"""
variants/business.py — InfraDesk Business variant.

Pywebview-based single-page UI (ui/business.html) with BusinessAPI as
the JS bridge. Wraps auto-diagnostics, self-heal, backup scheduler,
WebSocket remote commands, metrics loop, tray, headless service loop.
"""
from __future__ import annotations

import base64
import io
import os
import random
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

import psutil
import requests
from PIL import ImageGrab

from ..core import (
    API_BASE, APP_NAME, APP_VERSION, INSTALL_DIR, PORTAL_URL,
    load_config, log, res, save_config,
)
from ..core.api import (
    api_get, api_patch, api_post, check_status, do_metrics, do_ticket,
    fetch_contact, upload_screenshot,
)
from ..core.backup import BackupScheduler
from ..core.diagnostics import (
    AutoDiagnostics, SelfHealer, _load_audit_cache, _save_audit_cache,
    full_diagnosis, get_system_score, run_security_fix, security_audit,
)
from ..core.metrics import (
    full_inventory, lan_scan_diff, license_audit, log_shipping_collect,
    machine_info, metrics, screen_lock_report, security_events,
    server_metrics, speedtest,
)
from ..core.remote import handle_remote_command
from ..core.system import (
    _rustdesk_id, _wmic, is_rustdesk_installed,
)
from ..core.update import check_for_update, do_self_update, install_rustdesk
from ..core.utils import NO_WINDOW, kill_other_instances, send_wol
from ..core.ws import WS


# ── BusinessAPI (pywebview JS bridge) ────────────────────────────────────────

