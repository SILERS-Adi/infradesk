"""
Asystent Business v1.0.0 — InfraDesk
Zbiera dane z komputera klienta, monitoring, backup, diagnostyka.
Pywebview UI: overview + formularz zgloszenia.
"""

import os, sys, re, json, time, shutil, socket, logging, platform
import threading, subprocess, winreg, tempfile, urllib.request, base64, io

_NO_WINDOW = subprocess.CREATE_NO_WINDOW
from datetime import datetime

import psutil, requests, websocket, pystray
from PIL import Image, ImageGrab, ImageDraw

# --- Config ---------------------------------------------------------------

APP_NAME    = "Asystent Business"
APP_VERSION = "4.14.4"
_OLD_INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "InfraDesk")
INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "SILERS", "Asystent Business")
INSTALL_EXE = os.path.join(INSTALL_DIR, "Asystent Business.exe")
CONFIG_FILE = os.path.join(INSTALL_DIR, "config.json")
TENANT_FILE = os.path.join(INSTALL_DIR, "tenant.json")


def _migrate_old_config():
    old_cfg = os.path.join(_OLD_INSTALL_DIR, "config.json")
    if os.path.exists(old_cfg) and not os.path.exists(CONFIG_FILE):
        import shutil
        os.makedirs(INSTALL_DIR, exist_ok=True)
        shutil.copy2(old_cfg, CONFIG_FILE)
        old_tenant = os.path.join(_OLD_INSTALL_DIR, "tenant.json")
        if os.path.exists(old_tenant):
            shutil.copy2(old_tenant, TENANT_FILE)


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
_log_file = os.path.join(INSTALL_DIR, "asystent_business.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("asystent_business")

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
            if "asystent business" in pname or INSTALL_EXE.lower() == pexe:
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
        lnk = os.path.join(desktop, "Asystent Business.lnk")
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
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Asystent Business"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as k:
            winreg.SetValueEx(k, "DisplayName",     0, winreg.REG_SZ,    APP_NAME)
            winreg.SetValueEx(k, "DisplayVersion",  0, winreg.REG_SZ,    APP_VERSION)
            winreg.SetValueEx(k, "Publisher",       0, winreg.REG_SZ,    "SILERS — Adrian Blaszczykowski")
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
    old_names = ["InfraDesk", "InfraDesk Agent", "InfraDesk Server Agent"]
    old_exes = ["InfraDesk.exe", "InfraDesk Agent.exe", "InfraDesk Server Agent.exe"]

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
    for name in ["InfraDesk Agent", "InfraDesk Server Agent"]:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall\\" + name)
            log.info("Removed Add/Remove entry: %s", name)
        except FileNotFoundError: pass
        except Exception: pass

    # Remove old Windows Service
    for svc in ["InfraDeskAgent", "InfraDeskServerAgent"]:
        try:
            subprocess.run(f"net stop {svc}", shell=True, capture_output=True, timeout=15,
                           creationflags=_NO_WINDOW)
            subprocess.run(f"sc delete {svc}", shell=True, capture_output=True, timeout=15,
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
        for old_lnk in ["InfraDesk.lnk", "InfraDesk Agent.lnk", "Zgloszenie serwisowe.lnk"]:
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
                            sw[name] = {"name": name, "version": v("DisplayVersion"), "publisher": v("Publisher")}
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
                app = websocket.WebSocketApp(WS_BASE,
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
            checks.append({"id": cid, "name": name, "status": "pass" if ok else "fail", "severity": sev, "detail": detail})
        except Exception as e:
            checks.append({"id": cid, "name": name, "status": "error", "severity": sev, "detail": str(e)[:100]})

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
        "(Get-LocalUser Guest).Enabled",
        lambda o: o == "False", lambda o: "Wylaczone" if o == "False" else "AKTYWNE!")
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
        checks.append({"id": "uptime", "name": "Uptime (<30 dni)", "severity": "low",
            "status": "pass" if days < 30 else "fail", "detail": f"{days} dni"})
    except: pass

    # Backup
    has_bk = load_config().get("backupMode", False)
    total_weight += WEIGHTS["high"]
    checks.append({"id": "backup_status", "name": "Backup Asystent", "severity": "high",
        "status": "pass" if has_bk else "fail", "detail": "Aktywny" if has_bk else "Brak konfiguracji"})

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
            if btype.startswith("SQL_"):
                path = self._backup_sql(cfg)
            elif btype == "FOLDER":
                path = self._backup_folder(cfg)
            else:
                raise ValueError(f"Unknown backup type: {btype}")

            if cfg.get("encryptBackups") and cfg.get("encryptionKey"):
                path = self._encrypt(path, cfg["encryptionKey"])

            drive_id = None
            drive_folder = cfg.get("googleDriveFolder")
            if drive_folder:
                drive_id = self._upload_gdrive(path, drive_folder)

            # Upload to InfraDesk Cloud if enabled
            if cfg.get("useInfradeskCloud"):
                try:
                    self._upload_infradesk_cloud(path, cfg.get("id", ""))
                    log.info("Uploaded to InfraDesk Cloud: %s", os.path.basename(path))
                except Exception as ue:
                    log.error("InfraDesk Cloud upload failed: %s", ue)

            # Copy to local/network path if configured
            local_path = cfg.get("localBackupPath")
            if local_path:
                try:
                    os.makedirs(local_path, exist_ok=True)
                    import shutil
                    shutil.copy2(path, os.path.join(local_path, os.path.basename(path)))
                    log.info("Copied to local path: %s", local_path)
                except Exception as le:
                    log.error("Local copy failed: %s", le)

            file_size = os.path.getsize(path) if os.path.exists(path) else 0

            # Retention policy — clean old local backups
            retention_days = int(cfg.get("retentionDays", 30))
            if local_path and retention_days > 0:
                self._cleanup_old_backups(local_path, retention_days)

            api_post("/agent/backup/complete", {
                "historyId": history_id,
                "sizeBytes": file_size,
                "fileName": os.path.basename(path),
                "googleDriveId": drive_id,
            }, self.token)
            log.info("Backup complete: %s (%d bytes)", cfg.get("name"), file_size)

            try: os.remove(path)
            except Exception: pass

        except Exception as e:
            log.error("Backup failed: %s — %s", cfg.get("name"), e)
            try:
                api_post("/agent/backup/failed", {"configId": cfg_id, "error": str(e)}, self.token)
            except Exception:
                pass

    def _backup_sql(self, cfg):
        btype = cfg["type"]
        host = str(cfg.get("sqlHost", "localhost"))
        port = str(cfg.get("sqlPort", 3306))
        user = str(cfg.get("sqlUser", ""))
        pwd = str(cfg.get("sqlPassword", "") or cfg.get("sqlPassEnc", ""))
        dbs = cfg.get("sqlDatabases", "").split(",")
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        results = []

        backup_dir = os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "InfraDesk", "backups")
        os.makedirs(backup_dir, exist_ok=True)

        for db in dbs:
            db = db.strip()
            if not db:
                continue
            output = os.path.join(backup_dir, f"backup_{db}_{timestamp}.sql")

            if btype == "SQL_MYSQL":
                env = os.environ.copy()
                if pwd:
                    env["MYSQL_PWD"] = pwd
                cmd = ["mysqldump", f"--host={host}", f"--port={port}", f"--user={user}", db]
                try:
                    with open(output, "w") as f:
                        subprocess.run(cmd, check=True, stdout=f, stderr=subprocess.PIPE, timeout=3600, env=env, creationflags=_NO_WINDOW)
                    results.append(output)
                except Exception as e:
                    raise RuntimeError(f"MySQL backup failed for {db}: {e}")

            elif btype == "SQL_POSTGRES":
                env = os.environ.copy()
                if pwd:
                    env["PGPASSWORD"] = pwd
                cmd = ["pg_dump", "-h", host, "-p", port, "-U", user, db]
                try:
                    with open(output, "w") as f:
                        subprocess.run(cmd, check=True, stdout=f, stderr=subprocess.PIPE, timeout=3600, env=env, creationflags=_NO_WINDOW)
                    results.append(output)
                except Exception as e:
                    raise RuntimeError(f"PostgreSQL backup failed for {db}: {e}")

            elif btype == "SQL_MSSQL":
                env = os.environ.copy()
                bak_path = f"{output}.bak"
                sql_query = f"BACKUP DATABASE [{db}] TO DISK=N'{bak_path}' WITH FORMAT, COMPRESSION"
                if user and pwd:
                    env["SQLCMDPASSWORD"] = pwd
                    cmd = ["sqlcmd", "-S", f"{host},{port}", "-U", user, "-Q", sql_query]
                else:
                    cmd = ["sqlcmd", "-S", f"{host},{port}", "-E", "-Q", sql_query]
                try:
                    subprocess.run(cmd, check=True, capture_output=True, timeout=3600, env=env, creationflags=_NO_WINDOW)
                    results.append(bak_path)
                except Exception as e:
                    raise RuntimeError(f"MSSQL backup failed for {db}: {e}")

        if not results:
            raise RuntimeError("No databases to backup")

        import tarfile
        archive = os.path.join(backup_dir, f"backup_sql_{timestamp}.tar.gz")
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


# --- BusinessAPI (pywebview bridge) ---------------------------------------

class BusinessAPI:
    """Pywebview JS API for Asystent Business — overview + ticket."""

    def __init__(self, token, cfg):
        self.token = token
        self.cfg = cfg
        self._screenshots = {}

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
        """Client adds comment / message to the technician."""
        try:
            return api_post(f"/agent/tickets/{ticket_id}/comments", {"comment": comment}, self.token)
        except Exception as e:
            log.debug("post_ticket_comment error: %s", e)
            return {"error": str(e)}

    def cancel_my_ticket(self, ticket_id):
        """Client cancels own ticket (only NEW/PENDING/ASSIGNED)."""
        try:
            return api_post(f"/agent/tickets/{ticket_id}/cancel", {}, self.token)
        except Exception as e:
            log.debug("cancel_my_ticket error: %s", e)
            return {"error": str(e)}

    def edit_my_ticket(self, ticket_id, title, description):
        """Client edits own ticket title/description (only NEW/PENDING)."""
        try:
            payload = {}
            if title: payload["title"] = title
            if description: payload["description"] = description
            return api_patch(f"/agent/tickets/{ticket_id}", payload, self.token)
        except Exception as e:
            log.debug("edit_my_ticket error: %s", e)
            return {"error": str(e)}

    def get_contact(self):
        """Get IT support contact info."""
        try:
            return fetch_contact()
        except Exception:
            return {
                "infolinia": "+48 575 662 664",
                "email": "zgloszenia@silers.pl",
                "opiekun": "Adrian Blaszczykowski",
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

    def start(self):
        if self.cfg.get("allowMonitoring", True):
            threading.Thread(target=self._metrics_loop, daemon=True).start()
            self._diagnostics = AutoDiagnostics(self.token)
            threading.Thread(target=self._diagnostics_loop, daemon=True).start()
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
                if cycle % 60 == 0:
                    try:
                        audit = security_audit()
                        data.setdefault("serverMetrics", {})["securityAudit"] = audit
                        log.info("Security audit: score=%s", audit.get("score"))
                    except Exception: pass
                if cycle % 30 == 0:
                    try:
                        scan = network_scan()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
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

    def _start_tray(self):
        try:
            try:
                icon_path = res("ikona.png")
                if os.path.exists(icon_path):
                    icon_img = Image.open(icon_path).convert("RGBA").resize((128, 128), Image.LANCZOS)
                else:
                    raise FileNotFoundError()
            except Exception:
                icon_img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
                d = ImageDraw.Draw(icon_img)
                d.rounded_rectangle([0, 0, 127, 127], radius=22, fill=(109, 40, 217, 255))
                try:
                    from PIL import ImageFont
                    font = ImageFont.truetype("arialbd.ttf", 52)
                except Exception:
                    font = ImageFont.load_default()
                d.text((28, 30), "AB", fill=(255, 255, 255, 255), font=font)

            import webbrowser
            menu = pystray.Menu(
                pystray.MenuItem(f"  {APP_NAME} v{APP_VERSION}", None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("  Otworz Asystent Business", lambda i, it: webbrowser.open(PORTAL_URL), default=True),
                pystray.MenuItem("  Zamknij", lambda i, it: (i.stop(), os._exit(0))),
            )
            self._tray = pystray.Icon(APP_NAME, icon_img, APP_NAME, menu)
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
                if cycle % 30 == 0:
                    try:
                        scan = network_scan()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
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
    webview.start(debug=False)

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
        return

    window = webview.create_window(
        APP_NAME,
        url=url,
        width=1300, height=750,
        min_size=(900, 550),
        js_api=api,
        background_color='#040810',
    )
    webview.start(debug=False)

    # Webview closed — keep tray alive
    log.info("Business webview closed — keeping tray alive")
    while True:
        time.sleep(60)


# --- main() ---------------------------------------------------------------

def main():
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
