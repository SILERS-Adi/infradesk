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


MAX_UPDATE_SIZE = 200 * 1024 * 1024  # 200 MB cap on EXE download
AUTHENTICODE_REQUIRED_SUBJECT = "SILERS"  # required substring in signer cert Subject


def _verify_authenticode(filepath: str) -> tuple[bool, str]:
    """Authenticode signature check via PowerShell. Returns (is_trusted, info).

    is_trusted = True only when Status == Valid and Subject contains the required publisher."""
    # PowerShell reads the path from $args[0] — no f-string interpolation so the
    # filepath cannot break out of the script context.
    ps_script = (
        "$path = $args[0]; "
        "$s = Get-AuthenticodeSignature -FilePath $path; "
        "if ($s.Status -ne 'Valid') { Write-Output \"INVALID:$($s.Status)\"; exit 0 } "
        "$subj = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '' }; "
        "Write-Output \"OK:$subj\""
    )
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script, "--", filepath],
            capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW,
        )
        out = (r.stdout or "").strip()
        if not out.startswith("OK:"):
            return (False, f"signature status: {out or 'unknown'}")
        subj = out[3:]
        if AUTHENTICODE_REQUIRED_SUBJECT.upper() not in subj.upper():
            return (False, f"signer Subject does not match required publisher: {subj[:120]}")
        return (True, subj[:120])
    except Exception as e:
        return (False, f"verify error: {e}")


