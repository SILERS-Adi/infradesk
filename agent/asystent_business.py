"""
InfraDesk Business v4.0.1
SILERS — Błaszczykowski Adrian
Monitoring, backup, diagnostyka, zdalne zarządzanie.
Pywebview UI: overview + formularz zgłoszenia.
"""

import os, sys, re, json, time, shutil, socket, logging, platform
import threading, subprocess, winreg, tempfile, urllib.request, base64, io

_NO_WINDOW = subprocess.CREATE_NO_WINDOW
from datetime import datetime

import psutil, requests, websocket, pystray
from PIL import Image, ImageGrab, ImageDraw

# Top-level import to ensure PyInstaller bundles tkinter + Tcl/Tk runtime
import tkinter  # noqa: F401
import tkinter.ttk  # noqa: F401
import tkinter.messagebox  # noqa: F401

# --- Config ---------------------------------------------------------------

APP_NAME    = "InfraDesk Business"
APP_VERSION = "4.14.6"
PUBLISHER   = "SILERS — Błaszczykowski Adrian"
INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "SILERS", "InfraDesk Business")
INSTALL_EXE = os.path.join(INSTALL_DIR, "InfraDesk Business.exe")
CONFIG_FILE = os.path.join(INSTALL_DIR, "config.json")
TENANT_FILE = os.path.join(INSTALL_DIR, "tenant.json")

# Stare ścieżki — migracja konfiguracji
_OLD_DIRS = [
    os.path.join(os.environ.get("APPDATA", ""), "SILERS", "Asystent Business"),
    os.path.join(os.environ.get("APPDATA", ""), "InfraDesk"),
]


def _migrate_old_config():
    """Migrate config from old Asystent Business / InfraDesk to InfraDesk Business."""
    if os.path.exists(CONFIG_FILE):
        return
    for old_dir in _OLD_DIRS:
        old_cfg = os.path.join(old_dir, "config.json")
        if os.path.exists(old_cfg):
            os.makedirs(INSTALL_DIR, exist_ok=True)
            shutil.copy2(old_cfg, CONFIG_FILE)
            old_tenant = os.path.join(old_dir, "tenant.json")
            if os.path.exists(old_tenant):
                shutil.copy2(old_tenant, TENANT_FILE)
            break


_migrate_old_config()
API_BASE    = "https://infradesk.pl/api"
PORTAL_URL  = "https://infradesk.pl/portal"
WS_BASE     = "wss://infradesk.pl/api/agent/ws"
VERSION_URL = "https://infradesk.pl/downloads/version.json"
SILERS_MSI_URL = "https://infradesk.pl/downloads/silers.msi"


def _load_tenant_key() -> str | None:
    cfg = load_config()
    if cfg.get("tenantKey"):
        return cfg["tenantKey"]
    try:
        with open(TENANT_FILE, encoding="utf-8") as f:
            data = json.load(f)
            if data.get("tenantKey"):
                return data["tenantKey"]
    except Exception:
        pass
    for arg in sys.argv[1:]:
        if arg.startswith("--tenant-key="):
            return arg.split("=", 1)[1]
    return None


os.makedirs(INSTALL_DIR, exist_ok=True)
_log_file = os.path.join(INSTALL_DIR, "infradesk_business.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("infradesk_business")

# --- Kolory (tray icon fallback) -----------------------------------------

BG      = "#080D19"
SURF    = "#0C1220"
SURF2   = "#131B2E"
PRI     = "#6D28D9"
PRI_H   = "#5B21B6"
SEC     = "#2563EB"
TXT     = "#F3F4F6"
TXT_DIM = "#71717A"
OK_C    = "#10b981"
ERR_C   = "#ef4444"
WARN_C  = "#f59e0b"
BORDER  = "#1E293B"
FONT    = "Segoe UI"

# --- Zasoby ---------------------------------------------------------------

def res(name: str) -> str:
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, name)
    for d in [os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "..", "GRAFIKI")]:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return name


# --- Config I/O (with DPAPI token encryption on Windows) ------------------

def _dpapi_encrypt(plaintext: str) -> str:
    try:
        import win32crypt, base64
        blob = win32crypt.CryptProtectData(
            plaintext.encode("utf-8"), "InfraDesk Agent Token", None, None, None, 0)
        return "dpapi:" + base64.b64encode(blob).decode("ascii")
    except Exception as e:
        log.warning("DPAPI unavailable — token saved as plaintext: %s", e)
        return plaintext  # Fallback: store unencrypted (better than crash)

def _dpapi_decrypt(encrypted: str) -> str:
    if not encrypted.startswith("dpapi:"):
        return encrypted
    try:
        import win32crypt, base64
        blob = base64.b64decode(encrypted[6:])
        _, data = win32crypt.CryptUnprotectData(blob, None, None, None, 0)
        return data.decode("utf-8")
    except Exception as e:
        log.warning("DPAPI decrypt failed: %s", e)
        return encrypted

def load_config() -> dict:
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
        if cfg.get("token"):
            cfg["token"] = _dpapi_decrypt(cfg["token"])
        if cfg.get("token") and not cfg.get("_encrypted"):
            cfg["_encrypted"] = True
            save_config(cfg)
        return cfg
    except Exception:
        return {}


def save_config(data: dict):
    os.makedirs(INSTALL_DIR, exist_ok=True)
    to_save = dict(data)
    if to_save.get("token") and not to_save.get("token", "").startswith("dpapi:"):
        to_save["token"] = _dpapi_encrypt(to_save["token"])
    to_save["_encrypted"] = True
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(to_save, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    try:
        if os.path.exists(CONFIG_FILE):
            os.replace(tmp, CONFIG_FILE)
        else:
            os.rename(tmp, CONFIG_FILE)
    except Exception:
        shutil.copy2(tmp, CONFIG_FILE)
        try: os.remove(tmp)
        except Exception: pass
    log.info("Config SAVED: %s (keys=%s)", CONFIG_FILE, list(to_save.keys()))


# --- Instalacja -----------------------------------------------------------

def is_frozen(): return getattr(sys, "frozen", False)
def is_installed():
    if not is_frozen(): return True
    exe_path = os.path.abspath(sys.executable).lower()
    if exe_path == INSTALL_EXE.lower():
        return True
    prog_dirs = [os.environ.get("PROGRAMFILES", ""), os.environ.get("PROGRAMFILES(X86)", "")]
    for d in prog_dirs:
        if d and exe_path.startswith(d.lower()):
            return True
    return False


def _set_autostart(enable: bool):
    try:
        key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_SET_VALUE) as k:
            if enable:
                winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, f'"{INSTALL_EXE}"')
            else:
                try: winreg.DeleteValue(k, APP_NAME)
                except FileNotFoundError: pass
    except Exception: pass


def _kill_others():
    cur = os.getpid()
    for p in psutil.process_iter(["pid", "name", "exe"]):
        try:
            if p.pid == cur: continue
            pname = (p.info.get("name") or "").lower()
            pexe = (p.info.get("exe") or "").lower()
            if "infradesk business" in pname or "asystent business" in pname or INSTALL_EXE.lower() == pexe:
                p.terminate(); p.wait(timeout=3)
        except Exception: pass


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


def create_desktop_shortcut():
    try:
        desktop = _get_desktop_path()
        lnk = os.path.join(desktop, "InfraDesk Business.lnk")
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
            creationflags=_NO_WINDOW, timeout=15,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if result.returncode == 0 and os.path.exists(lnk):
            log.info("Desktop shortcut created: %s", lnk)
            return

        # VBScript fallback
        vbs = os.path.join(tempfile.gettempdir(), "ab_shortcut.vbs")
        with open(vbs, "w") as f:
            f.write(f'Set s = CreateObject("WScript.Shell").CreateShortcut("{lnk}")\n')
            f.write(f's.TargetPath = "{target}"\n')
            f.write(f's.WorkingDirectory = "{INSTALL_DIR}"\n')
            f.write(f's.Description = "{APP_NAME}"\n')
            f.write(f's.IconLocation = "{icon_loc}"\n')
            f.write('s.Save\n')
        subprocess.run(["cscript", "//Nologo", vbs], creationflags=_NO_WINDOW, timeout=15,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try: os.remove(vbs)
        except Exception: pass
    except Exception as e:
        log.warning("Shortcut creation failed: %s", e)


def _register_in_add_remove():
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


def _cleanup_old_agents():
    """Remove old InfraDesk Agent / Server Agent entries (autostart, Add/Remove, processes)."""
    old_names = ["InfraDesk", "InfraDesk Agent", "InfraDesk Server Agent", "Asystent Business"]
    old_exes = ["InfraDesk.exe", "InfraDesk Agent.exe", "InfraDesk Server Agent.exe", "Asystent Business.exe"]

    # Remove old autostart entries
    try:
        key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_SET_VALUE) as k:
            for name in old_names:
                try: winreg.DeleteValue(k, name)
                except FileNotFoundError: pass
        log.info("Old autostart entries cleaned")
    except Exception: pass

    # Remove old Add/Remove Programs entries
    for name in ["InfraDesk Agent", "InfraDesk Server Agent", "Asystent Business"]:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall\\" + name)
            log.info("Removed Add/Remove entry: %s", name)
        except FileNotFoundError: pass
        except Exception: pass

    # Remove old Windows Service
    for svc in ["InfraDeskAgent", "InfraDeskServerAgent", "AsystentBusiness"]:
        try:
            subprocess.run(["net", "stop", svc], capture_output=True, timeout=15,
                           creationflags=_NO_WINDOW)
            subprocess.run(["sc", "delete", svc], capture_output=True, timeout=15,
                           creationflags=_NO_WINDOW)
            log.info("Removed old service: %s", svc)
        except Exception: pass

    # Kill old agent processes
    my_pid = os.getpid()
    for p in psutil.process_iter(["pid", "name", "exe"]):
        try:
            if p.pid == my_pid: continue
            pname = (p.info.get("name") or "").lower()
            pexe = (p.info.get("exe") or "").lower()
            for old in old_exes:
                if old.lower() in pname or old.lower() in pexe:
                    p.terminate()
                    log.info("Killed old agent: %s (pid %d)", pname, p.pid)
                    break
        except Exception: pass

    # Remove old exe files from INSTALL_DIR
    for old_exe in old_exes:
        old_path = os.path.join(INSTALL_DIR, old_exe)
        if os.path.exists(old_path) and old_path.lower() != INSTALL_EXE.lower():
            try:
                os.remove(old_path)
                log.info("Removed old exe: %s", old_path)
            except Exception:
                pass

    # Remove old desktop shortcuts
    try:
        desktop = _get_desktop_path()
        for old_lnk in ["InfraDesk.lnk", "InfraDesk Agent.lnk", "Asystent Business.lnk", "Zgloszenie serwisowe.lnk"]:
            lnk = os.path.join(desktop, old_lnk)
            if os.path.exists(lnk):
                os.remove(lnk)
                log.info("Removed old shortcut: %s", lnk)
    except Exception: pass


def install_and_restart():
    os.makedirs(INSTALL_DIR, exist_ok=True)
    _cleanup_old_agents()
    src = sys.executable
    if src.lower() != INSTALL_EXE.lower():
        _kill_others()
        try:
            shutil.copy2(src, INSTALL_EXE)
        except PermissionError:
            bat = os.path.join(INSTALL_DIR, "_upd.bat")
            with open(bat, "w") as f:
                f.write(f'@echo off\ntimeout /t 2 >nul\ncopy /y "{src}" "{INSTALL_EXE}"\nstart "" "{INSTALL_EXE}"\ndel "%~f0"\n')
            subprocess.Popen(["cmd", "/c", bat], close_fds=True, creationflags=_NO_WINDOW)
            sys.exit(0)
    _set_autostart(True)
    _register_in_add_remove()
    for fname in ["icon.ico", "ikona.png", "logo.png", "tlo.png"]:
        try:
            src_f = res(fname)
            dst_f = os.path.join(INSTALL_DIR, fname)
            if src_f and os.path.exists(src_f) and src_f != dst_f:
                shutil.copy2(src_f, dst_f)
        except Exception: pass
    # Copy UI folder from bundled resources to install dir
    ui_src = None
    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        ui_src = os.path.join(meipass, 'ui')
    if not ui_src or not os.path.isdir(ui_src):
        ui_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui')
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
    subprocess.Popen([INSTALL_EXE], close_fds=True, creationflags=_NO_WINDOW)
    sys.exit(0)


# --- Sprzet ---------------------------------------------------------------

def _wmic(q: str) -> str:
    try:
        r = subprocess.run(["wmic"] + q.split(), capture_output=True, text=True, timeout=6,
                           creationflags=_NO_WINDOW)
        lines = [l.strip() for l in r.stdout.splitlines() if l.strip()]
        return lines[-1] if len(lines) >= 2 else ""
    except Exception: return ""


def _read_rustdesk_toml(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            for line in f:
                s = line.strip()
                if s.startswith("id =") or s.startswith("id="):
                    val = s.split("=", 1)[1].strip().strip('"').strip("'").strip()
                    if val and val != "0":
                        return val
    except Exception:
        pass
    return None


def _rustdesk_exe() -> str | None:
    for exe in [r"C:\Program Files\SILERS\SILERS.exe",
                r"C:\Program Files\SILERS\rustdesk.exe",
                r"C:\Program Files\SILERS\RustDesk\rustdesk.exe",
                r"C:\Program Files\RustDesk\rustdesk.exe",
                r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
        if os.path.exists(exe): return exe
    return None


def _rustdesk_set_one_time_password(length: int = 6) -> str | None:
    """Ustawia jednorazowe hasło RustDesk i zwraca je. None jeśli RustDesk niedostępny."""
    exe = _rustdesk_exe()
    if not exe: return None
    import secrets
    # 6-cyfrowe hasło łatwe do przedyktowania technikowi
    pwd = "".join(secrets.choice("0123456789") for _ in range(length))
    try:
        subprocess.run([exe, "--password", pwd], capture_output=True, timeout=10,
                       creationflags=_NO_WINDOW)
        log.info("RustDesk one-time password set (len=%d)", length)
        return pwd
    except Exception as e:
        log.error("Set RustDesk password failed: %s", e)
        return None


def _rustdesk_id() -> str | None:
    fixed = [
        os.path.join(os.environ.get("APPDATA", ""), "RustDesk", "config", "RustDesk.toml"),
        r"C:\ProgramData\RustDesk\config\RustDesk.toml",
        r"C:\Program Files\SILERS\config\RustDesk.toml",
        r"C:\Program Files\SILERS\RustDesk\config\RustDesk.toml",
        r"C:\Program Files\SILERS\RustDesk.toml",
        r"C:\Windows\System32\config\systemprofile\AppData\Roaming\RustDesk\config\RustDesk.toml",
        r"C:\Windows\ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk.toml",
        r"C:\Windows\ServiceProfiles\NetworkService\AppData\Roaming\RustDesk\config\RustDesk.toml",
    ]
    for path in fixed:
        val = _read_rustdesk_toml(path)
        if val:
            return val

    try:
        users_dir = r"C:\Users"
        for user in os.listdir(users_dir):
            path = os.path.join(users_dir, user, "AppData", "Roaming",
                                "RustDesk", "config", "RustDesk.toml")
            val = _read_rustdesk_toml(path)
            if val:
                return val
    except Exception:
        pass

    try:
        for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
            for subkey in [r"SOFTWARE\RustDesk", r"SOFTWARE\WOW6432Node\RustDesk"]:
                try:
                    with winreg.OpenKey(hive, subkey) as k:
                        val = str(winreg.QueryValueEx(k, "id")[0]).strip()
                        if val and val != "0":
                            return val
                except Exception:
                    pass
    except Exception:
        pass

    try:
        for exe in [r"C:\Program Files\SILERS\SILERS.exe",
                    r"C:\Program Files\SILERS\rustdesk.exe",
                    r"C:\Program Files\SILERS\RustDesk\rustdesk.exe",
                    r"C:\Program Files\RustDesk\rustdesk.exe",
                    r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
            if os.path.exists(exe):
                r = subprocess.run([exe, "--get-id"], capture_output=True, text=True,
                                   timeout=6, creationflags=_NO_WINDOW)
                val = (r.stdout.strip() or r.stderr.strip())
                if val and not val.lower().startswith("error") and len(val) > 3:
                    return val
    except Exception:
        pass

    try:
        ps = (
            "$id = $null; "
            "Get-ChildItem 'C:\\Users' -Directory -ErrorAction SilentlyContinue | ForEach-Object { "
            "  $p = Join-Path $_.FullName 'AppData\\Roaming\\RustDesk\\config\\RustDesk.toml'; "
            "  if (Test-Path $p) { "
            "    $l = Get-Content $p -ErrorAction SilentlyContinue | Where-Object { $_ -match '^id\\s*=' } | Select-Object -First 1; "
            "    if ($l) { $id = ($l -split '=',2)[1].Trim().Trim('\"') } "
            "  } "
            "}; "
            "if (-not $id) { "
            "  $p2 = 'C:\\ProgramData\\RustDesk\\config\\RustDesk.toml'; "
            "  if (Test-Path $p2) { "
            "    $l = Get-Content $p2 -ErrorAction SilentlyContinue | Where-Object { $_ -match '^id\\s*=' } | Select-Object -First 1; "
            "    if ($l) { $id = ($l -split '=',2)[1].Trim().Trim('\"') } "
            "  } "
            "}; "
            "if ($id) { Write-Output $id }"
        )
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
        val = r.stdout.strip()
        if val and len(val) > 3:
            return val
    except Exception:
        pass

    return None


def _anydesk_id() -> str | None:
    paths = [
        os.path.join(os.environ.get("PROGRAMDATA", ""), "AnyDesk", "system.conf"),
        os.path.join(os.environ.get("APPDATA", ""),    "AnyDesk", "system.conf"),
    ]
    for p in paths:
        try:
            with open(p) as f:
                for line in f:
                    if line.strip().startswith("ad.anynet.id"):
                        return line.split("=", 1)[1].strip()
        except Exception: pass
    return None


def _teamviewer_id() -> str | None:
    paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\TeamViewer"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\TeamViewer"),
    ]
    for hive, path in paths:
        try:
            with winreg.OpenKey(hive, path) as k:
                val = winreg.QueryValueEx(k, "ClientID")[0]
                if val: return str(val)
        except Exception: pass
    return None


def _cpu_temp() -> float | None:
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-WmiObject -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature"
             " -ErrorAction SilentlyContinue).CurrentTemperature |"
             " ForEach-Object { [math]::Round($_ / 10.0 - 273.15, 1) }"],
            capture_output=True, text=True, timeout=8,
            creationflags=_NO_WINDOW)
        vals = [float(v) for v in r.stdout.split() if v.strip()]
        return round(sum(vals) / len(vals), 1) if vals else None
    except Exception: return None


def _software() -> list:
    SKIP = ("update for","hotfix","security update","service pack","kb",
            "microsoft .net","microsoft visual c++","windows sdk","windows driver")
    sw: dict = {}
    paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    for hive, path in paths:
        try:
            with winreg.OpenKey(hive, path) as k:
                for i in range(winreg.QueryInfoKey(k)[0]):
                    try:
                        with winreg.OpenKey(k, winreg.EnumKey(k, i)) as s:
                            def v(n):
                                try: return winreg.QueryValueEx(s, n)[0]
                                except: return ""
                            def vi(n):
                                try: return int(winreg.QueryValueEx(s, n)[0])
                                except: return 0
                            name = v("DisplayName")
                            if not name: continue
                            if vi("SystemComponent"): continue
                            if v("ParentKeyName"): continue
                            if not v("UninstallString"): continue
                            if any(name.lower().startswith(p) for p in SKIP): continue
                            idate = v("InstallDate")  # YYYYMMDD
                            if idate and len(str(idate)) == 8:
                                idate = f"{str(idate)[:4]}-{str(idate)[4:6]}-{str(idate)[6:8]}"
                            sw[name] = {
                                "name": name, "version": v("DisplayVersion"),
                                "publisher": v("Publisher"),
                                "installDate": idate or "",
                                "sizeMB": round(vi("EstimatedSize") / 1024, 1) if vi("EstimatedSize") else 0,
                            }
                    except Exception: pass
        except Exception: pass
    return sorted(sw.values(), key=lambda x: x["name"].lower())


def machine_info() -> dict:
    info: dict = {
        "hostname":    socket.gethostname(),
        "osInfo":      f"{platform.system()} {platform.release()}",
        "domain":      os.environ.get("USERDOMAIN", ""),
        "currentUser": os.environ.get("USERNAME", ""),
    }
    try: info["ipAddress"] = socket.gethostbyname(info["hostname"])
    except Exception: info["ipAddress"] = "127.0.0.1"
    try:
        info["windowsVersion"] = platform.version()
        info["cpuModel"]   = platform.processor()
        info["cpuCores"]   = psutil.cpu_count(logical=False) or 1
        info["cpuThreads"] = psutil.cpu_count(logical=True) or 1
        info["ramTotalGb"] = round(psutil.virtual_memory().total / (1024**3), 2)
    except Exception: pass
    for key, q in [("gpuModel","path win32_VideoController get Name"),
                   ("serialNumber","bios get SerialNumber"),
                   ("motherboard","baseboard get Product")]:
        val = _wmic(q).strip()
        if val and val.lower() not in (key, "serialnumber", "to be filled by o.e.m.", "product", "name"):
            info[key] = val
    try:
        info["lastBootTime"] = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%dT%H:%M:%S")
    except Exception: pass
    try:
        disks = []
        for p in psutil.disk_partitions():
            try:
                u = psutil.disk_usage(p.mountpoint)
                disks.append({"device": p.device, "mountpoint": p.mountpoint,
                               "fstype": p.fstype,
                               "totalGb": round(u.total/(1024**3), 2),
                               "freeGb":  round(u.free /(1024**3), 2),
                               "usedPct": u.percent})
            except Exception: pass
        info["diskInfo"] = disks
    except Exception: pass
    try:
        addrs, stats = psutil.net_if_addrs(), psutil.net_if_stats()
        ifaces = []
        for name, al in addrs.items():
            ip4 = mac = ""
            for a in al:
                if a.family == socket.AF_INET: ip4 = a.address
                elif a.family == psutil.AF_LINK: mac = a.address
            s = stats.get(name)
            ifaces.append({"name": name, "ip": ip4, "mac": mac, "isUp": s.isup if s else False})
        info["networkIfaces"] = ifaces
    except Exception: pass
    rd = _rustdesk_id()
    if rd: info["rustdeskId"] = rd
    ad = _anydesk_id()
    if ad: info["anydeskId"] = ad
    tv = _teamviewer_id()
    if tv: info["teamviewerId"] = tv
    return info


def metrics() -> dict:
    d = machine_info()
    d["appVersion"] = APP_VERSION
    try:
        c = psutil.disk_usage("C:\\")
        d["diskFree"]  = round(c.free /(1024**3), 2)
        d["diskTotal"] = round(c.total/(1024**3), 2)
    except Exception: pass
    d["cpuUsage"] = psutil.cpu_percent(interval=1)
    d["ramUsage"] = psutil.virtual_memory().percent
    t = _cpu_temp()
    if t is not None: d["cpuTempC"] = t
    return d


def full_inventory() -> dict:
    d = metrics()
    try: d["installedSoftware"] = _software()
    except Exception: pass
    return d


# --- RustDesk -------------------------------------------------------------

