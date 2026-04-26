"""
core/update.py — version check + self-update (SHA256 verified download,
atomic EXE swap, UI resync, original-args preservation on restart).
"""
from __future__ import annotations

import json
import os
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request

from .config import APP_VERSION, INSTALL_DIR, INSTALL_EXE, VERSION_URL, log
from .utils import NO_WINDOW


def check_for_update() -> tuple[str, str, str] | None:
    """Return (version, url, sha256) if remote > local, else None."""
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(VERSION_URL, context=ctx, timeout=10) as r:
            data = json.loads(r.read())
        remote = data.get("version", "0.0.0")
        if tuple(int(x) for x in remote.split(".")) > tuple(int(x) for x in APP_VERSION.split(".")):
            return (remote,
                    data.get("url", "https://infradesk.pl/downloads/InfraDesk Business.exe"),
                    data.get("sha256", ""))
    except Exception as e:
        log.debug("Update check failed: %s", e)
    return None


def _verify_sha256(filepath: str, expected: str) -> bool:
    """Verify SHA256. True if matches or no hash provided (with warning)."""
    if not expected:
        log.warning("No SHA256 hash provided — skipping verification")
        return True
    import hashlib
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    actual = sha.hexdigest()
    if actual.lower() != expected.lower():
        log.error("SHA256 mismatch! Expected: %s, Got: %s", expected, actual)
        return False
    log.info("SHA256 verified OK: %s", actual[:16])
    return True


def do_self_update(download_url: str, notify_fn=None, expected_sha256: str = "") -> None:
    def _notify(msg: str):
        log.info(msg)
        if notify_fn:
            try:
                notify_fn(msg)
            except Exception:
                pass

    try:
        tmp_exe = os.path.join(tempfile.gettempdir(), "infradesk_update.exe")
        _notify("Pobieranie aktualizacji...")
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(download_url, context=ctx, timeout=120) as resp:
            with open(tmp_exe, "wb") as f:
                f.write(resp.read())
        log.info("Update downloaded: %d bytes", os.path.getsize(tmp_exe))

        if not _verify_sha256(tmp_exe, expected_sha256):
            _notify("Błąd: plik aktualizacji uszkodzony (SHA256 mismatch). Aktualizacja anulowana.")
            try:
                os.remove(tmp_exe)
            except Exception:
                pass
            return

        os.makedirs(INSTALL_DIR, exist_ok=True)
        target = INSTALL_EXE
        try:
            bak = target + ".bak"
            if os.path.exists(bak):
                os.remove(bak)
            if os.path.exists(target):
                os.rename(target, bak)
            shutil.copy2(tmp_exe, target)
            log.info("Updated EXE installed to %s", target)
        except Exception as e:
            log.warning("Install to %s failed (%s), launching from temp", target, e)
            target = tmp_exe

        # UI resync
        try:
            ui_src = None
            mp = getattr(sys, '_MEIPASS', None)
            if mp:
                ui_src = os.path.join(mp, 'ui')
            if not ui_src or not os.path.isdir(ui_src):
                ui_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ui')
                ui_src = os.path.abspath(ui_src)
            ui_dst = os.path.join(INSTALL_DIR, 'ui')
            if os.path.isdir(ui_src) and os.path.abspath(ui_src) != os.path.abspath(ui_dst):
                if os.path.exists(ui_dst):
                    shutil.rmtree(ui_dst)
                shutil.copytree(ui_src, ui_dst)
                log.info("UI updated: %s → %s", ui_src, ui_dst)
        except Exception as ue:
            log.warning("UI update failed: %s", ue)

        _notify("Restartuję...")
        args = [a for a in sys.argv[1:] if a not in ("--update",)]
        proc = subprocess.Popen([target] + args, close_fds=True, creationflags=NO_WINDOW)
        time.sleep(2)
        if proc.poll() is None:
            log.info("New process started (PID %d), exiting old", proc.pid)
            os._exit(0)
        else:
            log.error("New process exited immediately (rc=%s), NOT exiting old process",
                      proc.returncode)
    except Exception as e:
        log.error("Self-update error: %s", e)


# ── RustDesk/SILERS MSI installer ───────────────────────────────────────────

def install_rustdesk(notify_fn=None) -> bool:
    from .config import SILERS_MSI_URL
    from .system import is_rustdesk_installed

    msi = os.path.join(tempfile.gettempdir(), "silers.msi")

    def _notify(msg: str):
        log.info(msg)
        if notify_fn:
            try:
                notify_fn(msg)
            except Exception:
                pass

    try:
        if is_rustdesk_installed():
            _notify("SILERS juz zainstalowany.")
            return True

        _notify("Pobieranie SILERS...")
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(SILERS_MSI_URL, context=ctx, timeout=120) as resp:
            with open(msi, "wb") as f:
                f.write(resp.read())

        _notify("Instalowanie SILERS...")
        proc = subprocess.Popen(
            ["msiexec", "/i", msi, "/qn", "/norestart"],
            creationflags=NO_WINDOW,
        )
        proc.wait(timeout=300)

        if is_rustdesk_installed():
            _notify("SILERS zainstalowany pomyslnie.")
            try:
                os.remove(msi)
            except Exception:
                pass
            return True

        _notify("SILERS nie zostal wykryty po instalacji.")
        return False
    except Exception as e:
        log.error("RustDesk install error: %s", e)
        return False
    finally:
        try:
            os.remove(msi)
        except Exception:
            pass