def _verify_sha256(filepath: str, expected: str) -> bool:
    """Verify SHA256. HARD FAIL gdy hash pusty/zły — chroni przed RCE
    przez MITM lub kompromitację serwera (atakujący wystarczy że zwróci
    version.json bez pola sha256, agent wykona dowolny EXE)."""
    if not expected:
        log.error("No SHA256 hash in version.json — REFUSING update (security)")
        return False
    if len(expected) != 64 or not all(c in "0123456789abcdefABCDEF" for c in expected):
        log.error("Invalid SHA256 format (expected 64 hex chars): %r", expected[:16])
        return False
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
            # Stream with size cap so a malicious server cannot OOM the agent.
            written = 0
            with open(tmp_exe, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > MAX_UPDATE_SIZE:
                        raise RuntimeError(f"Update exceeds size cap ({MAX_UPDATE_SIZE} B)")
                    f.write(chunk)
        log.info("Update downloaded: %d bytes", os.path.getsize(tmp_exe))

        if not _verify_sha256(tmp_exe, expected_sha256):
            _notify("Błąd: plik aktualizacji uszkodzony (SHA256 mismatch). Aktualizacja anulowana.")
            try:
                os.remove(tmp_exe)
            except Exception:
                pass
            return

        # Defense-in-depth: SHA256 alone trusts version.json (same channel as the URL).
        # Authenticode binds trust to the publisher cert chain — independent of HTTPS.
        # In transition period: warn-only when EXE is unsigned, HARD FAIL when signed-but-bad.
        is_trusted, info = _verify_authenticode(tmp_exe)
        if not is_trusted:
            if "INVALID:NotSigned" in info or "signature status: unknown" in info:
                log.warning("Authenticode: EXE not signed (info=%s) — allowing update during signing rollout", info)
            else:
                log.error("Authenticode: REFUSING update — %s", info)
                _notify("Bezpieczeństwo: podpis cyfrowy nieprawidłowy. Aktualizacja anulowana.")
                try:
                    os.remove(tmp_exe)
                except Exception:
                    pass
                return
        else:
            log.info("Authenticode: signature trusted (%s)", info)

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
            # Rollback watchdog — odpalony jako detached cmd. Po 60s sprawdza czy
            # nowy EXE wciąż żyje. Jeśli nie — przywraca .bak i restartuje.
            # Bez tego: nowy EXE crashuje >2s po starcie → agent zombie, brak fallback.
            try:
                _spawn_rollback_watchdog(target, proc.pid)
            except Exception as we:
                log.warning("Rollback watchdog spawn failed (non-fatal): %s", we)
            os._exit(0)
        else:
            log.error("New process exited immediately (rc=%s), restoring .bak",
                      proc.returncode)
            # Natychmiastowy crash — przywróć .bak inline (jesteśmy jeszcze przy życiu)
            try:
                bak = INSTALL_EXE + ".bak"
                if os.path.exists(bak) and target == INSTALL_EXE:
                    if os.path.exists(target):
                        os.remove(target)
                    os.rename(bak, target)
                    log.info("Rolled back to previous version (.bak)")
            except Exception as re_err:
                log.error("Rollback restore failed: %s", re_err)
    except Exception as e:
        log.error("Self-update error: %s", e)


def _spawn_rollback_watchdog(target_exe: str, new_pid: int) -> None:
    """Odpala detached cmd /c batch który po 60s sprawdza czy nowy EXE żyje.
    Jeśli nie → przywraca .bak i startuje go ponownie.

    Watchdog idzie przez schtasks, żeby przeżyć śmierć agenta-rodzica."""
    bak = target_exe + ".bak"
    if not os.path.exists(bak):
        return  # nie ma do czego rollbackować

    watchdog_bat = os.path.join(tempfile.gettempdir(), f"infradesk_rollback_{int(time.time())}.bat")
    exe_name = os.path.basename(target_exe)
    # Po 60s: jeśli żaden proces o tej nazwie nie żyje → restore .bak + start
    bat_content = f"""@echo off
timeout /t 60 /nobreak >nul
tasklist /FI "IMAGENAME eq {exe_name}" 2>nul | find /I "{exe_name}" >nul
if errorlevel 1 (
    echo [{exe_name}] not running after update — rolling back to .bak
    if exist "{target_exe}" del /f /q "{target_exe}" >nul 2>&1
    if exist "{bak}" ren "{bak}" "{exe_name}" >nul 2>&1
    if exist "{target_exe}" start "" "{target_exe}"
)
del /f /q "%~f0" >nul 2>&1
"""
    try:
        with open(watchdog_bat, "w", encoding="utf-8") as f:
            f.write(bat_content)
        # Detached: nie umrze gdy agent-rodzic exitnie
        DETACHED_PROCESS = 0x00000008
        subprocess.Popen(
            ["cmd", "/c", watchdog_bat],
            creationflags=DETACHED_PROCESS | NO_WINDOW,
            close_fds=True,
        )
        log.info("Rollback watchdog spawned (will check PID %d in 60s)", new_pid)
    except Exception as e:
        log.warning("Could not write rollback watchdog batch: %s", e)


# ── RustDesk/SILERS MSI installer ───────────────────────────────────────────

def install_rustdesk(notify_fn=None) -> bool:
    from .config import SILERS_MSI_URL, VERSION_URL
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

        # SECURITY: Pobierz expected SHA256 z version.json (pole `silers_msi_sha256`).
        # Bez tego: jeden MITM = SYSTEM-level RCE przez msiexec /i z dowolnym MSI.
        # Jeśli pole nie jest w version.json — odmów instalacji (hard fail).
        expected_sha256 = ""
        try:
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(VERSION_URL, context=ctx, timeout=10) as r:
                vdata = json.loads(r.read())
            expected_sha256 = vdata.get("silers_msi_sha256", "")
        except Exception as e:
            log.warning("Cannot fetch silers_msi_sha256 from version.json: %s", e)

        _notify("Pobieranie SILERS...")
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(SILERS_MSI_URL, context=ctx, timeout=120) as resp:
            with open(msi, "wb") as f:
                f.write(resp.read())

        if not _verify_sha256(msi, expected_sha256):
            _notify("Bezpieczeństwo: weryfikacja SHA256 SILERS MSI nie powiodła się — instalacja anulowana.")
            log.error("SILERS MSI SHA256 verification failed — refusing install")
            try:
                os.remove(msi)
            except Exception:
                pass
            return False

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