def is_rustdesk_installed() -> bool:
    for p in [r"C:\Program Files\SILERS\SILERS.exe",
              r"C:\Program Files\RustDesk\rustdesk.exe",
              r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
        if os.path.exists(p): return True
    return False


def install_rustdesk(notify_fn=None) -> bool:
    msi = os.path.join(tempfile.gettempdir(), "silers.msi")

    def _notify(msg):
        log.info(msg)
        if notify_fn:
            try: notify_fn(msg)
            except Exception: pass

    try:
        if is_rustdesk_installed():
            _notify("SILERS juz zainstalowany.")
            return True

        _notify("Pobieranie SILERS...")
        import ssl
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(SILERS_MSI_URL, context=ctx, timeout=120) as resp:
            with open(msi, "wb") as f:
                f.write(resp.read())

        _notify("Instalowanie SILERS...")
        proc = subprocess.Popen(
            ["msiexec", "/i", msi, "/qn", "/norestart"],
            creationflags=_NO_WINDOW,
        )
        proc.wait(timeout=300)

        if is_rustdesk_installed():
            _notify("SILERS zainstalowany pomyslnie.")
            try: os.remove(msi)
            except Exception: pass
            return True

        _notify("SILERS nie zostal wykryty po instalacji.")
        return False
    except Exception as e:
        log.error("RustDesk install error: %s", e)
        return False
    finally:
        try: os.remove(msi)
        except Exception: pass


# --- Auto-update ----------------------------------------------------------

def check_for_update():
    try:
        import ssl
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(VERSION_URL, context=ctx, timeout=10) as r:
            data = json.loads(r.read())
        remote = data.get("version", "0.0.0")
        if tuple(int(x) for x in remote.split(".")) > tuple(int(x) for x in APP_VERSION.split(".")):
            return remote, data.get("url", "https://infradesk.pl/downloads/AsystentBusiness.exe"), data.get("sha256", "")
    except Exception as e:
        log.debug("Update check failed: %s", e)
    return None


def _verify_sha256(filepath: str, expected: str) -> bool:
    """Verify SHA256 hash of a file. Returns True if matches or no hash provided."""
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


def do_self_update(download_url, notify_fn=None, expected_sha256=""):
    def _notify(msg):
        log.info(msg)
        if notify_fn:
            try: notify_fn(msg)
            except Exception: pass

    try:
        tmp_exe = os.path.join(tempfile.gettempdir(), "ab_update.exe")
        _notify("Pobieranie aktualizacji...")
        import ssl, shutil
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(download_url, context=ctx, timeout=120) as resp:
            with open(tmp_exe, "wb") as f:
                f.write(resp.read())
        log.info("Update downloaded: %d bytes", os.path.getsize(tmp_exe))

        # Verify integrity before executing
        if not _verify_sha256(tmp_exe, expected_sha256):
            _notify("Błąd: plik aktualizacji uszkodzony (SHA256 mismatch). Aktualizacja anulowana.")
            try: os.remove(tmp_exe)
            except Exception: pass
            return

        # Copy new EXE to install dir (replacing current)
        os.makedirs(INSTALL_DIR, exist_ok=True)
        target = INSTALL_EXE
        try:
            # On Windows, can't replace running EXE directly — rename old first
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

        # Update UI folder from new exe's bundled resources
        try:
            # Run new exe briefly to extract _MEIPASS, then copy ui/ from there
            # Simpler: extract from current _MEIPASS since we're running the same codebase
            ui_src = None
            mp = getattr(sys, '_MEIPASS', None)
            if mp:
                ui_src = os.path.join(mp, 'ui')
            if not ui_src or not os.path.isdir(ui_src):
                ui_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui')
            ui_dst = os.path.join(INSTALL_DIR, 'ui')
            if os.path.isdir(ui_src) and os.path.abspath(ui_src) != os.path.abspath(ui_dst):
                if os.path.exists(ui_dst):
                    shutil.rmtree(ui_dst)
                shutil.copytree(ui_src, ui_dst)
                log.info("UI updated: %s → %s", ui_src, ui_dst)
        except Exception as ue:
            log.warning("UI update failed: %s", ue)

        _notify("Restartuje...")
        # Preserve original args (e.g. --service)
        args = [a for a in sys.argv[1:] if a not in ("--update",)]
        proc = subprocess.Popen([target] + args, close_fds=True, creationflags=_NO_WINDOW)
        # Verify new process started before exiting
        time.sleep(2)
        if proc.poll() is None:
            log.info("New process started (PID %d), exiting old", proc.pid)
            os._exit(0)
        else:
            log.error("New process exited immediately (rc=%s), NOT exiting old process", proc.returncode)
            # Don't exit — keep running old version rather than dying completely
    except Exception as e:
        log.error("Self-update error: %s", e)


# --- API ------------------------------------------------------------------

def api_post(path, data, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{API_BASE}{path}", json=data, headers=h, timeout=15)
    r.raise_for_status()
    return r.json()


def api_get(path, token=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.get(f"{API_BASE}{path}", headers=h, timeout=10)
    r.raise_for_status()
    return r.json()


def api_patch(path, data, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    r = requests.patch(f"{API_BASE}{path}", json=data, headers=h, timeout=15)
    r.raise_for_status()
    return r.json()


def do_login(email, pwd):
    cfg = load_config()
    body = {"email": email, "password": pwd, "agentType": "CLIENT", **metrics()}
    if cfg.get("deviceId"):
        body["deviceId"] = cfg["deviceId"]
    tenant_key = _load_tenant_key()
    if tenant_key:
        body["tenantKey"] = tenant_key
    return api_post("/agent/register", body)


def do_register(form):
    body = {k: v for k, v in {**form, "agentType": "CLIENT", **full_inventory()}.items() if v is not None}
    tenant_key = _load_tenant_key()
    if tenant_key:
        body["tenantKey"] = tenant_key
    return api_post("/agent/register", body)


def do_metrics(token, data=None):
    if data is None:
        data = metrics()
    api_post("/agent/metrics", data, token=token)


def do_ticket(token, title, desc, priority, due_iso=None):
    p = {"title": title, "description": desc, "priority": priority}
    if due_iso: p["dueAt"] = due_iso
    return api_post("/agent/ticket", p, token=token)


def upload_screenshot(path_: str, token: str) -> str | None:
    try:
        with open(path_, "rb") as f:
            r = requests.post(
                f"{API_BASE}/agent/upload",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": (os.path.basename(path_), f, "image/jpeg")},
                timeout=30,
            )
            r.raise_for_status()
            return f"https://infradesk.pl{r.json()['url']}"
    except Exception as e:
        log.error("Screenshot upload error: %s", e)
        return None


def check_status(token):
    try: return api_get("/agent/status", token)
    except Exception: return None


# --- Wake-on-LAN ----------------------------------------------------------

def _send_wol(mac: str):
    try:
        mac_clean = mac.replace(":", "").replace("-", "").upper()
        if len(mac_clean) != 12 or not all(c in "0123456789ABCDEF" for c in mac_clean):
            log.warning("WoL: nieprawidlowy MAC: %s", mac)
            return
        magic = bytes.fromhex("FF" * 6 + mac_clean * 16)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.sendto(magic, ("255.255.255.255", 9))
        log.info("WoL wyslany do %s", mac)
    except Exception as e:
        log.error("WoL blad: %s", e)


# --- WebSocket ------------------------------------------------------------

class WS:
    _BACKOFF_MIN = 5
    _BACKOFF_MAX = 300

    def __init__(self, token, on_msg):
        self.token = token; self.cb = on_msg; self._sock = None; self._backoff = self._BACKOFF_MIN
    def start(self):
        threading.Thread(target=self._run, daemon=True).start()
    def send(self, data):
        """Send data back to server (thread-safe via raw socket)."""
        try:
            s = self._sock
            if s:
                from websocket import ABNF
                s.send(data, ABNF.OPCODE_TEXT)
        except Exception as e:
            log.error("WS send error: %s", e)
    def _run(self):
        import random
        while True:
            try:
                ws_url = f"{WS_BASE}?hostname={socket.gethostname()}"
                app = websocket.WebSocketApp(ws_url,
                    header=[f"Authorization: Bearer {self.token}"],
                    on_open=lambda ws: self._on_open(ws),
                    on_message=lambda ws, m: self._on(m),
                    on_close=lambda ws, *a: setattr(self, '_sock', None))
                app.run_forever(ping_interval=30)
            except Exception as e:
                log.warning("WS connection error: %s", e)
            self._sock = None
            # Exponential backoff with jitter
            jitter = random.uniform(0, self._backoff * 0.3)
            delay = self._backoff + jitter
            log.debug("WS reconnect in %.1fs (backoff=%.0fs)", delay, self._backoff)
            time.sleep(delay)
            self._backoff = min(self._backoff * 2, self._BACKOFF_MAX)
    def _on_open(self, ws):
        self._sock = ws
        self._backoff = self._BACKOFF_MIN
        log.info("WS connected")
    def _on(self, raw):
        try: self.cb(json.loads(raw))
        except Exception as e:
            log.warning("WS message parse error: %s", e)


# --- Server Metrics -------------------------------------------------------

def server_metrics():
    """Collect server-specific metrics: S.M.A.R.T., RAID, services, events, certs, top processes."""
    result = {}
    try:
        # S.M.A.R.T. disk health
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,MediaType,HealthStatus,OperationalStatus,Size | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
            )
            if ps.stdout.strip():
                disks = json.loads(ps.stdout)
                if isinstance(disks, dict): disks = [disks]
                result["smartDisks"] = [{
                    "id": str(d.get("DeviceId", "")),
                    "name": d.get("FriendlyName", ""),
                    "type": d.get("MediaType", ""),
                    "health": d.get("HealthStatus", "Unknown"),
                    "status": d.get("OperationalStatus", "Unknown"),
                    "sizeGb": round(d.get("Size", 0) / 1073741824, 1) if d.get("Size") else 0,
                } for d in disks]
        except Exception as e:
            log.debug("S.M.A.R.T. collection error: %s", e)

        # RAID / Storage Pool status
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-StoragePool | Where-Object IsPrimordial -eq $false | Select-Object FriendlyName,HealthStatus,OperationalStatus,Size | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
            )
            if ps.stdout.strip() and ps.stdout.strip() != "":
                pools = json.loads(ps.stdout)
                if isinstance(pools, dict): pools = [pools]
                result["storagePools"] = [{
                    "name": p.get("FriendlyName", ""),
                    "health": p.get("HealthStatus", "Unknown"),
                    "status": p.get("OperationalStatus", "Unknown"),
                } for p in pools]
        except Exception:
            pass

        # Critical Windows services
        try:
            svc_list = "Spooler,BITS,wuauserv,Dhcp,Dnscache,W32Time,EventLog,Schedule,LanmanServer,LanmanWorkstation"
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 f"Get-Service -Name {svc_list} -ErrorAction SilentlyContinue | Select-Object Name,DisplayName,Status | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
            )
            if ps.stdout.strip():
                svcs = json.loads(ps.stdout)
                if isinstance(svcs, dict): svcs = [svcs]
                result["services"] = [{
                    "name": s.get("Name", ""),
                    "displayName": s.get("DisplayName", ""),
                    "status": "Running" if s.get("Status") == 4 else "Stopped" if s.get("Status") == 1 else str(s.get("Status", "")),
                } for s in svcs]
        except Exception:
            pass

        # Event Log critical errors (last 24h)
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-WinEvent -FilterHashtable @{LogName='System','Application';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 20 -ErrorAction SilentlyContinue | "
                 "Select-Object TimeCreated,LevelDisplayName,ProviderName,Message | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
            )
            if ps.stdout.strip():
                events = json.loads(ps.stdout)
                if isinstance(events, dict): events = [events]
                result["criticalEvents"] = [{
                    "time": str(e.get("TimeCreated", ""))[:19],
                    "level": e.get("LevelDisplayName", ""),
                    "source": e.get("ProviderName", ""),
                    "message": (e.get("Message", "") or "")[:200],
                } for e in events[:20]]
        except Exception:
            pass

        # SSL Certificates expiring within 60 days
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-ChildItem Cert:\\LocalMachine\\My | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(60) } | "
                 "Select-Object Subject,NotAfter,Thumbprint | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
            )
            if ps.stdout.strip():
                certs = json.loads(ps.stdout)
                if isinstance(certs, dict): certs = [certs]
                result["expiringCerts"] = [{
                    "subject": c.get("Subject", ""),
                    "expiresAt": str(c.get("NotAfter", ""))[:10],
                    "thumbprint": c.get("Thumbprint", "")[:16],
                } for c in certs]
        except Exception:
            pass

        # Top 5 CPU-consuming processes
        try:
            procs = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                try:
                    info = p.info
                    if info['cpu_percent'] and info['cpu_percent'] > 0:
                        procs.append(info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            procs.sort(key=lambda x: x.get('cpu_percent', 0), reverse=True)
            result["topProcesses"] = [{
                "pid": p['pid'], "name": p['name'],
                "cpu": round(p.get('cpu_percent', 0), 1),
                "ram": round(p.get('memory_percent', 0), 1),
            } for p in procs[:5]]
        except Exception:
            pass

        # Listening ports
        try:
            ports = set()
            for conn in psutil.net_connections(kind='inet'):
                if conn.status == 'LISTEN' and conn.laddr:
                    ports.add(conn.laddr.port)
            result["listeningPorts"] = sorted(ports)[:50]
        except Exception:
            pass

        # Hyper-V VMs (if available)
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "if (Get-Command Get-VM -ErrorAction SilentlyContinue) { Get-VM | Select-Object Name,State,CPUUsage,MemoryAssigned,Uptime | ConvertTo-Json -Compress }"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
            )
            if ps.stdout.strip():
                vms = json.loads(ps.stdout)
                if isinstance(vms, dict): vms = [vms]
                result["hyperVMs"] = [{
                    "name": v.get("Name", ""),
                    "state": str(v.get("State", "")),
                    "cpuUsage": v.get("CPUUsage"),
                    "memoryMb": round(v.get("MemoryAssigned", 0) / 1048576) if v.get("MemoryAssigned") else 0,
                } for v in vms]
        except Exception:
            pass

    except Exception as e:
        log.error("server_metrics error: %s", e)

    return result


# --- Security Audit Cache -------------------------------------------------

_AUDIT_CACHE_FILE = os.path.join(INSTALL_DIR, "last_audit.json")


def _save_audit_cache(audit: dict):
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_AUDIT_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(audit, f)
    except Exception as e:
        log.debug("Audit cache save failed: %s", e)


def _load_audit_cache() -> dict | None:
    try:
        if os.path.exists(_AUDIT_CACHE_FILE):
            with open(_AUDIT_CACHE_FILE, encoding="utf-8") as f:
                return json.load(f)
    except Exception: pass
    return None


# --- Security Check Descriptions -------------------------------------------
# Szczegółowy opis każdego checka dla UI.
SECURITY_CHECK_INFO: dict[str, dict] = {
    "firewall": {
        "desc": "Zapora Windows Firewall chroni komputer przed nieautoryzowanymi połączeniami sieciowymi.",
        "why": "Wyłączona zapora naraża na ataki z sieci lokalnej i Internetu.",
        "fix_info": "Włącza wszystkie 3 profile (Domain/Private/Public). Trwałe.",
    },
    "defender": {
        "desc": "Windows Defender — ochrona antywirusowa w czasie rzeczywistym.",
        "why": "Bez Defendera brak ochrony przed malware, ransomware, wirusami.",
        "fix_info": "Włącza Real-Time Protection. Trwałe.",
    },
    "defender_defs": {
        "desc": "Aktualność definicji wirusów Windows Defender (<7 dni).",
        "why": "Stare definicje = brak ochrony przed nowymi zagrożeniami.",
        "fix_info": "Pobiera najnowsze sygnatury. Zajmuje 1-2 min.",
    },
    "updates": {
        "desc": "Ostatnia aktualizacja systemu (<30 dni).",
        "why": "Nieaktualny system = znane luki bezpieczeństwa.",
        "fix_info": "Wymaga ręcznej instalacji Windows Update (zbyt długie dla 1-klik).",
    },
    "smb1": {
        "desc": "SMBv1 — przestarzały protokół udostępniania plików.",
        "why": "Słynne podatności WannaCry / EternalBlue używają SMBv1.",
        "fix_info": "Wyłącza funkcję systemową. Wymaga restartu komputera.",
    },
    "guest": {
        "desc": "Konto Guest (gość) w Windows — dostęp bez hasła.",
        "why": "Aktywne konto Guest umożliwia nieautoryzowany dostęp lokalny.",
        "fix_info": "Wyłącza konto. Identyfikowane po SID (-501) niezależnie od nazwy.",
    },
    "rdp_nla": {
        "desc": "Network Level Authentication dla Pulpitu Zdalnego.",
        "why": "Bez NLA atakujący może łączyć się RDP przed uwierzytelnieniem.",
        "fix_info": "Włącza NLA w rejestrze. Trwałe, działa od razu.",
    },
    "bitlocker": {
        "desc": "Szyfrowanie dysku systemowego (BitLocker).",
        "why": "Bez szyfrowania: kradzież dysku = wyciek wszystkich danych.",
        "fix_info": "Wymaga ręcznej konfiguracji (wybór TPM/hasło, backup klucza).",
    },
    "password_policy": {
        "desc": "Minimalna długość hasła lokalnego (min. 8 znaków).",
        "why": "Krótkie hasła łatwe do złamania brute-force.",
        "fix_info": "Ustawia lokalnie. UWAGA: GPO domenowe może nadpisać — sprawdź zasady domeny.",
    },
    "lockout_policy": {
        "desc": "Blokada konta po kilku nieudanych próbach (1-10).",
        "why": "Bez blokady: bez ograniczeń na brute-force haseł.",
        "fix_info": "Ustawia próg 5 prób. GPO domenowe może nadpisać.",
    },
    "admin_count": {
        "desc": "Liczba kont w grupie Administratorzy (maks. 3).",
        "why": "Za wielu adminów = większa powierzchnia ataku.",
        "fix_info": "Brak auto-fix — wymaga ręcznej weryfikacji kto ma być adminem.",
    },
    "autorun": {
        "desc": "Autouruchamianie z nośników USB/CD.",
        "why": "Autorun był wektorem ataków przez pendrive'y (Stuxnet).",
        "fix_info": "Wyłącza NoDriveTypeAutoRun w rejestrze. Trwałe.",
    },
    "ps_policy": {
        "desc": "Polityka wykonywania skryptów PowerShell.",
        "why": "Unrestricted = atakujący może uruchomić dowolny skrypt.",
        "fix_info": "Ustawia RemoteSigned. GPO może nadpisać ExecutionPolicy.",
    },
    "open_shares": {
        "desc": "Udostępnione foldery sieciowe (poza standardowymi $).",
        "why": "Otwarte udziały mogą ujawniać wrażliwe dane.",
        "fix_info": "Brak auto-fix — zależy od polityki firmy (czy mają być).",
    },
    "event_errors": {
        "desc": "Błędy krytyczne w dzienniku zdarzeń (ostatnie 24h).",
        "why": "Duża liczba błędów = niestabilny system.",
        "fix_info": "Brak auto-fix — wymaga analizy konkretnych zdarzeń.",
    },
    "cert_expiry": {
        "desc": "Certyfikaty SSL/TLS wygasające w ciągu 30 dni.",
        "why": "Wygasły certyfikat = ostrzeżenia dla użytkowników, utracone połączenia HTTPS.",
        "fix_info": "Brak auto-fix — certyfikat musi zostać odnowiony w CA.",
    },
    "pending_updates": {
        "desc": "Oczekujące aktualizacje Windows.",
        "why": "Brak aktualizacji = otwarte znane luki.",
        "fix_info": "Użyj przycisku 'Aktualizuj Windows' w panelu — fix zbyt długi dla 1-klik.",
    },
    "uptime": {
        "desc": "Czas pracy komputera bez restartu (<30 dni).",
        "why": "Długi uptime = aktualizacje wymagające restartu nie zostały zastosowane.",
        "fix_info": "Zaplanuj restart w oknie serwisowym.",
    },
    "backup_status": {
        "desc": "Konfiguracja Backup Asystent Business.",
        "why": "Bez backupu: ransomware = utrata danych.",
        "fix_info": "Skonfiguruj w sekcji Kopie zapasowe asystenta — wymaga wyboru lokalizacji i harmonogramu.",
    },
    "remote_desktop": {
        "desc": "Stan Remote Desktop (informacyjny).",
        "why": "Nie fail-level — tylko info czy RDP włączony.",
        "fix_info": "Nie wymaga naprawy — zależy od polityki firmy.",
    },
}


# --- Security Audit Fix Whitelist ------------------------------------------
# Mapowanie ID checka → bezpieczna komenda PowerShell naprawcza.
# UI przesyła TYLKO id (nie komendę), asystent wykonuje z whitelisty.
SECURITY_FIX_WHITELIST: dict[str, str] = {
    "firewall":       "Set-NetFirewallProfile -All -Enabled True",
    "defender":       "Set-MpPreference -DisableRealtimeMonitoring $false",
    "defender_defs":  "Update-MpSignature",
    "smb1":           "Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart",
    "guest":          "Get-LocalUser | Where-Object { $_.SID -like '*-501' } | Disable-LocalUser",
    "rdp_nla":        "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name UserAuthentication -Value 1",
    "autorun":        "New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name NoDriveTypeAutoRun -Value 255 -PropertyType DWord -Force",
    "ps_policy":      "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force",
    "cert_expiry":    None,  # Ręczne — nie można auto-odnowić certyfikatu
    "password_policy":"net accounts /minpwlen:8",
    "lockout_policy": "net accounts /lockoutthreshold:5",
}


def run_security_fix(check_id: str) -> dict:
    """Wykonuje predefiniowaną komendę naprawczą dla checka bezpieczeństwa."""
    cmd = SECURITY_FIX_WHITELIST.get(check_id)
    if not cmd:
        return {"ok": False, "error": f"Brak zdefiniowanego fixu dla '{check_id}'"}
    try:
        r = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            capture_output=True, text=True, timeout=60,
            creationflags=_NO_WINDOW,
        )
        stdout = (r.stdout or "").strip()
        stderr = (r.stderr or "").strip()
        combined = (stdout + "\n" + stderr).lower()

        # GPO override detection — komenda zadziałała lokalnie, ale polityka domenowa wymusza inne
        gpo_phrases = [
            "zastąpione zasadą",  # PL Set-ExecutionPolicy
            "overridden by a policy",  # EN Set-ExecutionPolicy
            "zdefiniowane przez zasadę",
            "defined by a group policy",
            "determined by policy",
        ]
        is_gpo_override = any(p in combined for p in gpo_phrases)

        ok = r.returncode == 0
        out = (stdout or stderr)[-400:]
        log.info("security_fix %s → rc=%d gpo=%s", check_id, r.returncode, is_gpo_override)

        # Invalidate cache — następne odświeżenie uruchomi nowy audit
        if (ok or is_gpo_override) and os.path.exists(_AUDIT_CACHE_FILE):
            try: os.remove(_AUDIT_CACHE_FILE)
            except Exception: pass

        if is_gpo_override:
            return {
                "ok": True,
                "partial": True,
                "rc": r.returncode,
                "output": out,
                "checkId": check_id,
                "cmd": cmd,
                "warning": "Ustawiono lokalnie, ale GPO domenowe wymusza inną wartość. Aby trwale zmienić — edytuj zasady na kontrolerze domeny (gpedit/Active Directory).",
            }
        return {"ok": ok, "rc": r.returncode, "output": out, "checkId": check_id, "cmd": cmd}
    except Exception as e:
        log.error("security_fix %s error: %s", check_id, e)
        return {"ok": False, "error": str(e), "checkId": check_id}


# --- Security Audit -------------------------------------------------------

