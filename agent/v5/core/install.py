"""
core/install.py — installation flow, autostart, desktop shortcut,
Add/Remove Programs entry, legacy cleanup, Windows Service install/remove,
uninstall routine.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
import winreg

import psutil

from .config import (
    APP_NAME, APP_VERSION, INSTALL_DIR, INSTALL_EXE, PUBLISHER,
    SERVICE_DESC, SERVICE_DISPLAY, SERVICE_NAME, log, res,
)
from .utils import NO_WINDOW, kill_other_instances


def _set_autostart(enable: bool) -> None:
    try:
        key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_SET_VALUE) as k:
            if enable:
                winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, f'"{INSTALL_EXE}"')
            else:
                try:
                    winreg.DeleteValue(k, APP_NAME)
                except FileNotFoundError:
                    pass
    except Exception:
        pass


def _get_desktop_path() -> str:
    try:
        import ctypes

        CSIDL_DESKTOPDIRECTORY = 0x10
        buf = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(None, CSIDL_DESKTOPDIRECTORY, None, 0, buf)
        if buf.value:
            return buf.value
    except Exception:
        pass
    return os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")


def create_desktop_shortcut() -> None:
    try:
        desktop = _get_desktop_path()
        lnk = os.path.join(desktop, f"{APP_NAME}.lnk")
        target = INSTALL_EXE
        if not os.path.exists(target):
            target = sys.executable

        icon_file = os.path.join(INSTALL_DIR, "icon.ico")
        icon_loc = f"{icon_file},0" if os.path.exists(icon_file) else f"{target},0"

        ps_cmd = (
            f'$s=(New-Object -ComObject WScript.Shell).CreateShortcut("{lnk}");'
            f'$s.TargetPath="{target}";'
            f'$s.WorkingDirectory="{INSTALL_DIR}";'
            f'$s.Description="{APP_NAME}";'
            f'$s.IconLocation="{icon_loc}";'
            f'$s.Save()'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            creationflags=NO_WINDOW, timeout=15,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if result.returncode == 0 and os.path.exists(lnk):
            log.info("Desktop shortcut created: %s", lnk)
            return

        vbs = os.path.join(tempfile.gettempdir(), "infradesk_shortcut.vbs")
        with open(vbs, "w") as f:
            f.write(f'Set s = CreateObject("WScript.Shell").CreateShortcut("{lnk}")\n')
            f.write(f's.TargetPath = "{target}"\n')
            f.write(f's.WorkingDirectory = "{INSTALL_DIR}"\n')
            f.write(f's.Description = "{APP_NAME}"\n')
            f.write(f's.IconLocation = "{icon_loc}"\n')
            f.write('s.Save\n')
        subprocess.run(["cscript", "//Nologo", vbs], creationflags=NO_WINDOW, timeout=15,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            os.remove(vbs)
        except Exception:
            pass
    except Exception as e:
        log.warning("Shortcut creation failed: %s", e)


def _register_in_add_remove() -> None:
    try:
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\InfraDeskBusiness"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as k:
            winreg.SetValueEx(k, "DisplayName",     0, winreg.REG_SZ,    APP_NAME)
            winreg.SetValueEx(k, "DisplayVersion",  0, winreg.REG_SZ,    APP_VERSION)
            winreg.SetValueEx(k, "Publisher",       0, winreg.REG_SZ,    PUBLISHER)
            winreg.SetValueEx(k, "DisplayIcon",     0, winreg.REG_SZ,    f'"{INSTALL_EXE}"')
            winreg.SetValueEx(k, "InstallLocation", 0, winreg.REG_SZ,    INSTALL_DIR)
            winreg.SetValueEx(k, "UninstallString", 0, winreg.REG_SZ,    f'"{INSTALL_EXE}" --uninstall')
            winreg.SetValueEx(k, "NoModify",        0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(k, "NoRepair",        0, winreg.REG_DWORD, 1)
        log.info("Registered in Add/Remove programs (v%s)", APP_VERSION)
    except Exception as e:
        log.warning("Add/Remove register failed: %s", e)


def _cleanup_old_agents() -> None:
    """Remove old Asystent / InfraDesk Agent entries — autostart, A/R, processes."""
    old_names = ["InfraDesk", "InfraDesk Agent", "InfraDesk Server Agent", "Asystent Business"]
    old_exes = ["InfraDesk.exe", "InfraDesk Agent.exe", "InfraDesk Server Agent.exe", "Asystent Business.exe"]

    try:
        key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_SET_VALUE) as k:
            for name in old_names:
                try:
                    winreg.DeleteValue(k, name)
                except FileNotFoundError:
                    pass
        log.info("Old autostart entries cleaned")
    except Exception:
        pass

    for name in ["InfraDesk Agent", "InfraDesk Server Agent", "Asystent Business"]:
        try:
            winreg.DeleteKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall\\" + name)
            log.info("Removed Add/Remove entry: %s", name)
        except FileNotFoundError:
            pass
        except Exception:
            pass

    for svc in ["InfraDeskAgent", "InfraDeskServerAgent", "AsystentBusiness"]:
        try:
            subprocess.run(["net", "stop", svc], capture_output=True, timeout=15, creationflags=NO_WINDOW)
            subprocess.run(["sc", "delete", svc], capture_output=True, timeout=15, creationflags=NO_WINDOW)
            log.info("Removed old service: %s", svc)
        except Exception:
            pass

    my_pid = os.getpid()
    for p in psutil.process_iter(["pid", "name", "exe"]):
        try:
            if p.pid == my_pid:
                continue
            pname = (p.info.get("name") or "").lower()
            pexe = (p.info.get("exe") or "").lower()
            for old in old_exes:
                if old.lower() in pname or old.lower() in pexe:
                    p.terminate()
                    log.info("Killed old agent: %s (pid %d)", pname, p.pid)
                    break
        except Exception:
            pass

    for old_exe in old_exes:
        old_path = os.path.join(INSTALL_DIR, old_exe)
        if os.path.exists(old_path) and old_path.lower() != INSTALL_EXE.lower():
            try:
                os.remove(old_path)
                log.info("Removed old exe: %s", old_path)
            except Exception:
                pass

    try:
        desktop = _get_desktop_path()
        for old_lnk in ["InfraDesk.lnk", "InfraDesk Agent.lnk",
                         "Asystent Business.lnk", "Zgloszenie serwisowe.lnk"]:
            lnk = os.path.join(desktop, old_lnk)
            if os.path.exists(lnk):
                os.remove(lnk)
                log.info("Removed old shortcut: %s", lnk)
    except Exception:
        pass


def install_and_restart() -> None:
    os.makedirs(INSTALL_DIR, exist_ok=True)
    _cleanup_old_agents()
    src = sys.executable
    if src.lower() != INSTALL_EXE.lower():
        kill_other_instances()
        try:
            shutil.copy2(src, INSTALL_EXE)
        except PermissionError:
            bat = os.path.join(INSTALL_DIR, "_upd.bat")
            with open(bat, "w") as f:
                f.write(f'@echo off\ntimeout /t 2 >nul\ncopy /y "{src}" "{INSTALL_EXE}"\nstart "" "{INSTALL_EXE}"\ndel "%~f0"\n')
            subprocess.Popen(["cmd", "/c", bat], close_fds=True, creationflags=NO_WINDOW)
            sys.exit(0)
    _set_autostart(True)
    _register_in_add_remove()
    for fname in ["icon.ico", "ikona.png", "logo.png", "tlo.png"]:
        try:
            src_f = res(fname)
            dst_f = os.path.join(INSTALL_DIR, fname)
            if src_f and os.path.exists(src_f) and src_f != dst_f:
                shutil.copy2(src_f, dst_f)
        except Exception:
            pass
    # UI folder
    ui_src = None
    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        ui_src = os.path.join(meipass, 'ui')
    if not ui_src or not os.path.isdir(ui_src):
        ui_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ui')
        ui_src = os.path.abspath(ui_src)
    ui_dst = os.path.join(INSTALL_DIR, 'ui')
    if os.path.isdir(ui_src) and os.path.abspath(ui_src) != os.path.abspath(ui_dst):
        try:
            if os.path.exists(ui_dst):
                shutil.rmtree(ui_dst)
            shutil.copytree(ui_src, ui_dst)
            log.info("UI folder updated: %s → %s", ui_src, ui_dst)
        except Exception as e:
            log.warning("Failed to copy UI folder: %s", e)
    create_desktop_shortcut()
    subprocess.Popen([INSTALL_EXE], close_fds=True, creationflags=NO_WINDOW)
    sys.exit(0)


def do_uninstall() -> None:
    _set_autostart(False)
    try:
        winreg.DeleteKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\InfraDeskBusiness")
    except Exception:
        pass
    # Also remove legacy Asystent Business entry if present
    try:
        winreg.DeleteKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Asystent Business")
    except Exception:
        pass
    log.info("Uninstall registry entries removed")
    print(f"{APP_NAME} odinstalowany.\nMozesz recznie usunac folder: {INSTALL_DIR}")


def sync_ui_on_start() -> None:
    """Sync bundled UI to install dir — ensures UI updates with the exe."""
    try:
        ui_src = None
        mp = getattr(sys, '_MEIPASS', None)
        if mp:
            ui_src = os.path.join(mp, 'ui')
        if not ui_src or not os.path.isdir(ui_src):
            ui_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ui')
            ui_src = os.path.abspath(ui_src)
        ui_dst = os.path.join(INSTALL_DIR, 'ui')
        if not os.path.isdir(ui_src) or os.path.abspath(ui_src) == os.path.abspath(ui_dst):
            return
        key_files = ['script.js', 'business.html', 'aicore.js', 'aicore.css', 'styles.css']

        def _sum_sizes(dir_):
            total = 0
            for n in key_files:
                p = os.path.join(dir_, n)
                if os.path.isfile(p):
                    try:
                        total += os.path.getsize(p)
                    except Exception:
                        pass
            return total

        if os.path.isdir(ui_dst) and _sum_sizes(ui_src) == _sum_sizes(ui_dst):
            return
        if os.path.exists(ui_dst):
            shutil.rmtree(ui_dst)
        shutil.copytree(ui_src, ui_dst)
        log.info("UI synced: %s → %s", ui_src, ui_dst)
    except Exception as e:
        log.warning("UI sync failed: %s", e)


# ── Windows Service ──────────────────────────────────────────────────────────

try:
    import win32serviceutil  # type: ignore
    import win32service  # type: ignore
    import win32event  # type: ignore
    import servicemanager  # type: ignore

    class InfraDeskBusinessService(win32serviceutil.ServiceFramework):
        _svc_name_         = SERVICE_NAME
        _svc_display_name_ = SERVICE_DISPLAY
        _svc_description_  = SERVICE_DESC

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
            self._loop = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self.hWaitStop)
            if self._loop:
                self._loop.stop()
            log.info("Service stop requested")

        def SvcDoRun(self):
            # Deferred import to avoid circular deps at module load
            import threading

            from .config import load_config
            # ServerServiceLoop lives with the Business variant for v5; Phase 1
            # keeps the same inline loop used by the Business variant.
            from ..variants.business import ServerServiceLoop

            servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                                  servicemanager.PYS_SERVICE_STARTED,
                                  (self._svc_name_, ''))
            log.info("%s service starting", APP_NAME)
            cfg = load_config()
            if not cfg.get("token") or cfg.get("status") != "ACTIVE":
                log.error("Service cannot start — not registered")
                return
            self._loop = ServerServiceLoop(cfg["token"], cfg)
            threading.Thread(target=self._loop.start, daemon=True).start()
            win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
            log.info("Service stopped")

    _HAS_WIN32SVC = True
except ImportError:
    _HAS_WIN32SVC = False


def install_service() -> None:
    if not _HAS_WIN32SVC:
        print("ERROR: pywin32 nie jest zainstalowany. Uruchom: pip install pywin32")
        return
    try:
        win32serviceutil.InstallService(
            InfraDeskBusinessService._svc_reg_class_,
            SERVICE_NAME, SERVICE_DISPLAY,
            startType=win32service.SERVICE_AUTO_START,
            description=SERVICE_DESC,
        )
        print(f"[OK] Usluga '{SERVICE_DISPLAY}' zainstalowana.")
        print(f"     Uruchom: net start {SERVICE_NAME}")
    except Exception as e:
        exe_path = sys.executable if not getattr(sys, 'frozen', False) else INSTALL_EXE
        cmd = f'sc create {SERVICE_NAME} binPath= "\"{exe_path}\" --service" start= auto DisplayName= "{SERVICE_DISPLAY}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            subprocess.run(f'sc description {SERVICE_NAME} "{SERVICE_DESC}"',
                           shell=True, capture_output=True)
            print(f"[OK] Usluga '{SERVICE_DISPLAY}' zainstalowana (sc.exe).")
        else:
            print(f"[BLAD] Nie udalo sie zainstalowac uslugi: {e}\n{result.stderr}")


def remove_service() -> None:
    try:
        subprocess.run(f"net stop {SERVICE_NAME}", shell=True, capture_output=True)
        time.sleep(2)
    except Exception:
        pass
    try:
        if _HAS_WIN32SVC:
            win32serviceutil.RemoveService(SERVICE_NAME)
        else:
            subprocess.run(f"sc delete {SERVICE_NAME}", shell=True, capture_output=True)
        print(f"[OK] Usluga '{SERVICE_DISPLAY}' usunieta.")
    except Exception as e:
        print(f"[BLAD] {e}")
