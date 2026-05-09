"""
core/backup.py — BackupScheduler (cron parser, SQL dump per engine,
Fernet encryption, Google Drive + InfraDesk Cloud upload, retention).
"""
from __future__ import annotations

import base64
import glob
import os
import re
import shutil
import subprocess

# Reject any SQL identifier with characters outside [A-Za-z0-9_-]. Compiled once
# (was inside the per-backup loop) — prevents SQL injection in `BACKUP DATABASE [{db}]`
# and path traversal in `f"{db}_{timestamp}.sql"` filenames.
_DB_NAME_RX = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_SQL_HOST_RX = re.compile(r"^[A-Za-z0-9_.\-]{1,253}$")
_SQL_USER_RX = re.compile(r"^[A-Za-z0-9_.\-]{1,128}$")
import tempfile
import threading
import time
import zipfile
from datetime import datetime

import requests

from .api import api_get, api_post
from .config import API_BASE, log
from .utils import NO_WINDOW


class BackupScheduler:
    """Pobiera konfiguracje backupu z API i wykonuje je wg harmonogramu."""

    def __init__(self, token: str):
        self.token = token
        self.configs: list[dict] = []
        self._last_runs: dict = {}

    def sync_configs(self) -> None:
        try:
            self.configs = api_get("/agent/backup-configs", self.token)
            log.info("Backup configs synced: %d", len(self.configs))
        except Exception as e:
            log.warning("Backup config sync failed: %s", e)

    def check_and_run(self) -> None:
        now = datetime.now()
        for cfg in self.configs:
            cfg_id = cfg.get("id")
            cron = cfg.get("cronSchedule", "0 2 * * *")
            if not self._should_run(cron, cfg_id, now):
                continue
            log.info("Starting backup: %s (%s)", cfg.get("name"), cfg.get("type"))
            self._last_runs[cfg_id] = now
            threading.Thread(target=self._run_backup, args=(cfg,), daemon=True).start()

    def run_single(self, config_id) -> None:
        for cfg in self.configs:
            if cfg.get("id") == config_id:
                threading.Thread(target=self._run_backup, args=(cfg,), daemon=True).start()
                return

    # ── Cron parser ─────────────────────────────────────────────────────────

    @staticmethod
    def _cron_field_matches(field: str, value: int) -> bool:
        if field == "*":
            return True
        for part in field.split(","):
            if "/" in part:
                base, step = part.split("/", 1)
                step = int(step)
                if base == "*":
                    if value % step == 0:
                        return True
                elif "-" in base:
                    lo, hi = int(base.split("-")[0]), int(base.split("-")[1])
                    if lo <= value <= hi and (value - lo) % step == 0:
                        return True
            elif "-" in part:
                lo, hi = int(part.split("-")[0]), int(part.split("-")[1])
                if lo <= value <= hi:
                    return True
            else:
                if int(part) == value:
                    return True
        return False

    def _should_run(self, cron_str: str, cfg_id, now: datetime) -> bool:
        try:
            parts = cron_str.split()
            if len(parts) < 5:
                parts += ["*"] * (5 - len(parts))
            minute, hour, dom, month, dow = parts[:5]
            if not self._cron_field_matches(minute, now.minute):
                return False
            if not self._cron_field_matches(hour, now.hour):
                return False
            if not self._cron_field_matches(dom, now.day):
                return False
            if not self._cron_field_matches(month, now.month):
                return False
            cron_dow = now.isoweekday() % 7  # 0=Sunday
            if not self._cron_field_matches(dow, cron_dow):
                return False
            last = self._last_runs.get(cfg_id)
            if last and (now - last).total_seconds() < 3500:
                return False
            return True
        except Exception as e:
            log.warning("Cron parse error for '%s': %s", cron_str, e)
            return False

    # ── Runner ──────────────────────────────────────────────────────────────

    def _run_backup(self, cfg: dict) -> None:
        cfg_id = cfg.get("id")
        try:
            resp = api_post("/agent/backup/start", {"configId": cfg_id}, self.token)
            history_id = resp.get("historyId")

            btype = cfg.get("type", "")
            local_path = cfg.get("localBackupPath")
            timestamp = time.strftime("%Y%m%d_%H%M%S")

            temp_dir = os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "InfraDesk", "backups")
            os.makedirs(temp_dir, exist_ok=True)

            if btype.startswith("SQL_"):
                path = self._backup_sql(cfg, temp_dir, timestamp)
            elif btype == "FOLDER":
                path = self._backup_folder(cfg)
            else:
                raise ValueError(f"Unknown backup type: {btype}")

            if not os.path.exists(path) or os.path.getsize(path) == 0:
                raise RuntimeError(f"Backup file missing or empty: {path}")

            if cfg.get("encryptBackups") and cfg.get("encryptionKey"):
                path = self._encrypt(path, cfg["encryptionKey"])

            if local_path:
                os.makedirs(local_path, exist_ok=True)
                dest = os.path.join(local_path, os.path.basename(path))
                shutil.copy2(path, dest)
                if not os.path.exists(dest) or os.path.getsize(dest) == 0:
                    raise RuntimeError(f"Copy to {dest} failed")
                log.info("Copied to %s (%d bytes)", dest, os.path.getsize(dest))

            drive_id = None
            drive_folder = cfg.get("googleDriveFolder")
            if drive_folder:
                drive_id = self._upload_gdrive(path, drive_folder)

            if cfg.get("useInfradeskCloud"):
                try:
                    self._upload_infradesk_cloud(path, cfg.get("id", ""))
                except Exception as ue:
                    log.error("Cloud upload failed: %s", ue)

            file_size = os.path.getsize(path)

            try:
                os.remove(path)
            except Exception:
                pass
            retention_days = int(cfg.get("retentionDays", 30))
            if local_path and retention_days > 0:
                self._cleanup_old_backups(local_path, retention_days)

            api_post("/agent/backup/complete", {
                "historyId":     history_id,
                "sizeBytes":     file_size,
                "fileName":      os.path.basename(path),
                "googleDriveId": drive_id,
            }, self.token)
            log.info("Backup OK: %s → %s (%d bytes)",
                     cfg.get("name"), local_path or temp_dir, file_size)

        except Exception as e:
            log.error("Backup failed: %s — %s", cfg.get("name"), e)
            try:
                api_post("/agent/backup/failed",
                         {"configId": cfg_id, "error": str(e)}, self.token)
            except Exception:
                pass

    # ── SQL dumps (MySQL / Postgres / MSSQL) ────────────────────────────────

    def _backup_sql(self, cfg: dict, out_dir: str | None = None,
                    timestamp: str | None = None) -> str:
        btype = cfg["type"]
        host = str(cfg.get("sqlHost", "localhost"))
        port = str(cfg.get("sqlPort", 3306))
        user = str(cfg.get("sqlUser", ""))
        pwd = str(cfg.get("sqlPassword", "") or cfg.get("sqlPassEnc", ""))
        dbs = cfg.get("sqlDatabases", "").split(",")
        if not timestamp:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
        if not out_dir:
            out_dir = os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "InfraDesk", "backups")
        os.makedirs(out_dir, exist_ok=True)

        if not _SQL_HOST_RX.match(host or ""):
            raise RuntimeError(f"Invalid SQL host: {host!r}")
        if user and not _SQL_USER_RX.match(user):
            raise RuntimeError(f"Invalid SQL user: {user!r}")

        results = []
        for db in dbs:
            db = db.strip()
            if not db:
                continue
            if not _DB_NAME_RX.match(db):
                raise RuntimeError(f"Invalid database name: {db!r}")

            if btype == "SQL_MYSQL":
                output = os.path.join(out_dir, f"{db}_{timestamp}.sql")
                env = os.environ.copy()
                if pwd:
                    env["MYSQL_PWD"] = pwd
                cmd = ["mysqldump", f"--host={host}", f"--port={port}", f"--user={user}", db]
                try:
                    with open(output, "w") as f:
                        subprocess.run(cmd, check=True, stdout=f, stderr=subprocess.PIPE,
                                       timeout=3600, env=env, creationflags=NO_WINDOW)
                    results.append(output)
                    log.info("MySQL dump: %s → %s", db, output)
                except Exception as e:
                    raise RuntimeError(f"MySQL backup failed for {db}: {e}")

            elif btype == "SQL_POSTGRES":
                output = os.path.join(out_dir, f"{db}_{timestamp}.sql")
                env = os.environ.copy()
                if pwd:
                    env["PGPASSWORD"] = pwd
                cmd = ["pg_dump", "-h", host, "-p", port, "-U", user, "-Fc", "-f", output, db]
                try:
                    subprocess.run(cmd, check=True, capture_output=True, timeout=3600,
                                   env=env, creationflags=NO_WINDOW)
                    results.append(output)
                    log.info("PostgreSQL dump: %s → %s", db, output)
                except Exception as e:
                    raise RuntimeError(f"PostgreSQL backup failed for {db}: {e}")

            elif btype == "SQL_MSSQL":
                bak_path = os.path.join(out_dir, f"{db}_{timestamp}.bak")
                sql_query = f"BACKUP DATABASE [{db}] TO DISK=N'{bak_path}' WITH FORMAT, COMPRESSION, STATS=10"
                env = os.environ.copy()
                if user and pwd:
                    env["SQLCMDPASSWORD"] = pwd
                    cmd = ["sqlcmd", "-S", f"{host},{port}", "-U", user, "-Q", sql_query]
                else:
                    cmd = ["sqlcmd", "-S", f"{host},{port}", "-E", "-Q", sql_query]
                try:
                    r = subprocess.run(cmd, check=True, capture_output=True, text=True,
                                       timeout=3600, env=env, creationflags=NO_WINDOW)
                    if not os.path.exists(bak_path):
                        raise RuntimeError(
                            f"MSSQL backup file not created: {bak_path}\n"
                            f"Output: {r.stdout[:500]}\nError: {r.stderr[:500]}")
                    results.append(bak_path)
                    sz = os.path.getsize(bak_path)
                    log.info("MSSQL backup: %s → %s (%d MB)", db, bak_path, sz // (1024 * 1024))
                except subprocess.CalledProcessError as e:
                    raise RuntimeError(
                        f"MSSQL backup failed for {db}: {e.stderr[:500] if e.stderr else e}")

        if not results:
            raise RuntimeError("No databases to backup")

        if len(results) == 1:
            return results[0]

        import tarfile

        archive = os.path.join(out_dir, f"backup_sql_{timestamp}.tar.gz")
        with tarfile.open(archive, "w:gz") as tar:
            for r in results:
                tar.add(r, arcname=os.path.basename(r))
                try:
                    os.remove(r)
                except Exception:
                    pass
        return archive

    @staticmethod
    def _cleanup_old_backups(directory: str, retention_days: int) -> None:
        cutoff = time.time() - (retention_days * 86400)
        patterns = ["backup_*.tar.gz", "backup_*.zip", "backup_*.bak", "backup_*.sql"]
        removed = 0
        for pattern in patterns:
            for f in glob.glob(os.path.join(directory, pattern)):
                try:
                    if os.path.getmtime(f) < cutoff:
                        os.remove(f)
                        removed += 1
                except Exception:
                    pass
        if removed:
            log.info("Retention cleanup: removed %d old backups from %s (>%d days)",
                     removed, directory, retention_days)

    def _backup_folder(self, cfg: dict) -> str:
        folder = cfg.get("folderPath", "")
        if not os.path.isdir(folder):
            raise RuntimeError(f"Folder not found: {folder}")
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        output = os.path.join(tempfile.gettempdir(), f"backup_folder_{timestamp}.zip")
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(folder):
                for file in files:
                    fpath = os.path.join(root, file)
                    arcname = os.path.relpath(fpath, folder)
                    try:
                        zf.write(fpath, arcname)
                    except Exception:
                        pass
        return output

    def _encrypt(self, path: str, key) -> str:
        try:
            import hashlib

            from cryptography.fernet import Fernet
            raw = hashlib.sha256(key.encode() if isinstance(key, str) else key).digest()
            fernet_key = base64.urlsafe_b64encode(raw)
            f = Fernet(fernet_key)
            with open(path, "rb") as file:
                data = file.read()
            encrypted = f.encrypt(data)
            enc_path = path + ".enc"
            with open(enc_path, "wb") as file:
                file.write(encrypted)
            os.remove(path)
            return enc_path
        except ImportError:
            log.warning("cryptography not installed, skipping encryption")
            return path

    def _upload_infradesk_cloud(self, path: str, config_id: str) -> dict:
        url = f"{API_BASE}/backup/cloud/upload"
        file_size = os.path.getsize(path)
        log.info("Uploading to InfraDesk Cloud: %s (%d MB)",
                 os.path.basename(path), file_size // (1024 * 1024))
        with open(path, "rb") as f:
            resp = requests.post(
                url,
                files={"backup": (os.path.basename(path), f)},
                headers={
                    "x-agent-token":        self.token,
                    "x-backup-config-id":   config_id,
                },
                timeout=7200,
            )
        if resp.status_code != 200:
            raise RuntimeError(f"InfraDesk Cloud upload error {resp.status_code}: {resp.text[:200]}")
        return resp.json()

    def _upload_gdrive(self, path: str, folder_id: str):
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload

            creds_data = api_get("/agent/backup/drive-credentials", self.token)
            creds = service_account.Credentials.from_service_account_info(
                creds_data, scopes=["https://www.googleapis.com/auth/drive.file"],
            )
            service = build("drive", "v3", credentials=creds)
            media = MediaFileUpload(path, resumable=True)
            file_meta = {"name": os.path.basename(path), "parents": [folder_id]}
            result = service.files().create(body=file_meta, media_body=media, fields="id").execute()
            return result.get("id")
        except ImportError:
            log.warning("google-api-python-client not installed, skipping Drive upload")
            return None
        except Exception as e:
            log.error("Google Drive upload failed: %s", e)
            raise