def security_audit():
    """Run 20 security checks and return score + details."""
    WEIGHTS = {"critical": 15, "high": 10, "medium": 5, "low": 2, "info": 0}
    checks = []
    total_weight = 0

    def _ck(cid, name, sev, cmd, pass_fn, detail_fn=None):
        nonlocal total_weight
        total_weight += WEIGHTS.get(sev, 0)
        try:
            r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command", cmd],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW)
            o = (r.stdout or "").strip()
            ok = pass_fn(o)
            detail = detail_fn(o) if detail_fn else (o[:150] if o else "")
            info = SECURITY_CHECK_INFO.get(cid, {})
            checks.append({
                "id": cid, "name": name,
                "status": "pass" if ok else "fail",
                "severity": sev, "detail": detail,
                "fixable": not ok and cid in SECURITY_FIX_WHITELIST and SECURITY_FIX_WHITELIST[cid] is not None,
                "description": info.get("desc", ""),
                "why": info.get("why", ""),
                "fixInfo": info.get("fix_info", ""),
            })
        except Exception as e:
            info = SECURITY_CHECK_INFO.get(cid, {})
            checks.append({
                "id": cid, "name": name, "status": "error", "severity": sev,
                "detail": str(e)[:100], "fixable": False,
                "description": info.get("desc", ""),
                "why": info.get("why", ""),
                "fixInfo": info.get("fix_info", ""),
            })

    _ck("firewall", "Firewall Windows", "critical",
        "Get-NetFirewallProfile | Select-Object -ExpandProperty Enabled",
        lambda o: "False" not in o, lambda o: "Wlaczony" if "False" not in o else "Profil wylaczony!")
    _ck("defender", "Windows Defender", "critical",
        "(Get-MpComputerStatus).RealTimeProtectionEnabled",
        lambda o: o == "True", lambda o: "Aktywny" if o == "True" else "Wylaczony!")
    _ck("defender_defs", "Definicje antywirusa", "critical",
        "((Get-Date) - (Get-MpComputerStatus).AntivirusSignatureLastUpdated).Days",
        lambda o: o.isdigit() and int(o) < 7, lambda o: f"{o} dni temu" if o.isdigit() else "Brak danych")
    _ck("updates", "Aktualizacje Windows (<30d)", "critical",
        "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')",
        lambda o: len(o) >= 10 and (datetime.now() - datetime.strptime(o[:10], '%Y-%m-%d')).days < 30,
        lambda o: f"Ostatnia: {o[:10]}" if len(o) >= 10 else "Brak danych")
    _ck("smb1", "SMBv1 wylaczony", "critical",
        "(Get-SmbServerConfiguration).EnableSMB1Protocol",
        lambda o: o == "False", lambda o: "Wylaczony" if o == "False" else "WLACZONY!")
    _ck("guest", "Konto Guest wylaczone", "critical",
        "$g=Get-LocalUser | Where-Object { $_.SID -like '*-501' }; if($g){$g.Enabled}else{'NOTFOUND'}",
        lambda o: o == "False" or o == "NOTFOUND",
        lambda o: "Brak konta Guest" if o == "NOTFOUND" else ("Wylaczone" if o == "False" else "AKTYWNE!"))
    _ck("rdp_nla", "RDP NLA", "high",
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -EA SilentlyContinue).UserAuthentication",
        lambda o: o == "1", lambda o: "NLA wlaczone" if o == "1" else "NLA wylaczone")
    _ck("bitlocker", "Szyfrowanie dyskow", "high",
        "Get-BitLockerVolume -EA SilentlyContinue | Select-Object -ExpandProperty ProtectionStatus",
        lambda o: "1" in o or "On" in o, lambda o: "Zaszyfrowane" if "1" in o or "On" in o else "Brak BitLocker")
    _ck("password_policy", "Polityka hasel (min 8)", "high",
        "net accounts 2>$null | Select-String 'Minimum password length'",
        lambda o: any(c.isdigit() and int(c) >= 8 for c in re.findall(r'\d+', o)),
        lambda o: o.strip() if o else "Brak danych")
    _ck("lockout_policy", "Blokada konta", "high",
        "net accounts 2>$null | Select-String 'Lockout threshold'",
        lambda o: any(c.isdigit() and 0 < int(c) <= 10 for c in re.findall(r'\d+', o)),
        lambda o: o.strip() if o else "Brak blokady")
    _ck("admin_count", "Administratorzy (max 3)", "high",
        "(Get-LocalGroupMember Administrators -EA SilentlyContinue).Count",
        lambda o: o.isdigit() and int(o) <= 3, lambda o: f"{o} kont" if o.isdigit() else "Brak danych")
    _ck("autorun", "Autorun wylaczony", "medium",
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name NoDriveTypeAutoRun -EA SilentlyContinue).NoDriveTypeAutoRun",
        lambda o: o != "" and o != "0", lambda o: "Wylaczony" if o and o != "0" else "Wlaczony")
    _ck("ps_policy", "PowerShell policy", "medium",
        "Get-ExecutionPolicy", lambda o: o in ("Restricted", "AllSigned", "RemoteSigned"), lambda o: o)
    _ck("open_shares", "Udzialy sieciowe (max 3)", "medium",
        "(Get-SmbShare | Where-Object { $_.Name -notmatch '\\$$' }).Count",
        lambda o: o.isdigit() and int(o) <= 3, lambda o: f"{o} udzialow" if o.isdigit() else "0")
    _ck("event_errors", "Bledy Event Log (24h)", "medium",
        "(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -EA SilentlyContinue).Count",
        lambda o: not o.isdigit() or int(o) < 10, lambda o: f"{o} zdarzen" if o.isdigit() else "0")
    _ck("cert_expiry", "Certyfikaty (30 dni)", "medium",
        "(Get-ChildItem Cert:\\LocalMachine\\My -EA SilentlyContinue | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) }).Count",
        lambda o: o in ("", "0"), lambda o: f"{o} wygasa" if o and o != "0" else "OK")
    _ck("pending_updates", "Oczekujace aktualizacje", "medium",
        "if (Get-Command Get-WindowsUpdate -EA SilentlyContinue) { (Get-WindowsUpdate).Count } else { '0' }",
        lambda o: o in ("0", ""), lambda o: f"{o} czeka" if o.isdigit() and o != "0" else "OK")

    # Uptime
    try:
        days = int((time.time() - psutil.boot_time()) / 86400)
        total_weight += WEIGHTS["low"]
        _info = SECURITY_CHECK_INFO.get("uptime", {})
        checks.append({"id": "uptime", "name": "Uptime (<30 dni)", "severity": "low",
            "status": "pass" if days < 30 else "fail", "detail": f"{days} dni",
            "fixable": False,
            "description": _info.get("desc", ""), "why": _info.get("why", ""), "fixInfo": _info.get("fix_info", "")})
    except: pass

    # Backup
    has_bk = load_config().get("backupMode", False)
    total_weight += WEIGHTS["high"]
    _info = SECURITY_CHECK_INFO.get("backup_status", {})
    checks.append({"id": "backup_status", "name": "Backup Asystent", "severity": "high",
        "status": "pass" if has_bk else "fail", "detail": "Aktywny" if has_bk else "Brak konfiguracji",
        "fixable": False,
        "description": _info.get("desc", ""), "why": _info.get("why", ""), "fixInfo": _info.get("fix_info", "")})

    # RDP
    _ck("remote_desktop", "Remote Desktop", "info",
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -EA SilentlyContinue).fDenyTSConnections",
        lambda o: True, lambda o: "Wylaczony" if o == "1" else "Wlaczony")

    fail_w = sum(WEIGHTS.get(c["severity"], 0) for c in checks if c["status"] == "fail")
    score = max(0, min(100, round(100 - (fail_w / max(total_weight, 1)) * 100)))
    return {"score": score, "checks": checks, "timestamp": datetime.now().isoformat()[:19]}


# --- Network Scan ---------------------------------------------------------

def network_scan():
    """Scan local network for devices via ARP + ping + port scan."""
    result = {"scannedAt": datetime.now().isoformat()[:19], "subnet": "", "gateway": "", "devices": []}
    try:
        ps = subprocess.run(["powershell", "-Command",
            "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Select-Object -First 1).NextHop"],
            capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
        gw = ps.stdout.strip()
        if not gw:
            return result
        result["gateway"] = gw
        parts = gw.split(".")
        if len(parts) != 4: return result
        subnet = f"{parts[0]}.{parts[1]}.{parts[2]}"
        result["subnet"] = f"{subnet}.0/24"

        subprocess.run(["powershell", "-Command",
            f"1..254 | ForEach-Object {{ Test-Connection -ComputerName '{subnet}.$_' -Count 1 -TimeoutSeconds 1 -EA SilentlyContinue | Out-Null }}"],
            capture_output=True, timeout=120, creationflags=_NO_WINDOW)

        arp_out = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW).stdout
        devices = []
        for line in arp_out.split("\n"):
            m = re.match(r'\s*(\d+\.\d+\.\d+\.\d+)\s+([\da-f-]+)\s+(\w+)', line.strip())
            if m and m.group(3) == "dynamic" and m.group(1).startswith(subnet + "."):
                ip = m.group(1)
                mac = m.group(2).replace("-", ":").upper()
                if mac == "FF:FF:FF:FF:FF:FF": continue
                hostname = ""
                try: hostname = socket.gethostbyaddr(ip)[0]
                except: pass
                open_ports = []
                for port in [22, 80, 443, 445, 3389, 5900, 8080, 9100]:
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(0.3)
                        if s.connect_ex((ip, port)) == 0: open_ports.append(port)
                        s.close()
                    except: pass
                dtype = "unknown"
                if ip == gw: dtype = "router"
                elif 9100 in open_ports: dtype = "printer"
                elif 3389 in open_ports and 445 in open_ports: dtype = "server"
                elif 3389 in open_ports: dtype = "windows"
                elif 22 in open_ports: dtype = "linux"
                elif 80 in open_ports or 443 in open_ports: dtype = "network"
                devices.append({"ip": ip, "mac": mac, "hostname": hostname, "ports": open_ports, "type": dtype})

        result["devices"] = sorted(devices, key=lambda d: [int(x) for x in d["ip"].split(".")])
        log.info("Network scan: %d devices in %s", len(devices), result["subnet"])
    except Exception as e:
        log.error("Network scan error: %s", e)
    return result


# --- Log Shipping ---------------------------------------------------------

_LOG_CURSOR_FILE = os.path.join(INSTALL_DIR, "log_cursor.json")
_LOG_MAX_LINES_PER_FILE = 50  # max linii błędów z jednego pliku w jednym push
_LOG_MAX_FILE_SIZE = 50 * 1024 * 1024  # pomiń pliki >50MB żeby nie zadławić agenta


def _autodetect_log_sources() -> list[dict]:
    """Znajdź typowe lokalizacje logów IIS i SQL Server."""
    sources = []
    # IIS — wszystkie foldery W3SVC*
    iis_root = r"C:\inetpub\logs\LogFiles"
    if os.path.isdir(iis_root):
        try:
            for sub in os.listdir(iis_root):
                full = os.path.join(iis_root, sub)
                if os.path.isdir(full) and sub.upper().startswith("W3SVC"):
                    # najnowszy plik .log
                    logs = sorted(
                        [f for f in os.listdir(full) if f.lower().endswith(".log")],
                        key=lambda f: os.path.getmtime(os.path.join(full, f)),
                        reverse=True,
                    )
                    if logs:
                        sources.append({"type": "iis", "site": sub,
                                        "path": os.path.join(full, logs[0])})
        except Exception: pass

    # SQL Server ERRORLOG (bez rozszerzenia)
    for base in [r"C:\Program Files\Microsoft SQL Server",
                 r"C:\Program Files (x86)\Microsoft SQL Server"]:
        if not os.path.isdir(base): continue
        try:
            for inst in os.listdir(base):
                log_dir = os.path.join(base, inst, "MSSQL", "Log")
                errorlog = os.path.join(log_dir, "ERRORLOG")
                if os.path.isfile(errorlog):
                    sources.append({"type": "mssql", "instance": inst, "path": errorlog})
        except Exception: pass

    return sources


def _load_log_cursors() -> dict:
    try:
        if os.path.exists(_LOG_CURSOR_FILE):
            with open(_LOG_CURSOR_FILE) as f:
                return json.load(f)
    except Exception: pass
    return {}


def _save_log_cursors(c: dict):
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_LOG_CURSOR_FILE, "w") as f:
            json.dump(c, f)
    except Exception: pass


def _is_error_line(src_type: str, line: str) -> bool:
    low = line.lower()
    if src_type == "iis":
        # IIS W3C: kod statusu jest w konkretnej kolumnie. Szukamy 5xx + 4xx (ale nie 404 szumu).
        m = re.search(r'\s(5\d{2}|4\d{2})\s', line)
        if not m: return False
        code = int(m.group(1))
        return code >= 500 or code in (401, 403, 429)
    if src_type == "mssql":
        return ("error" in low or "severity" in low or "fatal" in low or
                "login failed" in low or "deadlock" in low)
    return "error" in low or "fail" in low or "fatal" in low


def log_shipping_collect() -> dict:
    """Tail-uje skonfigurowane źródła logów, zwraca nowe linie błędów od kursora."""
    cfg = load_config()
    configured = cfg.get("logSources")
    sources = configured if isinstance(configured, list) and configured else _autodetect_log_sources()
    cursors = _load_log_cursors()
    out = {"collectedAt": datetime.now().isoformat()[:19], "entries": []}

    for src in sources:
        path = src.get("path", "")
        stype = src.get("type", "other")
        if not path or not os.path.isfile(path): continue
        try:
            size = os.path.getsize(path)
            if size > _LOG_MAX_FILE_SIZE: continue
            # Detekcja rotacji — jeśli rozmiar spadł, zaczynamy od 0
            prev = cursors.get(path, 0)
            if prev > size: prev = 0
            if prev >= size: continue  # brak nowych danych

            errors: list[str] = []
            with open(path, "rb") as f:
                f.seek(prev)
                chunk = f.read(min(size - prev, 4 * 1024 * 1024))  # max 4MB na file/iterację
            try:
                text = chunk.decode("utf-8", errors="replace")
            except Exception:
                text = chunk.decode("latin-1", errors="replace")
            for ln in text.splitlines():
                ln = ln.strip()
                if not ln or ln.startswith("#"): continue
                if _is_error_line(stype, ln):
                    errors.append(ln[:500])
                    if len(errors) >= _LOG_MAX_LINES_PER_FILE: break

            cursors[path] = size
            if errors:
                out["entries"].append({
                    "type": stype,
                    "path": path,
                    "meta": {k: v for k, v in src.items() if k not in ("type", "path")},
                    "lines": errors,
                    "count": len(errors),
                })
        except Exception as e:
            log.debug("Log shipping %s error: %s", path, e)

    _save_log_cursors(cursors)
    return out


# --- LAN Scan with Diff ---------------------------------------------------

_LAN_KNOWN_FILE = os.path.join(INSTALL_DIR, "lan_known.json")


def _load_lan_known() -> dict:
    try:
        if os.path.exists(_LAN_KNOWN_FILE):
            with open(_LAN_KNOWN_FILE) as f:
                return json.load(f)
    except Exception: pass
    return {}


def _save_lan_known(db: dict):
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_LAN_KNOWN_FILE, "w") as f:
            json.dump(db, f)
    except Exception: pass


def lan_scan_diff() -> dict:
    """Wykonuje network_scan, oznacza nowe urządzenia (isNew) względem bazy MAC."""
    scan = network_scan()
    now_iso = datetime.now().isoformat()[:19]
    db = _load_lan_known()
    new_devices = []
    for d in scan.get("devices", []):
        mac = d.get("mac", "")
        if not mac: continue
        entry = db.get(mac)
        if entry:
            d["firstSeen"] = entry.get("firstSeen", now_iso)
            d["lastSeen"] = now_iso
            d["isNew"] = False
            db[mac] = {**entry, "lastSeen": now_iso, "ip": d.get("ip", entry.get("ip", ""))}
        else:
            d["firstSeen"] = now_iso
            d["lastSeen"] = now_iso
            d["isNew"] = True
            new_devices.append(d)
            db[mac] = {"firstSeen": now_iso, "lastSeen": now_iso,
                       "ip": d.get("ip", ""), "hostname": d.get("hostname", "")}
    _save_lan_known(db)
    scan["newDevices"] = new_devices
    scan["newCount"] = len(new_devices)
    return scan


# --- License Audit --------------------------------------------------------

def license_audit() -> dict:
    """Zbiera klucze produktów (Windows/Office) + status aktywacji."""
    result = {"measuredAt": datetime.now().isoformat()[:19], "licenses": []}

    # Windows product key + activation status
    try:
        ps = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             "$sls = Get-CimInstance SoftwareLicensingService; "
             "$prod = Get-CimInstance SoftwareLicensingProduct | Where-Object { $_.PartialProductKey -and $_.LicenseStatus -ne 0 } | "
             "Select-Object Name,Description,PartialProductKey,LicenseStatus,@{N='GraceDays';E={[math]::Round($_.GracePeriodRemaining/1440,0)}}; "
             "@{ OA3Key=$sls.OA3xOriginalProductKey; Products=$prod } | ConvertTo-Json -Compress -Depth 3"],
            capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
        )
        raw = (ps.stdout or "").strip()
        if raw:
            data = json.loads(raw)
            oem = data.get("OA3Key", "") or ""
            if oem:
                result["licenses"].append({
                    "product": "Windows (OEM)",
                    "key": oem,
                    "source": "BIOS (OA3)",
                })
            prods = data.get("Products") or []
            if isinstance(prods, dict): prods = [prods]
            status_map = {0: "Unlicensed", 1: "Licensed", 2: "OOB Grace", 3: "OOT Grace",
                          4: "Non-Genuine", 5: "Notification", 6: "Extended Grace"}
            for p in prods:
                name = p.get("Name", "")
                # Skip "WindowsStore" automatic licenses, only include OS + Office
                nm_lower = name.lower()
                if not ("windows" in nm_lower or "office" in nm_lower or "visio" in nm_lower or "project" in nm_lower):
                    continue
                result["licenses"].append({
                    "product": name,
                    "partialKey": p.get("PartialProductKey", ""),
                    "status": status_map.get(p.get("LicenseStatus", 0), "Unknown"),
                    "graceDays": p.get("GraceDays", 0),
                    "description": p.get("Description", ""),
                })
    except Exception as e:
        log.debug("License audit (Windows) error: %s", e)

    # Office — install path + license edition from registry
    try:
        for hive, path in [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Office\ClickToRun\Configuration"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Office\ClickToRun\Configuration"),
        ]:
            try:
                with winreg.OpenKey(hive, path) as k:
                    def _rv(n):
                        try: return winreg.QueryValueEx(k, n)[0]
                        except Exception: return ""
                    prod = _rv("ProductReleaseIds")
                    ver  = _rv("VersionToReport")
                    if prod:
                        result["licenses"].append({
                            "product": f"Microsoft Office ({prod})",
                            "version": ver,
                            "source": "ClickToRun",
                        })
                        break
            except Exception: pass
    except Exception: pass

    return result


# --- Screen Lock Report ---------------------------------------------------

def _user_idle_seconds() -> int:
    """Zwraca liczbę sekund od ostatniej aktywności użytkownika (GetLastInputInfo)."""
    try:
        import ctypes
        from ctypes import wintypes
        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]
        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(lii)
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            return 0
        tick = ctypes.windll.kernel32.GetTickCount()
        return int((tick - lii.dwTime) / 1000)
    except Exception:
        return 0


def _is_workstation_locked() -> bool:
    """Heurystyka: LogonUI.exe uruchomiony → ekran zablokowany."""
    try:
        for p in psutil.process_iter(["name"]):
            try:
                if (p.info["name"] or "").lower() == "logonui.exe":
                    return True
            except Exception: pass
    except Exception: pass
    return False


def screen_lock_report(unlocked_idle_threshold: int = 900) -> dict:
    """
    Zwraca raport o stanie blokady ekranu.
    unlockedIdleSeconds = sekundy bezczynności przy odblokowanym ekranie.
    flagged = True jeśli użytkownik zostawił odblokowany PC >15 min.
    """
    idle = _user_idle_seconds()
    locked = _is_workstation_locked()
    flagged = (not locked) and idle > unlocked_idle_threshold
    return {
        "idleSeconds": idle,
        "locked": locked,
        "flagged": flagged,
        "thresholdSeconds": unlocked_idle_threshold,
        "measuredAt": datetime.now().isoformat()[:19],
    }


# --- Security Events ------------------------------------------------------

_SEC_CURSOR_FILE = os.path.join(INSTALL_DIR, "sec_cursor.json")


def _load_sec_state() -> dict:
    try:
        if os.path.exists(_SEC_CURSOR_FILE):
            with open(_SEC_CURSOR_FILE) as f:
                return json.load(f)
    except Exception: pass
    return {"rdpIps": [], "lastTime": ""}


def _save_sec_state(state: dict):
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_SEC_CURSOR_FILE, "w") as f:
            json.dump(state, f)
    except Exception as e:
        log.debug("Sec state save failed: %s", e)


def security_events() -> dict:
    """Zbiera zdarzenia Security log: failed logins, new user, admin group add, RDP from new IP, USB."""
    out = {"failedLogins": 0, "newUsers": [], "newAdmins": [], "rdpNewIp": [], "usbDevices": []}
    state = _load_sec_state()
    known_ips: list[str] = list(state.get("rdpIps", []) or [])
    cutoff_hours = 24
    try:
        ps = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             f"$since=(Get-Date).AddHours(-{cutoff_hours});"
             f"Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4625,4624,4720,4732;StartTime=$since}} "
             f"-MaxEvents 500 -ErrorAction SilentlyContinue | "
             f"Select-Object @{{N='Time';E={{$_.TimeCreated.ToString('o')}}}},Id,"
             f"@{{N='Msg';E={{($_.Message -replace '\\s+',' ').Substring(0,[Math]::Min(600,$_.Message.Length))}}}} | "
             f"ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW
        )
        raw = (ps.stdout or "").strip()
        if raw:
            evs = json.loads(raw)
            if isinstance(evs, dict): evs = [evs]
            failed_count = 0
            for e in evs:
                eid = e.get("Id")
                msg = e.get("Msg", "") or ""
                t = str(e.get("Time", ""))[:19]
                if eid == 4625:
                    failed_count += 1
                elif eid == 4720:
                    # Nowy użytkownik lokalny
                    m = re.search(r"New Account:[\s\S]*?Account Name:\s*(\S+)", msg) or \
                        re.search(r"Nowe konto:[\s\S]*?Nazwa konta:\s*(\S+)", msg)
                    out["newUsers"].append({"time": t, "account": m.group(1) if m else "?"})
                elif eid == 4732:
                    # Dodano członka do grupy lokalnej — filtruj tylko Administratorzy
                    if "Administrator" in msg or "Administrators" in msg or "Administratorzy" in msg:
                        m = re.search(r"Member:[\s\S]*?Account Name:\s*(\S+)", msg) or \
                            re.search(r"Członek:[\s\S]*?Nazwa konta:\s*(\S+)", msg)
                        out["newAdmins"].append({"time": t, "account": m.group(1) if m else "?"})
                elif eid == 4624:
                    # Sukces logowania — interesują nas tylko LogonType=10 (RemoteInteractive = RDP)
                    if "Logon Type:\t\t10" in msg or "Logon Type:  10" in msg or "Typ logowania:\t\t10" in msg or "LogonType 10" in msg:
                        m = re.search(r"Source Network Address:\s*(\S+)", msg) or \
                            re.search(r"Źródłowy adres sieciowy:\s*(\S+)", msg)
                        ip = m.group(1) if m else ""
                        if ip and ip not in ("-", "::1", "127.0.0.1") and ip not in known_ips:
                            known_ips.append(ip)
                            out["rdpNewIp"].append({"time": t, "ip": ip})
            out["failedLogins"] = failed_count
    except Exception as e:
        log.debug("Security events error: %s", e)

    # USB — nowe urządzenia PnP z ostatnich 24h
    try:
        ps = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             f"$since=(Get-Date).AddHours(-{cutoff_hours});"
             f"Get-WinEvent -FilterHashtable @{{LogName='Microsoft-Windows-DriverFrameworks-UserMode/Operational';Id=2003;StartTime=$since}} "
             f"-MaxEvents 50 -ErrorAction SilentlyContinue | "
             f"Select-Object @{{N='Time';E={{$_.TimeCreated.ToString('o')}}}},"
             f"@{{N='Msg';E={{($_.Message -replace '\\s+',' ').Substring(0,[Math]::Min(300,$_.Message.Length))}}}} | "
             f"ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=45, creationflags=_NO_WINDOW
        )
        raw = (ps.stdout or "").strip()
        if raw:
            evs = json.loads(raw)
            if isinstance(evs, dict): evs = [evs]
            for e in evs[:20]:
                out["usbDevices"].append({
                    "time": str(e.get("Time", ""))[:19],
                    "info": (e.get("Msg", "") or "")[:200],
                })
    except Exception:
        pass

    # Zapisz zaktualizowaną listę znanych IP RDP (trim do 50 ostatnich)
    state["rdpIps"] = known_ips[-50:]
    _save_sec_state(state)
    return out