class BusinessAPI:
    """JS API exposed to business.html for overview, ticket, backup, diag, etc."""

    def __init__(self, token: str, cfg: dict):
        self.token = token
        self.cfg = cfg
        self._screenshots: dict = {}

    def get_system_info(self):
        try:
            info = machine_info()
            disks = []
            for p in psutil.disk_partitions():
                try:
                    u = psutil.disk_usage(p.mountpoint)
                    disks.append({
                        "device":   p.device,
                        "totalGb":  round(u.total / (1024**3), 1),
                        "freeGb":   round(u.free  / (1024**3), 1),
                        "usedPct":  u.percent,
                    })
                except Exception:
                    pass

            return {
                "hostname":    info.get("hostname", ""),
                "currentUser": info.get("currentUser", os.environ.get("USERNAME", "")),
                "os":          f"{info.get('osInfo', '')} (build {info.get('windowsVersion', '')})",
                "cpu":         info.get("cpuModel", _wmic("cpu get name")),
                "cpuCores":    info.get("cpuCores", 0),
                "ramGb":       round(psutil.virtual_memory().total / (1024**3), 1),
                "score":       get_system_score(),
                "disks":       disks,
                "version":     APP_VERSION,
                "rustdeskId":  info.get("rustdeskId", ""),
            }
        except Exception as e:
            return {"error": str(e)}

    def get_metrics(self):
        try:
            disk = psutil.disk_usage("C:\\")
            return {
                "cpu":         psutil.cpu_percent(interval=0.5),
                "ram":         psutil.virtual_memory().percent,
                "diskPercent": disk.percent,
                "diskFreeGb":  round(disk.free / (1024**3), 1),
            }
        except Exception as e:
            return {"error": str(e)}

    def capture_screenshot(self, slot):
        try:
            img = ImageGrab.grab()
            path = os.path.join(tempfile.gettempdir(), f"infradesk_screen_{slot}.png")
            img.save(path, "PNG")
            self._screenshots[slot] = path
            thumb = img.copy()
            thumb.thumbnail((200, 120))
            buf = io.BytesIO()
            thumb.save(buf, format="PNG")
            return {"ok": True, "slot": slot,
                    "preview": base64.b64encode(buf.getvalue()).decode()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def remove_screenshot(self, slot):
        path = self._screenshots.pop(slot, None)
        if path:
            try:
                os.remove(path)
            except Exception:
                pass
        return {"ok": True}

    def submit_ticket(self, category, title, description, urgent):
        try:
            priority = "HIGH" if urgent else "MEDIUM"
            full_title = f"[{category}] {title}"
            full_desc = description

            attachment_urls = []
            for slot in sorted(self._screenshots.keys()):
                path = self._screenshots[slot]
                if path and os.path.exists(path):
                    url = upload_screenshot(path, self.token)
                    if url:
                        attachment_urls.append(url)

            if attachment_urls:
                full_desc += "\n\nZalaczniki:\n" + "\n".join(attachment_urls)

            payload = {"title": full_title, "description": full_desc, "priority": priority}
            log.info("submit_ticket payload: %s",
                     {k: v[:80] if isinstance(v, str) else v for k, v in payload.items()})

            h = {"Content-Type": "application/json",
                 "Authorization": f"Bearer {self.token}"}
            r = requests.post(f"{API_BASE}/agent/ticket", json=payload, headers=h, timeout=15)
            log.info("submit_ticket response: status=%s body=%s", r.status_code, r.text[:500])

            if r.status_code == 409:
                time.sleep(0.5)
                r = requests.post(f"{API_BASE}/agent/ticket",
                                  json=payload, headers=h, timeout=15)
                log.info("submit_ticket retry: status=%s body=%s",
                         r.status_code, r.text[:500])

            r.raise_for_status()
            result = r.json()

            for path in self._screenshots.values():
                try:
                    os.remove(path)
                except Exception:
                    pass
            self._screenshots.clear()

            return {"ok": True, "ticketId": result.get("id")}
        except requests.exceptions.HTTPError as e:
            body = ""
            try:
                body = e.response.text[:300]
            except Exception:
                pass
            log.error("submit_ticket HTTP %s: %s",
                      e.response.status_code if e.response else '?', body)
            return {"ok": False,
                    "error": f"Blad serwera ({e.response.status_code if e.response else '?'}): {body[:100]}"}
        except Exception as e:
            log.error("submit_ticket error: %s", e)
            return {"ok": False, "error": str(e)}

    def get_workspaces(self):
        try:
            status = check_status(self.token)
            if status and isinstance(status, dict):
                ws = status.get("workspace") or status.get("workspaceName")
                wid = status.get("workspaceId")
                return [{"id": wid, "name": ws or "Moja firma"}] if wid else []
            return []
        except Exception:
            return []

    def get_remote_programs(self):
        """Detect installed remote access programs (RustDesk/AnyDesk/TeamViewer)."""
        import winreg

        programs = []

        rd_installed = is_rustdesk_installed()
        rd_id = _rustdesk_id() if rd_installed else None
        rd_exe = None
        for p in [r"C:\Program Files\SILERS\SILERS.exe",
                  r"C:\Program Files\RustDesk\rustdesk.exe",
                  r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
            if os.path.exists(p):
                rd_exe = p
                break
        programs.append({
            "name": "RustDesk", "installed": rd_installed, "exe": rd_exe,
            "id": rd_id, "password": None, "canInstall": True,
        })

        ad_installed = False
        ad_exe = None
        ad_id = None
        for p in [r"C:\Program Files (x86)\AnyDesk\AnyDesk.exe",
                  r"C:\Program Files\AnyDesk\AnyDesk.exe",
                  os.path.join(os.environ.get("APPDATA", ""), "AnyDesk", "AnyDesk.exe"),
                  os.path.join(os.environ.get("LOCALAPPDATA", ""), "AnyDesk", "AnyDesk.exe")]:
            if os.path.exists(p):
                ad_installed = True
                ad_exe = p
                break
        if ad_installed and ad_exe:
            try:
                r = subprocess.run([ad_exe, "--get-id"], capture_output=True, text=True,
                                   timeout=5, creationflags=NO_WINDOW)
                ad_id = r.stdout.strip() if r.returncode == 0 else None
            except Exception:
                pass
        if not ad_id:
            try:
                cfg_path = os.path.join(os.environ.get("APPDATA", ""), "AnyDesk", "system.conf")
                if not os.path.exists(cfg_path):
                    cfg_path = os.path.join(os.environ.get("PROGRAMDATA", ""), "AnyDesk", "system.conf")
                if os.path.exists(cfg_path):
                    with open(cfg_path, encoding="utf-8", errors="ignore") as f:
                        for line in f:
                            if "ad.anynet.id" in line:
                                ad_id = line.split("=", 1)[1].strip()
                                break
            except Exception:
                pass
        programs.append({
            "name": "AnyDesk", "installed": ad_installed, "exe": ad_exe,
            "id": ad_id, "password": None, "canInstall": False,
        })

        tv_installed = False
        tv_exe = None
        tv_id = None
        for p in [r"C:\Program Files\TeamViewer\TeamViewer.exe",
                  r"C:\Program Files (x86)\TeamViewer\TeamViewer.exe"]:
            if os.path.exists(p):
                tv_installed = True
                tv_exe = p
                break
        if tv_installed:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                    r"SOFTWARE\WOW6432Node\TeamViewer") as k:
                    tv_id = str(winreg.QueryValueEx(k, "ClientID")[0])
            except Exception:
                try:
                    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                        r"SOFTWARE\TeamViewer") as k:
                        tv_id = str(winreg.QueryValueEx(k, "ClientID")[0])
                except Exception:
                    pass
        programs.append({
            "name": "TeamViewer", "installed": tv_installed, "exe": tv_exe,
            "id": tv_id, "password": None, "canInstall": False,
        })

        return programs

    def launch_program(self, exe_path):
        try:
            if os.path.exists(exe_path):
                subprocess.Popen([exe_path], creationflags=NO_WINDOW)
                return {"ok": True}
            return {"ok": False, "error": "Plik nie istnieje"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def copy_to_clipboard(self, text):
        try:
            subprocess.run(["powershell", "-Command", f"Set-Clipboard -Value '{text}'"],
                           creationflags=NO_WINDOW, timeout=5)
            return {"ok": True}
        except Exception:
            return {"ok": False}

    def get_connection_status(self):
        try:
            resp = check_status(self.token)
            connected = resp is not None and (
                resp.get("status") == "ACTIVE" if isinstance(resp, dict)
                else resp == "ACTIVE"
            )
            return {"connected": connected}
        except Exception:
            return {"connected": False}

    def get_tickets(self):
        try:
            return api_get("/agent/tickets", self.token)
        except Exception as e:
            log.debug("get_tickets error: %s", e)
            return []

    def get_ticket_detail(self, ticket_id):
        try:
            return api_get(f"/agent/tickets/{ticket_id}", self.token)
        except Exception as e:
            log.debug("get_ticket_detail error: %s", e)
            return {"error": str(e)}

    def post_ticket_comment(self, ticket_id, comment):
        try:
            return api_post(f"/agent/tickets/{ticket_id}/comments",
                            {"comment": comment}, self.token)
        except Exception as e:
            log.debug("post_ticket_comment error: %s", e)
            return {"error": str(e)}

    def cancel_my_ticket(self, ticket_id):
        try:
            return api_post(f"/agent/tickets/{ticket_id}/cancel", {}, self.token)
        except Exception as e:
            log.debug("cancel_my_ticket error: %s", e)
            return {"error": str(e)}

    def edit_my_ticket(self, ticket_id, title, description):
        try:
            payload = {}
            if title:
                payload["title"] = title
            if description:
                payload["description"] = description
            return api_patch(f"/agent/tickets/{ticket_id}", payload, self.token)
        except Exception as e:
            log.debug("edit_my_ticket error: %s", e)
            return {"error": str(e)}

    def full_diagnosis(self):
        try:
            result = full_diagnosis()
            try:
                threading.Thread(target=lambda: do_metrics(self.token, {
                    **metrics(), "serverMetrics": {"fullDiagnosis": result},
                }), daemon=True).start()
            except Exception:
                pass
            return result
        except Exception as e:
            log.error("full_diagnosis error: %s", e)
            return {"error": str(e)}

    def run_security_fix(self, check_id):
        return run_security_fix(check_id)

    def get_security_audit(self, force=False):
        try:
            if force:
                audit = security_audit()
                _save_audit_cache(audit)
                try:
                    threading.Thread(target=lambda: do_metrics(self.token, {
                        **metrics(), "serverMetrics": {"securityAudit": audit},
                    }), daemon=True).start()
                except Exception:
                    pass
                return audit
            cached = _load_audit_cache()
            if cached:
                return cached
            audit = security_audit()
            _save_audit_cache(audit)
            return audit
        except Exception as e:
            log.error("get_security_audit error: %s", e)
            return {"error": str(e)}

    def get_contact(self):
        try:
            return fetch_contact()
        except Exception:
            return {
                "infolinia":    "+48 575 662 664",
                "email":        "zgloszenia@silers.pl",
                "opiekun":      "Błaszczykowski Adrian",
                "opiekunTel":   "+48 604 292 831",
                "opiekunEmail": "adrian@silers.pl",
            }

    def get_rustdesk_id(self):
        try:
            installed = is_rustdesk_installed()
            rid = _rustdesk_id() if installed else None
            return {"installed": installed, "id": rid}
        except Exception:
            return {"installed": False, "id": None}

    def launch_rustdesk(self):
        try:
            for exe in [r"C:\Program Files\SILERS\SILERS.exe",
                        r"C:\Program Files\RustDesk\rustdesk.exe",
                        r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
                if os.path.exists(exe):
                    subprocess.Popen([exe], creationflags=NO_WINDOW)
                    return {"ok": True}
            return {"ok": False, "error": "RustDesk nie zainstalowany"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def install_rustdesk(self):
        try:
            return install_rustdesk()
        except Exception as e:
            log.error("RustDesk install error: %s", e)
            return False

    def get_backup_status(self):
        try:
            configs = api_get("/agent/backup-configs", self.token) or []
            history = []
            for cfg in configs[:10]:
                try:
                    h = api_get(f"/agent/backup-configs/{cfg['id']}/history?limit=5", self.token)
                    if h:
                        for entry in h:
                            entry["configName"] = cfg.get("name", "Backup")
                        history.extend(h)
                except Exception:
                    pass
            history.sort(key=lambda x: x.get("startedAt", ""), reverse=True)
            schedule_labels = {
                "0 2 * * *":    "Codziennie 02:00",
                "0 */6 * * *":  "Co 6h",
                "0 */12 * * *": "Co 12h",
                "0 0 * * 0":    "Co niedzielę 00:00",
            }
            for cfg in configs:
                cfg["cronLabel"] = schedule_labels.get(
                    cfg.get("cronSchedule", ""), cfg.get("cronSchedule", ""))
            return {"configs": configs, "history": history[:20]}
        except Exception as e:
            log.error("Backup status error: %s", e)
            return {"configs": [], "history": [], "error": str(e)}

    def run_backup_now(self, config_id):
        try:
            result = api_post("/agent/backup/run-now",
                              {"configId": config_id}, self.token)
            return {"ok": True, "result": result}
        except Exception as e:
            log.error("Run backup error: %s", e)
            return {"ok": False, "error": str(e)}

    def check_update(self):
        try:
            result = check_for_update()
            if result:
                ver, url, sha = result
                return {"available": True, "version": ver, "url": url}
            return {"available": False}
        except Exception as e:
            return {"available": False, "error": str(e)}

    def do_update(self):
        try:
            result = check_for_update()
            if result:
                _, url, sha = result
                do_self_update(url, expected_sha256=sha)
                return {"ok": True}
            return {"ok": False, "error": "Brak aktualizacji"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_url(self, url):
        import webbrowser
        webbrowser.open(url)

    def get_dysk_files(self):
        try:
            data = api_get("/agent/downloads", self.token)
            files = data.get("files", []) if isinstance(data, dict) else []
            return {"ok": True, "files": files}
        except Exception as e:
            log.error("get_dysk_files error: %s", e)
            return {"ok": False, "error": str(e), "files": []}

    def download_dysk_file(self, file_id: str, file_name: str):
        try:
            downloads = os.path.join(os.path.expanduser("~"), "Downloads")
            os.makedirs(downloads, exist_ok=True)
            safe_name = "".join(ch for ch in (file_name or "plik")
                                if ch not in '\\/:*?"<>|').strip() or "plik"
            dest = os.path.join(downloads, safe_name)
            base, ext = os.path.splitext(dest)
            i = 1
            while os.path.exists(dest):
                dest = f"{base} ({i}){ext}"
                i += 1
            h = {"Authorization": f"Bearer {self.token}"}
            with requests.get(f"{API_BASE}/agent/downloads/{file_id}/file",
                              headers=h, stream=True, timeout=300) as r:
                r.raise_for_status()
                with open(dest, "wb") as out:
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            out.write(chunk)
            try:
                if sys.platform == "win32":
                    subprocess.Popen(["explorer", "/select,", dest])
            except Exception:
                pass
            return {"ok": True, "path": dest}
        except Exception as e:
            log.error("download_dysk_file error: %s", e)
            return {"ok": False, "error": str(e)}

    def get_iris_embed_url(self, theme: str = "auto"):
        """Build embed URL for Iris chat inside the Asystent webview.

        Fetches a short-lived JWT from the V2 backend and composes the
        /iris-embed SPA URL. The token lives in the URL (not cookies) so the
        webview does not need to share session state with infradesk.pl.
        """
        try:
            portal_base = PORTAL_URL.rsplit("/", 1)[0] if "/" in PORTAL_URL else PORTAL_URL
            # PORTAL_URL is https://infradesk.pl/portal -> strip trailing segment
            host_base = "https://infradesk.pl"
            try:
                tok_resp = api_get("/v2/iris/embed-token", self.token)
            except Exception:
                tok_resp = None
            embed_token = None
            if isinstance(tok_resp, dict):
                embed_token = tok_resp.get("token") or tok_resp.get("embedToken")
            safe_theme = theme if theme in ("auto", "light", "dark") else "auto"
            if embed_token:
                return {
                    "ok": True,
                    "url": f"{host_base}/iris-embed?token={embed_token}&theme={safe_theme}",
                }
            # Fallback: load embed page without token; user must already have
            # session cookie on infradesk.pl (unlikely in webview, but harmless).
            return {
                "ok": True,
                "url": f"{host_base}/iris-embed?theme={safe_theme}",
                "warning": "no embed token",
            }
        except Exception as e:
            log.error("get_iris_embed_url error: %s", e)
            return {"ok": False, "error": str(e)}

    def logout(self):
        try:
            save_config({})
            log.info("User logged out")
            os._exit(0)
        except Exception as e:
            return {"error": str(e)}


# ── Background services: metrics loop, diagnostics, self-heal, WS, tray ────

class BackgroundServices:
    """Runs all the background loops for Business variant (tray, metrics, WS)."""

    def __init__(self, token: str, cfg: dict):
        self.token = token
        self.cfg = cfg
        self._update_info = None
        self._backup_scheduler: BackupScheduler | None = None
        self._diagnostics: AutoDiagnostics | None = None
        self._healer: SelfHealer | None = None
        self._ws: WS | None = None

    def start(self) -> None:
        if self.cfg.get("allowMonitoring", True):
            threading.Thread(target=self._metrics_loop, daemon=True).start()
            self._diagnostics = AutoDiagnostics(self.token)
            threading.Thread(target=self._diagnostics_loop, daemon=True).start()
            self._healer = SelfHealer(self.token)
            threading.Thread(target=self._self_heal_loop, daemon=True).start()
        threading.Thread(target=self._update_check_loop, daemon=True).start()
        if self.cfg.get("backupMode") or self.cfg.get("allowMonitoring"):
            self._backup_scheduler = BackupScheduler(self.token)
            threading.Thread(target=self._backup_loop, daemon=True).start()
        self._ws = WS(self.token, self._on_ws)
        self._ws.start()
        self._start_tray()

    def _diagnostics_loop(self):
        time.sleep(120)
        while True:
            try:
                if self._diagnostics:
                    self._diagnostics.run_checks()
            except Exception as e:
                log.debug("Diagnostics error: %s", e)
            time.sleep(AutoDiagnostics.CHECK_INTERVAL)

    def _self_heal_loop(self):
        time.sleep(300)
        while True:
            try:
                if self._healer:
                    actions = self._healer.run()
                    if actions:
                        try:
                            do_metrics(self.token, {
                                **metrics(),
                                "serverMetrics": {"selfHealActions": actions},
                            })
                        except Exception:
                            pass
            except Exception as e:
                log.debug("Self-heal loop error: %s", e)
            time.sleep(SelfHealer.CHECK_INTERVAL)

    def _metrics_loop(self):
        try:
            requests.post(f"{API_BASE}/agent/metrics", json=full_inventory(),
                          headers={"Authorization": f"Bearer {self.token}"}, timeout=15)
        except Exception:
            pass
        cycle = 0
        while True:
            time.sleep(60 + random.uniform(0, 15))
            try:
                data = metrics()
                if cycle % 5 == 0:
                    try:
                        srv = server_metrics()
                        if srv:
                            data["serverMetrics"] = srv
                    except Exception:
                        pass
                if cycle % 1440 == 3:
                    try:
                        audit = security_audit()
                        data.setdefault("serverMetrics", {})["securityAudit"] = audit
                        _save_audit_cache(audit)
                        log.info("Security audit: score=%s", audit.get("score"))
                    except Exception:
                        pass
                if cycle % 1440 == 11:
                    try:
                        scan = lan_scan_diff()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
                    except Exception:
                        pass
                if cycle % 180 == 1:
                    try:
                        st = speedtest()
                        data.setdefault("serverMetrics", {})["speedtest"] = st
                    except Exception:
                        pass
                if cycle % 10 == 3:
                    try:
                        sev = security_events()
                        if (sev.get("failedLogins", 0) > 0 or sev.get("newUsers")
                                or sev.get("newAdmins") or sev.get("rdpNewIp")
                                or sev.get("usbDevices")):
                            data.setdefault("serverMetrics", {})["securityEvents"] = sev
                    except Exception:
                        pass
                if cycle % 5 == 2:
                    try:
                        sl = screen_lock_report()
                        data.setdefault("serverMetrics", {})["screenLock"] = sl
                    except Exception:
                        pass
                if cycle % 1440 == 7:
                    try:
                        lic = license_audit()
                        data.setdefault("serverMetrics", {})["licenseAudit"] = lic
                    except Exception:
                        pass
                if cycle % 10 == 5:
                    try:
                        logs = log_shipping_collect()
                        if logs.get("entries"):
                            data.setdefault("serverMetrics", {})["logShipping"] = logs
                    except Exception:
                        pass
                do_metrics(self.token, data)
            except Exception:
                pass
            cycle += 1

    def _update_check_loop(self):
        time.sleep(30)
        while True:
            result = check_for_update()
            if result and result != self._update_info:
                self._update_info = result
                ver, url, sha = result
                log.info("Update available: %s — auto-updating", ver)
                try:
                    do_self_update(url, notify_fn=lambda m: None,
                                   expected_sha256=sha)
                except Exception as e:
                    log.error("Auto-update failed: %s", e)
            time.sleep(2 * 3600)

    def _backup_loop(self):
        bs = self._backup_scheduler
        if not bs:
            return
        bs.sync_configs()
        c = 0
        while True:
            time.sleep(60)
            c += 1
            if c >= 5:
                bs.sync_configs()
                c = 0
            bs.check_and_run()

    # ── WebSocket message dispatcher ────────────────────────────────────────

    def _ws_ack(self, msg: dict, ok: bool = True, message: str | None = None,
                data: dict | None = None) -> None:
        """Reply to a push-command so the backend waiter unblocks.

        The V2 backend tags outbound commands with `requestId` + `ackId`; agents
        echo one of them back on a dedicated ack channel. Fire-and-forget (old
        V1 panel) messages arrive without these IDs -- we skip the ack then.
        """
        if not self._ws:
            return
        rid = msg.get("requestId") or msg.get("ackId")
        if not rid:
            return
        orig_type = msg.get("type", "unknown")
        body = {
            "type": f"{orig_type}_ack",
            "ok": bool(ok),
            "requestId": rid,
            "ackId": rid,
        }
        if message is not None:
            body["message"] = str(message)[:500]
        if data is not None:
            body["data"] = data
        try:
            import json as _json
            self._ws.send(_json.dumps(body))
        except Exception as e:
            log.warning("WS ack send failed: %s", e)

    def _on_ws(self, msg: dict):
        mtype = msg.get("type")
        if mtype == "remote_command":
            threading.Thread(target=handle_remote_command,
                             args=(msg, self._ws.send), daemon=True).start()
            return
        if mtype in ("notification", "status_update"):
            log.debug("WS notification (silent): %s", msg.get("title", ""))
        elif mtype == "update":
            info = self._update_info or check_for_update()
            if info:
                _, url, sha = info
                do_self_update(url, expected_sha256=sha)
            self._ws_ack(msg, ok=bool(info),
                         message=None if info else "No update available")
        elif mtype == "backup_run":
            cid = msg.get("configId", "")
            if cid and self._backup_scheduler:
                self._backup_scheduler.run_single(cid)
            self._ws_ack(msg, ok=bool(cid), message=None if cid else "missing configId")
        elif mtype == "wake":
            # Wake messages arrive on OTHER agents (peers) to relay WoL -- not
            # on the target itself. We send the magic packet then ack.
            mac = msg.get("mac", "")
            if mac:
                threading.Thread(target=send_wol, args=(mac,), daemon=True).start()
            self._ws_ack(msg, ok=bool(mac), message=None if mac else "missing mac")
        elif mtype == "windows_update":
            schedule_time = msg.get("scheduleTime")
            threading.Thread(target=self._run_windows_update,
                             args=(schedule_time,), daemon=True).start()
            # Ack immediately -- the actual update runs for up to 2h in background.
            self._ws_ack(msg, ok=True, message="Windows Update started")
        elif mtype == "restart_service":
            svc = msg.get("serviceName", "")
            if svc:
                def _rs():
                    try:
                        subprocess.run(["net", "stop", svc], capture_output=True,
                                       timeout=60, creationflags=NO_WINDOW)
                        time.sleep(2)
                        subprocess.run(["net", "start", svc], capture_output=True,
                                       timeout=60, creationflags=NO_WINDOW)
                        log.info("Service %s restarted", svc)
                    except Exception as e:
                        log.error("Service restart error: %s", e)

                threading.Thread(target=_rs, daemon=True).start()
                self._ws_ack(msg, ok=True, message=f"Restarting {svc}")
            else:
                self._ws_ack(msg, ok=False, message="serviceName required")
        elif mtype == "system_reboot":
            delay = msg.get("delay", 60)
            threading.Thread(target=lambda: subprocess.run(
                ["shutdown", "/r", "/t", str(delay), "/c",
                 f"{APP_NAME}: restart serwera"],
                capture_output=True, creationflags=NO_WINDOW), daemon=True).start()
            self._ws_ack(msg, ok=True, message=f"Reboot scheduled in {delay}s")
        elif mtype == "schedule_task":
            threading.Thread(target=self._schedule_task, args=(msg,), daemon=True).start()
            self._ws_ack(msg, ok=True, message="Task scheduled")
        elif mtype == "install_software":
            threading.Thread(target=self._install_software, args=(msg,), daemon=True).start()
            self._ws_ack(msg, ok=True,
                         message=f"Installing {msg.get('package', '?')}")
        elif mtype == "speedtest":
            def _st():
                try:
                    st = speedtest()
                    do_metrics(self.token, {**metrics(), "serverMetrics": {"speedtest": st}})
                    # Speedtest is request/response -- reply with the result.
                    self._ws_ack(msg, ok=True, data={
                        "download_mbps": st.get("download"),
                        "upload_mbps": st.get("upload"),
                        "ping_ms": st.get("ping"),
                        "server": st.get("server"),
                    })
                except Exception as e:
                    log.error("Speedtest on-demand failed: %s", e)
                    self._ws_ack(msg, ok=False, message=str(e)[:200])

            threading.Thread(target=_st, daemon=True).start()
        elif mtype == "scan_databases":
            def _scan():
                try:
                    from ..core.remote import scan_databases as _scan_dbs
                    result = _scan_dbs()
                    self._ws_ack(msg, ok=True, data=result)
                except Exception as e:
                    log.error("scan_databases failed: %s", e)
                    self._ws_ack(msg, ok=False, message=str(e)[:300])

            threading.Thread(target=_scan, daemon=True).start()
        elif mtype == "test_db_connection":
            def _test():
                try:
                    from ..core.remote import test_db_connection as _test_db
                    # Backend spreads payload at top-level; DB type is renamed to dbType
                    # to avoid collision with WS message `type`.
                    payload = {
                        "type": msg.get("dbType") or msg.get("db_type") or "",
                        "host": msg.get("host", "127.0.0.1"),
                        "port": msg.get("port"),
                        "instance": msg.get("instance"),
                        "user": msg.get("user"),
                        "password": msg.get("password"),
                        "authMode": msg.get("authMode"),
                    }
                    result = _test_db(payload)
                    self._ws_ack(msg, ok=True, data=result)
                except Exception as e:
                    log.error("test_db_connection failed: %s", e)
                    self._ws_ack(msg, ok=False, message=str(e)[:300])

            threading.Thread(target=_test, daemon=True).start()

    def _run_windows_update(self, schedule_time=None):
        try:
            log.info("Windows Update: starting%s",
                     f" (restart at {schedule_time})" if schedule_time else "")
            ps_cmd = (
                '$ErrorActionPreference="SilentlyContinue"; '
                'if (-not (Get-Module -ListAvailable -Name PSWindowsUpdate)) { '
                '  Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Confirm:$false | Out-Null; '
                '  Install-Module PSWindowsUpdate -Force -Confirm:$false | Out-Null '
                '}; '
                'Import-Module PSWindowsUpdate; '
                'Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false -Confirm:$false 2>&1 | Out-String'
            )
            result = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=7200, creationflags=NO_WINDOW)
            log.info("Windows Update result: %s", (result.stdout or "")[-500:])
            if schedule_time:
                subprocess.run([
                    "schtasks", "/create", "/tn", "InfraDeskBusiness_WinUpdate_Restart",
                    "/tr", f'shutdown /r /t 60 /c "{APP_NAME}: restart po aktualizacji"',
                    "/sc", "once", "/st", schedule_time, "/f",
                ], capture_output=True, timeout=30, creationflags=NO_WINDOW)
        except Exception as e:
            log.error("Windows Update error: %s", e)

    def _schedule_task(self, msg: dict):
        try:
            action = msg.get("action") or "shell"
            params = msg.get("params") or {}
            st = msg.get("scheduleTime") or ""
            freq = msg.get("frequency") or "once"
            name = msg.get("taskName") or f"InfraDeskBusiness_{action}_{int(time.time())}"

            if action == "restart_service":
                svc = params.get("service", "")
                if not svc:
                    log.error("schedule_task: brak service")
                    return
                tr = f'cmd /c net stop "{svc}" && net start "{svc}"'
            elif action == "windows_update":
                tr = 'powershell -ExecutionPolicy Bypass -Command "Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false -Confirm:$false"'
            elif action == "defrag":
                drive = params.get("drive", "C:")
                tr = f'defrag {drive} /O /H'
            elif action == "reboot":
                delay = int(params.get("delay", 60))
                tr = f'shutdown /r /t {delay} /c "{APP_NAME}: zaplanowany restart"'
            elif action == "shell":
                tr = params.get("command", "")
                if not tr:
                    log.error("schedule_task shell: brak command")
                    return
            else:
                log.error("schedule_task: nieznana akcja %s", action)
                return

            date_arg = []
            if "T" in st:
                d, t = st.split("T", 1)
                t = t[:5]
                date_arg = ["/sd", d, "/st", t]
            elif st:
                date_arg = ["/st", st[:5]]

            freq_map = {"once": "ONCE", "daily": "DAILY", "weekly": "WEEKLY"}
            sc = freq_map.get(freq, "ONCE")

            cmd = ["schtasks", "/create", "/tn", name, "/tr", tr, "/sc", sc,
                   "/f", "/rl", "HIGHEST"] + date_arg
            result = subprocess.run(cmd, capture_output=True, text=True,
                                    timeout=30, creationflags=NO_WINDOW)
            if result.returncode == 0:
                log.info("Scheduled task '%s' (%s) at %s", name, action, st or "immediate")
            else:
                log.error("schtasks failed (%d): %s", result.returncode,
                          (result.stderr or result.stdout or "")[:300])
        except Exception as e:
            log.error("schedule_task error: %s", e)

    def _install_software(self, msg: dict):
        try:
            pkg = (msg.get("package") or "").strip()
            mgr = (msg.get("manager") or "auto").lower()
            source = msg.get("source") or "winget"
            if not pkg:
                log.error("install_software: brak package")
                return
            if re.search(r'[;&|`$<>\n]', pkg):
                log.error("install_software: odrzucono package z metaznakami powłoki")
                return

            def _try_winget() -> tuple[bool, str]:
                if not shutil.which("winget"):
                    return False, "winget niedostępny"
                r = subprocess.run(
                    ["winget", "install", "--id", pkg, "--source", source,
                     "--accept-source-agreements", "--accept-package-agreements",
                     "--silent", "--disable-interactivity"],
                    capture_output=True, text=True, timeout=1800, creationflags=NO_WINDOW)
                return r.returncode == 0, (r.stdout + r.stderr)[-500:]

            def _try_choco() -> tuple[bool, str]:
                if not shutil.which("choco"):
                    return False, "choco niedostępny"
                r = subprocess.run(
                    ["choco", "install", pkg, "-y", "--no-progress"],
                    capture_output=True, text=True, timeout=1800, creationflags=NO_WINDOW)
                return r.returncode == 0, (r.stdout + r.stderr)[-500:]

            ok, out = False, ""
            if mgr in ("winget", "auto"):
                ok, out = _try_winget()
            if not ok and mgr in ("choco", "auto"):
                ok2, out2 = _try_choco()
                if ok2:
                    ok, out = True, out2
                else:
                    out = out + "\n---\n" + out2

            log.info("install_software %s: %s", pkg, "OK" if ok else "FAIL")
            try:
                do_metrics(self.token, {**metrics(), "serverMetrics": {
                    "installResult": {
                        "package": pkg, "ok": ok, "output": out[-800:],
                        "at": datetime.now().isoformat()[:19],
                    }
                }})
            except Exception:
                pass
        except Exception as e:
            log.error("install_software error: %s", e)

    # ── Tray ────────────────────────────────────────────────────────────────

    def _start_tray(self):
        from ..ui.ticket import open_remote_help_dialog, open_ticket_window
        from ..ui.tray import TrayIcon

        def _dashboard():
            # Dashboard is rendered by the webview itself via BusinessAPI;
            # tray entry just opens portal for now.
            import webbrowser
            webbrowser.open(PORTAL_URL)

        def _report():
            open_ticket_window(None, self.token, None)

        def _remote_help():
            open_remote_help_dialog(self.token)

        def _speedtest():
            try:
                st = speedtest()
                do_metrics(self.token, {**metrics(), "serverMetrics": {"speedtest": st}})
            except Exception as e:
                log.error("Speedtest tray: %s", e)

        def _dysk():
            from ..ui.dysk import open_dysk_window
            try:
                open_dysk_window(self.token)
            except Exception as e:
                log.error("Dysk window error: %s", e)

        tray = TrayIcon(
            on_dashboard=_dashboard,
            on_report=_report,
            on_remote_help=_remote_help,
            on_speedtest=_speedtest,
            on_dysk=_dysk,
        )
        tray.start()


# ── Headless service loop (--service CLI) ────────────────────────────────────

class ServerServiceLoop:
    """Headless background loop for --service CLI or Windows Service."""

    def __init__(self, token: str, cfg: dict):
        self.token = token
        self.cfg = cfg
        self._running = True
        self._ws: WS | None = None
        self._backup: BackupScheduler | None = None

    def _ws_ack(self, msg: dict, ok: bool = True, message: str | None = None,
                data: dict | None = None) -> None:
        """Ack helper (headless mode) -- echoes requestId/ackId back."""
        if not self._ws:
            return
        rid = msg.get("requestId") or msg.get("ackId")
        if not rid:
            return
        orig_type = msg.get("type", "unknown")
        body = {
            "type": f"{orig_type}_ack",
            "ok": bool(ok),
            "requestId": rid,
            "ackId": rid,
        }
        if message is not None:
            body["message"] = str(message)[:500]
        if data is not None:
            body["data"] = data
        try:
            import json as _json
            self._ws.send(_json.dumps(body))
        except Exception as e:
            log.warning("WS ack send failed (service): %s", e)

    def _on_ws(self, msg: dict):
        mtype = msg.get("type")
        if mtype == "remote_command":
            threading.Thread(target=handle_remote_command,
                             args=(msg, self._ws.send), daemon=True).start()
            return
        if mtype in ("notification", "status_update"):
            log.info("WS notification: %s — %s",
                     msg.get("title", ""), msg.get("body", ""))
        elif mtype == "update":
            info = check_for_update()
            if info:
                _, url, sha = info
                threading.Thread(target=do_self_update, args=(url,),
                                 kwargs={"expected_sha256": sha}, daemon=True).start()
            self._ws_ack(msg, ok=bool(info),
                         message=None if info else "No update available")
        elif mtype == "backup_run":
            cid = msg.get("configId", "")
            if cid and self._backup:
                self._backup.run_single(cid)
            self._ws_ack(msg, ok=bool(cid), message=None if cid else "missing configId")
        elif mtype == "wake":
            mac = msg.get("mac", "")
            if mac:
                threading.Thread(target=send_wol, args=(mac,), daemon=True).start()
            self._ws_ack(msg, ok=bool(mac), message=None if mac else "missing mac")
        elif mtype == "restart_service":
            svc = msg.get("serviceName", "")
            if svc:
                def _rs():
                    try:
                        subprocess.run(["net", "stop", svc], capture_output=True,
                                       timeout=60, creationflags=NO_WINDOW)
                        time.sleep(2)
                        subprocess.run(["net", "start", svc], capture_output=True,
                                       timeout=60, creationflags=NO_WINDOW)
                    except Exception as e:
                        log.error("Service restart (headless): %s", e)

                threading.Thread(target=_rs, daemon=True).start()
                self._ws_ack(msg, ok=True, message=f"Restarting {svc}")
            else:
                self._ws_ack(msg, ok=False, message="serviceName required")
        elif mtype == "system_reboot":
            delay = msg.get("delay", 60)
            threading.Thread(target=lambda: subprocess.run(
                ["shutdown", "/r", "/t", str(delay), "/c",
                 f"{APP_NAME}: restart serwera"],
                capture_output=True, creationflags=NO_WINDOW), daemon=True).start()
            self._ws_ack(msg, ok=True, message=f"Reboot scheduled in {delay}s")
        elif mtype == "speedtest":
            def _st():
                try:
                    st = speedtest()
                    do_metrics(self.token, {**metrics(), "serverMetrics": {"speedtest": st}})
                    self._ws_ack(msg, ok=True, data={
                        "download_mbps": st.get("download"),
                        "upload_mbps": st.get("upload"),
                        "ping_ms": st.get("ping"),
                        "server": st.get("server"),
                    })
                except Exception as e:
                    log.error("Speedtest (headless) failed: %s", e)
                    self._ws_ack(msg, ok=False, message=str(e)[:200])

            threading.Thread(target=_st, daemon=True).start()
        elif mtype == "scan_databases":
            def _scan():
                try:
                    from ..core.remote import scan_databases as _scan_dbs
                    result = _scan_dbs()
                    self._ws_ack(msg, ok=True, data=result)
                except Exception as e:
                    log.error("scan_databases (headless) failed: %s", e)
                    self._ws_ack(msg, ok=False, message=str(e)[:300])

            threading.Thread(target=_scan, daemon=True).start()
        elif mtype == "test_db_connection":
            def _test():
                try:
                    from ..core.remote import test_db_connection as _test_db
                    payload = {
                        "type": msg.get("dbType") or msg.get("db_type") or "",
                        "host": msg.get("host", "127.0.0.1"),
                        "port": msg.get("port"),
                        "instance": msg.get("instance"),
                        "user": msg.get("user"),
                        "password": msg.get("password"),
                        "authMode": msg.get("authMode"),
                    }
                    result = _test_db(payload)
                    self._ws_ack(msg, ok=True, data=result)
                except Exception as e:
                    log.error("test_db_connection (headless) failed: %s", e)
                    self._ws_ack(msg, ok=False, message=str(e)[:300])

            threading.Thread(target=_test, daemon=True).start()

    def start(self):
        log.info("ServerServiceLoop starting (token=%s...)", self.token[:8])

        self._ws = WS(self.token, self._on_ws)
        self._ws.start()

        try:
            self._backup = BackupScheduler(self.token)
        except Exception as e:
            log.warning("Backup scheduler init failed: %s", e)

        diag = AutoDiagnostics(self.token)
        threading.Thread(target=self._diagnostics_loop, args=(diag,), daemon=True).start()

        cycle = 0
        while self._running:
            try:
                data = metrics()
                if cycle % 5 == 0:
                    srv = server_metrics()
                    if srv:
                        data["serverMetrics"] = srv
                if cycle % 60 == 0 or cycle == 0:
                    try:
                        audit = security_audit()
                        data.setdefault("serverMetrics", {})["securityAudit"] = audit
                    except Exception:
                        pass
                if cycle % 1440 == 11:
                    try:
                        scan = lan_scan_diff()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
                    except Exception:
                        pass
                if cycle % 180 == 1:
                    try:
                        st = speedtest()
                        data.setdefault("serverMetrics", {})["speedtest"] = st
                    except Exception:
                        pass
                if cycle % 10 == 3:
                    try:
                        sev = security_events()
                        if (sev.get("failedLogins", 0) > 0 or sev.get("newUsers")
                                or sev.get("newAdmins") or sev.get("rdpNewIp")
                                or sev.get("usbDevices")):
                            data.setdefault("serverMetrics", {})["securityEvents"] = sev
                    except Exception:
                        pass
                if cycle % 5 == 2:
                    try:
                        sl = screen_lock_report()
                        data.setdefault("serverMetrics", {})["screenLock"] = sl
                    except Exception:
                        pass
                if cycle % 1440 == 7:
                    try:
                        lic = license_audit()
                        data.setdefault("serverMetrics", {})["licenseAudit"] = lic
                    except Exception:
                        pass
                if cycle % 10 == 5:
                    try:
                        logs = log_shipping_collect()
                        if logs.get("entries"):
                            data.setdefault("serverMetrics", {})["logShipping"] = logs
                    except Exception:
                        pass
                do_metrics(self.token, data)
            except Exception as e:
                log.warning("Metrics error: %s", e)

            if self._backup:
                try:
                    self._backup.check_and_run()
                except Exception:
                    pass
                if cycle % 5 == 0:
                    try:
                        self._backup.sync_configs()
                    except Exception:
                        pass

            if cycle % 30 == 0:
                try:
                    info = check_for_update()
                    if info:
                        ver, url, sha = info
                        log.info("Update available: %s — auto-updating", ver)
                        do_self_update(url, expected_sha256=sha)
                except Exception as e:
                    log.warning("Auto-update check failed: %s", e)

            time.sleep(60)
            cycle += 1

    def _diagnostics_loop(self, diag: AutoDiagnostics):
        time.sleep(120)
        while self._running:
            try:
                diag.run_checks()
            except Exception:
                pass
            time.sleep(AutoDiagnostics.CHECK_INTERVAL)

    def stop(self):
        self._running = False


# ── Webview runners ──────────────────────────────────────────────────────────

def _find_ui_dir() -> str | None:
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ui'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'ui'),
        os.path.join(INSTALL_DIR, 'ui'),
    ]
    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        candidates.insert(0, os.path.join(meipass, 'ui'))
    for c in candidates:
        c = os.path.abspath(c)
        if os.path.isdir(c) and os.path.isfile(os.path.join(c, 'business.html')):
            return c
    return None


def run_auth_webview(cfg: dict) -> None:
    """Webview-based login/register/waiting flow (ui/auth.html)."""
    try:
        import webview
    except ImportError:
        log.error("pywebview not installed — cannot start")
        print("ERROR: pywebview wymagany. Uruchom: pip install pywebview")
        return

    ui_dir = _find_ui_dir()
    if not ui_dir or not os.path.exists(os.path.join(ui_dir, 'auth.html')):
        log.error("auth.html not found in %s", ui_dir)
        return

    result = {"action": None}

    class AuthAPI:
        def get_init_data(self):
            token = cfg.get("token")
            status = cfg.get("status")
            start_page = "auth"
            if token and status != "ACTIVE":
                start_page = "waiting"
            return {
                "hasHomeMode": False,
                "appName":     APP_NAME,
                "appVersion":  APP_VERSION,
                "startPage":   start_page,
                "token":       token or "",
            }

        def select_mode(self, mode):
            cfg["mode"] = "business"
            save_config(cfg)

        def do_login(self, email, pwd):
            from ..core.api import do_login as _do_login
            try:
                r = _do_login(email, pwd)
                cfg["token"] = r["token"]
                cfg["status"] = r["status"]
                cfg["mode"] = "business"
                cfg["allowMonitoring"] = True
                cfg["allowRustdesk"] = True
                if r.get("deviceId"):
                    cfg["deviceId"] = r["deviceId"]
                save_config(cfg)
                if r["status"] == "ACTIVE":
                    result["action"] = "active"
                    for w in webview.windows:
                        w.destroy()
                return {"status": r["status"], "token": r["token"]}
            except requests.HTTPError as e:
                msg = ("Nieprawidlowy e-mail lub haslo."
                       if e.response.status_code in (400, 401)
                       else f"Blad serwera: {e.response.status_code}")
                return {"error": msg}
            except requests.exceptions.ConnectionError:
                return {"error": "Brak polaczenia z serwerem"}
            except requests.exceptions.Timeout:
                return {"error": "Serwer nie odpowiada"}
            except Exception as e:
                return {"error": f"Blad: {e}"}

        def do_register(self, form):
            from ..core.api import do_register as _do_register
            try:
                r = _do_register(form)
                cfg["token"] = r["token"]
                cfg["status"] = r["status"]
                cfg["mode"] = "business"
                cfg["allowRustdesk"] = form.get("allowRustdesk", True)
                cfg["allowMonitoring"] = form.get("allowMonitoring", True)
                if form.get("backupMode"):
                    cfg["backupMode"] = True
                save_config(cfg)
                if r["status"] == "ACTIVE":
                    result["action"] = "active"
                    for w in webview.windows:
                        w.destroy()
                return {"status": r["status"], "token": r["token"]}
            except requests.HTTPError as e:
                try:
                    body = e.response.json()
                    msg = body.get("error") or body.get("message") or str(e)
                except Exception:
                    msg = f"HTTP {e.response.status_code}"
                return {"error": f"Blad: {msg}"}
            except requests.exceptions.ConnectionError:
                return {"error": "Brak polaczenia z serwerem"}
            except Exception as e:
                return {"error": f"Blad: {e}"}

        def check_status(self):
            try:
                token = cfg.get("token")
                if not token:
                    return None
                resp = api_get("/agent/status", token)
                s = resp.get("status") if isinstance(resp, dict) else resp
                if s == "ACTIVE":
                    if isinstance(resp, dict) and resp.get("deviceId"):
                        cfg["deviceId"] = resp["deviceId"]
                    cfg["status"] = "ACTIVE"
                    save_config(cfg)
                    result["action"] = "active"
                    for w in webview.windows:
                        w.destroy()
                return s
            except Exception:
                return None

        def cancel_registration(self):
            save_config({})
            cfg.clear()

        def check_rustdesk(self):
            return 'installed' if is_rustdesk_installed() else 'not_installed'

        def install_rustdesk(self):
            try:
                return install_rustdesk()
            except Exception as e:
                log.error("RustDesk install error: %s", e)
                return False

    api = AuthAPI()
    url = f"file:///{os.path.join(ui_dir, 'auth.html').replace(os.sep, '/')}"

    webview.create_window(
        APP_NAME,
        url=url,
        width=620, height=560,
        min_size=(500, 450),
        js_api=api,
        background_color='#040810',
    )
    webview.start(debug=False, gui="edgechromium")

    if result["action"] == "active":
        log.info("Auth successful — starting business UI")
        cfg_fresh = load_config()
        run_business_webview(cfg_fresh["token"], cfg_fresh)
    else:
        log.info("Auth webview closed without action — exiting")


def run_business_webview(token: str, cfg: dict) -> None:
    """Launch InfraDesk Business main UI (ui/business.html)."""
    import webview

    bg = BackgroundServices(token, cfg)
    bg.start()

    from ..core.install import create_desktop_shortcut

    def _setup():
        for fname in ["icon.ico", "ikona.png", "logo.png"]:
            try:
                src_f = res(fname)
                dst_f = os.path.join(INSTALL_DIR, fname)
                if src_f and os.path.exists(src_f) and src_f != dst_f:
                    shutil.copy2(src_f, dst_f)
            except Exception:
                pass
        create_desktop_shortcut()

    threading.Thread(target=_setup, daemon=True).start()

    if cfg.get("allowRustdesk", True):
        threading.Thread(
            target=lambda: install_rustdesk() if not is_rustdesk_installed() else None,
            daemon=True,
        ).start()

    api = BusinessAPI(token, cfg)

    ui_dir = _find_ui_dir()
    html_path = os.path.join(ui_dir, 'business.html') if ui_dir else None

    if html_path and os.path.exists(html_path):
        url = f"file:///{html_path.replace(os.sep, '/')}"
    else:
        log.error("business.html not found")
        import webbrowser
        webbrowser.open(PORTAL_URL)
        while True:
            time.sleep(60)

    webview.create_window(
        APP_NAME,
        url=url,
        width=1300, height=750,
        min_size=(900, 550),
        js_api=api,
        background_color='#040810',
    )
    webview.start(debug=False, gui="edgechromium")

    log.info("Business webview closed — keeping tray alive")
    while True:
        time.sleep(60)


# ── Variant entry point ─────────────────────────────────────────────────────

def run() -> None:
    """Run the InfraDesk Business variant. Called from main.py with CLI parsed."""
    from ..core.install import do_uninstall, install_and_restart, install_service, remove_service, sync_ui_on_start
    from ..core.utils import is_frozen, is_installed

    sync_ui_on_start()
    log.info("%s %s starting — exe: %s", APP_NAME, APP_VERSION, sys.executable)

    if "--uninstall" in sys.argv:
        do_uninstall()
        return
    if "--install-service" in sys.argv:
        install_service()
        return
    if "--remove-service" in sys.argv:
        remove_service()
        return
    if "--service" in sys.argv:
        log.info("Starting in SERVICE mode (headless)")
        cfg = load_config()
        if cfg.get("status") == "ACTIVE" and cfg.get("token"):
            loop = ServerServiceLoop(cfg["token"], cfg)
            loop.start()
        else:
            log.error("Cannot start service — not registered. Run %s first.", APP_NAME)
        return

    if is_frozen() and not is_installed():
        log.info("Not installed — running install_and_restart()")
        install_and_restart()
        return

    kill_other_instances()

    cfg = load_config()
    log.info("Config: status=%s token=%s",
             cfg.get("status"), "YES" if cfg.get("token") else "NO")
    cfg["mode"] = "business"

    if cfg.get("status") == "ACTIVE" and cfg.get("token"):
        log.info("Already active — starting business UI")
        run_business_webview(cfg["token"], cfg)
        return

    run_auth_webview(cfg)