# --- Event Viewer Bridge --------------------------------------------------

_EVENT_CURSOR_FILE = os.path.join(INSTALL_DIR, "event_cursor.json")

# Wzorce krytycznych zdarzeń → (klucz deduplikacji, priorytet ticketu, tytuł)
_CRITICAL_EVENT_PATTERNS = [
    # (provider_contains, event_id, priority, short_title)
    ("Microsoft-Windows-Kernel-Power", 41, "HIGH", "Nieoczekiwany restart/wyłączenie (Kernel-Power 41)"),
    ("disk",                           7,  "HIGH", "Błąd dysku (disk 7)"),
    ("disk",                           51, "HIGH", "Błąd I/O stronicowania (disk 51)"),
    ("Ntfs",                           55, "HIGH", "Uszkodzenie systemu plików NTFS (55)"),
    ("volmgr",                         161,"HIGH", "Awaria woluminu (volmgr 161)"),
    ("Microsoft-Windows-WHEA-Logger",  None,"CRITICAL","Błąd sprzętu WHEA"),
    ("Service Control Manager",        7031,"MEDIUM","Usługa nieoczekiwanie przerwała pracę"),
    ("Service Control Manager",        7034,"MEDIUM","Usługa zakończyła pracę awaryjnie"),
    ("BugCheck",                       None,"CRITICAL","BSOD wykryty (BugCheck)"),
]


def _load_event_cursor() -> str:
    try:
        if os.path.exists(_EVENT_CURSOR_FILE):
            with open(_EVENT_CURSOR_FILE) as f:
                return json.load(f).get("lastTime", "")
    except Exception: pass
    return ""


def _save_event_cursor(last_time: str):
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_EVENT_CURSOR_FILE, "w") as f:
            json.dump({"lastTime": last_time}, f)
    except Exception as e:
        log.debug("Event cursor save failed: %s", e)


def _classify_event(provider: str, event_id) -> tuple[str, str] | None:
    """Return (priority, title) if event matches critical pattern."""
    try:
        eid = int(event_id) if event_id is not None else None
    except Exception:
        eid = None
    prov = (provider or "").lower()
    for pat_prov, pat_id, prio, title in _CRITICAL_EVENT_PATTERNS:
        if pat_prov.lower() in prov and (pat_id is None or pat_id == eid):
            return prio, title
    return None


def collect_new_events(max_events: int = 100) -> list[dict]:
    """Zwraca eventy krytyczne (Level 1,2) nowsze od zapisanego kursora."""
    cursor = _load_event_cursor()
    since_clause = ""
    if cursor:
        # PowerShell potrzebuje DateTime — użyjemy cursor jako ISO
        since_clause = f"StartTime=[DateTime]'{cursor}';"
    else:
        since_clause = "StartTime=(Get-Date).AddHours(-24);"
    try:
        ps = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             f"Get-WinEvent -FilterHashtable @{{LogName='System','Application';Level=1,2;{since_clause}}} "
             f"-MaxEvents {max_events} -ErrorAction SilentlyContinue | "
             f"Select-Object @{{N='Time';E={{$_.TimeCreated.ToString('o')}}}},"
             f"LevelDisplayName,ProviderName,Id,@{{N='Msg';E={{($_.Message -replace '\\s+',' ')}}}} | "
             f"ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=45, creationflags=_NO_WINDOW
        )
        out = (ps.stdout or "").strip()
        if not out: return []
        evs = json.loads(out)
        if isinstance(evs, dict): evs = [evs]
        results = []
        newest = cursor
        for e in evs:
            t = str(e.get("Time", ""))[:19]
            results.append({
                "time":    t,
                "level":   e.get("LevelDisplayName", ""),
                "source":  e.get("ProviderName", ""),
                "eventId": e.get("Id"),
                "message": (e.get("Msg", "") or "")[:400],
            })
            if t > newest: newest = t
        if newest and newest != cursor:
            _save_event_cursor(newest)
        return results
    except Exception as e:
        log.debug("Event collection error: %s", e)
        return []


# --- Speedtest ------------------------------------------------------------

def speedtest(download_size_mb: int = 10, upload_size_mb: int = 2) -> dict:
    """Measure network speed against infradesk.pl. Returns {downloadMbps, uploadMbps, pingMs, measuredAt}."""
    result = {"measuredAt": datetime.now().isoformat()[:19]}
    try:
        # Ping — HEAD request latency, median of 5
        import statistics
        pings = []
        for _ in range(5):
            t0 = time.perf_counter()
            try:
                requests.head(f"{API_BASE}/health", timeout=5)
                pings.append((time.perf_counter() - t0) * 1000)
            except Exception:
                pass
        if pings:
            result["pingMs"] = round(statistics.median(pings), 1)

        # Download — measure time to fetch a known-size file from our downloads/
        try:
            url = f"https://infradesk.pl/downloads/speedtest-{download_size_mb}mb.bin"
            t0 = time.perf_counter()
            r = requests.get(url, timeout=60, stream=True)
            total = 0
            if r.status_code == 200:
                for chunk in r.iter_content(chunk_size=65536):
                    total += len(chunk)
                elapsed = max(time.perf_counter() - t0, 0.001)
                if total > 0:
                    result["downloadMbps"] = round((total * 8) / elapsed / 1_000_000, 2)
                    result["downloadBytes"] = total
            else:
                # Fallback: fetch a large static asset (silers.msi is ~20MB)
                t0 = time.perf_counter()
                r = requests.get(SILERS_MSI_URL, timeout=60, stream=True)
                total = 0
                for chunk in r.iter_content(chunk_size=65536):
                    total += len(chunk)
                    if total >= download_size_mb * 1024 * 1024:
                        break
                elapsed = max(time.perf_counter() - t0, 0.001)
                if total > 0:
                    result["downloadMbps"] = round((total * 8) / elapsed / 1_000_000, 2)
                    result["downloadBytes"] = total
        except Exception as e:
            log.debug("Speedtest download failed: %s", e)

        # Upload — POST random bytes to /api/speedtest/upload
        try:
            payload = os.urandom(upload_size_mb * 1024 * 1024)
            t0 = time.perf_counter()
            r = requests.post(f"{API_BASE}/speedtest/upload", data=payload,
                              headers={"Content-Type": "application/octet-stream"}, timeout=60)
            elapsed = max(time.perf_counter() - t0, 0.001)
            if r.status_code < 400:
                result["uploadMbps"] = round((len(payload) * 8) / elapsed / 1_000_000, 2)
                result["uploadBytes"] = len(payload)
        except Exception as e:
            log.debug("Speedtest upload failed: %s", e)

        log.info("Speedtest: ↓ %s Mbps · ↑ %s Mbps · ping %s ms",
                 result.get("downloadMbps", "?"), result.get("uploadMbps", "?"), result.get("pingMs", "?"))
    except Exception as e:
        log.error("Speedtest error: %s", e)
        result["error"] = str(e)
    return result


# --- AutoDiagnostics ------------------------------------------------------

class AutoDiagnostics:
    """Automatyczne wykrywanie problemow i tworzenie zgloszen."""

    DISK_LOW_THRESHOLD = 10
    CHECK_INTERVAL = 300

    def __init__(self, token):
        self.token = token
        self._alerted = set()

    def run_checks(self):
        self._check_disk_space()
        self._check_windows_updates()
        self._check_services()
        self._check_event_log()

    def _check_event_log(self):
        """Event Viewer Bridge — tickety dla krytycznych wzorców."""
        try:
            events = collect_new_events(max_events=50)
            for ev in events:
                cls = _classify_event(ev.get("source", ""), ev.get("eventId"))
                if not cls: continue
                prio, short = cls
                # Dedup per (source, eventId) w obrębie procesu — nie spamuj ticketami
                key = f"evt_{ev.get('source','')}_{ev.get('eventId','')}"
                if key in self._alerted: continue
                self._alerted.add(key)
                self._create_ticket(
                    title=short,
                    desc=(f"Wykryto krytyczne zdarzenie w dzienniku Windows.\n\n"
                          f"Czas: {ev.get('time','')}\n"
                          f"Źródło: {ev.get('source','')}\n"
                          f"Event ID: {ev.get('eventId','')}\n"
                          f"Poziom: {ev.get('level','')}\n\n"
                          f"Treść:\n{ev.get('message','')}"),
                    priority=prio,
                )
        except Exception as e:
            log.debug("Event log check error: %s", e)

    def _check_disk_space(self):
        try:
            for p in psutil.disk_partitions():
                try:
                    u = psutil.disk_usage(p.mountpoint)
                    free_pct = 100 - u.percent
                    if free_pct < self.DISK_LOW_THRESHOLD:
                        alert_key = f"disk_low_{p.device}"
                        if alert_key not in self._alerted:
                            self._alerted.add(alert_key)
                            free_gb = round(u.free / (1024**3), 1)
                            total_gb = round(u.total / (1024**3), 1)
                            self._create_ticket(
                                title=f"Malo miejsca na dysku {p.device}",
                                desc=f"Dysk {p.device} ma tylko {free_gb} GB wolnego z {total_gb} GB ({free_pct:.0f}% wolnego).\n\n"
                                     f"Wymagane dzialanie: zwolnienie miejsca lub rozszerzenie dysku.",
                                priority="HIGH"
                            )
                    elif free_pct > self.DISK_LOW_THRESHOLD + 5:
                        self._alerted.discard(f"disk_low_{p.device}")
                except Exception:
                    pass
        except Exception as e:
            log.debug("Disk check error: %s", e)

    def _check_windows_updates(self):
        try:
            alert_key = "win_updates"
            if alert_key in self._alerted:
                return
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "(New-Object -ComObject Microsoft.Update.AutoUpdate).DetectNow(); "
                 "$s = New-Object -ComObject Microsoft.Update.Session; "
                 "$u = $s.CreateUpdateSearcher(); "
                 "try { $r = $u.Search('IsInstalled=0'); $r.Updates.Count } catch { 0 }"],
                capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW
            )
            count = int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0
            if count > 5:
                self._alerted.add(alert_key)
                self._create_ticket(
                    title=f"Oczekujace aktualizacje Windows ({count})",
                    desc=f"Komputer ma {count} oczekujacych aktualizacji Windows.\n\n"
                         f"Zalecamy zaplanowanie aktualizacji w najblizszym oknie serwisowym.",
                    priority="MEDIUM"
                )
        except Exception as e:
            log.debug("Windows update check error: %s", e)

    def _check_services(self):
        critical_services = ["Spooler", "BITS", "wuauserv", "Dhcp", "Dnscache"]
        try:
            import win32serviceutil
            for svc in critical_services:
                try:
                    status = win32serviceutil.QueryServiceStatus(svc)[1]
                    if status == 1:
                        alert_key = f"svc_stopped_{svc}"
                        if alert_key not in self._alerted:
                            self._alerted.add(alert_key)
                            try:
                                win32serviceutil.StartService(svc)
                                log.info("Auto-restarted service: %s", svc)
                            except Exception:
                                self._create_ticket(
                                    title=f"Usluga {svc} zatrzymana",
                                    desc=f"Krytyczna usluga Windows '{svc}' jest zatrzymana.\n"
                                         f"Proba automatycznego restartu nie powiodla sie.",
                                    priority="HIGH"
                                )
                except Exception:
                    pass
        except ImportError:
            pass
        except Exception as e:
            log.debug("Service check error: %s", e)

    def _create_ticket(self, title, desc, priority="MEDIUM"):
        try:
            hostname = os.environ.get("COMPUTERNAME", "Unknown")
            full_desc = f"[Auto-diagnostyka — {hostname}]\n\n{desc}"
            do_ticket(self.token, title, full_desc, priority, None)
            log.info("Auto-ticket created: %s", title)
        except Exception as e:
            log.error("Auto-ticket failed: %s", e)


# --- Self-Heal ------------------------------------------------------------

class SelfHealer:
    """Bezpieczne auto-fixy dla znanych problemów Windows.

    Uruchamia się co N minut, każdą akcję wykonuje co najwyżej raz na godzinę
    (rate-limit per-action), loguje wszystkie podjęte akcje.
    """

    COOLDOWN_SEC = 3600
    CHECK_INTERVAL = 900  # 15 min
    DISK_CRITICAL_PCT = 5   # poniżej 5% wolnego → czyszczenie temp
    AUTO_RESTART_SERVICES = ["Spooler", "BITS", "wuauserv", "Dnscache"]

    def __init__(self, token):
        self.token = token
        self._last_action: dict[str, float] = {}
        self._actions_log: list[dict] = []

    def _cooled_down(self, key: str) -> bool:
        t = self._last_action.get(key, 0)
        return (time.time() - t) >= self.COOLDOWN_SEC

    def _mark(self, key: str, summary: str):
        self._last_action[key] = time.time()
        entry = {"action": key, "summary": summary, "at": datetime.now().isoformat()[:19]}
        self._actions_log.append(entry)
        self._actions_log = self._actions_log[-50:]  # keep last 50
        log.info("Self-heal: %s — %s", key, summary)

    def run(self) -> list[dict]:
        """Wykonuje pojedynczy cykl self-heal. Zwraca listę podjętych akcji."""
        performed = []
        try:
            performed += self._heal_disk_space()
            performed += self._heal_stuck_services()
            performed += self._heal_dns_cache()
            performed += self._heal_windows_update()
        except Exception as e:
            log.error("SelfHealer.run error: %s", e)
        return performed

    def _heal_disk_space(self) -> list[dict]:
        """Czyści %TEMP% + Windows.old + kosz gdy C: poniżej 5%."""
        key = "clean_temp"
        try:
            u = psutil.disk_usage("C:\\")
            free_pct = 100 - u.percent
            if free_pct >= self.DISK_CRITICAL_PCT: return []
            if not self._cooled_down(key): return []

            freed_mb = 0
            # Windows temp folders
            for tmp in [os.environ.get("TEMP", ""), os.environ.get("TMP", ""),
                        r"C:\Windows\Temp", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp")]:
                if not tmp or not os.path.isdir(tmp): continue
                for entry in os.listdir(tmp):
                    fp = os.path.join(tmp, entry)
                    try:
                        if os.path.isfile(fp):
                            sz = os.path.getsize(fp)
                            os.remove(fp); freed_mb += sz / (1024**2)
                        elif os.path.isdir(fp):
                            import shutil as _sh
                            sz = sum(os.path.getsize(os.path.join(dp, f))
                                     for dp, _, fs in os.walk(fp) for f in fs
                                     if os.path.isfile(os.path.join(dp, f)))
                            _sh.rmtree(fp, ignore_errors=True); freed_mb += sz / (1024**2)
                    except Exception: pass

            # Recycle Bin (wszystkie dyski, cicho)
            try:
                subprocess.run(["powershell", "-NoProfile", "-Command",
                                "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                               capture_output=True, timeout=30, creationflags=_NO_WINDOW)
            except Exception: pass

            summary = f"Zwolniono ~{freed_mb:.0f} MB (TEMP + kosz), wolne było {free_pct:.1f}%"
            self._mark(key, summary)
            return [{"action": key, "summary": summary}]
        except Exception as e:
            log.debug("Self-heal disk error: %s", e)
            return []

    def _heal_stuck_services(self) -> list[dict]:
        """Restart krytycznych usług które powinny być 'running' a są 'stopped'."""
        performed = []
        try:
            import win32serviceutil
            for svc in self.AUTO_RESTART_SERVICES:
                try:
                    status = win32serviceutil.QueryServiceStatus(svc)[1]
                    # 1 = STOPPED
                    if status != 1: continue
                    key = f"restart_{svc}"
                    if not self._cooled_down(key): continue
                    try:
                        win32serviceutil.StartService(svc)
                        summary = f"Usługa {svc} była zatrzymana — uruchomiono"
                        self._mark(key, summary)
                        performed.append({"action": key, "summary": summary})
                    except Exception as e:
                        log.debug("Self-heal start %s failed: %s", svc, e)
                except Exception: pass
        except ImportError: pass
        except Exception as e:
            log.debug("Self-heal services error: %s", e)
        return performed

    def _heal_dns_cache(self) -> list[dict]:
        """Flush DNS gdy wykryto błędy DNS (nslookup/resolve nie działa)."""
        key = "flush_dns"
        if not self._cooled_down(key): return []
        try:
            # Szybki test — czy możemy zresolvować infradesk.pl?
            socket.gethostbyname("infradesk.pl")
            return []  # DNS OK
        except Exception:
            pass
        try:
            subprocess.run(["ipconfig", "/flushdns"], capture_output=True,
                           timeout=10, creationflags=_NO_WINDOW)
            summary = "Wyczyszczono cache DNS (ipconfig /flushdns) po błędzie rozwiązywania"
            self._mark(key, summary)
            return [{"action": key, "summary": summary}]
        except Exception as e:
            log.debug("Self-heal DNS error: %s", e)
            return []

    def _heal_windows_update(self) -> list[dict]:
        """Reset zacinającego się Windows Update — wuauserv + BITS."""
        key = "reset_wu"
        if not self._cooled_down(key): return []
        try:
            import win32serviceutil
            try:
                st = win32serviceutil.QueryServiceStatus("wuauserv")[1]
            except Exception:
                return []
            # Tylko jeśli wuauserv jest w stanie START_PENDING/STOP_PENDING (2 lub 3) przez długi czas
            if st not in (2, 3): return []
            try:
                subprocess.run(["net", "stop", "wuauserv", "/y"],
                               capture_output=True, timeout=60, creationflags=_NO_WINDOW)
                subprocess.run(["net", "stop", "bits", "/y"],
                               capture_output=True, timeout=60, creationflags=_NO_WINDOW)
                time.sleep(2)
                subprocess.run(["net", "start", "bits"],
                               capture_output=True, timeout=60, creationflags=_NO_WINDOW)
                subprocess.run(["net", "start", "wuauserv"],
                               capture_output=True, timeout=60, creationflags=_NO_WINDOW)
                summary = "Zresetowano Windows Update (wuauserv + bits zawieszone)"
                self._mark(key, summary)
                return [{"action": key, "summary": summary}]
            except Exception as e:
                log.debug("Self-heal WU reset failed: %s", e)
        except ImportError: pass
        except Exception as e:
            log.debug("Self-heal WU error: %s", e)
        return []


# --- Backup Scheduler -----------------------------------------------------

# ── Remote Command Handler (inline — no external module needed) ──────────

def _handle_remote_command(msg, ws_send_fn):
    """Handle remote_command from panel. Send result back via WebSocket."""
    request_id = msg.get("requestId")
    command = msg.get("command")
    payload = msg.get("payload", {})
    if not request_id or not command:
        return
    try:
        result = _exec_remote(command, payload)
        ws_send_fn(json.dumps({"requestId": request_id, "data": result}))
    except Exception as e:
        log.error("Remote command '%s' failed: %s", command, e)
        ws_send_fn(json.dumps({"requestId": request_id, "error": str(e)}))


def _exec_remote(command, payload):
    if command == "scan_databases":
        return _remote_scan_databases()
    elif command == "test_db_connection":
        return _remote_test_db(payload)
    elif command == "scan_system":
        return {
            "hostname": socket.gethostname(), "os": platform.system(),
            "os_version": platform.version(), "cpu_count": os.cpu_count(),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        }
    elif command == "get_services":
        svcs = []
        for s in psutil.win_service_iter():
            try:
                i = s.as_dict()
                svcs.append({"name": i["name"], "display_name": i["display_name"], "status": i["status"]})
            except Exception:
                pass
        return {"services": svcs, "count": len(svcs)}
    elif command == "list_files":
        target = payload.get("path", "C:\\")
        if not os.path.isdir(target):
            return {"error": f"Not a directory: {target}"}
        entries = []
        for f in os.listdir(target):
            fp = os.path.join(target, f)
            try:
                st = os.stat(fp)
                entries.append({"name": f, "size": st.st_size, "isDir": os.path.isdir(fp), "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime))})
            except Exception:
                entries.append({"name": f, "error": "access denied"})
        return {"path": target, "files": entries, "count": len(entries)}
    elif command == "run_backup_now":
        cfg_id = payload.get("configId")
        if not cfg_id:
            return {"error": "configId required"}
        # Trigger backup in background
        import threading as _t
        _t.Thread(target=lambda: BackupManager._instance._run_single(cfg_id) if hasattr(BackupManager, '_instance') else None, daemon=True).start()
        return {"triggered": True, "configId": cfg_id}
    else:
        raise ValueError(f"Unknown command: {command}")


def _remote_scan_databases():
    results = []
    # Standard port scan
    for port, name in [(3306,"MySQL"),(5432,"PostgreSQL"),(1433,"MSSQL"),(27017,"MongoDB")]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                results.append({"type": name, "port": port, "host": "127.0.0.1", "status": "running"})
            s.close()
        except Exception:
            pass

    # Detect named MSSQL instances via SQL Browser (UDP 1434)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(3)
        sock.sendto(b'\x02', ("127.0.0.1", 1434))
        data, _ = sock.recvfrom(4096)
        sock.close()
        # Parse response: "ServerName;HOST;InstanceName;NAME;IsClustered;No;Version;VER;tcp;PORT;;"
        for inst_str in data.decode("ascii", errors="ignore").split(";;"):
            if not inst_str.strip():
                continue
            parts = inst_str.strip("\x00").split(";")
            info = {}
            for i in range(0, len(parts) - 1, 2):
                info[parts[i].lower()] = parts[i + 1]
            inst_name = info.get("instancename", "")
            tcp_port = info.get("tcp", "")
            if inst_name:
                # Check if already found via port scan
                if tcp_port and not any(r["port"] == int(tcp_port) for r in results):
                    results.append({
                        "type": "MSSQL", "port": int(tcp_port) if tcp_port else None,
                        "host": "127.0.0.1", "status": "running",
                        "instance": inst_name,
                    })
                elif not tcp_port:
                    results.append({
                        "type": "MSSQL", "port": None,
                        "host": "127.0.0.1", "status": "running",
                        "instance": inst_name, "note": "named_pipes_only",
                    })
    except Exception:
        pass

    # Scan Windows services for DB engines
    services = []
    try:
        for svc in psutil.win_service_iter():
            try:
                i = svc.as_dict()
                nm = i["name"].lower()
                db_kw = ["mysql", "postgres", "pgsql", "mssql", "sqlserver", "mongodb", "mariadb"]
                if any(k in nm for k in db_kw):
                    services.append({"name": i["name"], "display_name": i["display_name"],
                                     "running": i["status"] == "running"})
            except Exception:
                pass
    except Exception:
        pass
    return {"databases": results, "services": services, "hostname": socket.gethostname()}


def _remote_test_db(p):
    db_type = (p.get("type") or "").upper().replace("SQL_", "")
    host = p.get("host", "127.0.0.1")
    port = int(p.get("port") or 0)
    instance = p.get("instance", "")
    user = p.get("user", "")
    pw = p.get("password", "")
    auth_mode = p.get("authMode", "sql")  # "sql" or "windows"
    if auth_mode != "windows" and not user:
        raise ValueError("user is required")
    if "MYSQL" in db_type:
        cmd = ["mysql", f"--host={host}", f"--port={port or 3306}", f"--user={user}"]
        if pw: cmd.append(f"--password={pw}")
        cmd.extend(["-e", "SHOW DATABASES"])
    elif "POSTGRES" in db_type:
        os.environ["PGPASSWORD"] = pw
        cmd = ["psql", f"-h{host}", f"-p{port or 5432}", f"-U{user}", "-c",
               "SELECT datname FROM pg_database WHERE datistemplate = false", "postgres"]
    elif "MSSQL" in db_type:
        # Named instance: SERVER\INSTANCE, otherwise SERVER,PORT
        if instance:
            server = f"{host}\\{instance}"
        elif port:
            server = f"{host},{port}"
        else:
            server = f"{host},1433"
        if auth_mode == "windows":
            # Windows Authentication (Trusted Connection)
            cmd = ["sqlcmd", f"-S{server}", "-E"]
        else:
            cmd = ["sqlcmd", f"-S{server}", f"-U{user}"]
            if pw: cmd.append(f"-P{pw}")
        cmd.extend(["-Q", "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb')"])
    else:
        raise ValueError(f"Unsupported: {db_type}")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
        if r.returncode != 0:
            return {"success": False, "error": r.stderr.strip()[:200]}
        dbs = [l.strip() for l in r.stdout.strip().split("\n")[1:] if l.strip() and not l.startswith("-") and not l.startswith("(")]
        dbs = [d for d in dbs if d not in ("information_schema", "performance_schema", "sys", "")]
        return {"success": True, "databases": dbs, "type": db_type}
    except FileNotFoundError:
        return {"success": False, "error": f"Client ({db_type.lower()}) not installed"}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


class BackupScheduler:
    """Pobiera konfiguracje backupu z API i wykonuje je wg harmonogramu."""

    def __init__(self, token):
        self.token = token
        self.configs = []
        self._last_runs = {}

    def sync_configs(self):
        try:
            self.configs = api_get("/agent/backup-configs", self.token)
            log.info("Backup configs synced: %d", len(self.configs))
        except Exception as e:
            log.warning("Backup config sync failed: %s", e)

    def check_and_run(self):
        now = datetime.now()
        for cfg in self.configs:
            cfg_id = cfg.get("id")
            cron = cfg.get("cronSchedule", "0 2 * * *")
            if not self._should_run(cron, cfg_id, now):
                continue
            log.info("Starting backup: %s (%s)", cfg.get("name"), cfg.get("type"))
            self._last_runs[cfg_id] = now
            threading.Thread(target=self._run_backup, args=(cfg,), daemon=True).start()

    @staticmethod
    def _cron_field_matches(field: str, value: int) -> bool:
        """Check if a cron field matches a value. Supports: *, N, N,M, */N, N-M."""
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

    def _should_run(self, cron_str, cfg_id, now):
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
            # dow: 0=Sunday in cron, isoweekday: 1=Monday..7=Sunday
            cron_dow = now.isoweekday() % 7  # convert to 0=Sunday
            if not self._cron_field_matches(dow, cron_dow):
                return False
            last = self._last_runs.get(cfg_id)
            if last and (now - last).total_seconds() < 3500:
                return False
            return True
        except Exception as e:
            log.warning("Cron parse error for '%s': %s", cron_str, e)
            return False

    def run_single(self, config_id):
        for cfg in self.configs:
            if cfg.get("id") == config_id:
                threading.Thread(target=self._run_backup, args=(cfg,), daemon=True).start()
                return

    def _run_backup(self, cfg):
        cfg_id = cfg.get("id")
        try:
            resp = api_post("/agent/backup/start", {"configId": cfg_id}, self.token)
            history_id = resp.get("historyId")

            btype = cfg.get("type", "")
            local_path = cfg.get("localBackupPath")
            timestamp = time.strftime("%Y%m%d_%H%M%S")

            # ── Step 1: SQL dump to temp dir (SQL Server has access to ProgramData) ──
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

            # ── Step 2: Optional encrypt ──
            if cfg.get("encryptBackups") and cfg.get("encryptionKey"):
                path = self._encrypt(path, cfg["encryptionKey"])

            # ── Step 3: Copy to local destination ──
            if local_path:
                os.makedirs(local_path, exist_ok=True)
                dest = os.path.join(local_path, os.path.basename(path))
                shutil.copy2(path, dest)
                if not os.path.exists(dest) or os.path.getsize(dest) == 0:
                    raise RuntimeError(f"Copy to {dest} failed")
                log.info("Copied to %s (%d bytes)", dest, os.path.getsize(dest))

            # ── Step 4: Optional cloud uploads ──
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

            # ── Step 5: Cleanup temp + old backups ──
            try: os.remove(path)
            except Exception: pass
            retention_days = int(cfg.get("retentionDays", 30))
            if local_path and retention_days > 0:
                self._cleanup_old_backups(local_path, retention_days)

            # ── Step 6: Report success ──
            api_post("/agent/backup/complete", {
                "historyId": history_id,
                "sizeBytes": file_size,
                "fileName": os.path.basename(path),
                "googleDriveId": drive_id,
            }, self.token)
            log.info("Backup OK: %s → %s (%d bytes)", cfg.get("name"), local_path or temp_dir, file_size)

        except Exception as e:
            log.error("Backup failed: %s — %s", cfg.get("name"), e)
            try:
                api_post("/agent/backup/failed", {"configId": cfg_id, "error": str(e)}, self.token)
            except Exception:
                pass

    def _backup_sql(self, cfg, out_dir=None, timestamp=None):
        """Backup SQL database directly to destination folder. No temp files, no tar.gz."""
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

        results = []
        for db in dbs:
            db = db.strip()
            if not db:
                continue

            if btype == "SQL_MYSQL":
                output = os.path.join(out_dir, f"{db}_{timestamp}.sql")
                env = os.environ.copy()
                if pwd:
                    env["MYSQL_PWD"] = pwd
                cmd = ["mysqldump", f"--host={host}", f"--port={port}", f"--user={user}", db]
                try:
                    with open(output, "w") as f:
                        subprocess.run(cmd, check=True, stdout=f, stderr=subprocess.PIPE, timeout=3600, env=env, creationflags=_NO_WINDOW)
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
                    subprocess.run(cmd, check=True, capture_output=True, timeout=3600, env=env, creationflags=_NO_WINDOW)
                    results.append(output)
                    log.info("PostgreSQL dump: %s → %s", db, output)
                except Exception as e:
                    raise RuntimeError(f"PostgreSQL backup failed for {db}: {e}")

            elif btype == "SQL_MSSQL":
                # Native BACKUP DATABASE — fast, compressed, directly to destination
                bak_path = os.path.join(out_dir, f"{db}_{timestamp}.bak")
                sql_query = f"BACKUP DATABASE [{db}] TO DISK=N'{bak_path}' WITH FORMAT, COMPRESSION, STATS=10"
                env = os.environ.copy()
                if user and pwd:
                    env["SQLCMDPASSWORD"] = pwd
                    cmd = ["sqlcmd", "-S", f"{host},{port}", "-U", user, "-Q", sql_query]
                else:
                    cmd = ["sqlcmd", "-S", f"{host},{port}", "-E", "-Q", sql_query]
                try:
                    r = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=3600, env=env, creationflags=_NO_WINDOW)
                    if not os.path.exists(bak_path):
                        raise RuntimeError(f"MSSQL backup file not created: {bak_path}\nOutput: {r.stdout[:500]}\nError: {r.stderr[:500]}")
                    results.append(bak_path)
                    sz = os.path.getsize(bak_path)
                    log.info("MSSQL backup: %s → %s (%d MB)", db, bak_path, sz // (1024*1024))
                except subprocess.CalledProcessError as e:
                    raise RuntimeError(f"MSSQL backup failed for {db}: {e.stderr[:500] if e.stderr else e}")

        if not results:
            raise RuntimeError("No databases to backup")

        # Single DB → return file directly. Multiple → tar them together.
        if len(results) == 1:
            return results[0]

        import tarfile
        archive = os.path.join(out_dir, f"backup_sql_{timestamp}.tar.gz")
        with tarfile.open(archive, "w:gz") as tar:
            for r in results:
                tar.add(r, arcname=os.path.basename(r))
                try: os.remove(r)
                except Exception: pass
        return archive

    @staticmethod
    def _cleanup_old_backups(directory: str, retention_days: int):
        """Remove backup files older than retention_days from directory."""
        import glob
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
            log.info("Retention cleanup: removed %d old backups from %s (>%d days)", removed, directory, retention_days)

    def _backup_folder(self, cfg):
        import zipfile
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
                    try: zf.write(fpath, arcname)
                    except Exception: pass
        return output

    def _encrypt(self, path, key):
        try:
            from cryptography.fernet import Fernet
            import hashlib
            # Always derive a valid 32-byte Fernet key from any input
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

    def _upload_infradesk_cloud(self, path, config_id):
        """Upload backup file to InfraDesk Cloud storage."""
        url = f"{API_BASE}/backup/cloud/upload"
        file_size = os.path.getsize(path)
        log.info("Uploading to InfraDesk Cloud: %s (%d MB)", os.path.basename(path), file_size // (1024*1024))
        with open(path, "rb") as f:
            resp = requests.post(
                url,
                files={"backup": (os.path.basename(path), f)},
                headers={
                    "x-agent-token": self.token,
                    "x-backup-config-id": config_id,
                },
                timeout=7200,  # 2h for large files
            )
        if resp.status_code != 200:
            raise RuntimeError(f"InfraDesk Cloud upload error {resp.status_code}: {resp.text[:200]}")
        return resp.json()

    def _upload_gdrive(self, path, folder_id):
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload

            creds_data = api_get("/agent/backup/drive-credentials", self.token)
            creds = service_account.Credentials.from_service_account_info(
                creds_data, scopes=["https://www.googleapis.com/auth/drive.file"]
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


# --- System Health Score --------------------------------------------------

def get_system_score():
    """Simple system benchmark score 1-10."""
    score = 5.0
    try:
        cores = psutil.cpu_count(logical=False) or 2
        if cores >= 8: score += 1.5
        elif cores >= 4: score += 0.8

        ram_gb = psutil.virtual_memory().total / (1024**3)
        if ram_gb >= 32: score += 1.5
        elif ram_gb >= 16: score += 1.0
        elif ram_gb >= 8: score += 0.3
        elif ram_gb < 4: score -= 1.0

        try:
            disk = psutil.disk_usage("C:\\")
            free_pct = 100 - disk.percent
            if free_pct > 30: score += 0.5
            elif free_pct < 10: score -= 1.0
        except Exception: pass

        try:
            r = subprocess.run(["powershell", "-Command", "(Get-PhysicalDisk | Select-Object MediaType).MediaType"],
                               capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
            if "SSD" in r.stdout: score += 1.0
        except Exception: pass

        cpu = psutil.cpu_percent(interval=1)
        if cpu > 80: score -= 0.5

    except Exception: pass
    return max(1.0, min(10.0, round(score, 1)))


# --- Full Diagnosis (ported from Asystent Home) ---------------------------

def full_diagnosis() -> dict:
    """Comprehensive system audit — wydajnosc/bezpieczenstwo/uslugi/siec/system/aktualizacje/dyski."""
    checks = []
    score = 100

    def add(cat, name, status, detail, severity='info', fix_cmd=None):
        nonlocal score
        pen = {'critical':15,'high':8,'medium':4,'low':1,'info':0}.get(severity,0)
        if status == 'fail':
            score = max(0, score - pen)
        checks.append({"cat": cat, "name": name, "status": status, "detail": detail,
                       "severity": severity, "fixCmd": fix_cmd})

    try:
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\")
        cpu_pct = psutil.cpu_percent(interval=1)
        uptime_d = int((time.time() - psutil.boot_time()) / 86400)

        # ── WYDAJNOŚĆ ──
        add('wydajnosc', 'Użycie CPU', 'pass' if cpu_pct<80 else 'fail',
            f'{cpu_pct}% wykorzystania procesora', 'high' if cpu_pct>80 else 'low')
        add('wydajnosc', 'Pamięć RAM', 'pass' if mem.percent<85 else 'fail',
            f'{mem.percent}% zajęte ({round(mem.used/(1024**3),1)}/{round(mem.total/(1024**3),1)} GB)',
            'high' if mem.percent>85 else 'medium' if mem.percent>70 else 'info')
        add('wydajnosc', 'Dysk C:', 'pass' if disk.percent<85 else 'fail',
            f'{disk.percent}% zajęte, wolne {round(disk.free/(1024**3),1)} GB',
            'critical' if disk.percent>90 else 'high' if disk.percent>85 else 'info',
            'cleanmgr /d C' if disk.percent>80 else None)
        add('wydajnosc', 'Czas pracy systemu', 'pass' if uptime_d<14 else 'warn',
            f'{uptime_d} dni od restartu',
            'medium' if uptime_d>30 else 'low' if uptime_d>14 else 'info',
            'shutdown /r /t 300' if uptime_d>14 else None)

        top = sorted(psutil.process_iter(['name','memory_percent']),
                     key=lambda p: p.info.get('memory_percent',0) or 0, reverse=True)[:5]
        top_str = ', '.join(f"{p.info['name']} ({p.info['memory_percent']:.0f}%)" for p in top if p.info.get('memory_percent'))
        add('wydajnosc', 'Procesy RAM', 'info', f'Top: {top_str}', 'info')

        # ── PLIKI TYMCZASOWE ──
        temp_mb = 0
        for d in [os.environ.get("TEMP",""), os.path.join(os.environ.get("WINDIR",""),"Temp")]:
            if d and os.path.exists(d):
                for dp,_,fns in os.walk(d):
                    for fn in fns:
                        try: temp_mb += os.path.getsize(os.path.join(dp,fn))
                        except Exception: pass
        temp_mb /= (1024*1024)
        add('czyszczenie', 'Pliki tymczasowe', 'fail' if temp_mb>200 else 'pass',
            f'{temp_mb:.0f} MB plików tymczasowych',
            'medium' if temp_mb>500 else 'low' if temp_mb>200 else 'info',
            "Remove-Item $env:TEMP\\* -Recurse -Force -EA SilentlyContinue" if temp_mb>200 else None)

        # ── BEZPIECZEŃSTWO ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "(Get-MpComputerStatus).RealTimeProtectionEnabled"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            defender_on = r.stdout.strip() == 'True'
            add('bezpieczenstwo', 'Windows Defender', 'pass' if defender_on else 'fail',
                'Ochrona w czasie rzeczywistym aktywna' if defender_on else 'Ochrona wyłączona!',
                'critical' if not defender_on else 'info',
                'Set-MpPreference -DisableRealtimeMonitoring $false' if not defender_on else None)
        except Exception: add('bezpieczenstwo','Windows Defender','warn','Nie udało się sprawdzić','low')

        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Get-NetFirewallProfile | Where-Object {$_.Enabled -eq $false} | Select-Object -ExpandProperty Name"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            disabled_fw = [p.strip() for p in r.stdout.strip().split("\n") if p.strip()]
            if disabled_fw:
                add('bezpieczenstwo','Firewall','fail',f'Wyłączone profile: {", ".join(disabled_fw)}','critical',
                    'Set-NetFirewallProfile -All -Enabled True')
            else:
                add('bezpieczenstwo','Firewall','pass','Wszystkie profile aktywne','info')
        except Exception: add('bezpieczenstwo','Firewall','warn','Nie udało się sprawdzić','low')

        # ── USŁUGI ──
        try:
            svcs = ["wuauserv","WinDefend","Spooler","Dnscache","BITS","EventLog"]
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Get-Service -Name "+",".join(svcs)+" -EA SilentlyContinue | Where-Object {$_.Status -ne 'Running'} | Select-Object -ExpandProperty DisplayName"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            stopped = [s.strip() for s in r.stdout.strip().split("\n") if s.strip()]
            if stopped:
                add('uslugi','Usługi systemowe','fail',f'Zatrzymane: {", ".join(stopped)}','high',
                    "; ".join(f"Start-Service '{s}' -EA SilentlyContinue" for s in svcs))
            else:
                add('uslugi','Usługi systemowe','pass','Wszystkie kluczowe usługi działają','info')
        except Exception: pass

        # ── SIEĆ ──
        try:
            r = subprocess.run(["ping","-n","2","-w","2000","8.8.8.8"],
                capture_output=True,text=True,timeout=10,creationflags=_NO_WINDOW)
            net_ok = r.returncode == 0
            add('siec','Połączenie internetowe','pass' if net_ok else 'fail',
                'Połączenie aktywne' if net_ok else 'Brak połączenia z internetem',
                'high' if not net_ok else 'info')
        except Exception: add('siec','Połączenie internetowe','warn','Nie udało się sprawdzić','low')

        try:
            r = subprocess.run(["nslookup","google.com"],capture_output=True,text=True,timeout=8,creationflags=_NO_WINDOW)
            dns_ok = r.returncode == 0 and 'Address' in r.stdout
            add('siec','DNS','pass' if dns_ok else 'fail',
                'Rozwiązywanie nazw działa' if dns_ok else 'Problem z DNS',
                'medium' if not dns_ok else 'info',
                'ipconfig /flushdns' if not dns_ok else None)
        except Exception: pass

        # ── EVENT LOG ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 30 -EA SilentlyContinue).Count"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=15,creationflags=_NO_WINDOW)
            err_count = int(r.stdout.strip()) if r.stdout.strip().isdigit() else 0
            add('system','Błędy systemowe (24h)','pass' if err_count<5 else 'fail',
                f'{err_count} błędów/krytycznych zdarzeń',
                'high' if err_count>10 else 'medium' if err_count>5 else 'info')
        except Exception: pass

        # ── AKTUALIZACJE ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            last_update = r.stdout.strip()
            if last_update:
                days_ago = (datetime.now() - datetime.strptime(last_update,'%Y-%m-%d')).days
                add('aktualizacje','Ostatnia aktualizacja','pass' if days_ago<30 else 'fail',
                    f'{last_update} ({days_ago} dni temu)',
                    'high' if days_ago>60 else 'medium' if days_ago>30 else 'info')
        except Exception: pass

        # ── DYSKI SMART ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Get-PhysicalDisk | Select-Object FriendlyName, HealthStatus, OperationalStatus | ConvertTo-Json"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            disks = json.loads(r.stdout) if r.stdout.strip() else []
            if not isinstance(disks, list): disks = [disks]
            for d in disks:
                healthy = d.get('HealthStatus','') == 'Healthy'
                add('dyski', f"Dysk: {d.get('FriendlyName','?')}",
                    'pass' if healthy else 'fail',
                    f"Stan: {d.get('HealthStatus','?')}, Status: {d.get('OperationalStatus','?')}",
                    'critical' if not healthy else 'info')
        except Exception: pass

        # ═══ EXTRA CHECKS (v4.13.0) ═══

        # ── TEMPERATURA CPU (WMI ACPI Thermal Zone) ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Get-WmiObject -Namespace 'root/wmi' -Class MSAcpi_ThermalZoneTemperature -EA SilentlyContinue | ForEach-Object { [math]::Round(($_.CurrentTemperature - 2732) / 10, 0) }"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=8,creationflags=_NO_WINDOW)
            temps = [int(x) for x in (r.stdout or '').split() if x.strip().lstrip('-').isdigit()]
            if temps:
                tmax = max(temps)
                sev = 'critical' if tmax > 90 else 'high' if tmax > 80 else 'medium' if tmax > 70 else 'info'
                add('wydajnosc','Temperatura CPU', 'fail' if tmax > 80 else 'pass',
                    f'{tmax}°C (najwyższa strefa termiczna)', sev)
        except Exception: pass

        # ── TPM ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "$t=Get-Tpm -EA SilentlyContinue; if($t){ \"$($t.TpmPresent);$($t.TpmReady);$($t.ManufacturerVersion)\" }"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            out = (r.stdout or '').strip()
            if out and ';' in out:
                present, ready, ver = (out.split(';') + ['','',''])[:3]
                tpm_ok = present.strip().lower() == 'true' and ready.strip().lower() == 'true'
                add('bezpieczenstwo','TPM (Trusted Platform Module)', 'pass' if tpm_ok else 'fail',
                    f'Obecny: {present}, Gotowy: {ready}, Firmware: {ver or "?"}',
                    'high' if not tpm_ok else 'info')
        except Exception: pass

        # ── SECURE BOOT ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Confirm-SecureBootUEFI -EA SilentlyContinue"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=8,creationflags=_NO_WINDOW)
            sb = (r.stdout or '').strip().lower() == 'true'
            add('bezpieczenstwo','Secure Boot UEFI', 'pass' if sb else 'fail',
                'Włączony' if sb else 'Wyłączony lub BIOS legacy',
                'high' if not sb else 'info',
                None)
        except Exception: pass

        # ── TIME SYNC (W32Time / NTP) ──
        try:
            r = subprocess.run(["w32tm","/query","/status"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=8,creationflags=_NO_WINDOW)
            out = r.stdout or ''
            # Parse "Last Successful Sync Time" lub "Źródło" + "Offset"
            synced = 'unspecified' not in out.lower() and 'not been synchronized' not in out.lower()
            src_match = re.search(r'Source:\s*(.+)', out) or re.search(r'Źródło:\s*(.+)', out)
            src = src_match.group(1).strip() if src_match else '?'
            add('siec','Synchronizacja czasu (NTP)', 'pass' if synced else 'fail',
                f'Źródło: {src[:80]}' if synced else 'Zegar niezsynchronizowany',
                'medium' if not synced else 'info',
                'w32tm /resync /force' if not synced else None)
        except Exception: pass

        # ── BATERIA (laptop wear level) ──
        try:
            bat = psutil.sensors_battery()
            if bat is not None:
                # Raport wear level z WMI (designed vs full charge)
                r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                    "$b=Get-WmiObject -Namespace 'root/wmi' -Class BatteryStaticData -EA SilentlyContinue; $f=Get-WmiObject -Namespace 'root/wmi' -Class BatteryFullChargedCapacity -EA SilentlyContinue; if($b -and $f){ \"$($b.DesignedCapacity);$($f.FullChargedCapacity)\" }"],
                    capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
                out = (r.stdout or '').strip()
                wear_pct = None
                if out and ';' in out:
                    try:
                        des, full = out.split(';', 1)
                        des, full = int(des.strip()), int(full.strip())
                        if des > 0: wear_pct = round(100 * (des - full) / des, 1)
                    except Exception: pass
                if wear_pct is not None:
                    sev = 'high' if wear_pct > 40 else 'medium' if wear_pct > 25 else 'info'
                    add('wydajnosc','Zużycie baterii', 'fail' if wear_pct > 25 else 'pass',
                        f'Pojemność: {100-wear_pct:.0f}% nominalnej ({wear_pct:.0f}% zużycia)', sev)
                else:
                    add('wydajnosc','Bateria', 'pass', f'Poziom: {bat.percent:.0f}%, zasilanie: {"sieć" if bat.power_plugged else "bateria"}', 'info')
        except Exception: pass

        # ── SCHEDULED TASKS — podejrzane ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.State -eq 'Ready' -and $_.TaskPath -notmatch '^\\\\Microsoft\\\\' -and $_.TaskPath -notmatch '^\\\\MicrosoftEdge' } | Measure-Object | Select-Object -ExpandProperty Count"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=20,creationflags=_NO_WINDOW)
            cnt = int(r.stdout.strip()) if (r.stdout or '').strip().isdigit() else 0
            add('bezpieczenstwo','Nietypowe zaplanowane zadania',
                'pass' if cnt < 10 else 'fail',
                f'{cnt} tasków poza katalogiem Microsoft/',
                'medium' if cnt >= 20 else 'low' if cnt >= 10 else 'info')
        except Exception: pass

        # ── USB STORAGE BLOCKED ──
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services\USBSTOR") as k:
                start_val = int(winreg.QueryValueEx(k, "Start")[0])
            # 3 = Manual (normalne), 4 = Disabled (zablokowane nośniki USB)
            blocked = start_val == 4
            add('bezpieczenstwo','Blokada nośników USB',
                'pass' if blocked else 'info',
                'Zablokowane (polityka korporacyjna)' if blocked else 'Odblokowane (domyślnie)',
                'info')
        except Exception: pass

        # ── AUDIT POLICY (Logon events 4624/4625) ──
        try:
            r = subprocess.run(["auditpol","/get","/subcategory:Logon"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=8,creationflags=_NO_WINDOW)
            out = r.stdout or ''
            # Akceptujemy "Success", "Success and Failure", "Sukces", "Powodzenie i Niepowodzenie"
            audited = 'success' in out.lower() or 'sukces' in out.lower() or 'powodzenie' in out.lower()
            add('bezpieczenstwo','Audyt logowań (4624/4625)',
                'pass' if audited else 'fail',
                'Zdarzenia logowania są audytowane' if audited else 'Brak audytu logowań!',
                'high' if not audited else 'info',
                'auditpol /set /subcategory:"Logon" /success:enable /failure:enable' if not audited else None)
        except Exception: pass

        # ── HASŁA LOKALNYCH KONT (PasswordLastSet > 90 dni) ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "Get-LocalUser -EA SilentlyContinue | Where-Object { $_.Enabled -and $_.PasswordLastSet -and $_.PasswordLastSet -lt (Get-Date).AddDays(-90) } | Select-Object -ExpandProperty Name"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
            old = [x.strip() for x in (r.stdout or '').split("\n") if x.strip()]
            if old:
                add('bezpieczenstwo','Stare hasła lokalne (>90 dni)',
                    'fail', f'Konta: {", ".join(old[:5])}{"..." if len(old)>5 else ""}',
                    'medium')
            else:
                add('bezpieczenstwo','Stare hasła lokalne (>90 dni)','pass','Wszystkie hasła aktualne','info')
        except Exception: pass

        # ── PAGEFILE ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue | Measure-Object AllocatedBaseSize -Sum).Sum"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=8,creationflags=_NO_WINDOW)
            pf_mb = int(r.stdout.strip()) if (r.stdout or '').strip().isdigit() else 0
            add('system','Plik stronicowania',
                'pass' if pf_mb > 0 else 'fail',
                f'{pf_mb} MB' if pf_mb > 0 else 'Brak pliku stronicowania',
                'medium' if pf_mb == 0 else 'info')
        except Exception: pass

        # ── SZYBKOŚĆ DYSKU (szybki sekwencyjny read test) ──
        try:
            # Read 50 MB z %TEMP%\speedtest.bin; tworzymy jeśli nie ma
            tmp = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'ab_diskspeed.bin')
            size_mb = 50
            if not os.path.exists(tmp) or os.path.getsize(tmp) < size_mb * 1024 * 1024:
                with open(tmp, 'wb') as f: f.write(os.urandom(size_mb * 1024 * 1024))
            t0 = time.perf_counter()
            with open(tmp, 'rb') as f:
                while f.read(1024 * 1024): pass
            elapsed = max(time.perf_counter() - t0, 0.001)
            mb_s = round(size_mb / elapsed, 0)
            sev = 'high' if mb_s < 100 else 'medium' if mb_s < 300 else 'info'
            add('dyski','Szybkość dysku systemowego (read)',
                'fail' if mb_s < 100 else 'pass',
                f'{mb_s} MB/s (test sekwencyjny 50 MB)', sev)
        except Exception: pass

        # ── BIOS / UEFI ──
        try:
            r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                "$b=Get-CimInstance Win32_BIOS -EA SilentlyContinue; if($b){ \"$($b.Manufacturer);$($b.SMBIOSBIOSVersion);$($b.ReleaseDate)\" }"],
                capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=8,creationflags=_NO_WINDOW)
            out = (r.stdout or '').strip()
            if out and ';' in out:
                parts = out.split(';')
                mfr = parts[0] if len(parts) > 0 else '?'
                ver = parts[1] if len(parts) > 1 else '?'
                rdate = parts[2] if len(parts) > 2 else ''
                # rdate format: yyyymmdd000000.000000+000
                age_years = None
                if rdate and len(rdate) >= 8 and rdate[:8].isdigit():
                    try:
                        rd = datetime.strptime(rdate[:8], '%Y%m%d')
                        age_years = (datetime.now() - rd).days / 365.25
                    except Exception: pass
                detail = f'{mfr} · {ver}' + (f' · {age_years:.1f} lat' if age_years else '')
                status = 'warn' if age_years and age_years > 5 else 'pass'
                sev = 'medium' if age_years and age_years > 7 else 'low' if age_years and age_years > 5 else 'info'
                add('system','BIOS / UEFI', status, detail, sev)
        except Exception: pass

    except Exception as e:
        log.error("full_diagnosis error: %s", e)

    return {
        "checks": checks, "score": max(0, score), "total": len(checks),
        "passed": len([c for c in checks if c['status']=='pass']),
        "failed": len([c for c in checks if c['status']=='fail']),
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M'),
    }


# --- BusinessAPI (pywebview bridge) ---------------------------------------

class BusinessAPI:
    """Pywebview JS API for Asystent Business — overview + ticket."""

    def __init__(self, token, cfg, bg=None):
        self.token = token
        self.cfg = cfg
        self._bg = bg                # _BackgroundServices (for WS status bridge)
        self._last_error = None
        self._auto_ticket_ts = 0     # set when auto-ticket created → sidebar orb flashes 'thinking'
        self._screenshots = {}

    def get_agent_status(self):
        """Return live agent status for the sidebar Rdzeń ID orb.
        Polled every 5s from JS (business.html)."""
        try:
            ws_connected = False
            bg = self._bg
            if bg is not None:
                ws = getattr(bg, "_ws", None)
                if ws is not None:
                    ws_connected = getattr(ws, "_sock", None) is not None
            # Thinking window: 2s after an auto-ticket is created.
            import time as _t
            state = "idle"
            if self._auto_ticket_ts and (_t.time() - self._auto_ticket_ts) < 2:
                state = "thinking"
            return {
                "state": state,
                "wsConnected": bool(ws_connected),
                "lastError": self._last_error,
            }
        except Exception as e:
            return {"state": "idle", "wsConnected": False, "lastError": str(e)}

    def notify_auto_ticket(self):
        """Server-side hook: call when an auto-ticket has been created so the
        sidebar orb briefly flips to 'thinking'. Exposed for internal use."""
        import time as _t
        self._auto_ticket_ts = _t.time()
        return True

    def get_system_info(self):
        try:
            info = machine_info()
            disks = []
            for p in psutil.disk_partitions():
                try:
                    u = psutil.disk_usage(p.mountpoint)
                    disks.append({
                        "device": p.device,
                        "totalGb": round(u.total / (1024**3), 1),
                        "freeGb": round(u.free / (1024**3), 1),
                        "usedPct": u.percent,
                    })
                except Exception: pass

            return {
                "hostname": info.get("hostname", ""),
                "currentUser": info.get("currentUser", os.environ.get("USERNAME", "")),
                "os": f"{info.get('osInfo', '')} (build {info.get('windowsVersion', '')})",
                "cpu": info.get("cpuModel", _wmic("cpu get name")),
                "cpuCores": info.get("cpuCores", 0),
                "ramGb": round(psutil.virtual_memory().total / (1024**3), 1),
                "score": get_system_score(),
                "disks": disks,
                "version": APP_VERSION,
                "rustdeskId": info.get("rustdeskId", ""),
            }
        except Exception as e:
            return {"error": str(e)}

    def get_metrics(self):
        try:
            disk = psutil.disk_usage("C:\\")
            return {
                "cpu": psutil.cpu_percent(interval=0.5),
                "ram": psutil.virtual_memory().percent,
                "diskPercent": disk.percent,
                "diskFreeGb": round(disk.free / (1024**3), 1),
            }
        except Exception as e:
            return {"error": str(e)}

    def capture_screenshot(self, slot):
        try:
            img = ImageGrab.grab()
            path = os.path.join(tempfile.gettempdir(), f"ab_screen_{slot}.png")
            img.save(path, "PNG")
            self._screenshots[slot] = path
            thumb = img.copy()
            thumb.thumbnail((200, 120))
            buf = io.BytesIO()
            thumb.save(buf, format="PNG")
            return {"ok": True, "slot": slot, "preview": base64.b64encode(buf.getvalue()).decode()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def remove_screenshot(self, slot):
        path = self._screenshots.pop(slot, None)
        if path:
            try: os.remove(path)
            except Exception: pass
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
            log.info("submit_ticket payload: %s", {k: v[:80] if isinstance(v, str) else v for k, v in payload.items()})

            h = {"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"}
            r = requests.post(f"{API_BASE}/agent/ticket", json=payload, headers=h, timeout=15)
            log.info("submit_ticket response: status=%s body=%s", r.status_code, r.text[:500])

            if r.status_code == 409:
                # Retry once — ticketNumber race condition
                import time; time.sleep(0.5)
                r = requests.post(f"{API_BASE}/agent/ticket", json=payload, headers=h, timeout=15)
                log.info("submit_ticket retry: status=%s body=%s", r.status_code, r.text[:500])

            r.raise_for_status()
            result = r.json()

            # Cleanup
            for path in self._screenshots.values():
                try: os.remove(path)
                except Exception: pass
            self._screenshots.clear()

            return {"ok": True, "ticketId": result.get("id")}
        except requests.exceptions.HTTPError as e:
            body = ""
            try: body = e.response.text[:300]
            except Exception: pass
            log.error("submit_ticket HTTP %s: %s", e.response.status_code if e.response else '?', body)
            return {"ok": False, "error": f"Blad serwera ({e.response.status_code if e.response else '?'}): {body[:100]}"}
        except Exception as e:
            log.error("submit_ticket error: %s", e)
            return {"ok": False, "error": str(e)}

    def get_workspaces(self):
        """Get workspaces/companies this agent is assigned to."""
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
        """Detect installed remote access programs with IDs and status."""
        programs = []

        # RustDesk
        rd_installed = is_rustdesk_installed()
        rd_id = _rustdesk_id() if rd_installed else None
        rd_exe = None
        for p in [r"C:\Program Files\SILERS\SILERS.exe",
                   r"C:\Program Files\RustDesk\rustdesk.exe",
                   r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
            if os.path.exists(p):
                rd_exe = p; break
        # Security: RustDesk password extraction removed — passwords are managed via
        # one-time connect passwords generated server-side through the API.
        programs.append({
            "name": "RustDesk",
            "installed": rd_installed,
            "exe": rd_exe,
            "id": rd_id,
            "password": None,
            "canInstall": True,
        })

        # AnyDesk
        ad_installed = False
        ad_exe = None
        ad_id = None
        for p in [r"C:\Program Files (x86)\AnyDesk\AnyDesk.exe",
                   r"C:\Program Files\AnyDesk\AnyDesk.exe",
                   os.path.join(os.environ.get("APPDATA", ""), "AnyDesk", "AnyDesk.exe"),
                   os.path.join(os.environ.get("LOCALAPPDATA", ""), "AnyDesk", "AnyDesk.exe")]:
            if os.path.exists(p):
                ad_installed = True; ad_exe = p; break
        if ad_installed and ad_exe:
            try:
                r = subprocess.run([ad_exe, "--get-id"], capture_output=True, text=True, timeout=5, creationflags=_NO_WINDOW)
                ad_id = r.stdout.strip() if r.returncode == 0 else None
            except Exception: pass
        # Try reading from system info
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
            except Exception: pass
        programs.append({
            "name": "AnyDesk",
            "installed": ad_installed,
            "exe": ad_exe,
            "id": ad_id,
            "password": None,
            "canInstall": False,
        })

        # TeamViewer
        tv_installed = False
        tv_exe = None
        tv_id = None
        for p in [r"C:\Program Files\TeamViewer\TeamViewer.exe",
                   r"C:\Program Files (x86)\TeamViewer\TeamViewer.exe"]:
            if os.path.exists(p):
                tv_installed = True; tv_exe = p; break
        if tv_installed:
            try:
                key_path = r"SOFTWARE\WOW6432Node\TeamViewer"
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as k:
                    tv_id = str(winreg.QueryValueEx(k, "ClientID")[0])
            except Exception:
                try:
                    key_path = r"SOFTWARE\TeamViewer"
                    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as k:
                        tv_id = str(winreg.QueryValueEx(k, "ClientID")[0])
                except Exception: pass
        programs.append({
            "name": "TeamViewer",
            "installed": tv_installed,
            "exe": tv_exe,
            "id": tv_id,
            "password": None,
            "canInstall": False,
        })

        return programs

    def launch_program(self, exe_path):
        """Launch any program by path."""
        try:
            if os.path.exists(exe_path):
                subprocess.Popen([exe_path], creationflags=_NO_WINDOW)
                return {"ok": True}
            return {"ok": False, "error": "Plik nie istnieje"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def copy_to_clipboard(self, text):
        """Copy text to clipboard."""
        try:
            subprocess.run(["powershell", "-Command", f"Set-Clipboard -Value '{text}'"],
                          creationflags=_NO_WINDOW, timeout=5)
            return {"ok": True}
        except Exception:
            return {"ok": False}

    def get_connection_status(self):
        try:
            resp = check_status(self.token)
            connected = resp is not None and (resp.get("status") == "ACTIVE" if isinstance(resp, dict) else resp == "ACTIVE")
            return {"connected": connected}
        except Exception:
            return {"connected": False}

    def get_tickets(self):
        """Get ticket history from API."""
        try:
            return api_get("/agent/tickets", self.token)
        except Exception as e:
            log.debug("get_tickets error: %s", e)
            return []

    def get_ticket_detail(self, ticket_id):
        """Get full ticket detail incl. comments."""
        try:
            return api_get(f"/agent/tickets/{ticket_id}", self.token)
        except Exception as e:
            log.debug("get_ticket_detail error: %s", e)
            return {"error": str(e)}

    def post_ticket_comment(self, ticket_id, comment):
        """Client adds a message to the technician."""
        try:
            return api_post(f"/agent/tickets/{ticket_id}/comments", {"comment": comment}, self.token)
        except Exception as e:
            log.debug("post_ticket_comment error: %s", e)
            return {"error": str(e)}

    def cancel_my_ticket(self, ticket_id):
        """Cancel own ticket (only NEW/PENDING/ASSIGNED)."""
        try:
            return api_post(f"/agent/tickets/{ticket_id}/cancel", {}, self.token)
        except Exception as e:
            log.debug("cancel_my_ticket error: %s", e)
            return {"error": str(e)}

    def edit_my_ticket(self, ticket_id, title, description):
        """Edit own ticket title/description (only NEW/PENDING)."""
        try:
            payload = {}
            if title: payload["title"] = title
            if description: payload["description"] = description
            return api_patch(f"/agent/tickets/{ticket_id}", payload, self.token)
        except Exception as e:
            log.debug("edit_my_ticket error: %s", e)
            return {"error": str(e)}

    def full_diagnosis(self):
        """Run comprehensive system diagnosis. Returns checks + score."""
        try:
            result = full_diagnosis()
            # Push wyniku do backendu jako serverMetrics.fullDiagnosis
            try:
                threading.Thread(target=lambda: do_metrics(self.token, {
                    **metrics(), "serverMetrics": {"fullDiagnosis": result}
                }), daemon=True).start()
            except Exception: pass
            return result
        except Exception as e:
            log.error("full_diagnosis error: %s", e)
            return {"error": str(e)}

    def run_security_fix(self, check_id):
        """Uruchamia predefiniowaną naprawę dla checka bezpieczeństwa. UI przekazuje TYLKO id."""
        return run_security_fix(check_id)

    def get_security_audit(self, force=False):
        """Return last security audit (cached). force=True → run now."""
        try:
            if force:
                audit = security_audit()
                _save_audit_cache(audit)
                # Push do panelu asynchronicznie
                try:
                    threading.Thread(target=lambda: do_metrics(self.token, {
                        **metrics(), "serverMetrics": {"securityAudit": audit}
                    }), daemon=True).start()
                except Exception: pass
                return audit
            cached = _load_audit_cache()
            if cached: return cached
            # Brak cache → uruchom pierwszy raz
            audit = security_audit()
            _save_audit_cache(audit)
            return audit
        except Exception as e:
            log.error("get_security_audit error: %s", e)
            return {"error": str(e)}

    def get_contact(self):
        """Get IT support contact info."""
        try:
            return fetch_contact()
        except Exception:
            return {
                "infolinia": "+48 575 662 664",
                "email": "zgloszenia@silers.pl",
                "opiekun": "Błaszczykowski Adrian",
                "opiekunTel": "+48 604 292 831",
                "opiekunEmail": "adrian@silers.pl",
            }

    def get_rustdesk_id(self):
        """Check if RustDesk is installed and return ID."""
        try:
            installed = is_rustdesk_installed()
            rid = _rustdesk_id() if installed else None
            return {"installed": installed, "id": rid}
        except Exception:
            return {"installed": False, "id": None}

    def launch_rustdesk(self):
        """Launch RustDesk for remote support."""
        try:
            for exe in [r"C:\Program Files\SILERS\SILERS.exe",
                        r"C:\Program Files\RustDesk\rustdesk.exe",
                        r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
                if os.path.exists(exe):
                    subprocess.Popen([exe], creationflags=_NO_WINDOW)
                    return {"ok": True}
            return {"ok": False, "error": "RustDesk nie zainstalowany"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def install_rustdesk(self):
        """Install RustDesk/SILERS."""
        try:
            return install_rustdesk()
        except Exception as e:
            log.error("RustDesk install error: %s", e)
            return False

    def get_backup_status(self):
        """Get backup configurations and recent history."""
        try:
            configs = api_get("/agent/backup-configs", self.token)
            if not configs:
                configs = []

            # Get recent history for all configs
            history = []
            for cfg in configs[:10]:  # limit to 10 configs
                try:
                    h = api_get(f"/agent/backup-configs/{cfg['id']}/history?limit=5", self.token)
                    if h:
                        for entry in h:
                            entry["configName"] = cfg.get("name", "Backup")
                        history.extend(h)
                except Exception:
                    pass

            # Sort history by date desc
            history.sort(key=lambda x: x.get("startedAt", ""), reverse=True)

            # Add friendly schedule labels
            schedule_labels = {
                "0 2 * * *": "Codziennie 02:00",
                "0 */6 * * *": "Co 6h",
                "0 */12 * * *": "Co 12h",
                "0 0 * * 0": "Co niedzielę 00:00",
            }
            for cfg in configs:
                cfg["cronLabel"] = schedule_labels.get(cfg.get("cronSchedule", ""), cfg.get("cronSchedule", ""))

            return {"configs": configs, "history": history[:20]}
        except Exception as e:
            log.error("Backup status error: %s", e)
            return {"configs": [], "history": [], "error": str(e)}

    def run_backup_now(self, config_id):
        """Trigger immediate backup for a config."""
        try:
            result = api_post(f"/agent/backup/run-now", {"configId": config_id}, self.token)
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
                ver, url, sha = result
                do_self_update(url, expected_sha256=sha)
                return {"ok": True}
            return {"ok": False, "error": "Brak aktualizacji"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_url(self, url):
        import webbrowser
        webbrowser.open(url)

    def logout(self):
        """Clear config and restart auth flow."""
        try:
            save_config({})
            log.info("User logged out")
            os._exit(0)
        except Exception as e:
            return {"error": str(e)}


# --- Background Services --------------------------------------------------

class _BackgroundServices:
    """Tray + monitoring + backup — runs in threads."""

    def __init__(self, token, cfg):
        self.token = token
        self.cfg = cfg
        self._tray = None
        self._update_info = None
        self._backup_scheduler = None
        # Ring buffer: ostatnie 60 próbek (CPU%, RAM%) — do wykresu w dashboard
        self._samples: list[tuple[float, float, float]] = []  # (ts, cpu, ram)

    def start(self):
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
        threading.Thread(target=self._start_tray, daemon=True).start()

    def _diagnostics_loop(self):
        time.sleep(120)
        while True:
            try: self._diagnostics.run_checks()
            except Exception as e: log.debug("Diagnostics error: %s", e)
            time.sleep(AutoDiagnostics.CHECK_INTERVAL)

    def _self_heal_loop(self):
        """Cyklicznie uruchamia SelfHealer; dokleja log akcji do serverMetrics przy następnym push."""
        time.sleep(300)
        while True:
            try:
                actions = self._healer.run()
                if actions:
                    # Natychmiast prześlij log akcji do portalu
                    try:
                        do_metrics(self.token, {
                            **metrics(),
                            "serverMetrics": {"selfHealActions": actions},
                        })
                    except Exception: pass
            except Exception as e:
                log.debug("Self-heal loop error: %s", e)
            time.sleep(SelfHealer.CHECK_INTERVAL)

    def _metrics_loop(self):
        import random
        try:
            requests.post(f"{API_BASE}/agent/metrics", json=full_inventory(),
                          headers={"Authorization": f"Bearer {self.token}"}, timeout=15)
        except Exception: pass
        cycle = 0
        while True:
            time.sleep(60 + random.uniform(0, 15))
            try:
                data = metrics()
                if cycle % 5 == 0:
                    try:
                        srv = server_metrics()
                        if srv: data["serverMetrics"] = srv
                    except Exception: pass
                # Security audit — raz dziennie
                if cycle % 1440 == 3:
                    try:
                        audit = security_audit()
                        data.setdefault("serverMetrics", {})["securityAudit"] = audit
                        _save_audit_cache(audit)
                        log.info("Security audit: score=%s", audit.get("score"))
                    except Exception: pass
                # LAN scan z diffem — raz dziennie (cykl ~1min → 1440)
                if cycle % 1440 == 11:
                    try:
                        scan = lan_scan_diff()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
                    except Exception: pass
                # Speedtest co ~3h
                if cycle % 180 == 1:
                    try:
                        st = speedtest()
                        data.setdefault("serverMetrics", {})["speedtest"] = st
                    except Exception: pass
                # Security events (failed logins, new users, RDP IPs, USB) co ~10min
                if cycle % 10 == 3:
                    try:
                        sev = security_events()
                        if (sev.get("failedLogins", 0) > 0 or sev.get("newUsers") or
                            sev.get("newAdmins") or sev.get("rdpNewIp") or sev.get("usbDevices")):
                            data.setdefault("serverMetrics", {})["securityEvents"] = sev
                    except Exception: pass
                # Screen-lock report co ~5min (tylko gdy flagged = zostawił odblokowany PC)
                if cycle % 5 == 2:
                    try:
                        sl = screen_lock_report()
                        data.setdefault("serverMetrics", {})["screenLock"] = sl
                    except Exception: pass
                # License audit co ~24h (cykl 1min → 1440)
                if cycle % 1440 == 7:
                    try:
                        lic = license_audit()
                        data.setdefault("serverMetrics", {})["licenseAudit"] = lic
                    except Exception: pass
                # Log shipping co ~10 min (IIS/MSSQL errors)
                if cycle % 10 == 5:
                    try:
                        logs = log_shipping_collect()
                        if logs.get("entries"):
                            data.setdefault("serverMetrics", {})["logShipping"] = logs
                    except Exception: pass
                do_metrics(self.token, data)
            except Exception: pass
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
                    do_self_update(url, notify_fn=lambda m: None, expected_sha256=sha)
                except Exception as e:
                    log.error("Auto-update failed: %s", e)
            time.sleep(2 * 3600)

    def _backup_loop(self):
        bs = self._backup_scheduler
        if not bs: return
        bs.sync_configs()
        c = 0
        while True:
            time.sleep(60)
            c += 1
            if c >= 5: bs.sync_configs(); c = 0
            bs.check_and_run()

    def _on_ws(self, msg):
        mtype = msg.get("type")
        if mtype == "remote_command":
            threading.Thread(target=_handle_remote_command, args=(msg, self._ws.send), daemon=True).start()
            return
        if mtype in ("notification", "status_update"):
            log.debug("WS notification (silent): %s", msg.get("title", ""))
        elif mtype == "update":
            info = self._update_info or check_for_update()
            if info:
                _, url, sha = info
                do_self_update(url, expected_sha256=sha)
        elif mtype == "backup_run":
            cid = msg.get("configId", "")
            if cid and self._backup_scheduler:
                self._backup_scheduler.run_single(cid)
        elif mtype == "wake":
            mac = msg.get("mac", "")
            if mac: threading.Thread(target=_send_wol, args=(mac,), daemon=True).start()
        elif mtype == "windows_update":
            schedule_time = msg.get("scheduleTime")
            threading.Thread(target=self._run_windows_update, args=(schedule_time,), daemon=True).start()
        elif mtype == "restart_service":
            svc = msg.get("serviceName", "")
            if svc:
                def _rs():
                    try:
                        subprocess.run(["net", "stop", svc], capture_output=True, timeout=60, creationflags=_NO_WINDOW)
                        time.sleep(2)
                        subprocess.run(["net", "start", svc], capture_output=True, timeout=60, creationflags=_NO_WINDOW)
                        log.info("Service %s restarted", svc)
                    except Exception as e: log.error("Service restart error: %s", e)
                threading.Thread(target=_rs, daemon=True).start()
        elif mtype == "system_reboot":
            delay = msg.get("delay", 60)
            threading.Thread(target=lambda: subprocess.run(
                ["shutdown", "/r", "/t", str(delay), "/c", "Asystent: restart serwera"],
                capture_output=True, creationflags=_NO_WINDOW), daemon=True).start()
        elif mtype == "schedule_task":
            # Planowe akcje na stacji/serwerze — schtasks /create
            threading.Thread(target=self._schedule_task, args=(msg,), daemon=True).start()
        elif mtype == "install_software":
            # Instalacja pakietu winget/choco
            threading.Thread(target=self._install_software, args=(msg,), daemon=True).start()
        elif mtype == "speedtest":
            # Ręczne wyzwolenie speedtestu z portalu — wynik wraca w najbliższym metrics push
            def _st():
                try:
                    st = speedtest()
                    do_metrics(self.token, {**metrics(), "serverMetrics": {"speedtest": st}})
                except Exception as e:
                    log.error("Speedtest on-demand failed: %s", e)
            threading.Thread(target=_st, daemon=True).start()

    def _run_windows_update(self, schedule_time=None):
        try:
            log.info("Windows Update: starting%s", f" (restart at {schedule_time})" if schedule_time else "")
            ps_cmd = (
                '$ErrorActionPreference="SilentlyContinue"; '
                'if (-not (Get-Module -ListAvailable -Name PSWindowsUpdate)) { '
                '  Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Confirm:$false | Out-Null; '
                '  Install-Module PSWindowsUpdate -Force -Confirm:$false | Out-Null '
                '}; '
                'Import-Module PSWindowsUpdate; '
                'Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false -Confirm:$false 2>&1 | Out-String'
            )
            result = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=7200, creationflags=_NO_WINDOW)
            log.info("Windows Update result: %s", (result.stdout or "")[-500:])
            if schedule_time:
                subprocess.run(["schtasks", "/create", "/tn", "AsystentBusiness_WinUpdate_Restart",
                    "/tr", 'shutdown /r /t 60 /c "Asystent: restart po aktualizacji"',
                    "/sc", "once", "/st", schedule_time, "/f"],
                    capture_output=True, timeout=30, creationflags=_NO_WINDOW)
        except Exception as e:
            log.error("Windows Update error: %s", e)

    def _schedule_task(self, msg: dict):
        """
        Zaplanuj zadanie przez schtasks. Oczekiwane pola:
          action: "restart_service" | "windows_update" | "defrag" | "reboot" | "shell"
          params: dict (np. {"service":"Spooler"} lub {"command":"..."})
          scheduleTime: "HH:MM" (once) LUB ISO "YYYY-MM-DDTHH:MM"
          frequency: "once" | "daily" | "weekly"  (default "once")
          taskName: str (default auto)
        """
        try:
            action = msg.get("action") or "shell"
            params = msg.get("params") or {}
            st = msg.get("scheduleTime") or ""
            freq = msg.get("frequency") or "once"
            name = msg.get("taskName") or f"AsystentBusiness_{action}_{int(time.time())}"

            # Zbuduj komendę do wykonania
            if action == "restart_service":
                svc = params.get("service", "")
                if not svc:
                    log.error("schedule_task: brak service"); return
                tr = f'cmd /c net stop "{svc}" && net start "{svc}"'
            elif action == "windows_update":
                tr = 'powershell -ExecutionPolicy Bypass -Command "Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false -Confirm:$false"'
            elif action == "defrag":
                drive = params.get("drive", "C:")
                tr = f'defrag {drive} /O /H'
            elif action == "reboot":
                delay = int(params.get("delay", 60))
                tr = f'shutdown /r /t {delay} /c "Asystent: zaplanowany restart"'
            elif action == "shell":
                tr = params.get("command", "")
                if not tr:
                    log.error("schedule_task shell: brak command"); return
            else:
                log.error("schedule_task: nieznana akcja %s", action); return

            # Parse scheduleTime → date/time
            date_arg = []
            if "T" in st:
                d, t = st.split("T", 1)
                t = t[:5]  # HH:MM
                date_arg = ["/sd", d, "/st", t]
            elif st:
                date_arg = ["/st", st[:5]]

            freq_map = {"once": "ONCE", "daily": "DAILY", "weekly": "WEEKLY"}
            sc = freq_map.get(freq, "ONCE")

            cmd = ["schtasks", "/create", "/tn", name, "/tr", tr, "/sc", sc, "/f", "/rl", "HIGHEST"]
            cmd += date_arg
            result = subprocess.run(cmd, capture_output=True, text=True,
                                    timeout=30, creationflags=_NO_WINDOW)
            if result.returncode == 0:
                log.info("Scheduled task '%s' (%s) at %s", name, action, st or "immediate")
            else:
                log.error("schtasks failed (%d): %s", result.returncode,
                          (result.stderr or result.stdout or "")[:300])
        except Exception as e:
            log.error("schedule_task error: %s", e)

    def _install_software(self, msg: dict):
        """
        Instalacja pakietu przez winget (preferowane) z fallbackiem na choco.
        Pola: manager ("winget"|"choco"|"auto"), package (id), source (opcjonalnie, np. "winget"|"msstore")
        """
        try:
            pkg = (msg.get("package") or "").strip()
            mgr = (msg.get("manager") or "auto").lower()
            source = msg.get("source") or "winget"
            if not pkg:
                log.error("install_software: brak package"); return
            # Bezpieczeństwo: nie pozwalaj na znaki powłoki
            if re.search(r'[;&|`$<>\n]', pkg):
                log.error("install_software: odrzucono package z metaznakami powłoki"); return

            def _try_winget() -> tuple[bool, str]:
                if not shutil.which("winget"):
                    return False, "winget niedostępny"
                r = subprocess.run(
                    ["winget", "install", "--id", pkg, "--source", source,
                     "--accept-source-agreements", "--accept-package-agreements",
                     "--silent", "--disable-interactivity"],
                    capture_output=True, text=True, timeout=1800, creationflags=_NO_WINDOW
                )
                return r.returncode == 0, (r.stdout + r.stderr)[-500:]

            def _try_choco() -> tuple[bool, str]:
                if not shutil.which("choco"):
                    return False, "choco niedostępny"
                r = subprocess.run(
                    ["choco", "install", pkg, "-y", "--no-progress"],
                    capture_output=True, text=True, timeout=1800, creationflags=_NO_WINDOW
                )
                return r.returncode == 0, (r.stdout + r.stderr)[-500:]

            ok, out = False, ""
            if mgr in ("winget", "auto"):
                ok, out = _try_winget()
            if not ok and mgr in ("choco", "auto"):
                ok2, out2 = _try_choco()
                if ok2: ok, out = True, out2
                else: out = out + "\n---\n" + out2

            log.info("install_software %s: %s", pkg, "OK" if ok else "FAIL")
            # Wynik raportuj jako serverMetrics.installResult
            try:
                do_metrics(self.token, {**metrics(), "serverMetrics": {
                    "installResult": {
                        "package": pkg, "ok": ok, "output": out[-800:],
                        "at": datetime.now().isoformat()[:19],
                    }
                }})
            except Exception: pass
        except Exception as e:
            log.error("install_software error: %s", e)

    def _render_gauge_icon(self, cpu_pct: float, ram_pct: float) -> Image.Image:
        """Renderuje ikonę tray jako pierścień obciążenia CPU z procentem w środku."""
        size = 128
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        # Kolor zależny od obciążenia CPU
        if cpu_pct >= 85:
            fg = (239, 68, 68, 255)   # czerwony
            bg = (80, 20, 20, 200)
        elif cpu_pct >= 60:
            fg = (245, 158, 11, 255)  # żółty
            bg = (80, 55, 10, 200)
        else:
            fg = (34, 197, 94, 255)   # zielony
            bg = (20, 60, 35, 200)

        # Tło — zaokrąglony kwadrat
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=22, fill=(15, 22, 40, 230))

        # Pierścień tła
        pad = 10
        d.ellipse([pad, pad, size - pad, size - pad], outline=bg, width=12)

        # Pierścień postępu (CPU)
        pct = max(0.0, min(100.0, float(cpu_pct)))
        end_angle = -90 + int(360 * pct / 100.0)
        if pct > 0:
            d.arc([pad, pad, size - pad, size - pad], start=-90, end=end_angle, fill=fg, width=12)

        # Tekst w środku — procent CPU
        try:
            from PIL import ImageFont
            font = ImageFont.truetype("arialbd.ttf", 44)
        except Exception:
            font = ImageFont.load_default()
        text = f"{int(round(pct))}"
        try:
            bbox = d.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
        except Exception:
            tw, th = d.textsize(text, font=font) if hasattr(d, "textsize") else (40, 40)
        d.text(((size - tw) // 2 - 2, (size - th) // 2 - 6), text, fill=(255, 255, 255, 255), font=font)

        return img

    def _gauge_loop(self):
        """Co kilka sekund aktualizuje ikonę tray wskaźnikiem CPU/RAM."""
        time.sleep(2)
        # Sampling co 60s dla dashboard (60 próbek = 1h)
        last_sample_at = 0.0
        while True:
            try:
                cpu = psutil.cpu_percent(interval=1.0)
                ram = psutil.virtual_memory().percent
                if self._tray is not None:
                    self._tray.icon = self._render_gauge_icon(cpu, ram)
                    self._tray.title = f"{APP_NAME} — CPU {int(round(cpu))}% · RAM {int(round(ram))}%"
                now = time.time()
                if now - last_sample_at >= 60:
                    self._samples.append((now, cpu, ram))
                    self._samples = self._samples[-60:]  # 60 ostatnich próbek
                    last_sample_at = now
            except Exception as e:
                log.debug("Gauge update error: %s", e)
            time.sleep(2)

    # ─── Tray dialogs: Zgłoś problem / Poproś o pomoc zdalną ──────────────

    def _agent_ticket(self, title: str, description: str, priority: str = "MEDIUM") -> tuple[bool, str]:
        """POST /agent/ticket — zwraca (ok, komunikat_lub_id)."""
        try:
            # Wzbogacenie opisu o kontekst (hostname, user, wersja, CPU/RAM)
            try:
                host = socket.gethostname()
            except Exception:
                host = "?"
            try:
                user = os.environ.get("USERNAME") or os.environ.get("USER") or "?"
            except Exception:
                user = "?"
            try:
                cpu = psutil.cpu_percent(interval=0.2)
                ram = psutil.virtual_memory().percent
                disk_free = psutil.disk_usage("C:\\").free / (1024**3)
                ctx = f"CPU {cpu:.0f}% · RAM {ram:.0f}% · Dysk C: {disk_free:.1f} GB wolne"
            except Exception:
                ctx = ""

            full_desc = (description or "").strip()
            full_desc += "\n\n— Zgłoszone z Asystenta Business —"
            full_desc += f"\nKomputer: {host}"
            full_desc += f"\nUżytkownik: {user}"
            full_desc += f"\nWersja Asystenta: {APP_VERSION}"
            if ctx:
                full_desc += f"\nStan systemu: {ctx}"

            payload = {"title": title[:200], "description": full_desc, "priority": priority}
            h = {"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"}
            r = requests.post(f"{API_BASE}/agent/ticket", json=payload, headers=h, timeout=20)
            if r.status_code >= 400:
                log.error("Agent ticket failed: %s %s", r.status_code, r.text[:300])
                return False, f"Kod {r.status_code}: {r.text[:200]}"
            data = r.json()
            return True, data.get("ticketNumber") or data.get("id") or "OK"
        except Exception as e:
            log.error("Agent ticket exception: %s", e)
            return False, str(e)

    def _show_report_dialog(self):
        """Okno tkinter: Zgłoś problem do IT."""
        try:
            import tkinter as tk
            from tkinter import ttk, messagebox
        except Exception as e:
            log.error("tkinter missing: %s", e)
            return

        def _submit():
            title = e_title.get().strip()
            desc = t_desc.get("1.0", "end").strip()
            prio = v_prio.get()
            if len(title) < 3:
                messagebox.showwarning("Asystent Business", "Tytuł musi mieć min. 3 znaki.")
                return
            if len(desc) < 5:
                messagebox.showwarning("Asystent Business", "Opis musi mieć min. 5 znaków.")
                return
            btn_send.config(state="disabled", text="Wysyłam...")
            win.update_idletasks()
            ok, msg = self._agent_ticket(title, desc, prio)
            if ok:
                messagebox.showinfo("Asystent Business", f"Zgłoszenie wysłane do IT.\nNumer: {msg}")
                win.destroy()
            else:
                btn_send.config(state="normal", text="Wyślij do IT")
                messagebox.showerror("Asystent Business", f"Nie udało się wysłać zgłoszenia.\n\n{msg}")

        win = tk.Tk()
        win.title("Zgłoś problem do IT")
        win.geometry("520x460")
        win.configure(bg="#0F1628")
        try:
            icon_path = res("ikona.png")
            if os.path.exists(icon_path):
                win.iconphoto(True, tk.PhotoImage(file=icon_path))
        except Exception:
            pass

        fg = "#E5E7EB"; bg = "#0F1628"; fld = "#1A2238"; accent = "#6D28D9"

        tk.Label(win, text="Zgłoś problem do IT", font=("Segoe UI", 14, "bold"),
                 fg=fg, bg=bg).pack(padx=18, pady=(16, 2), anchor="w")
        tk.Label(win, text="Opisz problem — IT dostanie zgłoszenie z danymi komputera.",
                 font=("Segoe UI", 9), fg="#9CA3AF", bg=bg).pack(padx=18, anchor="w")

        tk.Label(win, text="Tytuł", font=("Segoe UI", 9, "bold"), fg=fg, bg=bg).pack(padx=18, pady=(14, 2), anchor="w")
        e_title = tk.Entry(win, font=("Segoe UI", 10), bg=fld, fg=fg, insertbackground=fg,
                           relief="flat", bd=6)
        e_title.pack(padx=18, fill="x")

        tk.Label(win, text="Opis problemu", font=("Segoe UI", 9, "bold"), fg=fg, bg=bg).pack(padx=18, pady=(12, 2), anchor="w")
        t_desc = tk.Text(win, height=8, font=("Segoe UI", 10), bg=fld, fg=fg, insertbackground=fg,
                         relief="flat", bd=6, wrap="word")
        t_desc.pack(padx=18, fill="both", expand=True)

        row = tk.Frame(win, bg=bg)
        row.pack(padx=18, pady=(10, 0), fill="x")
        tk.Label(row, text="Priorytet:", font=("Segoe UI", 9), fg=fg, bg=bg).pack(side="left")
        v_prio = tk.StringVar(value="MEDIUM")
        for val, lab in [("LOW", "Niski"), ("MEDIUM", "Średni"), ("HIGH", "Wysoki"), ("CRITICAL", "Krytyczny")]:
            tk.Radiobutton(row, text=lab, variable=v_prio, value=val,
                           font=("Segoe UI", 9), fg=fg, bg=bg, selectcolor=fld,
                           activebackground=bg, activeforeground=fg).pack(side="left", padx=4)

        btns = tk.Frame(win, bg=bg)
        btns.pack(padx=18, pady=14, fill="x")
        tk.Button(btns, text="Anuluj", command=win.destroy,
                  font=("Segoe UI", 10), bg=fld, fg=fg, activebackground=fld,
                  relief="flat", padx=14, pady=6).pack(side="right", padx=(8, 0))
        btn_send = tk.Button(btns, text="Wyślij do IT", command=_submit,
                             font=("Segoe UI", 10, "bold"), bg=accent, fg="#fff",
                             activebackground=accent, relief="flat", padx=14, pady=6)
        btn_send.pack(side="right")

        e_title.focus_set()
        win.lift(); win.attributes("-topmost", True); win.after(300, lambda: win.attributes("-topmost", False))
        win.mainloop()

    def _show_remote_help_dialog(self):
        """Okno tkinter: pokazuje RustDesk ID + tworzy HIGH-priority ticket."""
        try:
            import tkinter as tk
            from tkinter import messagebox
        except Exception as e:
            log.error("tkinter missing: %s", e)
            return

        rd_id = _rustdesk_id() or "— (RustDesk niezainstalowany)"
        # Wygeneruj jednorazowe hasło (nadpisuje poprzednie — stare staje się nieważne)
        rd_pass = _rustdesk_set_one_time_password(6) if _rustdesk_exe() else None

        def _request_help():
            btn.config(state="disabled", text="Wysyłam...")
            win.update_idletasks()
            title = f"Prośba o pomoc zdalną · {socket.gethostname()}"
            desc = (
                f"Użytkownik poprosił o pomoc zdalną z poziomu Asystenta Business.\n\n"
                f"RustDesk ID: {rd_id}\n"
                + (f"Jednorazowe hasło: {rd_pass}\n" if rd_pass else "")
                + f"\nPołącz się jak najszybciej."
            )
            ok, msg = self._agent_ticket(title, desc, "HIGH")
            if ok:
                info_msg = f"Prośba wysłana do IT.\nNumer: {msg}\n\nRustDesk ID: {rd_id}"
                if rd_pass:
                    info_msg += f"\nHasło: {rd_pass}"
                messagebox.showinfo("Asystent Business", info_msg)
                win.destroy()
            else:
                btn.config(state="normal", text="Poproś o pomoc zdalną")
                messagebox.showerror("Asystent Business", f"Nie udało się wysłać prośby.\n\n{msg}")

        fg = "#E5E7EB"; bg = "#0F1628"; fld = "#1A2238"; accent = "#6D28D9"
        win = tk.Tk()
        win.title("Pomoc zdalna")
        win.geometry("440x400")
        win.configure(bg=bg)

        tk.Label(win, text="Pomoc zdalna", font=("Segoe UI", 14, "bold"),
                 fg=fg, bg=bg).pack(padx=18, pady=(16, 2), anchor="w")
        tk.Label(win, text="Wyślij IT prośbę o natychmiastowe zdalne połączenie.",
                 font=("Segoe UI", 9), fg="#9CA3AF", bg=bg).pack(padx=18, anchor="w")

        tk.Label(win, text="Twój RustDesk ID:", font=("Segoe UI", 9, "bold"),
                 fg=fg, bg=bg).pack(padx=18, pady=(18, 4), anchor="w")
        e = tk.Entry(win, font=("Consolas", 16, "bold"), bg=fld, fg="#A78BFA",
                     insertbackground=fg, relief="flat", bd=8, justify="center")
        e.insert(0, str(rd_id))
        e.config(state="readonly", readonlybackground=fld)
        e.pack(padx=18, fill="x")

        if rd_pass:
            tk.Label(win, text="Jednorazowe hasło:", font=("Segoe UI", 9, "bold"),
                     fg=fg, bg=bg).pack(padx=18, pady=(12, 4), anchor="w")
            ep = tk.Entry(win, font=("Consolas", 16, "bold"), bg=fld, fg="#F59E0B",
                          insertbackground=fg, relief="flat", bd=8, justify="center")
            ep.insert(0, str(rd_pass))
            ep.config(state="readonly", readonlybackground=fld)
            ep.pack(padx=18, fill="x")

        tk.Label(win, text="Po kliknięciu technik otrzyma zgłoszenie z ID i hasłem. Stare hasło zostało unieważnione.",
                 font=("Segoe UI", 8), fg="#6B7280", bg=bg, wraplength=400,
                 justify="left").pack(padx=18, pady=(8, 0), anchor="w")

        btns = tk.Frame(win, bg=bg)
        btns.pack(padx=18, pady=16, fill="x")
        tk.Button(btns, text="Zamknij", command=win.destroy,
                  font=("Segoe UI", 10), bg=fld, fg=fg, activebackground=fld,
                  relief="flat", padx=14, pady=6).pack(side="right", padx=(8, 0))
        btn = tk.Button(btns, text="Poproś o pomoc zdalną", command=_request_help,
                        font=("Segoe UI", 10, "bold"), bg=accent, fg="#fff",
                        activebackground=accent, relief="flat", padx=14, pady=6)
        btn.pack(side="right")

        win.lift(); win.attributes("-topmost", True); win.after(300, lambda: win.attributes("-topmost", False))
        win.mainloop()

    def _show_dashboard(self):
        """Natywne okno dashboard — wykres CPU/RAM 60min + przyciski akcji."""
        try:
            import tkinter as tk
            from tkinter import messagebox
        except Exception as e:
            log.error("tkinter missing: %s", e); return

        fg = "#E5E7EB"; bg = "#0F1628"; fld = "#1A2238"; accent = "#6D28D9"
        mute = "#6B7280"; ok = "#22C55E"; warn = "#F59E0B"; err = "#EF4444"

        win = tk.Tk()
        win.title(f"{APP_NAME} — Dashboard")
        win.geometry("720x560")
        win.configure(bg=bg)

        # Header
        hdr = tk.Frame(win, bg=bg)
        hdr.pack(fill="x", padx=18, pady=(14, 6))
        tk.Label(hdr, text=f"Dashboard — {socket.gethostname()}",
                 font=("Segoe UI", 14, "bold"), fg=fg, bg=bg).pack(side="left")
        tk.Label(hdr, text=f"v{APP_VERSION}", font=("Segoe UI", 9),
                 fg=mute, bg=bg).pack(side="right")

        # KPI row
        kpi = tk.Frame(win, bg=bg)
        kpi.pack(fill="x", padx=18, pady=6)

        def _kpi_box(parent, label):
            f = tk.Frame(parent, bg=fld)
            f.pack(side="left", fill="x", expand=True, padx=4, ipady=8, ipadx=8)
            tk.Label(f, text=label, font=("Segoe UI", 8), fg=mute, bg=fld).pack(anchor="w", padx=8)
            v = tk.Label(f, text="—", font=("Segoe UI", 16, "bold"), fg=fg, bg=fld)
            v.pack(anchor="w", padx=8)
            return v

        v_cpu = _kpi_box(kpi, "CPU")
        v_ram = _kpi_box(kpi, "RAM")
        v_disk = _kpi_box(kpi, "Dysk C: wolne")
        v_up = _kpi_box(kpi, "Uptime")

        # Canvas chart
        tk.Label(win, text="CPU/RAM — ostatnie 60 min", font=("Segoe UI", 9, "bold"),
                 fg=fg, bg=bg).pack(anchor="w", padx=22, pady=(12, 4))
        canvas = tk.Canvas(win, bg=fld, height=180, highlightthickness=0)
        canvas.pack(fill="x", padx=18)

        # Events list (self-heal log + recent alerts)
        tk.Label(win, text="Ostatnie zdarzenia", font=("Segoe UI", 9, "bold"),
                 fg=fg, bg=bg).pack(anchor="w", padx=22, pady=(14, 4))
        ev_frame = tk.Frame(win, bg=fld)
        ev_frame.pack(fill="both", expand=True, padx=18)
        ev_list = tk.Text(ev_frame, bg=fld, fg=fg, font=("Consolas", 9),
                          relief="flat", bd=6, wrap="none", height=8)
        ev_list.pack(fill="both", expand=True)
        ev_list.config(state="disabled")

        # Action buttons
        btns = tk.Frame(win, bg=bg)
        btns.pack(fill="x", padx=18, pady=14)

        def _btn(text, cmd, primary=False):
            b = tk.Button(btns, text=text, command=cmd,
                          font=("Segoe UI", 9, "bold" if primary else "normal"),
                          bg=accent if primary else fld, fg="#fff" if primary else fg,
                          activebackground=accent if primary else fld,
                          relief="flat", padx=12, pady=6)
            b.pack(side="left", padx=(0, 6))
            return b

        import webbrowser
        _btn("Otwórz portal", lambda: webbrowser.open(PORTAL_URL))
        _btn("Test prędkości",
             lambda: threading.Thread(target=self._show_speedtest_dialog, daemon=True).start())
        _btn("Zgłoś problem",
             lambda: threading.Thread(target=self._show_report_dialog, daemon=True).start(),
             primary=True)

        def _render_chart():
            canvas.delete("all")
            w = canvas.winfo_width() or 680
            h = 180
            # Osie — poziome linie 0/50/100%
            for pct, label in [(0, "0%"), (50, "50%"), (100, "100%")]:
                y = h - 20 - int((pct / 100) * (h - 40))
                canvas.create_line(40, y, w - 10, y, fill="#2A3350", dash=(2, 3))
                canvas.create_text(30, y, text=label, fill=mute, font=("Segoe UI", 7), anchor="e")

            samples = list(self._samples)
            if len(samples) < 2:
                canvas.create_text(w / 2, h / 2, text="Zbieranie danych...",
                                   fill=mute, font=("Segoe UI", 10))
                return
            n = len(samples)
            chart_w = w - 50
            step = chart_w / max(n - 1, 1)

            def _points(idx):
                pts = []
                for i, s in enumerate(samples):
                    x = 40 + i * step
                    val = s[idx]
                    y = h - 20 - (val / 100) * (h - 40)
                    pts.extend([x, y])
                return pts

            cpu_pts = _points(1)
            ram_pts = _points(2)
            if len(cpu_pts) >= 4:
                canvas.create_line(*cpu_pts, fill="#A78BFA", width=2, smooth=True)
            if len(ram_pts) >= 4:
                canvas.create_line(*ram_pts, fill="#60A5FA", width=2, smooth=True)

            # Legend
            canvas.create_rectangle(w - 140, 8, w - 132, 16, fill="#A78BFA", outline="")
            canvas.create_text(w - 128, 12, text="CPU", fill=fg, font=("Segoe UI", 8), anchor="w")
            canvas.create_rectangle(w - 80, 8, w - 72, 16, fill="#60A5FA", outline="")
            canvas.create_text(w - 68, 12, text="RAM", fill=fg, font=("Segoe UI", 8), anchor="w")

        def _update():
            try:
                cpu = psutil.cpu_percent(interval=None)
                ram = psutil.virtual_memory().percent
                disk = psutil.disk_usage("C:\\")
                up_sec = int(time.time() - psutil.boot_time())
                up_days = up_sec // 86400
                up_h = (up_sec % 86400) // 3600
                v_cpu.config(text=f"{cpu:.0f}%",
                             fg=err if cpu >= 85 else (warn if cpu >= 60 else ok))
                v_ram.config(text=f"{ram:.0f}%",
                             fg=err if ram >= 85 else (warn if ram >= 60 else ok))
                v_disk.config(text=f"{disk.free/(1024**3):.1f} GB")
                v_up.config(text=f"{up_days}d {up_h}h" if up_days else f"{up_h}h")

                # Event list — z SelfHealer._actions_log jeśli dostępny
                lines = []
                try:
                    healer = getattr(self, "_healer", None)
                    if healer and healer._actions_log:
                        for a in list(healer._actions_log)[-8:][::-1]:
                            lines.append(f"[{a['at'][11:]}] self-heal: {a['summary']}")
                except Exception: pass
                ev_list.config(state="normal")
                ev_list.delete("1.0", "end")
                ev_list.insert("1.0", "\n".join(lines) if lines else "Brak zdarzeń w ostatniej godzinie.")
                ev_list.config(state="disabled")

                _render_chart()
            except Exception as e:
                log.debug("Dashboard update error: %s", e)
            win.after(5000, _update)

        win.after(100, _update)
        win.lift(); win.attributes("-topmost", True)
        win.after(500, lambda: win.attributes("-topmost", False))
        win.mainloop()

    def _show_speedtest_dialog(self):
        """Okno tkinter: test prędkości sieci + auto-upload wyniku do portalu."""
        try:
            import tkinter as tk
            from tkinter import messagebox
        except Exception as e:
            log.error("tkinter missing: %s", e)
            return

        fg = "#E5E7EB"; bg = "#0F1628"; fld = "#1A2238"; accent = "#6D28D9"
        win = tk.Tk()
        win.title("Test prędkości sieci")
        win.geometry("420x340")
        win.configure(bg=bg)

        tk.Label(win, text="Test prędkości sieci", font=("Segoe UI", 14, "bold"),
                 fg=fg, bg=bg).pack(padx=18, pady=(16, 2), anchor="w")
        tk.Label(win, text="Pomiar wobec serwerów infradesk.pl.",
                 font=("Segoe UI", 9), fg="#9CA3AF", bg=bg).pack(padx=18, anchor="w")

        status = tk.Label(win, text="Kliknij 'Start' aby rozpocząć pomiar.",
                          font=("Segoe UI", 10), fg=fg, bg=bg, wraplength=380, justify="left")
        status.pack(padx=18, pady=(18, 8), anchor="w")

        result_frame = tk.Frame(win, bg=bg)
        result_frame.pack(padx=18, fill="x")

        def _row(label):
            r = tk.Frame(result_frame, bg=bg)
            r.pack(fill="x", pady=2)
            tk.Label(r, text=label, font=("Segoe UI", 9), fg="#9CA3AF", bg=bg, width=14, anchor="w").pack(side="left")
            v = tk.Label(r, text="—", font=("Consolas", 11, "bold"), fg="#A78BFA", bg=bg)
            v.pack(side="left")
            return v

        v_down = _row("Pobieranie:")
        v_up   = _row("Wysyłanie:")
        v_ping = _row("Ping:")

        def _run():
            btn.config(state="disabled", text="Testuję...")
            status.config(text="Trwa pomiar (może zająć 10-30s)...")
            win.update_idletasks()
            try:
                st = speedtest()
                v_down.config(text=f"{st.get('downloadMbps','?')} Mbps")
                v_up.config(text=f"{st.get('uploadMbps','?')} Mbps")
                v_ping.config(text=f"{st.get('pingMs','?')} ms")
                status.config(text="Pomiar zakończony. Wynik zapisany w portalu.")
                try:
                    do_metrics(self.token, {**metrics(), "serverMetrics": {"speedtest": st}})
                except Exception: pass
            except Exception as e:
                status.config(text=f"Błąd pomiaru: {e}")
            btn.config(state="normal", text="Start")

        btns = tk.Frame(win, bg=bg)
        btns.pack(padx=18, pady=14, fill="x", side="bottom")
        tk.Button(btns, text="Zamknij", command=win.destroy,
                  font=("Segoe UI", 10), bg=fld, fg=fg, activebackground=fld,
                  relief="flat", padx=14, pady=6).pack(side="right", padx=(8, 0))
        btn = tk.Button(btns, text="Start", command=lambda: threading.Thread(target=_run, daemon=True).start(),
                        font=("Segoe UI", 10, "bold"), bg=accent, fg="#fff",
                        activebackground=accent, relief="flat", padx=14, pady=6)
        btn.pack(side="right")

        win.lift(); win.attributes("-topmost", True); win.after(300, lambda: win.attributes("-topmost", False))
        win.mainloop()

    def _start_tray(self):
        try:
            # Startowa ikona (CPU 0) — zostanie odświeżona przez _gauge_loop
            try:
                icon_img = self._render_gauge_icon(0.0, 0.0)
            except Exception:
                icon_img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
                d = ImageDraw.Draw(icon_img)
                d.rounded_rectangle([0, 0, 127, 127], radius=22, fill=(109, 40, 217, 255))

            import webbrowser
            menu = pystray.Menu(
                pystray.MenuItem(f"  {APP_NAME} v{APP_VERSION}", None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("  Otworz Asystent Business", lambda i, it: webbrowser.open(PORTAL_URL), default=True),
                pystray.MenuItem("  Dashboard...",
                    lambda i, it: threading.Thread(target=self._show_dashboard, daemon=True).start()),
                pystray.MenuItem("  Zglos problem do IT...",
                    lambda i, it: threading.Thread(target=self._show_report_dialog, daemon=True).start()),
                pystray.MenuItem("  Poproś o pomoc zdalna...",
                    lambda i, it: threading.Thread(target=self._show_remote_help_dialog, daemon=True).start()),
                pystray.MenuItem("  Test prędkości sieci...",
                    lambda i, it: threading.Thread(target=self._show_speedtest_dialog, daemon=True).start()),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("  Zamknij", lambda i, it: (i.stop(), os._exit(0))),
            )
            self._tray = pystray.Icon(APP_NAME, icon_img, APP_NAME, menu)
            # Uruchom pętlę aktualizacji wskaźnika
            threading.Thread(target=self._gauge_loop, daemon=True).start()
            self._tray.run()
        except Exception as e:
            log.error("Tray error: %s", e)


# --- ServerServiceLoop (headless --service mode) --------------------------

class ServerServiceLoop:
    """Headless background loop for --service CLI or Windows Service."""

    def __init__(self, token: str, cfg: dict):
        self.token = token
        self.cfg = cfg
        self._running = True

    def _on_ws(self, msg):
        mtype = msg.get("type")
        if mtype == "remote_command":
            threading.Thread(target=_handle_remote_command, args=(msg, self._ws.send), daemon=True).start()
            return
        if mtype in ("notification", "status_update"):
            log.info("WS notification: %s — %s", msg.get("title", ""), msg.get("body", ""))
        elif mtype == "update":
            info = check_for_update()
            if info:
                _, url, sha = info
                threading.Thread(target=do_self_update, args=(url,), kwargs={"expected_sha256": sha}, daemon=True).start()
        elif mtype == "backup_run":
            cid = msg.get("configId", "")
            if cid and hasattr(self, '_backup') and self._backup:
                self._backup.run_single(cid)
        elif mtype == "wake":
            mac = msg.get("mac", "")
            if mac: threading.Thread(target=_send_wol, args=(mac,), daemon=True).start()
        elif mtype == "windows_update":
            schedule_time = msg.get("scheduleTime")
            threading.Thread(target=self._run_windows_update, args=(schedule_time,), daemon=True).start()
        elif mtype == "restart_service":
            svc_name = msg.get("serviceName", "")
            if svc_name:
                threading.Thread(target=self._restart_win_service, args=(svc_name,), daemon=True).start()
        elif mtype == "system_reboot":
            delay = msg.get("delay", 60)
            threading.Thread(target=self._schedule_reboot, args=(delay,), daemon=True).start()

    def _run_windows_update(self, schedule_time=None):
        try:
            log.info("Windows Update: starting%s", f" (restart at {schedule_time})" if schedule_time else "")
            ps_cmd = (
                '$ErrorActionPreference="SilentlyContinue"; '
                'if (-not (Get-Module -ListAvailable -Name PSWindowsUpdate)) { '
                '  Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Confirm:$false | Out-Null; '
                '  Install-Module PSWindowsUpdate -Force -Confirm:$false | Out-Null '
                '}; '
                'Import-Module PSWindowsUpdate; '
                'Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false -Confirm:$false 2>&1 | Out-String'
            )
            result = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=7200, creationflags=_NO_WINDOW)
            log.info("Windows Update result: %s", (result.stdout or "")[-500:])
            if schedule_time:
                subprocess.run(["schtasks", "/create", "/tn", "AsystentBusiness_WinUpdate_Restart",
                    "/tr", 'shutdown /r /t 60 /c "Asystent: restart po aktualizacji"',
                    "/sc", "once", "/st", schedule_time, "/f"],
                    capture_output=True, timeout=30, creationflags=_NO_WINDOW)
        except Exception as e:
            log.error("Windows Update error: %s", e)

    def _restart_win_service(self, service_name):
        try:
            log.info("Restarting service: %s", service_name)
            subprocess.run(["net", "stop", service_name], capture_output=True, timeout=60, creationflags=_NO_WINDOW)
            time.sleep(2)
            result = subprocess.run(["net", "start", service_name], capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW)
            log.info("Service %s restart: %s", service_name, "OK" if result.returncode == 0 else result.stderr)
        except Exception as e:
            log.error("Service restart error: %s", e)

    def _schedule_reboot(self, delay_seconds):
        try:
            log.info("Scheduling system reboot in %ds", delay_seconds)
            subprocess.run(["shutdown", "/r", "/t", str(delay_seconds), "/c", "Asystent: zaplanowany restart"],
                capture_output=True, timeout=10, creationflags=_NO_WINDOW)
        except Exception as e:
            log.error("Reboot schedule error: %s", e)

    def start(self):
        log.info("ServerServiceLoop starting (token=%s...)", self.token[:8])

        self._ws = WS(self.token, self._on_ws)
        self._ws.start()

        self._backup = None
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
                    except Exception: pass
                # LAN scan z diffem — raz dziennie (cykl ~1min → 1440)
                if cycle % 1440 == 11:
                    try:
                        scan = lan_scan_diff()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
                    except Exception: pass
                # Speedtest co ~3h
                if cycle % 180 == 1:
                    try:
                        st = speedtest()
                        data.setdefault("serverMetrics", {})["speedtest"] = st
                    except Exception: pass
                # Security events (failed logins, new users, RDP IPs, USB) co ~10min
                if cycle % 10 == 3:
                    try:
                        sev = security_events()
                        if (sev.get("failedLogins", 0) > 0 or sev.get("newUsers") or
                            sev.get("newAdmins") or sev.get("rdpNewIp") or sev.get("usbDevices")):
                            data.setdefault("serverMetrics", {})["securityEvents"] = sev
                    except Exception: pass
                # Screen-lock report co ~5min (tylko gdy flagged = zostawił odblokowany PC)
                if cycle % 5 == 2:
                    try:
                        sl = screen_lock_report()
                        data.setdefault("serverMetrics", {})["screenLock"] = sl
                    except Exception: pass
                # License audit co ~24h (cykl 1min → 1440)
                if cycle % 1440 == 7:
                    try:
                        lic = license_audit()
                        data.setdefault("serverMetrics", {})["licenseAudit"] = lic
                    except Exception: pass
                # Log shipping co ~10 min (IIS/MSSQL errors)
                if cycle % 10 == 5:
                    try:
                        logs = log_shipping_collect()
                        if logs.get("entries"):
                            data.setdefault("serverMetrics", {})["logShipping"] = logs
                    except Exception: pass
                do_metrics(self.token, data)
            except Exception as e:
                log.warning("Metrics error: %s", e)

            if self._backup:
                try: self._backup.check_and_run()
                except Exception: pass
                if cycle % 5 == 0:
                    try: self._backup.sync_configs()
                    except Exception: pass

            # Auto-update check every 30 min
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

    def _diagnostics_loop(self, diag):
        time.sleep(120)
        while self._running:
            try: diag.run_checks()
            except Exception: pass
            time.sleep(AutoDiagnostics.CHECK_INTERVAL)

    def stop(self):
        self._running = False


# --- Windows Service wrapper ----------------------------------------------

_SERVICE_NAME = "AsystentBusiness"
_SERVICE_DISPLAY = "Asystent Business"
_SERVICE_DESC = "Asystent Business — monitoring, backup, diagnostics"

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager

    class AsystentBusinessService(win32serviceutil.ServiceFramework):
        _svc_name_ = _SERVICE_NAME
        _svc_display_name_ = _SERVICE_DISPLAY
        _svc_description_ = _SERVICE_DESC

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
            servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                                  servicemanager.PYS_SERVICE_STARTED,
                                  (self._svc_name_, ''))
            log.info("Asystent Business service starting")
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


def _install_service():
    if not _HAS_WIN32SVC:
        print("ERROR: pywin32 nie jest zainstalowany. Uruchom: pip install pywin32")
        return
    try:
        win32serviceutil.InstallService(
            AsystentBusinessService._svc_reg_class_,
            _SERVICE_NAME,
            _SERVICE_DISPLAY,
            startType=win32service.SERVICE_AUTO_START,
            description=_SERVICE_DESC,
        )
        print(f"[OK] Usluga '{_SERVICE_DISPLAY}' zainstalowana.")
        print(f"     Uruchom: net start {_SERVICE_NAME}")
    except Exception as e:
        exe_path = sys.executable if not getattr(sys, 'frozen', False) else INSTALL_EXE
        cmd = f'sc create {_SERVICE_NAME} binPath= "\"{exe_path}\" --service" start= auto DisplayName= "{_SERVICE_DISPLAY}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            subprocess.run(f'sc description {_SERVICE_NAME} "{_SERVICE_DESC}"', shell=True, capture_output=True)
            print(f"[OK] Usluga '{_SERVICE_DISPLAY}' zainstalowana (sc.exe).")
        else:
            print(f"[BLAD] Nie udalo sie zainstalowac uslugi: {e}\n{result.stderr}")


def _remove_service():
    try:
        subprocess.run(f"net stop {_SERVICE_NAME}", shell=True, capture_output=True)
        time.sleep(2)
    except Exception:
        pass
    try:
        if _HAS_WIN32SVC:
            win32serviceutil.RemoveService(_SERVICE_NAME)
        else:
            subprocess.run(f"sc delete {_SERVICE_NAME}", shell=True, capture_output=True)
        print(f"[OK] Usluga '{_SERVICE_DISPLAY}' usunieta.")
    except Exception as e:
        print(f"[BLAD] {e}")


# --- Helpers --------------------------------------------------------------

def _find_ui_dir():
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui'),
        os.path.join(INSTALL_DIR, 'ui'),
    ]
    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        candidates.insert(0, os.path.join(meipass, 'ui'))
    for c in candidates:
        c = os.path.abspath(c)
        if os.path.isdir(c):
            return c
    return None


def _do_uninstall():
    _set_autostart(False)
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Asystent Business")
    except Exception:
        pass
    log.info("Uninstall registry entries removed")
    print(f"{APP_NAME} odinstalowany.\nMozesz recznie usunac folder: {INSTALL_DIR}")


def _kill_other_agents():
    try:
        my_pid = os.getpid()
        for p in psutil.process_iter(['pid', 'name']):
            pname = (p.info.get('name') or '').lower()
            if ('asystent business' in pname or 'infradesk' in pname) and p.info['pid'] != my_pid:
                try: p.kill(); log.info("Killed old process: %s (pid %s)", pname, p.info['pid'])
                except Exception: pass
    except Exception: pass


# --- Auth Webview ---------------------------------------------------------

def _run_auth_webview(cfg):
    """Webview-based login/register/waiting flow."""
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
            mode = cfg.get("mode")
            token = cfg.get("token")
            status = cfg.get("status")
            start_page = "auth"
            if token and status != "ACTIVE":
                start_page = "waiting"
            return {
                "hasHomeMode": False,
                "appName": APP_NAME,
                "appVersion": APP_VERSION,
                "startPage": start_page,
                "token": token or "",
            }

        def select_mode(self, mode):
            cfg["mode"] = "business"
            save_config(cfg)

        def do_login(self, email, pwd):
            try:
                r = do_login(email, pwd)
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
                msg = "Nieprawidlowy e-mail lub haslo." if e.response.status_code in (400, 401) else f"Blad serwera: {e.response.status_code}"
                return {"error": msg}
            except requests.exceptions.ConnectionError:
                return {"error": "Brak polaczenia z serwerem"}
            except requests.exceptions.Timeout:
                return {"error": "Serwer nie odpowiada"}
            except Exception as e:
                return {"error": f"Blad: {e}"}

        def do_register(self, form):
            try:
                r = do_register(form)
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

    window = webview.create_window(
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
        _run_business_webview(cfg_fresh["token"], cfg_fresh)
    else:
        log.info("Auth webview closed without action — exiting")


# --- Business Webview (main UI) -------------------------------------------

def _run_business_webview(token, cfg):
    """Launch Asystent Business single-page UI via pywebview."""
    import webview

    # Start background services
    bg = _BackgroundServices(token, cfg)
    bg.start()

    # Desktop shortcut + resources
    def _setup():
        for fname in ["icon.ico", "ikona.png", "logo.png"]:
            try:
                src_f = res(fname)
                dst_f = os.path.join(INSTALL_DIR, fname)
                if src_f and os.path.exists(src_f) and src_f != dst_f:
                    shutil.copy2(src_f, dst_f)
            except Exception: pass
        create_desktop_shortcut()

    threading.Thread(target=_setup, daemon=True).start()

    # RustDesk auto-install
    if cfg.get("allowRustdesk", True):
        threading.Thread(target=lambda: install_rustdesk() if not is_rustdesk_installed() else None, daemon=True).start()

    api = BusinessAPI(token, cfg, bg=bg)

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
        return

    window = webview.create_window(
        APP_NAME,
        url=url,
        width=1300, height=750,
        min_size=(900, 550),
        js_api=api,
        background_color='#040810',
    )
    webview.start(debug=False, gui="edgechromium")

    # Webview closed — keep tray alive
    log.info("Business webview closed — keeping tray alive")
    while True:
        time.sleep(60)


# --- main() ---------------------------------------------------------------

def _sync_ui_on_start():
    """Always sync bundled UI to install dir on startup — ensures UI updates with exe."""
    try:
        ui_src = None
        mp = getattr(sys, '_MEIPASS', None)
        if mp:
            ui_src = os.path.join(mp, 'ui')
        if not ui_src or not os.path.isdir(ui_src):
            ui_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui')
        ui_dst = os.path.join(INSTALL_DIR, 'ui')
        if not os.path.isdir(ui_src) or os.path.abspath(ui_src) == os.path.abspath(ui_dst):
            return
        # Check if UI needs update — porównujemy SUMĘ rozmiarów najważniejszych plików
        # (script.js + business.html + aicore.js + aicore.css). Każda zmiana dowolnego
        # z nich wymusza resync. Dzięki temu update nie jest pomijany gdy tylko HTML się
        # zmienił a script.js nie.
        key_files = ['script.js', 'business.html', 'aicore.js', 'aicore.css', 'styles.css']
        def _sum_sizes(dir_):
            total = 0
            for n in key_files:
                p = os.path.join(dir_, n)
                if os.path.isfile(p):
                    try: total += os.path.getsize(p)
                    except Exception: pass
            return total
        if os.path.isdir(ui_dst) and _sum_sizes(ui_src) == _sum_sizes(ui_dst):
            return  # Suma rozmiarów identyczna → brak zmian
        if os.path.exists(ui_dst):
            shutil.rmtree(ui_dst)
        shutil.copytree(ui_src, ui_dst)
        log.info("UI synced: %s → %s", ui_src, ui_dst)
    except Exception as e:
        log.warning("UI sync failed: %s", e)

def main():
    _sync_ui_on_start()
    log.info("%s %s starting — exe: %s", APP_NAME, APP_VERSION, sys.executable)

    if "--uninstall" in sys.argv:
        _do_uninstall()
        return

    if "--install-service" in sys.argv:
        _install_service()
        return

    if "--remove-service" in sys.argv:
        _remove_service()
        return

    if "--service" in sys.argv:
        log.info("Starting in SERVICE mode (headless)")
        cfg = load_config()
        if cfg.get("status") == "ACTIVE" and cfg.get("token"):
            loop = ServerServiceLoop(cfg["token"], cfg)
            loop.start()
        else:
            log.error("Cannot start service — not registered. Run Asystent Business first.")
        return

    if is_frozen() and not is_installed():
        log.info("Not installed — running install_and_restart()")
        install_and_restart()
        return

    _kill_other_agents()

    cfg = load_config()
    log.info("Config: status=%s token=%s", cfg.get("status"), "YES" if cfg.get("token") else "NO")

    # Force business mode
    cfg["mode"] = "business"

    if cfg.get("status") == "ACTIVE" and cfg.get("token"):
        log.info("Already active — starting business UI")
        _run_business_webview(cfg["token"], cfg)
        return

    # Not active — auth flow
    _run_auth_webview(cfg)


if __name__ == "__main__":
    main()
