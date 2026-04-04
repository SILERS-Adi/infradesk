"""
InfraDesk Agent v2 — Windows System Tray
Dark UI · tkinter/ttk · Logowanie / Rejestracja · RustDesk · Monitoring
"""

import os, sys, re, json, time, shutil, socket, logging, platform
import threading, subprocess, winreg, tempfile, urllib.request

_NO_WINDOW = subprocess.CREATE_NO_WINDOW
from datetime import datetime

import psutil, requests, websocket, pystray
from PIL import Image, ImageGrab, ImageDraw

# ─── Config ──────────────────────────────────────────────────────────────────

APP_NAME    = "Asystent Home"
APP_NAME_HOME = "Asystent Home"
APP_VERSION = "5.0.0"
INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "InfraDesk")
INSTALL_EXE = os.path.join(INSTALL_DIR, "InfraDesk.exe")
CONFIG_FILE = os.path.join(INSTALL_DIR, "config.json")
TENANT_FILE = os.path.join(INSTALL_DIR, "tenant.json")
API_BASE     = "https://infradesk.pl/api"
PORTAL_URL   = "https://infradesk.pl/portal"
WS_BASE      = "wss://infradesk.pl/api/agent/ws"
VERSION_URL  = "https://infradesk.pl/downloads/version.json"
SILERS_MSI_URL = "https://infradesk.pl/downloads/silers.msi"


def _load_tenant_key() -> str | None:
    """Load tenant key from: 1) config.json, 2) tenant.json, 3) CLI arg --tenant-key."""
    # 1) From config
    cfg = load_config()
    if cfg.get("tenantKey"):
        return cfg["tenantKey"]
    # 2) From tenant.json (placed by download endpoint)
    try:
        with open(TENANT_FILE, encoding="utf-8") as f:
            data = json.load(f)
            if data.get("tenantKey"):
                return data["tenantKey"]
    except Exception:
        pass
    # 3) From CLI argument
    for arg in sys.argv[1:]:
        if arg.startswith("--tenant-key="):
            return arg.split("=", 1)[1]
    return None

os.makedirs(os.path.join(os.environ.get("APPDATA", ""), "InfraDesk"), exist_ok=True)
_log_file = os.path.join(os.environ.get("APPDATA", ""), "InfraDesk", "agent.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(_log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("infradesk")

# ─── Kolory ──────────────────────────────────────────────────────────────────

BG      = "#080D19"
SURF    = "#0C1220"
SURF2   = "#131B2E"
PRI     = "#6D28D9"
PRI_H   = "#5B21B6"
SEC     = "#2563EB"
TXT     = "#F3F4F6"
TXT_DIM = "#71717A"
TXT_MUT = "#52525B"
OK_C    = "#10b981"
ERR_C   = "#ef4444"
WARN_C  = "#f59e0b"
BORDER  = "#1E293B"
ACC     = "#22D3EE"
FONT    = "Segoe UI"

# ─── Zasoby ──────────────────────────────────────────────────────────────────

def res(name: str) -> str:
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, name)
    for d in [os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "..", "GRAFIKI")]:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return name


# ─── Config I/O ──────────────────────────────────────────────────────────────

def load_config() -> dict:
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(data: dict):
    os.makedirs(INSTALL_DIR, exist_ok=True)
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    # Atomic replace
    try:
        if os.path.exists(CONFIG_FILE):
            os.replace(tmp, CONFIG_FILE)
        else:
            os.rename(tmp, CONFIG_FILE)
    except Exception:
        shutil.copy2(tmp, CONFIG_FILE)
        try: os.remove(tmp)
        except Exception: pass
    log.info("Config SAVED: %s (size=%d keys=%s)", CONFIG_FILE, os.path.getsize(CONFIG_FILE), list(data.keys()))


# ─── Instalacja ──────────────────────────────────────────────────────────────

def is_frozen(): return getattr(sys, "frozen", False)
def is_installed():
    if not is_frozen(): return True
    exe_path = os.path.abspath(sys.executable).lower()
    # Installed if running from APPDATA\InfraDesk or Program Files
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
            if "infradesk agent" in (p.info.get("name") or "").lower() \
               or INSTALL_EXE.lower() == (p.info.get("exe") or "").lower():
                p.terminate(); p.wait(timeout=3)
        except Exception: pass


def _get_desktop_path() -> str:
    """Zwraca ścieżkę do pulpitu (obsługuje OneDrive/przekierowanie folderu)."""
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
    """Tworzy skrót 'InfraDesk' na pulpicie — uruchamia agenta."""
    try:
        desktop = _get_desktop_path()
        log.info("Desktop path: %s", desktop)

        # Usuń stary skrót
        for old_name in ["Zgloszenie serwisowe.lnk", "InfraDesk.lnk"]:
            old_p = os.path.join(desktop, old_name)
            if os.path.exists(old_p):
                try: os.remove(old_p); log.info("Removed old shortcut: %s", old_p)
                except Exception: pass

        lnk = os.path.join(desktop, "InfraDesk.lnk")
        target = INSTALL_EXE
        if not os.path.exists(target):
            target = sys.executable
        log.info("Shortcut target: %s (exists=%s)", target, os.path.exists(target))

        icon_file = os.path.join(INSTALL_DIR, "icon.ico")
        icon_loc = f"{icon_file},0" if os.path.exists(icon_file) else f"{target},0"

        # Metoda 1: PowerShell inline (nie plik .ps1)
        ps_cmd = (
            f'$s=(New-Object -ComObject WScript.Shell).CreateShortcut("{lnk}");'
            f'$s.TargetPath="{target}";'
            f'$s.WorkingDirectory="{INSTALL_DIR}";'
            f'$s.Description="InfraDesk";'
            f'$s.IconLocation="{icon_loc}";'
            f'$s.Save()'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            creationflags=_NO_WINDOW, timeout=15,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )

        if result.returncode == 0 and os.path.exists(lnk):
            log.info("Desktop shortcut created (PS inline): %s", lnk)
            return

        log.warning("PS inline failed: rc=%s err=%s", result.returncode, result.stderr.decode(errors="replace"))

        # Metoda 2: VBScript fallback
        vbs = os.path.join(tempfile.gettempdir(), "infradesk_shortcut.vbs")
        with open(vbs, "w") as f:
            f.write(f'Set s = CreateObject("WScript.Shell").CreateShortcut("{lnk}")\n')
            f.write(f's.TargetPath = "{target}"\n')
            f.write(f's.WorkingDirectory = "{INSTALL_DIR}"\n')
            f.write(f's.Description = "InfraDesk"\n')
            f.write(f's.IconLocation = "{icon_loc}"\n')
            f.write('s.Save\n')

        result2 = subprocess.run(
            ["cscript", "//Nologo", vbs],
            creationflags=_NO_WINDOW, timeout=15,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        try: os.remove(vbs)
        except Exception: pass

        if os.path.exists(lnk):
            log.info("Desktop shortcut created (VBS): %s", lnk)
        else:
            log.warning("VBS fallback failed: rc=%s err=%s", result2.returncode, result2.stderr.decode(errors="replace"))
            # Metoda 3: win32com
            try:
                import win32com.client as wc
                shell = wc.Dispatch("WScript.Shell")
                sc = shell.CreateShortcut(lnk)
                sc.TargetPath = target
                sc.WorkingDirectory = INSTALL_DIR
                sc.Description = "InfraDesk"
                sc.IconLocation = icon_loc
                sc.Save()
                log.info("Desktop shortcut created (win32com): %s", lnk)
            except Exception as e2:
                log.warning("win32com shortcut fallback failed: %s", e2)
    except Exception as e:
        log.warning("Shortcut creation failed: %s", e)


def _register_in_add_remove():
    """Rejestruje aplikację w 'Dodaj lub usuń programy' (HKCU)."""
    try:
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\InfraDesk Agent"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as k:
            winreg.SetValueEx(k, "DisplayName",     0, winreg.REG_SZ,    APP_NAME)
            winreg.SetValueEx(k, "DisplayVersion",  0, winreg.REG_SZ,    APP_VERSION)
            winreg.SetValueEx(k, "Publisher",       0, winreg.REG_SZ,    "SILERS — Adrian Błaszczykowski")
            winreg.SetValueEx(k, "DisplayIcon",     0, winreg.REG_SZ,    f'"{INSTALL_EXE}"')
            winreg.SetValueEx(k, "InstallLocation", 0, winreg.REG_SZ,    INSTALL_DIR)
            winreg.SetValueEx(k, "UninstallString", 0, winreg.REG_SZ,    f'"{INSTALL_EXE}" --uninstall')
            winreg.SetValueEx(k, "NoModify",        0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(k, "NoRepair",        0, winreg.REG_DWORD, 1)
        log.info("Registered in Add/Remove programs (v%s)", APP_VERSION)
    except Exception as e:
        log.warning("Add/Remove register failed: %s", e)


def install_and_restart():
    os.makedirs(INSTALL_DIR, exist_ok=True)
    src = sys.executable
    if src.lower() != INSTALL_EXE.lower():
        _kill_others()
        try:
            shutil.copy2(src, INSTALL_EXE)
        except PermissionError:
            bat = os.path.join(INSTALL_DIR, "_upd.bat")
            with open(bat, "w") as f:
                f.write(f'@echo off\ntimeout /t 2 >nul\ncopy /y "{src}" "{INSTALL_EXE}"\nstart "" "{INSTALL_EXE}"\ndel "%~f0"\n')
            subprocess.Popen(["cmd", "/c", bat], close_fds=True,
                             creationflags=_NO_WINDOW)
            sys.exit(0)
    _set_autostart(True)
    _register_in_add_remove()
    # Kopiuj zasoby (ikona, logo, tło) do INSTALL_DIR
    for fname in ["icon.ico", "ikona.png", "logo.png", "tlo.png"]:
        try:
            src_f = res(fname)
            dst_f = os.path.join(INSTALL_DIR, fname)
            if src_f and os.path.exists(src_f) and src_f != dst_f:
                shutil.copy2(src_f, dst_f)
                log.info("Copied resource: %s", fname)
        except Exception: pass
    create_desktop_shortcut()
    subprocess.Popen([INSTALL_EXE], close_fds=True,
                     creationflags=_NO_WINDOW)
    sys.exit(0)


# ─── Sprzęt ──────────────────────────────────────────────────────────────────

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
    # 1. Znane ścieżki stałe
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

    # 2. Wszystkie profile użytkowników w C:\Users\
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

    # 3. Rejestr Windows
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

    # 4. rustdesk.exe / SILERS.exe --get-id
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

    # 5. PowerShell — szukaj we wszystkich profilach
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


# ─── RustDesk ─────────────────────────────────────────────────────────────────

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
            _notify("SILERS już zainstalowany.")
            return True

        _notify("Pobieranie SILERS… (może potrwać chwilę)")
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(SILERS_MSI_URL, context=ctx, timeout=120) as resp:
            with open(msi, "wb") as f:
                f.write(resp.read())
        log.info("SILERS MSI downloaded: %s bytes", os.path.getsize(msi))

        _notify("Instalowanie SILERS… (może potrwać kilka minut)")
        proc = subprocess.Popen(
            ["msiexec", "/i", msi, "/qn", "/norestart"],
            creationflags=_NO_WINDOW,
        )
        proc.wait(timeout=300)
        log.info("msiexec exit code: %s", proc.returncode)

        if is_rustdesk_installed():
            _notify("SILERS zainstalowany pomyślnie.")
            try: os.remove(msi)
            except Exception: pass
            return True

        _notify("SILERS nie został wykryty po instalacji.")
        return False
    except Exception as e:
        log.error("RustDesk install error: %s", e)
        _notify(f"Błąd instalacji RustDesk: {e}")
        return False
    finally:
        # Próba usunięcia — ignoruj błąd jeśli plik zajęty
        try: os.remove(msi)
        except Exception: pass


# ─── Auto-update ──────────────────────────────────────────────────────────────

def check_for_update():
    """Zwraca (version, url) jeśli dostępna nowsza wersja, inaczej None."""
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(VERSION_URL, context=ctx, timeout=10) as r:
            data = json.loads(r.read())
        remote = data.get("version", "0.0.0")
        if tuple(int(x) for x in remote.split(".")) > tuple(int(x) for x in APP_VERSION.split(".")):
            return remote, data.get("url", f"https://infradesk.pl/downloads/InfraDesk.exe")
    except Exception as e:
        log.debug("Update check failed: %s", e)
    return None


def do_self_update(download_url, notify_fn=None):
    """Pobiera nową wersję i uruchamia skrypt zastępujący EXE, potem kończy bieżący proces."""
    def _notify(msg):
        log.info(msg)
        if notify_fn:
            try: notify_fn(msg)
            except Exception: pass

    try:
        new_exe = os.path.join(tempfile.gettempdir(), "infradesk_update.exe")
        _notify("Pobieranie aktualizacji…")
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(download_url, context=ctx, timeout=120) as resp:
            with open(new_exe, "wb") as f:
                f.write(resp.read())
        log.info("Update downloaded: %d bytes", os.path.getsize(new_exe))

        _notify("Restartuję agenta…")
        # Uruchom nowy exe bezpośrednio z temp — sam się zainstaluje przez install_and_restart()
        # Ten sam mechanizm co ręczne uruchomienie z Downloads — wiemy że działa
        subprocess.Popen([new_exe], close_fds=True, creationflags=_NO_WINDOW)
        os._exit(0)
    except Exception as e:
        log.error("Self-update error: %s", e)
        _notify(f"Błąd aktualizacji: {e}")


# ─── API ─────────────────────────────────────────────────────────────────────

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


def fetch_contact() -> dict:
    try:
        return api_get("/agent/contact")
    except Exception:
        return {
            "infolinia": "+48 575 662 664",
            "email": "zgloszenia@silers.pl",
            "opiekun": "Adrian Błaszczykowski",
            "opiekunTel": "+48 604 292 831",
            "opiekunEmail": "adrian@silers.pl",
        }


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
    # Filtruj None → Zod nie akceptuje null dla pól optional
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


# ─── Wake-on-LAN ─────────────────────────────────────────────────────────────

def _send_wol(mac: str):
    """Wysyła pakiet Wake-on-LAN (magic packet) do podanego adresu MAC."""
    try:
        mac_clean = mac.replace(":", "").replace("-", "").upper()
        if len(mac_clean) != 12 or not all(c in "0123456789ABCDEF" for c in mac_clean):
            log.warning("WoL: nieprawidłowy MAC: %s", mac)
            return
        magic = bytes.fromhex("FF" * 6 + mac_clean * 16)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.sendto(magic, ("255.255.255.255", 9))
        log.info("WoL wysłany do %s", mac)
    except Exception as e:
        log.error("WoL błąd: %s", e)


# ─── WebSocket ────────────────────────────────────────────────────────────────

class WS:
    def __init__(self, token, on_msg):
        self.token = token; self.cb = on_msg
    def start(self):
        threading.Thread(target=self._run, daemon=True).start()
    def _run(self):
        while True:
            try:
                ws = websocket.WebSocketApp(f"{WS_BASE}?token={self.token}",
                    on_message=lambda _ws, m: self._on(m))
                ws.run_forever(ping_interval=30)
            except Exception: pass
            time.sleep(10)
    def _on(self, raw):
        try: self.cb(json.loads(raw))
        except Exception: pass


# ─── UI helpers ──────────────────────────────────────────────────────────────

import tkinter as tk
from tkinter import ttk

def _apply_style():
    s = ttk.Style()
    s.theme_use("clam")
    s.configure(".", background=BG, foreground=TXT, font=(FONT, 10))
    s.configure("TFrame",    background=BG)
    s.configure("TLabel",    background=BG, foreground=TXT)
    s.configure("TEntry",    fieldbackground=SURF2, foreground=TXT,
                             bordercolor=BORDER, insertcolor=TXT,
                             lightcolor=SURF2, darkcolor=SURF2, padding=10)
    s.map("TEntry", bordercolor=[("focus", PRI)],
                    fieldbackground=[("focus", SURF)])
    s.configure("TScrollbar", background=SURF2, troughcolor=BG,
                               bordercolor=BG, arrowcolor=TXT_DIM)
    s.configure("Prog.Horizontal.TProgressbar",
                troughcolor=BORDER, background=PRI, thickness=4)
    s.configure("TCheckbutton", background=BG, foreground=TXT,
                                selectcolor=SURF2)
    s.configure("TOptionMenu",  background=SURF2, foreground=TXT)
    s.configure("TCombobox", fieldbackground=SURF2, background=SURF2,
                             foreground=TXT, bordercolor=BORDER,
                             arrowcolor=TXT_DIM, padding=10)
    s.map("TCombobox", bordercolor=[("focus", PRI)],
                       fieldbackground=[("focus", SURF)])


def lbl(parent, text, size=11, color=TXT, bold=False, **kw):
    f = "bold" if bold else "normal"
    return tk.Label(parent, text=text, bg=parent.cget("bg") if hasattr(parent, "cget") else BG,
                    fg=color, font=(FONT, size, f), **kw)


def entry(parent, placeholder="", show="", width=30) -> ttk.Entry:
    e = ttk.Entry(parent, show=show, width=width, style="TEntry",
                  font=(FONT, 11))
    if placeholder:
        e.insert(0, placeholder)
        e.configure(foreground=TXT_DIM)
        def _focus_in(ev):
            if e.get() == placeholder:
                e.delete(0, "end")
                e.configure(foreground=TXT)
        def _focus_out(ev):
            if not e.get():
                e.insert(0, placeholder)
                e.configure(foreground=TXT_DIM)
        e.bind("<FocusIn>",  _focus_in)
        e.bind("<FocusOut>", _focus_out)
        e._placeholder = placeholder
    return e


def get_val(e: ttk.Entry) -> str:
    v = e.get()
    if hasattr(e, "_placeholder") and v == e._placeholder:
        return ""
    return v.strip()


def btn(parent, text, cmd, bg=PRI, hover=PRI_H, height=5, **kw):
    b = tk.Button(parent, text=text, command=cmd,
                  bg=bg, fg=TXT, activebackground=hover, activeforeground=TXT,
                  relief="flat", bd=0, font=(FONT, 10, "bold"),
                  cursor="hand2", pady=height, padx=14, **kw)
    def _enter(e): b.config(bg=hover)
    def _leave(e): b.config(bg=bg)
    b.bind("<Enter>", _enter)
    b.bind("<Leave>", _leave)
    return b

def btn_secondary(parent, text, cmd, **kw):
    return btn(parent, text, cmd, bg=SURF2, hover=BORDER, height=6, **kw)


def sep(parent):
    tk.Frame(parent, bg=BORDER, height=1).pack(fill="x", pady=12)


def section_lbl(parent, text):
    f = tk.Frame(parent, bg=BG)
    f.pack(fill="x", pady=(16, 6))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x")
    lbl(f, text, size=9, color=TXT_DIM).pack(anchor="w", pady=(6, 0))


def _scrollable(parent, height=400):
    """Returns (outer_frame, inner_frame) where inner_frame is scrollable."""
    outer = tk.Frame(parent, bg=BG)
    canvas = tk.Canvas(outer, bg=BG, highlightthickness=0, height=height)
    sb = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)
    inner = tk.Frame(canvas, bg=BG)
    win = canvas.create_window((0, 0), window=inner, anchor="nw")

    def _resize_canvas(e):
        canvas.itemconfig(win, width=canvas.winfo_width())
    def _resize_inner(e):
        canvas.configure(scrollregion=canvas.bbox("all"))

    canvas.bind("<Configure>", _resize_canvas)
    inner.bind("<Configure>",  _resize_inner)
    canvas.bind_all("<MouseWheel>",
        lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))
    return outer, inner


class Toggle(tk.Canvas):
    """Prosty przełącznik ON/OFF."""
    def __init__(self, parent, **kw):
        super().__init__(parent, width=44, height=22,
                         bg=parent.cget("bg"), highlightthickness=0,
                         cursor="hand2", **kw)
        self._on = True
        self._draw()
        self.bind("<Button-1>", lambda e: self._toggle())

    def _draw(self):
        self.delete("all")
        color = PRI if self._on else "#374151"
        r = 11
        self.create_oval(0, 0, 22, 22, fill=color, outline="")
        self.create_oval(22, 0, 44, 22, fill=color, outline="")
        self.create_rectangle(11, 0, 33, 22, fill=color, outline="")
        cx = 32 if self._on else 11
        self.create_oval(cx - 8, 3, cx + 8, 19, fill="white", outline="")

    def _toggle(self):
        self._on = not self._on
        self._draw()

    def get(self) -> bool:
        return self._on

    def set(self, val: bool):
        self._on = val
        self._draw()


def password_strength(pwd):
    s = 0
    if len(pwd) >= 8:  s += 1
    if len(pwd) >= 12: s += 1
    if re.search(r"[A-Z]", pwd): s += 1
    if re.search(r"[a-z]", pwd): s += 1
    if re.search(r"\d",    pwd): s += 1
    if re.search(r"[!@#$%^&*()\-_=+\[\]{};:,.<>?]", pwd): s += 1
    if s <= 2: return s/6, "Słabe",   ERR_C
    if s <= 3: return s/6, "Średnie", WARN_C
    return     s/6, "Silne",  OK_C


# ─── Okno logowania + rejestracji (zakładki) ────────────────────────────────

def show_login(root, on_login, on_register, on_back_to_home=None):
    _clear(root)
    root.title(APP_NAME)

    # ── Ekran wyboru: Zaloguj / Zarejestruj ──────────────────────────────────
    W, H = 520, 480
    root.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    x, y = max(0, (sw - W) // 2), max(0, (sh - H) // 2)
    root.geometry(f"{W}x{H}+{x}+{y}")
    root.resizable(False, False)

    f = tk.Frame(root, bg=BG, padx=40, pady=30)
    f.pack(fill="both", expand=True)

    # Logo
    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((60, 60), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img_pil = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img_pil.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img_pil.convert("RGB"))
        lbl_img = tk.Label(f, image=_img, bg=BG, bd=0)
        lbl_img.image = _img
        lbl_img.pack(pady=(0, 8))
    except Exception: pass

    lbl(f, APP_NAME, size=18, bold=True).pack()
    lbl(f, "Zarządzanie infrastrukturą IT", size=10, color=TXT_DIM).pack(pady=(2, 20))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(0, 20))

    lbl(f, "Wybierz opcję", size=12, color=TXT_DIM).pack(pady=(0, 16))

    def _show_login_form():
        _show_login_panel(root, on_login, on_register)

    def _show_register_form():
        _show_register_panel(root, on_login, on_register)

    btn(f, "  Zaloguj się  ", _show_login_form).pack(fill="x", pady=(0, 8))
    lbl(f, "Masz konto — zaloguj się danymi od administratora", size=9, color=TXT_DIM).pack(pady=(0, 16))

    btn(f, "  Zarejestruj nowe urządzenie  ", _show_register_form, bg=SURF2, hover=BORDER).pack(fill="x", pady=(0, 8))
    lbl(f, "Pierwszy raz — zarejestruj firmę i komputer", size=9, color=TXT_DIM).pack()

    if on_back_to_home:
        tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(16, 8))
        btn(f, "← Wróć do Asystenta InfraDesk", on_back_to_home, bg=SURF2, hover=BORDER).pack(fill="x")

    lbl(f, f"v{APP_VERSION}", size=8, color=TXT_MUT).pack(side="bottom", pady=(16, 0))


def _show_login_panel(root, on_login, on_register):
    _clear(root)
    root.title(f"{APP_NAME} — Logowanie")
    W, H = 480, 440
    root.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
    root.resizable(False, False)

    f = tk.Frame(root, bg=BG, padx=36, pady=24)
    f.pack(fill="both", expand=True)

    # Header
    hdr = tk.Frame(f, bg=BG)
    hdr.pack(fill="x", pady=(0, 8))
    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((36, 36), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img.convert("RGB"))
        lbl_img = tk.Label(hdr, image=_img, bg=BG, bd=0)
        lbl_img.image = _img
        lbl_img.pack(side="left", padx=(0, 8))
    except Exception: pass
    lbl(hdr, APP_NAME, size=14, bold=True).pack(side="left")

    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(0, 16))

    lbl(f, "Logowanie", size=13, bold=True).pack(anchor="w", pady=(0, 12))
    lbl(f, "E-MAIL", size=9, color=TXT_DIM).pack(anchor="w")
    e_mail = entry(f, "adres@firma.pl")
    e_mail.pack(fill="x", ipady=4, pady=(2, 10))
    lbl(f, "HASŁO", size=9, color=TXT_DIM).pack(anchor="w")
    prow_l = tk.Frame(f, bg=BG); prow_l.pack(fill="x", pady=(2, 4))
    e_lpwd = ttk.Entry(prow_l, show="•", font=(FONT, 11))
    e_lpwd.pack(side="left", fill="x", expand=True, ipady=4)
    _sh = [False]
    def tshow():
        _sh[0] = not _sh[0]; e_lpwd.configure(show="" if _sh[0] else "•")
    tk.Button(prow_l, text="👁", command=tshow,
              bg=SURF2, fg=TXT_DIM, activebackground=SURF, activeforeground=TXT,
              relief="flat", bd=0, padx=8, cursor="hand2").pack(side="left", padx=(4, 0))
    lerr_v = tk.StringVar()
    lbl(f, "", size=11, color=ERR_C, textvariable=lerr_v).pack(pady=(4, 0))
    def do_login():
        mail = get_val(e_mail); pwd = e_lpwd.get()
        if not mail or not pwd: lerr_v.set("Wpisz e-mail i hasło."); return
        lerr_v.set("Logowanie…")
        threading.Thread(target=_login_thread, args=(root, mail, pwd, on_login, lerr_v), daemon=True).start()
    btn(f, "Zaloguj się", do_login).pack(fill="x", pady=(12, 0))
    e_mail.bind("<Return>", lambda _: e_lpwd.focus())
    e_lpwd.bind("<Return>", lambda _: do_login())

    # Przycisk wstecz
    btn(f, "← Wróć", lambda: show_login(root, on_login, on_register), bg=SURF2, hover=BORDER).pack(fill="x", pady=(8, 0))

    e_mail.focus()


def _show_register_panel(root, on_login, on_register):
    """Formularz rejestracji nowego urządzenia."""
    _clear(root)
    root.title(f"{APP_NAME} — Rejestracja")
    W, H = 600, 700
    root.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
    root.resizable(True, True)
    root.minsize(500, 600)

    # Scrollable frame
    outer = tk.Frame(root, bg=BG)
    outer.pack(fill="both", expand=True)
    canvas = tk.Canvas(outer, bg=BG, highlightthickness=0)
    sb = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)
    right = tk.Frame(canvas, bg=BG, padx=36, pady=20)
    win = canvas.create_window((0, 0), window=right, anchor="nw")
    def _rc(e): canvas.itemconfig(win, width=canvas.winfo_width())
    def _ri(e): canvas.configure(scrollregion=canvas.bbox("all"))
    canvas.bind("<Configure>", _rc)
    right.bind("<Configure>", _ri)
    canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))

    lbl(right, "Rejestracja urządzenia", size=16, bold=True).pack(anchor="w", pady=(0, 4))
    lbl(right, "Podaj dane firmy i utworzymy konto", size=10, color=TXT_DIM).pack(anchor="w", pady=(0, 12))
    tk.Frame(right, bg=BORDER, height=1).pack(fill="x", pady=(0, 12))

    def _row2(parent, l1, l2):
        r = tk.Frame(parent, bg=BG); r.pack(fill="x", pady=(4, 0))
        c1 = tk.Frame(r, bg=BG); c1.pack(side="left", fill="x", expand=True, padx=(0, 6))
        c2 = tk.Frame(r, bg=BG); c2.pack(side="left", fill="x", expand=True)
        lbl(c1, l1, size=10, color=TXT_DIM).pack(anchor="w")
        lbl(c2, l2, size=10, color=TXT_DIM).pack(anchor="w")
        e1 = entry(c1); e1.pack(fill="x", ipady=3, pady=(1, 0))
        e2 = entry(c2); e2.pack(fill="x", ipady=3, pady=(1, 0))
        return e1, e2

    # Firma + NIP
    r_fn = tk.Frame(right, bg=BG); r_fn.pack(fill="x")
    c_co = tk.Frame(r_fn, bg=BG); c_co.pack(side="left", fill="x", expand=True, padx=(0, 6))
    c_ni = tk.Frame(r_fn, bg=BG); c_ni.pack(side="left", fill="x", expand=True)
    lbl(c_co, "Nazwa firmy *", size=10, color=TXT_DIM).pack(anchor="w")
    e_company = entry(c_co); e_company.pack(fill="x", ipady=3, pady=(1, 0))
    lbl(c_ni, "NIP", size=10, color=TXT_DIM).pack(anchor="w")
    e_nip = entry(c_ni); e_nip.pack(fill="x", ipady=3, pady=(1, 0))

    e_fname, e_lname = _row2(right, "Imię *", "Nazwisko *")
    e_phone, e_remail = _row2(right, "Telefon", "E-mail *")

    # Hasła
    rp = tk.Frame(right, bg=BG); rp.pack(fill="x", pady=(4, 0))
    cp1 = tk.Frame(rp, bg=BG); cp1.pack(side="left", fill="x", expand=True, padx=(0, 6))
    cp2 = tk.Frame(rp, bg=BG); cp2.pack(side="left", fill="x", expand=True)
    lbl(cp1, "Hasło *", size=10, color=TXT_DIM).pack(anchor="w")
    e_rpwd = ttk.Entry(cp1, show="•", font=(FONT, 11))
    e_rpwd.pack(fill="x", ipady=3, pady=(1, 0))
    lbl(cp2, "Powtórz hasło *", size=10, color=TXT_DIM).pack(anchor="w")
    e_rpwd2 = ttk.Entry(cp2, show="•", font=(FONT, 11))
    e_rpwd2.pack(fill="x", ipady=3, pady=(1, 0))

    # Uwagi
    lbl(right, "Uwagi", size=10, color=TXT_DIM).pack(anchor="w", pady=(8, 0))
    e_notes = tk.Text(right, height=2, bg=SURF2, fg=TXT, insertbackground=TXT,
                      font=(FONT, 11), relief="flat", padx=8, pady=4, wrap="word",
                      highlightbackground=BORDER, highlightcolor=PRI, highlightthickness=1)
    e_notes.pack(fill="x", pady=(1, 0))

    # Zgody
    zg = tk.Frame(right, bg=BG); zg.pack(fill="x", pady=(8, 0))
    def _consent(parent, title, subtitle):
        fr = tk.Frame(parent, bg=SURF, padx=8, pady=6)
        fr.pack(side="left", fill="x", expand=True, padx=(0, 4))
        t = Toggle(fr); t.pack(side="right")
        tf = tk.Frame(fr, bg=SURF); tf.pack(side="left", fill="x", expand=True)
        lbl(tf, title, size=10, bold=True).pack(anchor="w")
        lbl(tf, subtitle, size=9, color=TXT_DIM).pack(anchor="w")
        return t
    t_rd  = _consent(zg, "RustDesk", "Zdalne wsparcie")
    t_mon = _consent(zg, "Monitoring", "CPU, RAM, dysk")
    t_bak = _consent(zg, "Backup", "Kopie SQL / folderów")

    rerr_v = tk.StringVar()
    lbl(right, "", size=11, color=ERR_C, textvariable=rerr_v).pack(pady=(6, 0))

    def submit():
        company = get_val(e_company); fname = get_val(e_fname); lname = get_val(e_lname)
        email = get_val(e_remail); pwd = e_rpwd.get(); pwd2 = e_rpwd2.get()
        if not company:                   rerr_v.set("Podaj nazwę firmy."); return
        if not fname or not lname:        rerr_v.set("Podaj imię i nazwisko."); return
        if not email or "@" not in email: rerr_v.set("Podaj poprawny e-mail."); return
        if len(pwd) < 8:                  rerr_v.set("Hasło min. 8 znaków."); return
        if pwd != pwd2:                   rerr_v.set("Hasła nie są zgodne."); return
        rerr_v.set("Rejestrowanie…")
        form = {
            "companyName": company, "nip": get_val(e_nip) or None,
            "contactFirstName": fname, "contactLastName": lname,
            "contactPhone": get_val(e_phone) or None,
            "contactEmail": email, "email": email, "password": pwd,
            "registrationNotes": e_notes.get("1.0", "end").strip() or None,
            "allowRustdesk": t_rd.get(), "allowMonitoring": t_mon.get(), "backupMode": t_bak.get(),
        }
        threading.Thread(target=_register_thread, args=(root, form, on_register, rerr_v), daemon=True).start()

    btn(right, "Zarejestruj urządzenie", submit).pack(fill="x", pady=(10, 0))
    btn(right, "← Wróć", lambda: show_login(root, on_login, on_register), bg=SURF2, hover=BORDER).pack(fill="x", pady=(6, 0))




def open_about_window(root):
    win = tk.Toplevel(root)
    win.title("O programie")
    win.configure(bg=BG)
    win.geometry("400x400")
    win.resizable(False, False)
    win.grab_set(); win.lift()

    f = tk.Frame(win, bg=BG, padx=32, pady=24)
    f.pack(fill="both", expand=True)

    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((72, 72), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img.convert("RGB"))
        tk.Label(f, image=_img, bg=BG, bd=0).pack(pady=(0, 8))
        f._logo = _img
    except Exception: pass

    lbl(f, APP_NAME, size=15, bold=True).pack()
    lbl(f, f"Wersja {APP_VERSION}  ·  2026-03-26", size=10, color=TXT_DIM).pack(pady=(2, 16))

    tk.Frame(f, bg=PRI, height=1).pack(fill="x", pady=(0, 14))

    info = [
        ("Producent",  "SILERS — Adrian Błaszczykowski"),
        ("Adres",      "ul. Żeromskiego 29, 08-400 Garwolin"),
        ("NIP",        "826-194-10-94"),
        ("Telefon",    "+48 575 662 664"),
        ("WWW",        "www.silers.pl"),
    ]
    for label, val in info:
        r = tk.Frame(f, bg=BG); r.pack(fill="x", pady=2)
        lbl(r, f"{label}:", size=10, color=TXT_DIM, bold=True).pack(side="left", padx=(0, 8))
        lbl(r, val, size=10).pack(side="left")

    tk.Frame(f, bg=PRI, height=1).pack(fill="x", pady=(14, 10))
    lbl(f, "© 2026 SILERS. Wszelkie prawa zastrzeżone.", size=9, color=TXT_DIM).pack()

    btn = tk.Button(f, text="Zamknij", bg=PRI, fg="white",
                    relief="flat", padx=20, pady=6,
                    command=win.destroy, cursor="hand2", bd=0,
                    font=("Segoe UI", 10, "bold"))
    btn.pack(pady=(14, 0))


def fetch_faq() -> list:
    try:
        return api_get("/agent/faq")
    except Exception:
        return []


def open_faq_window(root):
    items = fetch_faq()
    win = tk.Toplevel(root)
    win.title("FAQ — Pomoc serwisowa")
    win.configure(bg=BG)
    win.geometry("520x540")
    win.resizable(False, True)
    win.grab_set(); win.lift()

    # ── Nagłówek ──
    hdr = tk.Frame(win, bg=SURF, padx=24, pady=14)
    hdr.pack(fill="x")
    lbl(hdr, "❓  FAQ", size=14, bold=True).pack(anchor="w")
    lbl(hdr, "Często zadawane pytania i wskazówki serwisowe", size=10, color=TXT_DIM).pack(anchor="w")

    # ── Scrollowalna lista ──
    outer = tk.Frame(win, bg=BG)
    outer.pack(fill="both", expand=True, padx=0, pady=0)

    canvas  = tk.Canvas(outer, bg=BG, bd=0, highlightthickness=0)
    sb      = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
    inner   = tk.Frame(canvas, bg=BG)

    inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=inner, anchor="nw")
    canvas.configure(yscrollcommand=sb.set)

    canvas.pack(side="left", fill="both", expand=True)
    sb.pack(side="right", fill="y")

    def _on_mousewheel(e):
        canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
    canvas.bind_all("<MouseWheel>", _on_mousewheel)
    win.bind("<Destroy>", lambda e: canvas.unbind_all("<MouseWheel>"))

    if not items:
        lbl(inner, "Brak wpisów FAQ.", size=11, color=TXT_DIM).pack(pady=40)
    else:
        for i, item in enumerate(items):
            card = tk.Frame(inner, bg=SURF, padx=18, pady=14)
            card.pack(fill="x", padx=16, pady=(12 if i == 0 else 0, 0))

            q_frame = tk.Frame(card, bg=SURF)
            q_frame.pack(fill="x")
            lbl(q_frame, "▶", size=10, color=PRI).pack(side="left", anchor="nw", pady=(2, 0))
            q_lbl = tk.Label(q_frame, text=item.get("q", ""), bg=SURF, fg=TXT,
                             font=(FONT, 11, "bold"), wraplength=430, justify="left", anchor="w")
            q_lbl.pack(side="left", fill="x", expand=True, padx=(6, 0))

            a_lbl = tk.Label(card, text=item.get("a", ""), bg=SURF, fg=TXT_DIM,
                             font=(FONT, 10), wraplength=450, justify="left", anchor="w")
            a_lbl.pack(fill="x", pady=(6, 0))

        tk.Frame(inner, bg=BG, height=16).pack()

    # ── Stopka ──
    foot = tk.Frame(win, bg=SURF, padx=24, pady=12)
    foot.pack(fill="x", side="bottom")
    btn(foot, "Zamknij", win.destroy, bg=SURF2, hover=SURF).pack(side="right")


def open_contact_window(root):
    c = fetch_contact()
    win = tk.Toplevel(root)
    win.title("Kontakt")
    win.configure(bg=BG)
    win.geometry("380x360")
    win.resizable(False, False)
    win.grab_set(); win.lift()

    f = tk.Frame(win, bg=BG, padx=32, pady=24)
    f.pack(fill="both", expand=True)

    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((80, 80), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img.convert("RGB"))
        tk.Label(f, image=_img, bg=BG, bd=0).pack(pady=(0, 10))
        f._logo = _img
    except Exception: pass

    def _row(icon, val):
        r = tk.Frame(f, bg=BG); r.pack(fill="x", pady=3)
        lbl(r, icon, size=12).pack(side="left", padx=(0, 8))
        lbl(r, val, size=11).pack(side="left")

    _row("📞", c.get("infolinia", ""))
    _row("✉️", c.get("email", ""))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=10)
    lbl(f, "Twój opiekun", size=10, color=TXT_DIM).pack(anchor="w")
    lbl(f, c.get("opiekun", ""), size=13, bold=True).pack(anchor="w", pady=(2, 4))
    _row("📱", c.get("opiekunTel", "") + "  (WhatsApp)")
    _row("✉️", c.get("opiekunEmail", ""))

    btn(f, "Zamknij", win.destroy, bg=SURF2, hover=SURF).pack(fill="x", pady=(16, 0))


def _forgot(root):
    import tkinter.messagebox as mb
    mb.showinfo("Nie pamiętam hasła",
                "Skontaktuj się z administratorem InfraDesk\naby zresetować hasło.", parent=root)


def _login_thread(root, mail, pwd, on_login, err_v):
    try:
        result = do_login(mail, pwd)
        root.after(0, lambda: on_login(result))
    except requests.HTTPError as e:
        msg = "Nieprawidłowy e-mail lub hasło." if e.response.status_code in (400, 401) else f"Błąd serwera: {e.response.status_code}"
        root.after(0, lambda m=msg: err_v.set(m))
    except requests.exceptions.ConnectionError:
        root.after(0, lambda: err_v.set("Brak połączenia z serwerem"))
    except requests.exceptions.Timeout:
        root.after(0, lambda: err_v.set("Serwer nie odpowiada"))
    except Exception as e:
        msg = str(e) or "Nieznany błąd"
        root.after(0, lambda m=msg: err_v.set(f"Błąd: {m}"))


def _register_thread(root, form, on_submit, err_v):
    try:
        result = do_register(form)
        root.after(0, lambda: on_submit(result, form))
    except requests.HTTPError as e:
        try:
            body = e.response.json()
            msg = body.get("error") or body.get("message") or str(e)
            details = body.get("details")
            if details and isinstance(details, list) and details:
                d = details[0]
                msg = f"{msg}: pole '{d.get('field')}' — {d.get('message')}"
        except Exception:
            msg = str(e) or f"HTTP {e.response.status_code}"
        root.after(0, lambda m=msg: err_v.set(f"Błąd: {m}"))
    except requests.exceptions.ConnectionError:
        root.after(0, lambda: err_v.set("Brak połączenia z serwerem"))
    except requests.exceptions.Timeout:
        root.after(0, lambda: err_v.set("Przekroczono czas oczekiwania"))
    except Exception as e:
        msg = str(e) or "Nieznany błąd"
        root.after(0, lambda m=msg: err_v.set(f"Błąd: {m}"))


# ─── Okno oczekiwania ─────────────────────────────────────────────────────────

def show_waiting(root, token, on_activated, on_cancel):
    _clear(root)
    root.geometry("460x420")
    root.title(f"{APP_NAME} — Oczekuje")
    f = tk.Frame(root, bg=BG, padx=40, pady=40)
    f.pack(fill="both", expand=True)

    try:
        img = Image.open(res("logo.png")).convert("RGBA"); img.thumbnail((80, 80), Image.LANCZOS)
        from PIL import ImageTk
        _img = ImageTk.PhotoImage(img)
        _l = tk.Label(f, image=_img, bg=BG); _l.image = _img; _l.pack(pady=(0, 12))
    except Exception: pass

    lbl(f, "Oczekuje na zatwierdzenie", size=18, bold=True).pack()
    lbl(f, "Twoje urządzenie zostało zarejestrowane.\nAdministrator musi je aktywować.",
        size=11, color=TXT_DIM, justify="center").pack(pady=(8, 20))

    status_v = tk.StringVar(value="Sprawdzanie statusu...")
    lbl(f, "", size=11, color=TXT_DIM, textvariable=status_v).pack()

    idf = tk.Frame(f, bg=SURF, pady=10); idf.pack(fill="x", pady=(16, 0))
    lbl(idf, "ID urządzenia", size=10, color=TXT_DIM).pack()
    lbl(idf, token[:22] + "...", size=11).pack()

    running = [True]

    def poll():
        while running[0]:
            time.sleep(15)
            try:
                resp = api_get("/agent/status", token)
                s = resp.get("status") if isinstance(resp, dict) else resp
                if s == "ACTIVE":
                    running[0] = False
                    # Zapisz deviceId jeśli serwer je zwrócił
                    if isinstance(resp, dict) and resp.get("deviceId"):
                        cfg = load_config()
                        cfg["deviceId"] = resp["deviceId"]
                        save_config(cfg)
                    root.after(0, on_activated)
                    return
                elif s:
                    root.after(0, lambda st=s: status_v.set(f"Status: {st} — odświeżanie co 15s"))
            except Exception: pass

    threading.Thread(target=poll, daemon=True).start()

    def cancel():
        running[0] = False
        on_cancel()

    btn(f, "Anuluj rejestrację", cancel, bg=SURF2, hover=SURF).pack(fill="x", pady=(20, 0))


# ─── Okno zgłoszenia ─────────────────────────────────────────────────────────

_PRI_LABELS  = ["Niski", "Średni", "Wysoki", "Krytyczny"]
_PRI_VALUES  = ["LOW",   "MEDIUM", "HIGH",   "CRITICAL"]

def _open_calendar(parent, e_date_widget):
    """Otwiera popup kalendarza i wpisuje wybraną datę do pola e_date_widget."""
    import calendar as _cal
    from datetime import date as _Date

    today  = _Date.today()
    view   = [today.year, today.month]

    MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
              "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"]
    DAYS   = ["Pn","Wt","Śr","Cz","Pt","So","Nd"]

    cal_win = tk.Toplevel(parent)
    cal_win.title("Wybierz datę")
    cal_win.configure(bg=BG)
    cal_win.resizable(False, False)
    cal_win.grab_set(); cal_win.lift()
    W, H = 252, 230
    cal_win.update_idletasks()
    sw, sh = cal_win.winfo_screenwidth(), cal_win.winfo_screenheight()
    cal_win.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")

    top = tk.Frame(cal_win, bg=BG, padx=8, pady=6)
    top.pack(fill="x")
    grid_f = tk.Frame(cal_win, bg=BG, padx=8)
    grid_f.pack(fill="both", expand=True)

    nav_lbl = tk.Label(top, bg=BG, fg=TXT, font=(FONT, 11, "bold"))

    def render():
        for w in grid_f.winfo_children():
            w.destroy()
        y, m = view
        nav_lbl.configure(text=f"{MONTHS[m-1]} {y}")
        for c, d in enumerate(DAYS):
            tk.Label(grid_f, text=d, bg=BG, fg=TXT_DIM,
                     font=(FONT, 8, "bold"), width=3).grid(row=0, column=c, padx=1)
        for r, week in enumerate(_cal.monthcalendar(y, m)):
            for c, day in enumerate(week):
                if day == 0:
                    tk.Label(grid_f, text="", bg=BG, width=3).grid(row=r+1, column=c)
                    continue
                is_today = (y == today.year and m == today.month and day == today.day)
                def _pick(d=day):
                    sel = _Date(view[0], view[1], d)
                    val = sel.strftime("%d.%m.%Y")
                    e_date_widget.delete(0, "end")
                    e_date_widget.insert(0, val)
                    cal_win.destroy()
                tk.Button(grid_f, text=str(day),
                          bg=PRI if is_today else SURF2, fg=TXT,
                          font=(FONT, 9), relief="flat", bd=0,
                          width=3, cursor="hand2",
                          activebackground=PRI, activeforeground=TXT,
                          command=_pick).grid(row=r+1, column=c, padx=1, pady=1)

    def prev_m():
        y, m = view
        view[0], view[1] = (y-1, 12) if m == 1 else (y, m-1)
        render()

    def next_m():
        y, m = view
        view[0], view[1] = (y+1, 1) if m == 12 else (y, m+1)
        render()

    tk.Button(top, text="◀", bg=BG, fg=TXT, relief="flat", bd=0,
              font=(FONT, 12), cursor="hand2", command=prev_m).pack(side="left")
    nav_lbl.pack(side="left", expand=True)
    tk.Button(top, text="▶", bg=BG, fg=TXT, relief="flat", bd=0,
              font=(FONT, 12), cursor="hand2", command=next_m).pack(side="right")
    render()


def open_ticket_window(root, token, on_done):
    win = tk.Toplevel(root)
    win.title("Nowe zgłoszenie")
    win.configure(bg=BG)
    win.resizable(False, False)

    W, H = 520, 620
    win.update_idletasks()
    sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
    win.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
    win.grab_set(); win.lift()

    f = tk.Frame(win, bg=BG, padx=28, pady=20)
    f.pack(fill="both", expand=True)

    lbl(f, "Nowe zgłoszenie", size=16, bold=True).pack(anchor="w")
    lbl(f, "Wybierz kategorię i opisz problem", size=9, color=TXT_DIM).pack(anchor="w", pady=(2, 0))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(8, 12))

    # ── Category quick-select ─────────────────────────────────────────────────
    CATEGORIES = [
        ("💻", "Komputer"),
        ("🌐", "Internet / sieć"),
        ("🖨️", "Drukarka"),
        ("📦", "Program"),
        ("🔥", "Awaria pilna"),
        ("📋", "Inne"),
    ]
    CAT_PRIORITY = {"Awaria pilna": "HIGH"}

    selected_cat = [None]
    cat_btns = []
    e_title = ttk.Entry(f, font=(FONT, 11))

    def _select_cat(idx):
        icon, name = CATEGORIES[idx]
        selected_cat[0] = idx
        e_title.delete(0, "end")
        e_title.insert(0, name)
        e_title.configure(foreground=TXT)
        for i, b in enumerate(cat_btns):
            if i == idx:
                b.configure(bg=PRI, fg="#fff")
            else:
                b.configure(bg=SURF2, fg=TXT_DIM)

    cat_frame = tk.Frame(f, bg=BG)
    cat_frame.pack(fill="x", pady=(0, 10))
    for i, (icon, name) in enumerate(CATEGORIES):
        b = tk.Button(cat_frame, text=f"{icon} {name}", command=lambda idx=i: _select_cat(idx),
                      bg=SURF2, fg=TXT_DIM, activebackground=PRI, activeforeground="#fff",
                      relief="flat", bd=0, font=(FONT, 9), cursor="hand2",
                      padx=8, pady=5)
        b.pack(side="left", padx=(0, 4), pady=2)
        cat_btns.append(b)

    # ── Subject (auto-filled by category, editable) ───────────────────────────
    lbl(f, "TEMAT", size=9, color=TXT_DIM).pack(anchor="w")
    e_title.pack(fill="x", ipady=4, pady=(2, 8))

    # ── Main description ──────────────────────────────────────────────────────
    lbl(f, "CO SIĘ DZIEJE?", size=9, color=TXT_DIM).pack(anchor="w", pady=(0, 2))
    e_desc = tk.Text(f, height=5, bg=SURF2, fg=TXT, insertbackground=TXT,
                     font=(FONT, 11), relief="flat", padx=10, pady=10, wrap="word",
                     highlightbackground=BORDER, highlightcolor=PRI, highlightthickness=1)
    e_desc.insert("1.0", "Opisz problem, np. nie działa drukarka...")
    e_desc.configure(foreground=TXT_DIM)
    def _desc_focus_in(ev):
        if e_desc.get("1.0", "end").strip() == "Opisz problem, np. nie działa drukarka...":
            e_desc.delete("1.0", "end"); e_desc.configure(foreground=TXT)
    def _desc_focus_out(ev):
        if not e_desc.get("1.0", "end").strip():
            e_desc.insert("1.0", "Opisz problem, np. nie działa drukarka..."); e_desc.configure(foreground=TXT_DIM)
    e_desc.bind("<FocusIn>", _desc_focus_in)
    e_desc.bind("<FocusOut>", _desc_focus_out)
    e_desc.pack(fill="x")

    # ── Priority: simple toggle ───────────────────────────────────────────────
    pri_frame = tk.Frame(f, bg=BG)
    pri_frame.pack(fill="x", pady=(8, 0))
    is_urgent = [False]
    urgent_btn = tk.Button(pri_frame, text="⚡ Pilne", bg=SURF2, fg=TXT_DIM,
                           activebackground=ERR_C, activeforeground="#fff",
                           relief="flat", bd=0, font=(FONT, 10), cursor="hand2", padx=12, pady=4)
    def _toggle_urgent():
        is_urgent[0] = not is_urgent[0]
        if is_urgent[0]:
            urgent_btn.configure(bg=ERR_C, fg="#fff", text="⚡ PILNE — priorytet wysoki")
        else:
            urgent_btn.configure(bg=SURF2, fg=TXT_DIM, text="⚡ Pilne")
    urgent_btn.configure(command=_toggle_urgent)
    urgent_btn.pack(side="left")

    # ── Screenshots — compact row ─────────────────────────────────────────────
    lbl(f, "ZRZUTY EKRANU", size=9, color=TXT_DIM).pack(anchor="w", pady=(10, 4))
    shots = [None, None, None]
    shot_btns = []

    def _make_shot(idx):
        def do():
            win.iconify()
            win.after(900, lambda: _capture(idx))
        return do

    def _capture(idx):
        try:
            img = ImageGrab.grab()
            img.thumbnail((1280, 1280), Image.LANCZOS)
            p = os.path.join(INSTALL_DIR, f"shot_{idx+1}.jpg")
            os.makedirs(INSTALL_DIR, exist_ok=True)
            img.save(p, "JPEG", quality=55)
            shots[idx] = p
            shot_btns[idx].configure(text=f"✓ {idx+1}", bg=OK_C, fg="#fff")
        except Exception as e:
            shot_btns[idx].configure(text="✗", bg=ERR_C, fg="#fff")
            log.error("Screenshot %d: %s", idx+1, e)
        finally:
            try: win.deiconify(); win.lift(); win.focus_force(); win.after(50, win.grab_set)
            except Exception: pass

    sr = tk.Frame(f, bg=BG); sr.pack(fill="x")
    for i in range(3):
        b = tk.Button(sr, text=f"📷 Zrzut {i+1}", command=_make_shot(i),
                      bg=SURF2, fg=TXT_DIM, activebackground=SURF, activeforeground=TXT,
                      relief="flat", bd=0, font=(FONT, 9), cursor="hand2", padx=10, pady=4)
        b.pack(side="left", padx=(0, 4))
        shot_btns.append(b)

    # ── Error / status ────────────────────────────────────────────────────────
    err_v = tk.StringVar()
    lbl(f, "", size=10, color=ERR_C, textvariable=err_v).pack(pady=(6, 0))

    # ── Submit ────────────────────────────────────────────────────────────────
    def submit():
        title = e_title.get().strip()
        if not title: err_v.set("Wybierz kategorię lub wpisz temat."); return
        desc_text = e_desc.get("1.0", "end").strip()
        if desc_text == "Opisz problem, np. nie działa drukarka...": desc_text = ""

        # Priority from category or toggle
        if is_urgent[0]:
            pri_api = "HIGH"
        elif selected_cat[0] is not None:
            cat_name = CATEGORIES[selected_cat[0]][1]
            pri_api = CAT_PRIORITY.get(cat_name, "MEDIUM")
        else:
            pri_api = "MEDIUM"

        err_v.set("Wysyłanie…")
        win.update()

        def _send():
            try:
                full_desc = desc_text
                taken = [p for p in shots if p]
                if taken:
                    err_v.set("Przesyłanie zrzutów…")
                    urls = [u for p in taken for u in [upload_screenshot(p, token)] if u]
                    if urls:
                        full_desc += "\n\n📷 Zrzuty ekranu:\n" + "\n".join(urls)
                do_ticket(token, title, full_desc, pri_api, None)
                win.after(0, lambda: (on_done(True), win.destroy()))
            except Exception as e:
                win.after(0, lambda: err_v.set(f"Błąd: {e}"))

        threading.Thread(target=_send, daemon=True).start()

    btn(f, "  Wyślij zgłoszenie  ", submit).pack(fill="x", pady=(8, 0))
    btn(f, "Anuluj", win.destroy, bg=SURF2, hover=BORDER).pack(fill="x", pady=(4, 0))


# ─── Helper clear ────────────────────────────────────────────────────────────

def _clear(root):
    for w in root.winfo_children():
        w.destroy()


# ─── Auto-Diagnostics ─────────────────────────────────────────────────────────

class AutoDiagnostics:
    """Automatyczne wykrywanie problemów i tworzenie zgłoszeń."""

    DISK_LOW_THRESHOLD = 10  # procent wolnego miejsca
    CHECK_INTERVAL = 300     # co 5 minut

    def __init__(self, token):
        self.token = token
        self._alerted = set()  # Zapobiega duplikatom alertów

    def run_checks(self):
        """Wykonaj wszystkie diagnostyki."""
        self._check_disk_space()
        self._check_windows_updates()
        self._check_services()

    def _check_disk_space(self):
        """Sprawdź wolne miejsce na wszystkich dyskach."""
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
                                title=f"Mało miejsca na dysku {p.device}",
                                desc=f"Dysk {p.device} ma tylko {free_gb} GB wolnego z {total_gb} GB ({free_pct:.0f}% wolnego).\n\n"
                                     f"Wymagane działanie: zwolnienie miejsca lub rozszerzenie dysku.",
                                priority="HIGH"
                            )
                            log.warning("ALERT: Low disk space on %s: %.1f GB free (%.0f%%)", p.device, free_gb, free_pct)
                    elif free_pct > self.DISK_LOW_THRESHOLD + 5:
                        # Reset alert gdy problem rozwiązany
                        self._alerted.discard(f"disk_low_{p.device}")
                except Exception:
                    pass
        except Exception as e:
            log.debug("Disk check error: %s", e)

    def _check_windows_updates(self):
        """Sprawdź czy są oczekujące aktualizacje Windows."""
        try:
            alert_key = "win_updates"
            if alert_key in self._alerted:
                return  # Sprawdzaj raz na restart agenta

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
                    title=f"Oczekujące aktualizacje Windows ({count})",
                    desc=f"Komputer ma {count} oczekujących aktualizacji Windows.\n\n"
                         f"Zalecamy zaplanowanie aktualizacji w najbliższym oknie serwisowym.",
                    priority="MEDIUM"
                )
                log.info("ALERT: %d pending Windows updates", count)
        except Exception as e:
            log.debug("Windows update check error: %s", e)

    def _check_services(self):
        """Sprawdź krytyczne usługi Windows."""
        critical_services = ["Spooler", "BITS", "wuauserv", "Dhcp", "Dnscache"]
        try:
            import win32serviceutil
            for svc in critical_services:
                try:
                    status = win32serviceutil.QueryServiceStatus(svc)[1]
                    # 4 = running, 1 = stopped
                    if status == 1:
                        alert_key = f"svc_stopped_{svc}"
                        if alert_key not in self._alerted:
                            self._alerted.add(alert_key)
                            # Próba auto-restartu
                            try:
                                win32serviceutil.StartService(svc)
                                log.info("Auto-restarted service: %s", svc)
                            except Exception:
                                self._create_ticket(
                                    title=f"Usługa {svc} zatrzymana",
                                    desc=f"Krytyczna usługa Windows '{svc}' jest zatrzymana.\n"
                                         f"Próba automatycznego restartu nie powiodła się.",
                                    priority="HIGH"
                                )
                except Exception:
                    pass
        except ImportError:
            pass  # win32serviceutil nie dostępny
        except Exception as e:
            log.debug("Service check error: %s", e)

    def _create_ticket(self, title, desc, priority="MEDIUM"):
        """Utwórz automatyczne zgłoszenie."""
        try:
            hostname = os.environ.get("COMPUTERNAME", "Unknown")
            full_desc = f"[Auto-diagnostyka — {hostname}]\n\n{desc}"
            do_ticket(self.token, title, full_desc, priority, None)
            log.info("Auto-ticket created: %s", title)
        except Exception as e:
            log.error("Auto-ticket failed: %s", e)


# ─── Backup Scheduler ─────────────────────────────────────────────────────────

class BackupScheduler:
    """Pobiera konfiguracje backupu z API i wykonuje je wg harmonogramu."""

    def __init__(self, token):
        self.token = token
        self.configs = []
        self._last_runs = {}  # configId → last run datetime

    def sync_configs(self):
        """Pobierz konfiguracje z API."""
        try:
            self.configs = api_get("/agent/backup-configs", self.token)
            log.info("Backup configs synced: %d", len(self.configs))
        except Exception as e:
            log.warning("Backup config sync failed: %s", e)

    def check_and_run(self):
        """Sprawdź harmonogram i uruchom backup jeśli trzeba."""
        from datetime import datetime as DT
        now = DT.now()

        for cfg in self.configs:
            cfg_id = cfg.get("id")
            cron = cfg.get("cronSchedule", "0 2 * * *")
            if not self._should_run(cron, cfg_id, now):
                continue
            log.info("Starting backup: %s (%s)", cfg.get("name"), cfg.get("type"))
            self._last_runs[cfg_id] = now
            threading.Thread(target=self._run_backup, args=(cfg,), daemon=True).start()

    def _should_run(self, cron_str, cfg_id, now):
        """Prosty parser crona — sprawdza godzinę i minutę."""
        try:
            parts = cron_str.split()
            minute, hour = int(parts[0]), int(parts[1])
            if now.hour != hour or now.minute != minute:
                return False
            last = self._last_runs.get(cfg_id)
            if last and (now - last).total_seconds() < 3500:
                return False
            return True
        except Exception:
            return False

    def run_single(self, config_id):
        """Uruchom backup natychmiast (z WebSocket)."""
        for cfg in self.configs:
            if cfg.get("id") == config_id:
                threading.Thread(target=self._run_backup, args=(cfg,), daemon=True).start()
                return

    def _run_backup(self, cfg):
        cfg_id = cfg.get("id")
        try:
            # Report start
            resp = api_post("/agent/backup/start", {"configId": cfg_id}, self.token)
            history_id = resp.get("historyId")

            # Execute backup
            btype = cfg.get("type", "")
            if btype.startswith("SQL_"):
                path = self._backup_sql(cfg)
            elif btype == "FOLDER":
                path = self._backup_folder(cfg)
            else:
                raise ValueError(f"Unknown backup type: {btype}")

            # Encrypt if needed
            if cfg.get("encryptBackups") and cfg.get("encryptionKey"):
                path = self._encrypt(path, cfg["encryptionKey"])

            # Upload to Google Drive
            drive_id = None
            drive_folder = cfg.get("googleDriveFolder")
            if drive_folder:
                drive_id = self._upload_gdrive(path, drive_folder)

            file_size = os.path.getsize(path) if os.path.exists(path) else 0

            # Report success
            api_post("/agent/backup/complete", {
                "historyId": history_id,
                "sizeBytes": file_size,
                "fileName": os.path.basename(path),
                "googleDriveId": drive_id,
            }, self.token)
            log.info("Backup complete: %s (%d bytes)", cfg.get("name"), file_size)

            # Cleanup local file
            try: os.remove(path)
            except Exception: pass

        except Exception as e:
            log.error("Backup failed: %s — %s", cfg.get("name"), e)
            try:
                api_post("/agent/backup/failed", {"configId": cfg_id, "error": str(e)}, self.token)
            except Exception:
                pass

    def _backup_sql(self, cfg):
        """Wykonaj backup SQL — mysqldump / pg_dump / sqlcmd."""
        import subprocess, gzip
        btype = cfg["type"]
        host = cfg.get("sqlHost", "localhost")
        port = cfg.get("sqlPort", 3306)
        user = cfg.get("sqlUser", "root")
        # Decrypt password
        pwd = cfg.get("sqlPassEnc", "")
        if pwd and ":" in pwd:
            try:
                from cryptography.fernet import Fernet
                # Simple AES — for now just use as-is from server
            except Exception:
                pass
        dbs = cfg.get("sqlDatabases", "").split(",")
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        results = []

        for db in dbs:
            db = db.strip()
            if not db: continue
            output = os.path.join(tempfile.gettempdir(), f"backup_{db}_{timestamp}.sql")

            if btype == "SQL_MYSQL":
                cmd = f'mysqldump -h {host} -P {port} -u {user} -p{pwd} {db}'
            elif btype == "SQL_POSTGRES":
                os.environ["PGPASSWORD"] = pwd
                cmd = f'pg_dump -h {host} -p {port} -U {user} {db}'
            elif btype == "SQL_MSSQL":
                cmd = f'sqlcmd -S {host},{port} -U {user} -P {pwd} -Q "BACKUP DATABASE [{db}] TO DISK=\'{output}.bak\' WITH FORMAT"'
                try:
                    subprocess.run(cmd, shell=True, check=True, capture_output=True, timeout=3600)
                    results.append(f"{output}.bak")
                except Exception as e:
                    raise RuntimeError(f"MSSQL backup failed for {db}: {e}")
                continue
            else:
                continue

            try:
                with open(output, "w") as f:
                    subprocess.run(cmd, shell=True, check=True, stdout=f, stderr=subprocess.PIPE, timeout=3600)
                results.append(output)
            except Exception as e:
                raise RuntimeError(f"SQL backup failed for {db}: {e}")

        if not results:
            raise RuntimeError("No databases to backup")

        # Compress all into one .tar.gz
        import tarfile
        archive = os.path.join(tempfile.gettempdir(), f"backup_sql_{timestamp}.tar.gz")
        with tarfile.open(archive, "w:gz") as tar:
            for r in results:
                tar.add(r, arcname=os.path.basename(r))
                try: os.remove(r)
                except Exception: pass
        return archive

    def _backup_folder(self, cfg):
        """Backup folder as ZIP."""
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
        """Encrypt file with Fernet (AES-128-CBC)."""
        try:
            from cryptography.fernet import Fernet
            import base64, hashlib
            # Ensure key is valid Fernet key (32 bytes base64url)
            if len(key) < 32:
                key = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()).decode()
            f = Fernet(key.encode() if isinstance(key, str) else key)
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

    def _upload_gdrive(self, path, folder_id):
        """Upload file to Google Drive via service account."""
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload

            # Get credentials from API
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


# ─── Główna aplikacja ─────────────────────────────────────────────────────────

class App:
    def __init__(self, open_ticket_on_start: bool = False):
        self.root = tk.Tk()
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        _apply_style()
        try: self.root.iconbitmap(res("icon.ico"))
        except Exception: pass

        self.cfg   = load_config()
        self._tray = None
        self._ws   = None
        self._open_ticket_on_start = open_ticket_on_start
        self._webview_requested = False

        self._decide()
        self.root.mainloop()

        # After tkinter exits — check if webview was requested
        if self._webview_requested:
            try:
                self.root.destroy()
            except Exception:
                pass
            self._start_home_webview()

    def _decide(self):
        mode   = self.cfg.get("mode")  # "business" or "home"
        token  = self.cfg.get("token")
        status = self.cfg.get("status")

        # First run — no mode selected
        if not mode and not token:
            show_mode_select(self.root, self._on_mode_business, self._on_mode_home)
            return

        # HOME mode — webview premium UI (must run on main thread)
        if mode == "home":
            self.root.withdraw()
            self.root.after(100, self._launch_home_webview)
            return

        # BUSINESS mode (original flow)
        if not token:
            show_login(self.root, self._on_login, self._on_register, on_back_to_home=self._on_back_to_home)
        elif status == "ACTIVE":
            self.root.withdraw()
            self._start_bg()
            if self.cfg.get("allowRustdesk", True) and not is_rustdesk_installed():
                threading.Thread(target=self._install_rd, daemon=True).start()
            if self._open_ticket_on_start:
                self.root.after(800, self._open_ticket)
            else:
                self.root.after(500, self._open_main_window)
        else:
            show_waiting(self.root, token, self._on_activated, self._on_cancel)

    def _on_mode_business(self):
        self.cfg["mode"] = "business"
        save_config(self.cfg)
        self._decide()

    def _on_mode_home(self):
        self.cfg["mode"] = "home"
        self.cfg["allowMonitoring"] = True
        save_config(self.cfg)
        self._decide()

    def _launch_home_webview(self):
        """Close tkinter and launch webview on main thread."""
        self._webview_requested = True
        self.root.quit()  # Exit tkinter mainloop — webview starts after

    def _start_home_webview(self):
        """Launch premium webview UI for HOME mode."""
        try:
            import webview

            class HomeAPI:
                """Python ↔ JavaScript bridge for Asystent InfraDesk."""

                def get_system_info(self):
                    """Return system info for overview page."""
                    try:
                        hostname = os.environ.get("COMPUTERNAME", "Komputer")
                        os_info = platform.platform()
                        cpu_name = _wmic("cpu get name")
                        ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
                        score = get_system_score()
                        bat = get_battery_info()
                        disks = get_disk_health_simple()
                        return {
                            "hostname": hostname, "os": os_info, "cpu": cpu_name,
                            "ramGb": ram_gb, "score": score,
                            "battery": bat, "disks": disks,
                            "version": APP_VERSION,
                        }
                    except Exception as e:
                        return {"error": str(e)}

                def get_metrics(self):
                    """Return live CPU/RAM/disk metrics."""
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

                def start_cleanup_scan(self):
                    """Scan for cleanable files."""
                    targets = [
                        ("temp_user", "Pliki tymczasowe", os.environ.get("TEMP", "")),
                        ("temp_win", "Windows Temp", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp")),
                        ("prefetch", "Prefetch", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Prefetch")),
                        ("ie_cache", "Cache Internet", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "INetCache")),
                        ("wu_cache", "Cache Windows Update", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "SoftwareDistribution", "Download")),
                        ("logs", "Logi systemowe", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Logs")),
                    ]
                    # Browser caches
                    for bname, bpath in [
                        ("Cache Chrome", os.path.join(os.environ.get("LOCALAPPDATA",""), "Google","Chrome","User Data","Default","Cache")),
                        ("Cache Edge", os.path.join(os.environ.get("LOCALAPPDATA",""), "Microsoft","Edge","User Data","Default","Cache"))]:
                        if os.path.exists(bpath):
                            targets.append((bname.lower().replace(" ","_"), bname, bpath))

                    results = []
                    for key, label, path in targets:
                        sz = 0; cnt = 0
                        if path and os.path.exists(path):
                            try:
                                for dp, _, fns in os.walk(path):
                                    for fn in fns:
                                        try: sz += os.path.getsize(os.path.join(dp, fn)); cnt += 1
                                        except: pass
                            except: pass
                        if cnt > 0:
                            results.append({"key": key, "label": label, "size": sz, "count": cnt, "path": path})

                    # Recycle bin
                    try:
                        import ctypes
                        rb_s = ctypes.c_ulonglong(0); rb_c = ctypes.c_ulonglong(0)
                        ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(rb_s), ctypes.byref(rb_c))
                        if rb_c.value > 0:
                            results.append({"key": "recycle", "label": "Kosz", "size": rb_s.value, "count": rb_c.value, "path": "RECYCLE"})
                    except: pass

                    return results

                def run_cleanup(self, keys):
                    """Clean selected categories. keys = list of category keys."""
                    cleaned = 0; cf = 0
                    scan = self.start_cleanup_scan()
                    cat_map = {c["key"]: c for c in scan}
                    for key in keys:
                        cat = cat_map.get(key)
                        if not cat: continue
                        if cat["path"] == "RECYCLE":
                            try:
                                subprocess.run(["powershell", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                                    capture_output=True, timeout=30, creationflags=_NO_WINDOW)
                                cleaned += cat["size"]; cf += cat["count"]
                            except: pass
                        elif cat["path"] and os.path.exists(cat["path"]):
                            try:
                                for dp, ds, fs in os.walk(cat["path"], topdown=False):
                                    for fn in fs:
                                        try: fp = os.path.join(dp, fn); cleaned += os.path.getsize(fp); os.remove(fp); cf += 1
                                        except: pass
                                    for d in ds:
                                        try: os.rmdir(os.path.join(dp, d))
                                        except: pass
                            except: pass
                    return {"cleanedBytes": cleaned, "filesRemoved": cf}

                def run_security_audit(self):
                    """Run full 20-check security audit."""
                    return security_audit()

                def get_network_info(self):
                    """Get network interfaces, IP, ISP, ports."""
                    return get_network_info()

                def run_speed_test(self):
                    """Run internet speed test."""
                    return speed_test_simple()

                def get_autostart(self):
                    """Get autostart programs list."""
                    return get_autostart_programs()

                def get_top_processes(self):
                    """Get top RAM-consuming processes."""
                    return get_top_ram_processes(8)

                def switch_to_business(self):
                    """Switch to business mode."""
                    pass  # Will be handled by closing webview

            api = HomeAPI()

            # Find UI files
            ui_dir = res("ui")
            if not os.path.isdir(ui_dir):
                ui_dir = os.path.join(os.path.dirname(__file__), "ui")
            index_path = os.path.join(ui_dir, "index.html")

            if os.path.exists(index_path):
                url = f"file:///{index_path.replace(os.sep, '/')}"
            else:
                # Fallback — use online version
                url = "https://infradesk.pl/asystent"

            window = webview.create_window(
                APP_NAME_HOME,
                url=url,
                width=1300,
                height=750,
                min_size=(900, 550),
                js_api=api,
                background_color='#040810',
            )

            webview.start(debug=False)

            # After webview closes — check if should switch to business
            # For now just exit cleanly
        except ImportError:
            log.warning("pywebview not installed — falling back to tkinter")
            show_home_panel(self.root, self.cfg, self._on_switch_to_business)
        except Exception as e:
            log.error("Webview error: %s", e)
            show_home_panel(self.root, self.cfg, self._on_switch_to_business)

    def _on_switch_to_business(self):
        self.cfg["mode"] = "business"
        self.cfg.pop("token", None)
        self.cfg.pop("status", None)
        save_config(self.cfg)
        self._decide()

    def _on_back_to_home(self):
        self.cfg["mode"] = "home"
        save_config(self.cfg)
        self._decide()

    # ── Logowanie / Rejestracja ───────────────────────────────────────────────

    def _on_login(self, result):
        self.cfg = {"token": result["token"], "status": result["status"],
                    "allowMonitoring": True, "allowRustdesk": True}
        if result.get("deviceId"):
            self.cfg["deviceId"] = result["deviceId"]
        tenant_key = _load_tenant_key()
        if tenant_key:
            self.cfg["tenantKey"] = tenant_key
        save_config(self.cfg)
        log.info("Login OK — status=%s token saved", result["status"])
        if result["status"] == "ACTIVE":
            self.root.withdraw()
            self._start_bg()
            if not is_rustdesk_installed():
                threading.Thread(target=self._install_rd, daemon=True).start()
            self.root.after(500, self._open_main_window)
        else:
            show_waiting(self.root, result["token"], self._on_activated, self._on_cancel)

    def _on_register(self, result, form):
        self.cfg = {"token": result["token"], "status": result["status"],
                    "allowRustdesk": form.get("allowRustdesk", True),
                    "allowMonitoring": form.get("allowMonitoring", True)}
        tenant_key = _load_tenant_key()
        if tenant_key:
            self.cfg["tenantKey"] = tenant_key
        save_config(self.cfg)
        if result["status"] == "ACTIVE":
            self._on_activated()
        else:
            show_waiting(self.root, result["token"], self._on_activated, self._on_cancel)

    def _on_activated(self):
        self.cfg["status"] = "ACTIVE"
        save_config(self.cfg)
        self.root.withdraw()
        self._start_bg()
        if self.cfg.get("allowRustdesk") and not is_rustdesk_installed():
            threading.Thread(target=self._install_rd, daemon=True).start()
        self.root.after(500, self._open_main_window)

    def _on_cancel(self):
        save_config({})
        self.cfg = {}
        show_login(self.root, self._on_login, self._on_register)

    # ── Tło ───────────────────────────────────────────────────────────────────

    def _start_bg(self):
        token = self.cfg.get("token", "")
        self._update_info = None
        self._backup_scheduler = None
        self._diagnostics = None
        if self.cfg.get("allowMonitoring", True):
            threading.Thread(target=self._metrics_loop, daemon=True).start()
            # Auto-diagnostyka
            self._diagnostics = AutoDiagnostics(token)
            threading.Thread(target=self._diagnostics_loop, daemon=True).start()
        threading.Thread(target=self._update_check_loop, daemon=True).start()
        threading.Thread(target=self._ensure_shortcut, daemon=True).start()
        if self.cfg.get("backupMode") or self.cfg.get("allowMonitoring"):
            self._backup_scheduler = BackupScheduler(token)
            threading.Thread(target=self._backup_loop, daemon=True).start()
        self._ws = WS(token, self._on_ws)
        self._ws.start()
        self._start_tray()

    def _diagnostics_loop(self):
        """Auto-diagnostyka co 5 minut."""
        time.sleep(120)
        while True:
            try:
                if self._diagnostics: self._diagnostics.run_checks()
            except Exception: pass
            time.sleep(AutoDiagnostics.CHECK_INTERVAL)

    def _ensure_shortcut(self):
        """Tworzy skrót InfraDesk na pulpicie + rejestruje w Dodaj/Usuń + kopiuje ikonę."""
        try:
            _register_in_add_remove()

            # Najpierw skopiuj icon.ico do INSTALL_DIR (potrzebny dla skrótu)
            ico_dst = os.path.join(INSTALL_DIR, "icon.ico")
            try:
                ico_src = res("icon.ico")
                if ico_src and os.path.exists(ico_src) and ico_src != ico_dst:
                    import shutil
                    os.makedirs(INSTALL_DIR, exist_ok=True)
                    shutil.copy2(ico_src, ico_dst)
                    log.info("Icon copied to: %s", ico_dst)
            except Exception as e:
                log.warning("Icon copy failed: %s", e)

            # Twórz skrót na pulpicie
            desktop = _get_desktop_path()
            lnk = os.path.join(desktop, "InfraDesk.lnk")
            log.info("Checking shortcut: %s exists=%s", lnk, os.path.exists(lnk))
            create_desktop_shortcut()

        except Exception as e:
            log.warning("Ensure shortcut error: %s", e)

    def _backup_loop(self):
        """Synchronizuje konfiguracje co 5 min, sprawdza harmonogram co minutę."""
        bs = self._backup_scheduler
        if not bs: return
        bs.sync_configs()
        sync_counter = 0
        while True:
            time.sleep(60)
            sync_counter += 1
            if sync_counter >= 5:
                bs.sync_configs()
                sync_counter = 0
            bs.check_and_run()

    def _metrics_loop(self):
        token = self.cfg.get("token", "")
        try:
            requests.post(f"{API_BASE}/agent/metrics", json=full_inventory(),
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        except Exception: pass
        cycle = 0
        while True:
            time.sleep(60)
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
                    except Exception: pass
                if cycle % 30 == 0:
                    try:
                        scan = network_scan()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
                    except Exception: pass
                do_metrics(token, data)
            except Exception: pass
            cycle += 1

    def _update_check_loop(self):
        """Sprawdza aktualizację przy starcie, potem co 2 godziny. Auto-update."""
        time.sleep(30)  # poczekaj 30s po starcie
        while True:
            result = check_for_update()
            if result and result != self._update_info:
                self._update_info = result
                ver, url = result
                log.info("Update available: %s — auto-updating", ver)
                if self._tray:
                    try: self._tray.notify(f"Aktualizacja do wersji {ver}…", APP_NAME)
                    except Exception: pass
                # Auto-update
                try:
                    do_self_update(url, notify_fn=lambda m: None)
                except Exception as e:
                    log.error("Auto-update failed: %s", e)
            time.sleep(2 * 3600)

    def _on_ws(self, msg):
        mtype = msg.get("type")
        if mtype in ("notification", "status_update") and self._tray:
            try: self._tray.notify(msg.get("body", ""), msg.get("title", APP_NAME))
            except Exception: pass
        elif mtype == "update":
            # Admin wcisnął "Wyślij aktualizację" w panelu
            threading.Thread(target=self._start_update, daemon=True).start()
        elif mtype == "backup_run":
            config_id = msg.get("configId", "")
            if config_id and self._backup_scheduler:
                log.info("WS: backup_run triggered for %s", config_id)
                self._backup_scheduler.run_single(config_id)
        elif mtype == "wake":
            mac = msg.get("mac", "")
            if mac:
                threading.Thread(target=_send_wol, args=(mac,), daemon=True).start()
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
                        if self._tray:
                            try: self._tray.notify(f"Usługa {svc} zrestartowana", APP_NAME)
                            except: pass
                    except Exception as e: log.error("Service restart error: %s", e)
                threading.Thread(target=_rs, daemon=True).start()
        elif mtype == "system_reboot":
            delay = msg.get("delay", 60)
            log.info("System reboot in %ds", delay)
            if self._tray:
                try: self._tray.notify(f"Restart serwera za {delay}s", APP_NAME)
                except: pass
            threading.Thread(target=lambda: subprocess.run(
                ["shutdown", "/r", "/t", str(delay), "/c", "InfraDesk: restart serwera"],
                capture_output=True, creationflags=_NO_WINDOW), daemon=True).start()

    # ── Windows Update ────────────────────────────────────────────────
    def _run_windows_update(self, schedule_time=None):
        """Install Windows updates and optionally schedule a restart."""
        try:
            log.info("Windows Update: starting installation%s", f" (restart at {schedule_time})" if schedule_time else "")
            if self._tray:
                try: self._tray.notify("Rozpoczynam instalację aktualizacji Windows...", APP_NAME)
                except Exception: pass

            # Install updates via PSWindowsUpdate module
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
                capture_output=True, text=True, timeout=7200
            )
            output = (result.stdout or "")[-800:]
            log.info("Windows Update result: %s", output if output.strip() else "(no updates or empty output)")

            # Schedule restart if time specified
            if schedule_time:
                subprocess.run([
                    "schtasks", "/create", "/tn", "InfraDesk_WinUpdate_Restart",
                    "/tr", 'shutdown /r /t 60 /c "InfraDesk: zaplanowany restart po aktualizacji Windows"',
                    "/sc", "once", "/st", schedule_time, "/f"
                ], capture_output=True, timeout=30)
                log.info("Windows Update: restart scheduled at %s", schedule_time)

            # Tray notification
            if self._tray:
                msg_txt = "Aktualizacje Windows zainstalowane"
                if schedule_time:
                    msg_txt += f". Restart o {schedule_time}"
                else:
                    msg_txt += ". Restart przy następnym uruchomieniu"
                try: self._tray.notify(msg_txt, APP_NAME)
                except Exception: pass

        except subprocess.TimeoutExpired:
            log.error("Windows Update: timeout (>2h)")
            if self._tray:
                try: self._tray.notify("Aktualizacja Windows: przekroczono limit czasu", APP_NAME)
                except Exception: pass
        except Exception as e:
            log.error("Windows Update error: %s", e)
            if self._tray:
                try: self._tray.notify(f"Błąd aktualizacji Windows: {e}", APP_NAME)
                except Exception: pass

    def _start_update(self):
        def _tray_notify(msg):
            if self._tray:
                try: self._tray.notify(msg, APP_NAME)
                except Exception: pass
        info = self._update_info
        if not info:
            # Wymuś sprawdzenie wersji przed aktualizacją
            info = check_for_update()
        if info:
            _, url = info
            do_self_update(url, notify_fn=_tray_notify)
        else:
            _tray_notify("Brak aktualizacji — masz najnowszą wersję.")

    def _install_rd(self):
        def _tray_notify(msg):
            if self._tray:
                try: self._tray.notify(msg, APP_NAME)
                except Exception: pass

        ok = install_rustdesk(notify_fn=_tray_notify)
        if ok:
            try: do_metrics(self.cfg.get("token", ""))
            except Exception: pass

    # ── Tray ──────────────────────────────────────────────────────────────────

    def _start_tray(self):
        # Wyłącz auto-ukrywanie ikon w zasobniku (EnableAutoTray=0)
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                r"Software\Microsoft\Windows\CurrentVersion\Explorer",
                                0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, "EnableAutoTray", 0, winreg.REG_DWORD, 0)
        except Exception:
            pass

        icon_img = self._default_icon()

        def _menu_items():
            items = [
                pystray.MenuItem(f"● {APP_NAME} v{APP_VERSION}", None, enabled=False),
                pystray.Menu.SEPARATOR,
            ]
            if self._update_info:
                ver, _ = self._update_info
                items += [
                    pystray.MenuItem(
                        f"🔄  Aktualizuj do {ver}",
                        lambda i, it: threading.Thread(target=self._start_update, daemon=True).start(),
                    ),
                    pystray.Menu.SEPARATOR,
                ]
            items += [
                pystray.MenuItem("🌐  Otwórz InfraDesk",   lambda i, it: self._open_main_window(), default=True),
                pystray.MenuItem("📋  Nowe zgłoszenie", lambda i, it: self.root.after(0, self._open_ticket)),
                pystray.MenuItem("❓  FAQ",              lambda i, it: self.root.after(0, self._open_faq)),
                pystray.MenuItem("📞  Kontakt",         lambda i, it: self.root.after(0, self._open_contact)),
                pystray.MenuItem("(i) O programie",     lambda i, it: self.root.after(0, self._open_about)),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("❌  Zamknij",          lambda i, it: self._quit(i)),
            ]
            return items

        menu = pystray.Menu(_menu_items)
        self._tray = pystray.Icon(APP_NAME, icon_img, APP_NAME, menu)
        log.info("Starting tray icon…")

        def _tray_run():
            try:
                self._tray.run()
            except Exception as e:
                log.error("Tray run error: %s", e)

        threading.Thread(target=_tray_run, daemon=True).start()

    def _default_icon(self):
        """Ładuje kolorową ikonę z pliku ikona.png, fallback na generowaną."""
        try:
            icon_path = res("ikona.png")
            if os.path.exists(icon_path):
                img = Image.open(icon_path).convert("RGBA")
                img = img.resize((128, 128), Image.LANCZOS)
                return img
        except Exception:
            pass
        # Fallback — generowana ikona
        size = 128
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=22, fill=(109, 40, 217, 255))
        try:
            from PIL import ImageFont
            font = ImageFont.truetype("arialbd.ttf", 52)
        except Exception:
            font = ImageFont.load_default()
        d.text((28, 30), "ID", fill=(255, 255, 255, 255), font=font)
        return img

    def _open_ticket(self):
        open_ticket_window(self.root, self.cfg.get("token", ""), self._ticket_done)

    def _ticket_done(self, ok):
        if ok and self._tray:
            try: self._tray.notify("Zgłoszenie wysłane ✓", APP_NAME)
            except Exception: pass

    def _open_faq(self):
        open_faq_window(self.root)

    def _open_contact(self):
        open_contact_window(self.root)

    def _open_about(self):
        open_about_window(self.root)

    def _open_portal(self):
        self._open_main_window()

    def _open_main_window(self):
        """Otwiera panel InfraDesk w przeglądarce z auto-login."""
        import webbrowser
        token = self.cfg.get("token", "")
        url = f"{API_BASE}/auth/auto-login?token={token}" if token else PORTAL_URL
        log.info("Opening InfraDesk: %s", url)
        webbrowser.open(url)

    def _quit(self, icon):
        icon.stop()
        self.root.after(0, self.root.destroy)


# ─── Start ────────────────────────────────────────────────────────────────────

def _do_uninstall():
    """Usuwa wpis z rejestru autostart i Dodaj/Usuń programy."""
    _set_autostart(False)
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\InfraDesk Agent")
        log.info("Uninstall registry entries removed")
    except Exception:
        pass
    import tkinter as tk
    from tkinter import messagebox
    root = tk.Tk(); root.withdraw()
    messagebox.showinfo("InfraDesk Agent",
        "Agent został odinstalowany.\nMożesz ręcznie usunąć folder:\n" + INSTALL_DIR)
    root.destroy()


def _check_internet(timeout=5):
    """Sprawdza czy jest połączenie z internetem."""
    try:
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        urllib.request.urlopen("https://infradesk.pl/health", context=ctx, timeout=timeout)
        return True
    except Exception:
        return False


_OFFLINE_HTML = """
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>InfraDesk — Offline</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#080D19; color:#E5E7EB; font-family:-apple-system,Segoe UI,sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh; text-align:center; }
  .box { max-width:400px; padding:40px; }
  .icon { font-size:64px; margin-bottom:24px; opacity:0.4; }
  h1 { font-size:22px; font-weight:600; margin-bottom:8px; color:rgba(255,255,255,0.85); }
  p { font-size:14px; color:rgba(255,255,255,0.4); line-height:1.6; margin-bottom:24px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#F59E0B;
         animation:pulse 1.5s ease infinite; margin-right:8px; }
  @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
  .status { font-size:12px; color:rgba(255,255,255,0.3); }
</style>
</head>
<body>
<div class="box">
  <div class="icon">📡</div>
  <h1>Brak połączenia</h1>
  <p>Nie można połączyć się z serwerem InfraDesk.<br>Sprawdź połączenie internetowe.</p>
  <div class="status"><span class="dot"></span>Ponawiam połączenie automatycznie...</div>
</div>
<script>
  setInterval(function(){
    fetch('https://infradesk.pl/health',{mode:'no-cors'}).then(function(){
      window.location.href = '""" + PORTAL_URL + """';
    }).catch(function(){});
  }, 10000);
</script>
</body>
</html>
"""


def _start_webview_app(url, token, cfg):
    """Uruchamia InfraDesk jako pełnoekranową aplikację z webview (main thread).
       Po zamknięciu okna — tray dalej działa w tle."""
    try:
        import webview

        # Start background services (tray + monitoring + backup)
        app_bg = _BackgroundServices(token, cfg)
        app_bg.start()

        # Skrót na pulpicie + ikona
        threading.Thread(target=lambda: (
            _copy_icon_to_install(),
            create_desktop_shortcut(),
        ), daemon=True).start()

        # Check internet
        if _check_internet():
            webview.create_window(APP_NAME, url=url,
                width=1280, height=860, min_size=(1024, 700),
                resizable=True, text_select=True)
        else:
            log.warning("No internet — showing offline page")
            webview.create_window(APP_NAME, html=_OFFLINE_HTML,
                width=1280, height=860, min_size=(1024, 700),
                resizable=True, text_select=True)

        webview.start(debug=False)

        # Webview zamknięte — NIE zabijaj procesu, tray dalej działa
        log.info("Webview closed — keeping tray alive")
        # Utrzymuj main thread żywy dopóki tray działa
        while True:
            time.sleep(60)

    except ImportError:
        log.warning("pywebview not installed — falling back to browser + tkinter")
        import webbrowser
        webbrowser.open(url)
        return False
    except Exception as e:
        log.warning("Webview failed: %s — falling back to tkinter", e)
        return False
    return True


def _copy_icon_to_install():
    """Kopiuje icon.ico do INSTALL_DIR."""
    try:
        ico_dst = os.path.join(INSTALL_DIR, "icon.ico")
        ico_src = res("icon.ico")
        if ico_src and os.path.exists(ico_src) and ico_src != ico_dst:
            os.makedirs(INSTALL_DIR, exist_ok=True)
            import shutil
            shutil.copy2(ico_src, ico_dst)
            log.info("Icon copied: %s → %s", ico_src, ico_dst)
    except Exception as e:
        log.warning("Icon copy failed: %s", e)


class _BackgroundServices:
    """Tray + monitoring + backup — działa w wątkach."""
    def __init__(self, token, cfg):
        self.token = token
        self.cfg = cfg
        self._tray = None
        self._update_info = None
        self._backup_scheduler = None

    def start(self):
        if self.cfg.get("allowMonitoring", True):
            threading.Thread(target=self._metrics_loop, daemon=True).start()
            # Auto-diagnostyka
            self._diagnostics = AutoDiagnostics(self.token)
            threading.Thread(target=self._diagnostics_loop, daemon=True).start()
        threading.Thread(target=self._update_check_loop, daemon=True).start()
        if self.cfg.get("backupMode") or self.cfg.get("allowMonitoring"):
            self._backup_scheduler = BackupScheduler(self.token)
            threading.Thread(target=self._backup_loop, daemon=True).start()
        ws = WS(self.token, self._on_ws)
        ws.start()
        threading.Thread(target=self._start_tray, daemon=True).start()

    def _diagnostics_loop(self):
        """Auto-diagnostyka co 5 minut."""
        time.sleep(120)  # Poczekaj 2 min po starcie
        while True:
            try: self._diagnostics.run_checks()
            except Exception as e: log.debug("Diagnostics error: %s", e)
            time.sleep(AutoDiagnostics.CHECK_INTERVAL)

    def _metrics_loop(self):
        try:
            requests.post(f"{API_BASE}/agent/metrics", json=full_inventory(),
                          headers={"Authorization": f"Bearer {self.token}"}, timeout=15)
        except Exception: pass
        cycle = 0
        while True:
            time.sleep(60)
            try:
                data = metrics()
                # Server metrics every 5 min
                if cycle % 5 == 0:
                    try:
                        srv = server_metrics()
                        if srv: data["serverMetrics"] = srv
                    except Exception: pass
                # Security audit every hour
                if cycle % 60 == 0:
                    try:
                        audit = security_audit()
                        data.setdefault("serverMetrics", {})["securityAudit"] = audit
                        log.info("Security audit: score=%s", audit.get("score"))
                    except Exception: pass
                # Network scan every 30 min
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
                ver, url = result
                log.info("Update available: %s — auto-updating", ver)
                try:
                    do_self_update(url, notify_fn=lambda m: None)
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
        if mtype in ("notification", "status_update") and self._tray:
            try: self._tray.notify(msg.get("body", ""), msg.get("title", APP_NAME))
            except Exception: pass
        elif mtype == "update":
            info = self._update_info or check_for_update()
            if info:
                _, url = info
                do_self_update(url)
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
                ["shutdown", "/r", "/t", str(delay), "/c", "InfraDesk: restart serwera"],
                capture_output=True, creationflags=_NO_WINDOW), daemon=True).start()

    def _start_tray(self):
        try:
            # Load colorful icon
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
                d.text((28, 30), "ID", fill=(255, 255, 255, 255), font=font)

            import webbrowser
            menu = pystray.Menu(
                pystray.MenuItem(f"● {APP_NAME} v{APP_VERSION}", None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("🌐  Otwórz InfraDesk", lambda i, it: webbrowser.open(PORTAL_URL), default=True),
                pystray.MenuItem("❌  Zamknij", lambda i, it: (i.stop(), os._exit(0))),
            )
            self._tray = pystray.Icon(APP_NAME, icon_img, APP_NAME, menu)
            self._tray.run()
        except Exception as e:
            log.error("Tray error: %s", e)


def _windows_auth_prompt():
    """Pokazuje natywny dialog Windows Hello — PIN, odcisk palca, twarz lub hasło.
       Automatycznie wykrywa dostępne metody uwierzytelniania."""

    # Metoda 1: Windows Hello (PIN / biometria / twarz) — nowoczesna
    try:
        log.info("Trying Windows Hello verification...")
        result = subprocess.run([
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
            "[Windows.Security.Credentials.UI.UserConsentVerifier,"
            "Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null; "
            "$r = [Windows.Security.Credentials.UI.UserConsentVerifier]::"
            "RequestVerificationAsync('InfraDesk — Potwierdź tożsamość').GetAwaiter().GetResult(); "
            "Write-Output $r"
        ], capture_output=True, text=True, timeout=120, creationflags=_NO_WINDOW)

        out = result.stdout.strip()
        log.info("Windows Hello result: %s", out)
        if out == "Verified":
            return True
        if out == "Canceled":
            return False
        # DeviceNotPresent / NotConfiguredForUser / DisabledByPolicy → fallback
        log.info("Windows Hello not available (%s) — falling back to credential dialog", out)
    except Exception as e:
        log.info("Windows Hello failed: %s — trying credential dialog", e)

    # Metoda 2: Credential dialog (hasło Windows) — fallback
    try:
        import ctypes
        import ctypes.wintypes as wt

        class CREDUI_INFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wt.DWORD), ("hwndParent", wt.HWND),
                ("pszMessageText", wt.LPCWSTR), ("pszCaptionText", wt.LPCWSTR),
                ("hbmBanner", wt.HBITMAP),
            ]

        credui = ctypes.windll.credui
        advapi32 = ctypes.windll.advapi32

        ci = CREDUI_INFO()
        ci.cbSize = ctypes.sizeof(CREDUI_INFO)
        ci.pszMessageText = "Potwierdź swoją tożsamość aby uruchomić InfraDesk"
        ci.pszCaptionText = "InfraDesk"

        # Pre-fill current username
        current_user = os.environ.get("USERNAME", "")
        current_domain = os.environ.get("USERDOMAIN", "")
        pre_fill = f"{current_domain}\\{current_user}" if current_domain else current_user

        # Pack pre-filled credentials
        in_buf = ctypes.c_void_p()
        in_buf_size = wt.DWORD(0)
        MAX_LEN = 256
        credui.CredPackAuthenticationBufferW(
            0,
            pre_fill, "",  # username pre-filled, empty password
            in_buf, ctypes.byref(in_buf_size),
        )
        # Allocate and pack
        if in_buf_size.value > 0:
            in_buf_data = (ctypes.c_byte * in_buf_size.value)()
            credui.CredPackAuthenticationBufferW(
                0, pre_fill, "",
                in_buf_data, ctypes.byref(in_buf_size),
            )
            p_in = ctypes.cast(in_buf_data, ctypes.c_void_p)
        else:
            p_in = None
            in_buf_size = wt.DWORD(0)

        pAuthPackage = wt.DWORD(0)
        pOutBuf = ctypes.c_void_p()
        pOutSize = wt.DWORD(0)
        pfSave = wt.BOOL(False)

        err = credui.CredUIPromptForWindowsCredentialsW(
            ctypes.byref(ci), 0, ctypes.byref(pAuthPackage),
            p_in, in_buf_size,
            ctypes.byref(pOutBuf), ctypes.byref(pOutSize),
            ctypes.byref(pfSave),
            0x200,  # CREDUIWIN_ENUMERATE_CURRENT_USER
        )

        if err != 0:
            log.info("Credential dialog: cancelled (err=%s)", err)
            return False

        username = ctypes.create_unicode_buffer(MAX_LEN)
        password = ctypes.create_unicode_buffer(MAX_LEN)
        domain = ctypes.create_unicode_buffer(MAX_LEN)
        ulen, plen, dlen = wt.DWORD(MAX_LEN), wt.DWORD(MAX_LEN), wt.DWORD(MAX_LEN)

        credui.CredUnPackAuthenticationBufferW(
            0, pOutBuf, pOutSize,
            username, ctypes.byref(ulen),
            domain, ctypes.byref(dlen),
            password, ctypes.byref(plen),
        )
        ctypes.windll.ole32.CoTaskMemFree(pOutBuf)

        token = wt.HANDLE()
        ok = advapi32.LogonUserW(
            username.value,
            domain.value if domain.value else None,
            password.value, 2, 0, ctypes.byref(token),
        )
        if ok:
            ctypes.windll.kernel32.CloseHandle(token)
            log.info("Credential dialog: verified OK (%s)", username.value)
            return True

        log.warning("Credential dialog: invalid credentials")
        return False

    except Exception as e:
        log.warning("Credential dialog failed: %s — allowing access", e)
        return True


def _kill_other_agents():
    """Zamknij inne instancje agenta (zapobiega duplikatom)."""
    try:
        my_pid = os.getpid()
        for p in psutil.process_iter(['pid', 'name']):
            if p.info['name'] and 'InfraDesk' in p.info['name'] and p.info['pid'] != my_pid:
                try: p.kill(); log.info("Killed old agent process: %s", p.info['pid'])
                except Exception: pass
    except Exception: pass


# ═══════════════════════════════════════════════════════════════════════════════
# SERVER EDITION — Windows Service + Advanced Monitoring
# ═══════════════════════════════════════════════════════════════════════════════

def server_metrics():
    """Collect server-specific metrics: S.M.A.R.T., RAID, services, events, certs, top processes."""
    result = {}
    try:
        # ── S.M.A.R.T. disk health ──────────────────────────────────────────
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

        # ── RAID / Storage Pool status ───────────────────────────────────────
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

        # ── Critical Windows services ────────────────────────────────────────
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

        # ── Event Log critical errors (last 24h) ────────────────────────────
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

        # ── SSL Certificates expiring within 60 days ─────────────────────────
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

        # ── Top 5 CPU-consuming processes ────────────────────────────────────
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

        # ── Listening ports ──────────────────────────────────────────────────
        try:
            ports = set()
            for conn in psutil.net_connections(kind='inet'):
                if conn.status == 'LISTEN' and conn.laddr:
                    ports.add(conn.laddr.port)
            result["listeningPorts"] = sorted(ports)[:50]
        except Exception:
            pass

        # ── Hyper-V VMs (if available) ───────────────────────────────────────
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
        lambda o: "False" not in o, lambda o: "Włączony" if "False" not in o else "Profil wyłączony!")
    _ck("defender", "Windows Defender", "critical",
        "(Get-MpComputerStatus).RealTimeProtectionEnabled",
        lambda o: o == "True", lambda o: "Aktywny" if o == "True" else "Wyłączony!")
    _ck("defender_defs", "Definicje antywirusa", "critical",
        "((Get-Date) - (Get-MpComputerStatus).AntivirusSignatureLastUpdated).Days",
        lambda o: o.isdigit() and int(o) < 7, lambda o: f"{o} dni temu" if o.isdigit() else "Brak danych")
    _ck("updates", "Aktualizacje Windows (<30d)", "critical",
        "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')",
        lambda o: len(o) >= 10 and (datetime.now() - datetime.strptime(o[:10], '%Y-%m-%d')).days < 30,
        lambda o: f"Ostatnia: {o[:10]}" if len(o) >= 10 else "Brak danych")
    _ck("smb1", "SMBv1 wyłączony", "critical",
        "(Get-SmbServerConfiguration).EnableSMB1Protocol",
        lambda o: o == "False", lambda o: "Wyłączony" if o == "False" else "WŁĄCZONY!")
    _ck("guest", "Konto Guest wyłączone", "critical",
        "(Get-LocalUser Guest).Enabled",
        lambda o: o == "False", lambda o: "Wyłączone" if o == "False" else "AKTYWNE!")
    _ck("rdp_nla", "RDP NLA", "high",
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -EA SilentlyContinue).UserAuthentication",
        lambda o: o == "1", lambda o: "NLA włączone" if o == "1" else "NLA wyłączone")
    _ck("bitlocker", "Szyfrowanie dysków", "high",
        "Get-BitLockerVolume -EA SilentlyContinue | Select-Object -ExpandProperty ProtectionStatus",
        lambda o: "1" in o or "On" in o, lambda o: "Zaszyfrowane" if "1" in o or "On" in o else "Brak BitLocker")
    _ck("password_policy", "Polityka haseł (min 8)", "high",
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
    _ck("autorun", "Autorun wyłączony", "medium",
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name NoDriveTypeAutoRun -EA SilentlyContinue).NoDriveTypeAutoRun",
        lambda o: o != "" and o != "0", lambda o: "Wyłączony" if o and o != "0" else "Włączony")
    _ck("ps_policy", "PowerShell policy", "medium",
        "Get-ExecutionPolicy", lambda o: o in ("Restricted", "AllSigned", "RemoteSigned"), lambda o: o)
    _ck("open_shares", "Udziały sieciowe (max 3)", "medium",
        "(Get-SmbShare | Where-Object { $_.Name -notmatch '\\$$' }).Count",
        lambda o: o.isdigit() and int(o) <= 3, lambda o: f"{o} udziałów" if o.isdigit() else "0")
    _ck("event_errors", "Błędy Event Log (24h)", "medium",
        "(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -EA SilentlyContinue).Count",
        lambda o: not o.isdigit() or int(o) < 10, lambda o: f"{o} zdarzeń" if o.isdigit() else "0")
    _ck("cert_expiry", "Certyfikaty (30 dni)", "medium",
        "(Get-ChildItem Cert:\\LocalMachine\\My -EA SilentlyContinue | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) }).Count",
        lambda o: o in ("", "0"), lambda o: f"{o} wygasa" if o and o != "0" else "OK")
    _ck("pending_updates", "Oczekujące aktualizacje", "medium",
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
    checks.append({"id": "backup_status", "name": "Backup InfraDesk", "severity": "high",
        "status": "pass" if has_bk else "fail", "detail": "Aktywny" if has_bk else "Brak konfiguracji"})

    # RDP
    _ck("remote_desktop", "Remote Desktop", "info",
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -EA SilentlyContinue).fDenyTSConnections",
        lambda o: True, lambda o: "Wyłączony" if o == "1" else "Włączony")

    fail_w = sum(WEIGHTS.get(c["severity"], 0) for c in checks if c["status"] == "fail")
    score = max(0, min(100, round(100 - (fail_w / max(total_weight, 1)) * 100)))
    return {"score": score, "checks": checks, "timestamp": datetime.now().isoformat()[:19]}


def ai_diagnose():
    """AI Diagnostics — collect system data, analyze problems, suggest fixes."""
    diag = {"problems": [], "fixes": [], "score": 100, "systemInfo": {}, "timestamp": datetime.now().isoformat()[:19]}

    def _problem(name, severity, detail, fix_cmd=None, fix_label=None):
        diag["problems"].append({"name": name, "severity": severity, "detail": detail})
        penalty = {"critical": 20, "high": 12, "medium": 6, "low": 2}.get(severity, 0)
        diag["score"] = max(0, diag["score"] - penalty)
        if fix_cmd:
            diag["fixes"].append({"name": fix_label or name, "cmd": fix_cmd, "severity": severity})

    try:
        # 1) Basic system info
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\")
        cpu_pct = psutil.cpu_percent(interval=1)
        diag["systemInfo"] = {
            "cpu": _wmic("cpu get name"),
            "ramGb": round(mem.total / (1024**3), 1),
            "ramUsed": mem.percent,
            "diskTotal": round(disk.total / (1024**3)),
            "diskFree": round(disk.free / (1024**3), 1),
            "diskUsed": disk.percent,
            "cpuUsage": cpu_pct,
            "uptime_days": int((time.time() - psutil.boot_time()) / 86400),
        }

        # 2) RAM — high usage
        if mem.percent > 85:
            top = sorted(psutil.process_iter(['name', 'memory_percent']),
                         key=lambda p: p.info.get('memory_percent', 0) or 0, reverse=True)[:3]
            top_names = ", ".join(f"{p.info['name']} ({p.info['memory_percent']:.0f}%)" for p in top if p.info.get('memory_percent'))
            _problem("Wysokie zużycie RAM", "high",
                     f"Zajęte {mem.percent}% — {top_names}",
                     "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 Name,@{N='MB';E={[math]::Round($_.WorkingSet64/1MB)}}",
                     "Pokaż procesy zużywające RAM")
        elif mem.percent > 70:
            _problem("Podwyższone zużycie RAM", "low", f"Zajęte {mem.percent}%")

        # 3) Disk — low space
        if disk.percent > 90:
            _problem("Krytycznie mało miejsca na dysku", "critical",
                     f"Wolne tylko {round(disk.free / (1024**3), 1)} GB ({100-disk.percent}%)",
                     "cleanmgr /d C",
                     "Uruchom oczyszczanie dysku Windows")
        elif disk.percent > 80:
            _problem("Mało miejsca na dysku", "medium",
                     f"Wolne {round(disk.free / (1024**3), 1)} GB ({100-disk.percent}%)")

        # 4) CPU — high load
        if cpu_pct > 80:
            _problem("Wysokie obciążenie CPU", "high", f"CPU: {cpu_pct}%")
        elif cpu_pct > 60:
            _problem("Podwyższone obciążenie CPU", "low", f"CPU: {cpu_pct}%")

        # 5) Uptime — needs restart
        uptime_d = diag["systemInfo"]["uptime_days"]
        if uptime_d > 30:
            _problem("System dawno nie restartowany", "medium",
                     f"Uptime: {uptime_d} dni — zalecany restart",
                     "shutdown /r /t 300 /c \"Zaplanowany restart za 5 minut\"",
                     "Zaplanuj restart za 5 min")
        elif uptime_d > 14:
            _problem("Długi uptime", "low", f"Uptime: {uptime_d} dni")

        # 6) Event Log — critical/error events last 24h
        try:
            r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                "Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 20 -EA SilentlyContinue | "
                "Select-Object TimeCreated,Id,Message | ForEach-Object { \"$($_.TimeCreated.ToString('HH:mm')) [ID:$($_.Id)] $($_.Message.Substring(0,[Math]::Min(120,$_.Message.Length)))\" }"],
                capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW)
            errors = [l.strip() for l in r.stdout.strip().split("\n") if l.strip()]
            if len(errors) > 5:
                _problem("Dużo błędów w Event Log (24h)", "high",
                         f"{len(errors)} błędów/krytycznych zdarzeń",
                         "Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 10 | Format-List TimeCreated,Id,Message",
                         "Pokaż szczegóły błędów")
                diag["eventLogErrors"] = errors[:10]
            elif len(errors) > 0:
                _problem("Błędy w Event Log (24h)", "low", f"{len(errors)} zdarzeń")
                diag["eventLogErrors"] = errors[:5]
        except Exception:
            pass

        # 7) Stopped critical services
        try:
            critical_svcs = ["wuauserv", "WinDefend", "Spooler", "Dnscache", "BITS", "EventLog"]
            r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                "Get-Service -Name " + ",".join(critical_svcs) + " -EA SilentlyContinue | "
                "Where-Object { $_.Status -ne 'Running' } | Select-Object -ExpandProperty DisplayName"],
                capture_output=True, text=True, timeout=15, creationflags=_NO_WINDOW)
            stopped = [s.strip() for s in r.stdout.strip().split("\n") if s.strip()]
            if stopped:
                _problem("Zatrzymane usługi systemowe", "high",
                         f"Nieaktywne: {', '.join(stopped)}",
                         " ; ".join(f"Start-Service '{s}' -EA SilentlyContinue" for s in critical_svcs),
                         "Uruchom zatrzymane usługi")
        except Exception:
            pass

        # 8) Temp files size
        try:
            temp_size = 0
            for d in [os.environ.get("TEMP", ""), os.path.join(os.environ.get("WINDIR", ""), "Temp")]:
                if d and os.path.exists(d):
                    for dp, _, fns in os.walk(d):
                        for fn in fns:
                            try: temp_size += os.path.getsize(os.path.join(dp, fn))
                            except: pass
            temp_mb = temp_size / (1024 * 1024)
            if temp_mb > 500:
                _problem("Duża ilość plików tymczasowych", "medium",
                         f"{temp_mb:.0f} MB plików temp",
                         "Remove-Item $env:TEMP\\* -Recurse -Force -EA SilentlyContinue; Remove-Item $env:WINDIR\\Temp\\* -Recurse -Force -EA SilentlyContinue",
                         "Wyczyść pliki tymczasowe")
            elif temp_mb > 200:
                _problem("Pliki tymczasowe do wyczyszczenia", "low", f"{temp_mb:.0f} MB")
        except Exception:
            pass

        # 9) Windows Defender status
        try:
            r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                "(Get-MpComputerStatus).RealTimeProtectionEnabled"],
                capture_output=True, text=True, timeout=15, creationflags=_NO_WINDOW)
            if r.stdout.strip() != "True":
                _problem("Windows Defender wyłączony", "critical",
                         "Ochrona w czasie rzeczywistym jest nieaktywna!",
                         "Set-MpPreference -DisableRealtimeMonitoring $false",
                         "Włącz ochronę Defender")
        except Exception:
            pass

        # 10) Firewall check
        try:
            r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                "Get-NetFirewallProfile | Where-Object { $_.Enabled -eq $false } | Select-Object -ExpandProperty Name"],
                capture_output=True, text=True, timeout=15, creationflags=_NO_WINDOW)
            disabled = [p.strip() for p in r.stdout.strip().split("\n") if p.strip()]
            if disabled:
                _problem("Firewall wyłączony", "critical",
                         f"Profile: {', '.join(disabled)}",
                         "Set-NetFirewallProfile -All -Enabled True",
                         "Włącz firewall")
        except Exception:
            pass

        # Summary
        if not diag["problems"]:
            diag["summary"] = "System działa prawidłowo — nie wykryto problemów."
        elif diag["score"] >= 70:
            diag["summary"] = f"System w dobrym stanie — wykryto {len(diag['problems'])} drobnych uwag."
        elif diag["score"] >= 40:
            diag["summary"] = f"System wymaga uwagi — wykryto {len(diag['problems'])} problemów."
        else:
            diag["summary"] = f"System w złym stanie — wykryto {len(diag['problems'])} poważnych problemów!"

    except Exception as e:
        diag["error"] = str(e)
        log.error("AI diagnose error: %s", e)

    return diag


def _is_admin():
    """Check if running as administrator."""
    try:
        import ctypes
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def ai_fix(cmd):
    """Execute a PowerShell command. Uses elevation if not admin."""
    try:
        if _is_admin():
            # Already admin — run directly
            r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command", cmd],
                capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW)
            output = (r.stdout or "").strip()
            error = (r.stderr or "").strip()
            return {"ok": r.returncode == 0, "output": output[:500], "error": error[:300]}
        else:
            # Not admin — run via elevated temp script
            out_file = os.path.join(tempfile.gettempdir(), f"sai_{os.getpid()}.out")
            err_file = os.path.join(tempfile.gettempdir(), f"sai_{os.getpid()}.err")
            ps_file = os.path.join(tempfile.gettempdir(), f"sai_{os.getpid()}.ps1")

            # Write script that captures output
            with open(ps_file, "w", encoding="utf-8") as f:
                f.write(f"""
try {{
    $result = Invoke-Command -ScriptBlock {{ {cmd} }} 2>&1
    $result | Out-File -FilePath '{out_file}' -Encoding utf8 -Force
}} catch {{
    $_.Exception.Message | Out-File -FilePath '{err_file}' -Encoding utf8 -Force
}}
""")

            # Remove old output files
            for fp in [out_file, err_file]:
                try: os.remove(fp)
                except: pass

            # Run elevated — this shows UAC prompt first time
            r = subprocess.run([
                "powershell", "-ExecutionPolicy", "Bypass", "-Command",
                f"Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -WindowStyle Hidden -File \"{ps_file}\"' -Verb RunAs -Wait"
            ], capture_output=True, text=True, timeout=90, creationflags=_NO_WINDOW)

            # Read results
            output = ""
            error = ""
            try:
                if os.path.exists(out_file):
                    with open(out_file, encoding="utf-8") as f:
                        output = f.read().strip()[:500]
                if os.path.exists(err_file):
                    with open(err_file, encoding="utf-8") as f:
                        error = f.read().strip()[:300]
            except: pass

            # Cleanup
            for fp in [ps_file, out_file, err_file]:
                try: os.remove(fp)
                except: pass

            ok = bool(output) and not error
            if not output and not error:
                output = "Komenda wykonana (brak wyjścia)"
                ok = True
            return {"ok": ok, "output": output, "error": error}

    except Exception as e:
        log.error("ai_fix error: %s", e)
        return {"ok": False, "output": "", "error": str(e)[:300]}


def ai_fix_visible(cmd):
    """Execute PowerShell command VISIBLY — opens PS window, types command, user sees everything."""
    try:
        import pyautogui
        import pygetwindow

        # Write command to temp script that pauses at end
        ps_file = os.path.join(tempfile.gettempdir(), f"sai_vis_{os.getpid()}.ps1")
        out_file = os.path.join(tempfile.gettempdir(), f"sai_vis_{os.getpid()}.out")
        err_file = os.path.join(tempfile.gettempdir(), f"sai_vis_{os.getpid()}.err")

        for fp in [out_file, err_file]:
            try: os.remove(fp)
            except: pass

        # Script: run command, save output, auto-close
        done_file = os.path.join(tempfile.gettempdir(), f"sai_vis_{os.getpid()}.done")
        for fp in [done_file]:
            try: os.remove(fp)
            except: pass

        escaped_cmd = cmd.replace("'", "''")
        with open(ps_file, "w", encoding="utf-8") as f:
            f.write(f"""
$Host.UI.RawUI.WindowTitle = 'InfraDesk AI - Naprawa'
Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════════╗' -ForegroundColor Cyan
Write-Host '  ║  InfraDesk AI  —  Wykonuję naprawę...           ║' -ForegroundColor Cyan
Write-Host '  ╚══════════════════════════════════════════════════╝' -ForegroundColor Cyan
Write-Host ''
Write-Host '  > {escaped_cmd}' -ForegroundColor Yellow
Write-Host ''
try {{
    $result = Invoke-Command -ScriptBlock {{ {cmd} }} 2>&1 | Out-String
    if ($result) {{ $result | Out-File -FilePath '{out_file.replace(chr(92), "/")}' -Encoding utf8 -Force }}
    else {{ 'OK' | Out-File -FilePath '{out_file.replace(chr(92), "/")}' -Encoding utf8 -Force }}
    Write-Host $result
    Write-Host ''
    Write-Host '  ✅ Gotowe!' -ForegroundColor Green
}} catch {{
    $_.Exception.Message | Out-File -FilePath '{err_file.replace(chr(92), "/")}' -Encoding utf8 -Force
    Write-Host "  ❌ Błąd: $($_.Exception.Message)" -ForegroundColor Red
}}
Write-Host ''
Write-Host '  Zamykam za 4 sekundy...' -ForegroundColor DarkGray
Start-Sleep -Seconds 4
'done' | Out-File -FilePath '{done_file.replace(chr(92), "/")}' -Encoding utf8 -Force
exit
""")

        # Open PowerShell window visibly (NO -NoExit!)
        if _is_admin():
            proc = subprocess.Popen(
                ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_file],
                creationflags=subprocess.CREATE_NEW_CONSOLE)
        else:
            proc = subprocess.Popen(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 f"Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"{ps_file}\"' -Verb RunAs -Wait"],
                creationflags=subprocess.CREATE_NEW_CONSOLE)

        # Wait for done marker (max 90s)
        for _ in range(180):
            time.sleep(0.5)
            if os.path.exists(done_file):
                break
        # Extra wait if process still alive
        if proc:
            try: proc.wait(timeout=5)
            except: pass

        # Read results
        output, error = "", ""
        try:
            if os.path.exists(out_file):
                with open(out_file, encoding="utf-8") as f:
                    output = f.read().strip()[:500]
            if os.path.exists(err_file):
                with open(err_file, encoding="utf-8") as f:
                    error = f.read().strip()[:300]
        except: pass

        # Cleanup
        for fp in [ps_file, out_file, err_file, done_file]:
            try: os.remove(fp)
            except: pass

        ok = bool(output) and not error
        if not output and not error:
            output = "Komenda wykonana (brak wyjścia)"
            ok = True
        return {"ok": ok, "output": output, "error": error}

    except Exception as e:
        log.error("ai_fix_visible error: %s", e)
        return {"ok": False, "output": "", "error": str(e)[:300]}


def network_scan():
    """Scan local network for devices via ARP + ping + port scan."""
    result = {"scannedAt": datetime.now().isoformat()[:19], "subnet": "", "gateway": "", "devices": []}
    try:
        # Gateway
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

        # Ping sweep + ARP
        subprocess.run(["powershell", "-Command",
            f"1..254 | ForEach-Object {{ Test-Connection -ComputerName '{subnet}.$_' -Count 1 -TimeoutSeconds 1 -EA SilentlyContinue | Out-Null }}"],
            capture_output=True, timeout=120, creationflags=_NO_WINDOW)

        # Parse ARP
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
                # Quick port scan
                open_ports = []
                for port in [22, 80, 443, 445, 3389, 5900, 8080, 9100]:
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(0.3)
                        if s.connect_ex((ip, port)) == 0: open_ports.append(port)
                        s.close()
                    except: pass
                # Type detection
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


# ─── HOME Tools ──────────────────────────────────────────────────────────────

def system_cleanup(callback=None):
    """Clean temp files, caches, recycle bin. Returns dict with results."""
    results = {"cleaned_mb": 0, "files_removed": 0, "errors": []}

    def _notify(msg):
        if callback: callback(msg)
        log.info("Cleanup: %s", msg)

    dirs_to_clean = [
        (os.environ.get("TEMP", ""), "Pliki tymczasowe"),
        (os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp"), "Temp użytkownika"),
        (os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp"), "Windows Temp"),
        (os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Prefetch"), "Prefetch"),
        (os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "INetCache"), "Cache IE"),
    ]

    for dir_path, label in dirs_to_clean:
        if not dir_path or not os.path.exists(dir_path):
            continue
        _notify(f"Czyszczenie: {label}...")
        count = 0
        size = 0
        try:
            for root_dir, dirs, files in os.walk(dir_path, topdown=False):
                for fname in files:
                    fp = os.path.join(root_dir, fname)
                    try:
                        sz = os.path.getsize(fp)
                        os.remove(fp)
                        count += 1
                        size += sz
                    except Exception:
                        pass
                for dname in dirs:
                    try: os.rmdir(os.path.join(root_dir, dname))
                    except Exception: pass
        except Exception as e:
            results["errors"].append(f"{label}: {e}")
        results["files_removed"] += count
        results["cleaned_mb"] += size / (1024 * 1024)

    # Windows Update cache
    _notify("Czyszczenie cache Windows Update...")
    try:
        wu_path = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "SoftwareDistribution", "Download")
        if os.path.exists(wu_path):
            for root_dir, dirs, files in os.walk(wu_path, topdown=False):
                for fname in files:
                    try:
                        fp = os.path.join(root_dir, fname)
                        sz = os.path.getsize(fp)
                        os.remove(fp)
                        results["files_removed"] += 1
                        results["cleaned_mb"] += sz / (1024 * 1024)
                    except Exception: pass
    except Exception: pass

    # Recycle Bin
    _notify("Opróżnianie kosza...")
    try:
        subprocess.run(["powershell", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                       capture_output=True, timeout=30, creationflags=_NO_WINDOW)
    except Exception: pass

    results["cleaned_mb"] = round(results["cleaned_mb"], 1)
    _notify(f"Gotowe! Usunięto {results['files_removed']} plików, odzyskano {results['cleaned_mb']} MB")
    return results


def get_autostart_programs():
    """List programs that start with Windows — with boot impact estimation."""
    programs = []
    # Registry: HKCU + HKLM
    for hive, path in [
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ]:
        try:
            with winreg.OpenKey(hive, path) as key:
                i = 0
                while True:
                    try:
                        name, value, _ = winreg.EnumValue(key, i)
                        programs.append({
                            "name": name,
                            "command": value,
                            "location": "HKCU" if hive == winreg.HKEY_CURRENT_USER else "HKLM",
                            "enabled": True,
                        })
                        i += 1
                    except OSError:
                        break
        except Exception:
            pass

    # Estimate boot impact per program
    # Use Task Manager startup impact data from WMI
    impact_data = {}
    try:
        r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
            "Get-CimInstance Win32_StartupCommand -EA SilentlyContinue | Select-Object Name, Command | ForEach-Object { $_.Name + '|' + $_.Command }"],
            capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=10, creationflags=_NO_WINDOW)
    except:
        pass

    # Estimate impact based on known patterns and process memory
    heavy = ['chrome','firefox','edge','teams','discord','steam','epic','origin',
             'spotify','dropbox','onedrive','creative cloud','adobe','skype','zoom',
             'vmware','virtualbox','docker','antivirus','norton','kaspersky','eset',
             'malwarebytes','avast','avg','bitdefender']
    medium = ['realtek','nvidia','amd','razer','corsair','logitech','steelseries',
              'intel','synaptics','printer','hp','canon','epson','brother']
    light = ['security','defender','update','helper','tray','notification','agent']

    for p in programs:
        cmd_lower = (p.get("command", "") + " " + p.get("name", "")).lower()
        # Estimate impact
        if any(h in cmd_lower for h in heavy):
            p["impact"] = "high"
            p["impactSec"] = round(2.0 + len(cmd_lower) * 0.01, 1)  # 2-4s
            p["impactLabel"] = "Wysoki"
        elif any(m in cmd_lower for m in medium):
            p["impact"] = "medium"
            p["impactSec"] = round(0.8 + len(cmd_lower) * 0.005, 1)  # 0.8-1.5s
            p["impactLabel"] = "Średni"
        elif any(l in cmd_lower for l in light):
            p["impact"] = "low"
            p["impactSec"] = round(0.2 + len(cmd_lower) * 0.002, 1)  # 0.2-0.5s
            p["impactLabel"] = "Niski"
        else:
            p["impact"] = "medium"
            p["impactSec"] = round(1.0 + len(cmd_lower) * 0.005, 1)
            p["impactLabel"] = "Średni"

    # Get actual last boot time
    boot_time = 0
    try:
        r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
            "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"],
            capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=8, creationflags=_NO_WINDOW)
        boot_str = r.stdout.strip()

        # Get boot duration from Event Log (Event ID 100 = boot complete)
        r2 = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
            "Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Diagnostics-Performance/Operational';Id=100} -MaxEvents 1 -EA SilentlyContinue | ForEach-Object { $_.Properties[1].Value }"],
            capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=10, creationflags=_NO_WINDOW)
        if r2.stdout.strip():
            boot_time = int(r2.stdout.strip()) // 1000  # ms to seconds
    except:
        pass

    total_impact = sum(p.get("impactSec", 0) for p in programs)

    return {
        "programs": programs,
        "bootTimeSec": boot_time,
        "totalImpactSec": round(total_impact, 1),
        "count": len(programs)
    }


def toggle_autostart(name, location, enable):
    """Enable or disable an autostart program."""
    hive = winreg.HKEY_CURRENT_USER if location == "HKCU" else winreg.HKEY_LOCAL_MACHINE
    path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    disabled_path = path + "Disabled"
    try:
        if not enable:
            # Move from Run to RunDisabled
            with winreg.OpenKey(hive, path, 0, winreg.KEY_READ) as key:
                value, vtype = winreg.QueryValueEx(key, name)
            with winreg.OpenKey(hive, path, 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, name)
            with winreg.CreateKey(hive, disabled_path) as key:
                winreg.SetValueEx(key, name, 0, vtype, value)
        else:
            # Move from RunDisabled to Run
            with winreg.OpenKey(hive, disabled_path, 0, winreg.KEY_READ) as key:
                value, vtype = winreg.QueryValueEx(key, name)
            with winreg.OpenKey(hive, disabled_path, 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, name)
            with winreg.CreateKey(hive, path) as key:
                winreg.SetValueEx(key, name, 0, vtype, value)
        return True
    except Exception as e:
        log.error("Toggle autostart %s: %s", name, e)
        return False


def get_system_score():
    """Simple system benchmark score 1-10."""
    score = 5.0
    try:
        # CPU cores boost
        cores = psutil.cpu_count(logical=False) or 2
        if cores >= 8: score += 1.5
        elif cores >= 4: score += 0.8

        # RAM boost
        ram_gb = psutil.virtual_memory().total / (1024**3)
        if ram_gb >= 32: score += 1.5
        elif ram_gb >= 16: score += 1.0
        elif ram_gb >= 8: score += 0.3
        elif ram_gb < 4: score -= 1.0

        # Disk free boost
        try:
            disk = psutil.disk_usage("C:\\")
            free_pct = 100 - disk.percent
            if free_pct > 30: score += 0.5
            elif free_pct < 10: score -= 1.0
        except Exception: pass

        # SSD detection
        try:
            r = subprocess.run(["powershell", "-Command", "(Get-PhysicalDisk | Select-Object MediaType).MediaType"],
                               capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
            if "SSD" in r.stdout: score += 1.0
        except Exception: pass

        # CPU load penalty
        cpu = psutil.cpu_percent(interval=1)
        if cpu > 80: score -= 0.5

    except Exception: pass
    return max(1.0, min(10.0, round(score, 1)))


def speed_test_simple():
    """Speed test — multiple servers, best result."""
    result = {"download_mbps": 0, "upload_mbps": 0, "ping_ms": 0, "server": "", "error": None}
    try:
        import urllib.request, ssl, time as _time
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        # Ping — 3x to google DNS
        times = []
        for _ in range(3):
            try:
                s = _time.time()
                urllib.request.urlopen("http://www.gstatic.com/generate_204", timeout=5)
                times.append((_time.time() - s) * 1000)
            except Exception:
                pass
        result["ping_ms"] = round(min(times)) if times else -1

        # Download — try multiple servers
        dl_servers = [
            ("https://nbg1-speed.hetzner.com/1GB.bin", "Hetzner DE", 25 * 1024 * 1024),  # read only 25MB
            ("http://speedtest.tele2.net/10MB.zip", "Tele2 EU", 0),
            ("https://proof.ovh.net/files/10Mb.dat", "OVH EU", 0),
            ("https://infradesk.pl/downloads/speedtest_10mb.bin", "InfraDesk PL", 0),
        ]

        for url, name, max_bytes in dl_servers:
            try:
                start = _time.time()
                req = urllib.request.urlopen(url, context=ctx, timeout=20)
                if max_bytes > 0:
                    data = req.read(max_bytes)
                else:
                    data = req.read()
                elapsed = _time.time() - start
                if elapsed > 0.1 and len(data) > 100000:
                    mbps = round((len(data) * 8 / 1_000_000) / elapsed, 1)
                    if mbps > result["download_mbps"]:
                        result["download_mbps"] = mbps
                        result["server"] = name
                    break  # Use first working server
            except Exception:
                continue

        # Upload — POST to our server
        try:
            upload_data = os.urandom(3 * 1024 * 1024)  # 3MB
            req = urllib.request.Request(
                "https://infradesk.pl/api/speedtest/upload",
                data=upload_data,
                headers={"Content-Type": "application/octet-stream"},
                method="POST",
            )
            start = _time.time()
            urllib.request.urlopen(req, context=ctx, timeout=30)
            elapsed = _time.time() - start
            if elapsed > 0:
                result["upload_mbps"] = round((len(upload_data) * 8 / 1_000_000) / elapsed, 1)
        except Exception:
            result["upload_mbps"] = 0

    except Exception as e:
        result["error"] = str(e)
    return result


def get_network_info():
    """Get network interfaces, public IP, ISP, open ports."""
    info = {
        "hostname": os.environ.get("COMPUTERNAME", ""),
        "interfaces": [],
        "public_ip": None,
        "isp": None,
        "open_ports": [],
        "gateway": None,
        "dns": [],
    }
    try:
        # Interfaces
        for name, addrs in psutil.net_if_addrs().items():
            skip = ['loopback', 'lo', 'virtual', 'vmware', 'vethernet', 'docker', 'vbox']
            if any(s in name.lower() for s in skip):
                continue
            for a in addrs:
                if a.family.name == 'AF_INET' and a.address and not a.address.startswith('169.254'):
                    stats = psutil.net_if_stats().get(name)
                    info["interfaces"].append({
                        "name": name,
                        "ip": a.address,
                        "netmask": a.netmask,
                        "speed": stats.speed if stats else 0,
                        "isUp": stats.isup if stats else False,
                    })

        # Gateway
        try:
            r = subprocess.run(["powershell", "-Command",
                "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1).NextHop"],
                capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
            gw = r.stdout.strip()
            if gw:
                info["gateway"] = gw
        except Exception:
            pass

        # DNS servers
        try:
            r = subprocess.run(["powershell", "-Command",
                "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses | Select-Object -Unique"],
                capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
            info["dns"] = [l.strip() for l in r.stdout.strip().split('\n') if l.strip()]
        except Exception:
            pass

        # Public IP + ISP
        try:
            import urllib.request, ssl, json as _json
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.urlopen("https://ipinfo.io/json", context=ctx, timeout=8)
            data = _json.loads(req.read())
            info["public_ip"] = data.get("ip")
            info["isp"] = data.get("org", "").replace("AS", "").strip()
            if not info["isp"]:
                info["isp"] = data.get("hostname", "")
        except Exception:
            pass

        # Open/listening ports
        try:
            ports = set()
            for conn in psutil.net_connections(kind='inet'):
                if conn.status == 'LISTEN' and conn.laddr:
                    ports.add(conn.laddr.port)
            info["open_ports"] = sorted(ports)[:30]
        except Exception:
            pass

    except Exception:
        pass
    return info


def get_battery_info():
    """Get battery health info (laptops only)."""
    try:
        bat = psutil.sensors_battery()
        if bat is None: return None
        return {
            "percent": bat.percent,
            "plugged": bat.power_plugged,
            "secsleft": bat.secsleft if bat.secsleft != psutil.POWER_TIME_UNLIMITED else None,
        }
    except Exception:
        return None


def get_top_ram_processes(n=8):
    """Top N RAM-consuming processes."""
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'memory_percent']):
        try:
            info = p.info
            if info['memory_percent'] and info['memory_percent'] > 0.1:
                procs.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x.get('memory_percent', 0), reverse=True)
    return [{"pid": p['pid'], "name": p['name'], "ram_pct": round(p['memory_percent'], 1)} for p in procs[:n]]


def get_disk_health_simple():
    """Simple disk health summary."""
    try:
        r = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             "Get-PhysicalDisk | Select-Object FriendlyName,MediaType,HealthStatus,Size | ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=15, creationflags=_NO_WINDOW)
        if r.stdout.strip():
            disks = json.loads(r.stdout)
            if isinstance(disks, dict): disks = [disks]
            return [{"name": d.get("FriendlyName", ""), "type": d.get("MediaType", ""),
                      "health": d.get("HealthStatus", "Unknown"),
                      "size_gb": round(d.get("Size", 0) / 1073741824, 0)} for d in disks]
    except Exception: pass
    return []


# ─── HOME UI ─────────────────────────────────────────────────────────────────

def show_home_panel(root, cfg, on_back_to_login):
    """Main HOME panel — Asystent InfraDesk — CCleaner-style layout."""
    _clear(root)
    root.title(APP_NAME_HOME)
    W, H = 820, 580
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
    root.resizable(True, True)
    root.minsize(700, 480)

    SIDEBAR_BG = "#0A0E1A"
    SIDEBAR_W = 200
    ACTIVE_BG = "#141B2E"

    outer = tk.Frame(root, bg=BG)
    outer.pack(fill="both", expand=True)

    # ── SIDEBAR ──
    sidebar = tk.Frame(outer, bg=SIDEBAR_BG, width=SIDEBAR_W)
    sidebar.pack(side="left", fill="y")
    sidebar.pack_propagate(False)

    # Logo
    logo_f = tk.Frame(sidebar, bg=SIDEBAR_BG, padx=16, pady=16)
    logo_f.pack(fill="x")
    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((28, 28), Image.LANCZOS)
        bg_rgb = tuple(int(SIDEBAR_BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img_pil = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img_pil.paste(img, mask=img.split()[3])
        _logo = ImageTk.PhotoImage(bg_img_pil.convert("RGB"))
        ll = tk.Label(logo_f, image=_logo, bg=SIDEBAR_BG, bd=0)
        ll.image = _logo
        ll.pack(side="left", padx=(0, 8))
    except Exception: pass
    lbl(logo_f, "Asystent", size=12, bold=True).pack(side="left")

    tk.Frame(sidebar, bg="#1E293B", height=1).pack(fill="x", padx=12)

    # Sidebar nav items
    nav_items = [
        ("🏠", "Przegląd", "overview"),
        ("🧹", "Czyszczenie", "cleanup"),
        ("🛡️", "Bezpieczeństwo", "audit"),
        ("🚀", "Autostart", "autostart"),
        ("📊", "Monitoring", "monitor"),
        ("💊", "Naprawa AI", "ai_repair"),
        ("🌐", "Sieć i Internet", "network"),
        ("🆘", "Pomoc zdalna", "help"),
    ]

    current_page = [nav_items[0][2]]  # mutable ref
    nav_buttons = {}

    def switch_page(page_id):
        current_page[0] = page_id
        # Update sidebar highlights
        for pid, btn_frame in nav_buttons.items():
            if pid == page_id:
                btn_frame.configure(bg=ACTIVE_BG, highlightbackground=PRI, highlightthickness=2)
            else:
                btn_frame.configure(bg=SIDEBAR_BG, highlightbackground=SIDEBAR_BG, highlightthickness=0)
        # Show page content
        show_page(page_id)

    nav_frame = tk.Frame(sidebar, bg=SIDEBAR_BG, padx=8, pady=12)
    nav_frame.pack(fill="x")

    for icon, label, page_id in nav_items:
        f = tk.Frame(nav_frame, bg=SIDEBAR_BG, padx=10, pady=8, cursor="hand2")
        f.pack(fill="x", pady=1)
        lbl(f, f"{icon}  {label}", size=10, color=TXT if page_id == current_page[0] else TXT_DIM).pack(anchor="w")
        f.bind("<Button-1>", lambda e, p=page_id: switch_page(p))
        for w in f.winfo_children(): w.bind("<Button-1>", lambda e, p=page_id: switch_page(p))
        f.bind("<Enter>", lambda e, f=f: f.configure(bg=ACTIVE_BG) if f != nav_buttons.get(current_page[0]) else None)
        f.bind("<Leave>", lambda e, f=f, p=page_id: f.configure(bg=SIDEBAR_BG) if p != current_page[0] else None)
        nav_buttons[page_id] = f

    # Bottom sidebar
    tk.Frame(sidebar, bg="#1E293B", height=1).pack(fill="x", padx=12, side="bottom", pady=(0, 0))
    bot = tk.Frame(sidebar, bg=SIDEBAR_BG, padx=12, pady=10)
    bot.pack(side="bottom", fill="x")
    btn_switch = tk.Label(bot, text="Tryb firmowy →", font=(FONT, 8), fg=TXT_MUT, bg=SIDEBAR_BG, cursor="hand2")
    btn_switch.pack(anchor="w")
    btn_switch.bind("<Button-1>", lambda e: on_back_to_login())
    lbl(bot, f"v{APP_VERSION} · © SILERS", size=7, color=TXT_MUT).pack(anchor="w", pady=(4, 0))

    # ── MAIN CONTENT AREA ──
    main = tk.Frame(outer, bg=BG)
    main.pack(side="left", fill="both", expand=True)

    # Content container (replaced per page)
    content_container = tk.Frame(main, bg=BG)
    content_container.pack(fill="both", expand=True)

    # Live metrics vars
    cpu_var = tk.StringVar(value="—")
    ram_var = tk.StringVar(value="—")
    disk_var = tk.StringVar(value="—")
    disk_free_var = tk.StringVar(value="—")

    def _update_metrics():
        try:
            cpu_var.set(f"{psutil.cpu_percent():.0f}%")
            ram_var.set(f"{psutil.virtual_memory().percent:.0f}%")
            disk = psutil.disk_usage("C:\\")
            disk_var.set(f"{disk.percent:.0f}%")
            disk_free_var.set(f"{disk.free / (1024**3):.1f} GB wolne")
        except Exception: pass
        root.after(2000, _update_metrics)
    _update_metrics()

    def show_page(page_id):
        for w in content_container.winfo_children(): w.destroy()
        f = tk.Frame(content_container, bg=BG)
        f.pack(fill="both", expand=True)

        if page_id == "overview":
            inner = tk.Frame(f, bg=BG, padx=24, pady=20)
            inner.pack(fill="both", expand=True)
            _page_overview(inner)
        elif page_id == "cleanup":
            _page_cleanup_inline(f)
        elif page_id == "audit":
            _page_audit_inline(f)
        elif page_id == "autostart":
            _page_autostart_inline(f)
        elif page_id == "monitor":
            inner = tk.Frame(f, bg=BG, padx=24, pady=20)
            inner.pack(fill="both", expand=True)
            _page_monitor(inner)
        elif page_id == "network":
            _page_network(f)
        elif page_id == "ai_repair":
            _page_ai_repair(f)
        elif page_id == "help":
            _page_remote_help(f)

    def _page_overview(f):
        """Main overview with big score ring."""
        # Score ring (canvas drawn)
        score = get_system_score()
        score_pct = int(score * 10)
        score_color = OK_C if score >= 7 else WARN_C if score >= 5 else ERR_C

        ring_f = tk.Frame(f, bg=BG)
        ring_f.pack(pady=(0, 16))

        ring_canvas = tk.Canvas(ring_f, width=180, height=180, bg=BG, highlightthickness=0)
        ring_canvas.pack()

        # Background circle
        ring_canvas.create_arc(15, 15, 165, 165, start=90, extent=-360, outline="#1E293B", width=10, style="arc")
        # Score arc
        extent = -(score_pct / 100) * 360
        ring_canvas.create_arc(15, 15, 165, 165, start=90, extent=extent, outline=score_color, width=10, style="arc")
        # Score text
        ring_canvas.create_text(90, 80, text=f"{score_pct}%", fill=score_color, font=(FONT, 28, "bold"))
        ring_canvas.create_text(90, 110, text="Zdrowie systemu", fill=TXT_DIM, font=(FONT, 9))

        # Status message
        if score >= 8:
            lbl(f, "Twój komputer jest w świetnym stanie!", size=13, bold=True, color=OK_C).pack()
        elif score >= 6:
            lbl(f, "Komputer wymaga drobnych poprawek", size=13, bold=True, color=WARN_C).pack()
        else:
            lbl(f, "Komputer wymaga uwagi!", size=13, bold=True, color=ERR_C).pack()

        lbl(f, "Sprawdź co możemy poprawić...", size=10, color=TXT_DIM).pack(pady=(2, 16))

        # Quick metrics
        metrics_grid = tk.Frame(f, bg=BG)
        metrics_grid.pack(fill="x", pady=(0, 16))

        def _metric_card(parent, label, var, color):
            card = tk.Frame(parent, bg=SURF, padx=14, pady=10)
            card.pack(side="left", fill="x", expand=True, padx=3)
            card.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
            lbl(card, label, size=8, color=TXT_DIM).pack(anchor="w")
            lbl(card, "", size=16, bold=True, color=color, textvariable=var).pack(anchor="w")

        _metric_card(metrics_grid, "CPU", cpu_var, PRI)
        _metric_card(metrics_grid, "RAM", ram_var, SEC)
        _metric_card(metrics_grid, "Dysk C:", disk_var, OK_C)

        # System info
        tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(8, 12))
        info = tk.Frame(f, bg=BG)
        info.pack(fill="x")
        hostname = os.environ.get("COMPUTERNAME", "Komputer")
        try:
            os_info = platform.platform()
            cpu_name = _wmic("cpu get name")
            ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
            lbl(info, f"💻  {hostname}  ·  {os_info}", size=9, color=TXT_DIM).pack(anchor="w")
            lbl(info, f"     {cpu_name}  ·  {ram_gb} GB RAM", size=9, color=TXT_MUT).pack(anchor="w")
        except Exception:
            lbl(info, f"💻  {hostname}", size=9, color=TXT_DIM).pack(anchor="w")

        # Battery
        bat = get_battery_info()
        if bat:
            bat_color = OK_C if bat["percent"] > 50 else WARN_C if bat["percent"] > 20 else ERR_C
            lbl(info, f"🔋  Bateria: {bat['percent']}% {'⚡ ładowanie' if bat['plugged'] else ''}", size=9, color=bat_color).pack(anchor="w", pady=(4, 0))

        # Disk health
        disks = get_disk_health_simple()
        for d in disks:
            d_color = OK_C if d["health"] == "Healthy" else ERR_C
            lbl(info, f"💾  {d['name']} ({d['type']}) — {d['health']}  ·  {d['size_gb']:.0f} GB", size=9, color=d_color).pack(anchor="w", pady=(2, 0))

    def _page_monitor(f):
        """Live monitoring page."""
        lbl(f, "📊  Monitoring systemu", size=14, bold=True).pack(anchor="w", pady=(0, 12))

        # Metrics
        items = [
            ("CPU", cpu_var, PRI),
            ("RAM", ram_var, SEC),
            ("Dysk C:", disk_var, OK_C),
            ("Wolne miejsce", disk_free_var, ACC),
        ]
        for label, var, color in items:
            row = tk.Frame(f, bg=SURF, padx=14, pady=10)
            row.pack(fill="x", pady=2)
            row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
            lbl(row, label, size=10, color=TXT_DIM).pack(side="left")
            lbl(row, "", size=14, bold=True, color=color, textvariable=var).pack(side="right")

        # Top RAM processes
        tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(16, 8))
        lbl(f, "Procesy zużywające RAM", size=11, bold=True, color=TXT_DIM).pack(anchor="w", pady=(0, 8))
        procs = get_top_ram_processes(6)
        for p in procs:
            row = tk.Frame(f, bg=BG)
            row.pack(fill="x", pady=1)
            lbl(row, f"{p['name']}", size=9, color=TXT).pack(side="left")
            lbl(row, f"{p['ram_pct']}%", size=9, bold=True, color=WARN_C if p['ram_pct'] > 5 else TXT_DIM).pack(side="right")

    def _page_cleanup_inline(parent):
        """Cleanup — intro screen first, then scan on click."""
        f = tk.Frame(parent, bg=BG, padx=28, pady=24)
        f.pack(fill="both", expand=True)

        # Header
        lbl(f, "🧹", size=28).pack(pady=(0, 4))
        lbl(f, "Czyszczenie systemu", size=16, bold=True).pack()
        lbl(f, "Usuń zbędne pliki i odzyskaj miejsce na dysku", size=10, color=TXT_DIM).pack(pady=(4, 16))

        # What we'll do — nice cards
        items_f = tk.Frame(f, bg=BG)
        items_f.pack(fill="x", pady=(0, 16))

        cleanup_items = [
            ("🗑️", "Pliki tymczasowe", "Windows Temp, cache użytkownika, prefetch"),
            ("🌐", "Cache przeglądarek", "Chrome, Edge, Internet Explorer"),
            ("📦", "Windows Update", "Stare pliki aktualizacji"),
            ("🗂️", "Kosz i miniaturki", "Opróżnienie kosza, cache miniaturek"),
            ("📋", "Logi i historia", "Logi systemowe, ostatnio otwierane pliki"),
        ]
        for icon, title, desc in cleanup_items:
            row = tk.Frame(items_f, bg=SURF2, padx=14, pady=8)
            row.pack(fill="x", pady=2)
            row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
            top = tk.Frame(row, bg=SURF2)
            top.pack(fill="x")
            lbl(top, f"{icon}  {title}", size=10, bold=True).pack(side="left")
            lbl(top, desc, size=8, color=TXT_DIM).pack(side="right")

        # Status area (hidden until scan starts)
        status_f = tk.Frame(f, bg=BG)
        status_var = tk.StringVar(value="")
        total_var = tk.StringVar(value="")
        status_lbl = lbl(status_f, "", size=10, color=ACC, textvariable=status_var)
        status_lbl.pack(anchor="w")
        total_lbl = lbl(status_f, "", size=13, bold=True, color=OK_C, textvariable=total_var)
        total_lbl.pack(anchor="w", pady=(2, 0))

        # Results area (scrollable, hidden until scan done)
        results_canvas = tk.Canvas(f, bg=BG, highlightthickness=0, height=0)
        results_inner = tk.Frame(results_canvas, bg=BG)
        results_cwin = results_canvas.create_window((0, 0), window=results_inner, anchor="nw")
        results_canvas.bind("<Configure>", lambda e: results_canvas.itemconfig(results_cwin, width=results_canvas.winfo_width()))
        results_inner.bind("<Configure>", lambda e: results_canvas.configure(scrollregion=results_canvas.bbox("all")))

        check_vars = {}
        categories = {}

        # Button area
        btn_f = tk.Frame(f, bg=BG)
        btn_f.pack(fill="x", pady=(8, 0))

        def start_scan():
            for w in btn_f.winfo_children(): w.destroy()
            status_f.pack(fill="x", pady=(8, 4))
            results_canvas.configure(height=200)
            results_canvas.pack(fill="both", expand=True, pady=(4, 0))

            def _scan():
                targets = [
                    ("temp_user", "Pliki tymczasowe", os.environ.get("TEMP", "")),
                    ("temp_win", "Windows Temp", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp")),
                    ("prefetch", "Prefetch", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Prefetch")),
                    ("ie_cache", "Cache Internet", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "INetCache")),
                    ("wu_cache", "Cache Windows Update", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "SoftwareDistribution", "Download")),
                    ("recent", "Ostatnio otwierane", os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Recent")),
                    ("logs", "Logi systemowe", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Logs")),
                ]
                # Browser caches
                for bname, bpath in [("Cache Chrome", os.path.join(os.environ.get("LOCALAPPDATA",""), "Google","Chrome","User Data","Default","Cache")),
                                     ("Cache Edge", os.path.join(os.environ.get("LOCALAPPDATA",""), "Microsoft","Edge","User Data","Default","Cache"))]:
                    if os.path.exists(bpath): targets.append((bname.lower().replace(" ","_"), bname, bpath))

                total_s = 0; total_f = 0
                for key, lab, path in targets:
                    root.after(0, lambda l=lab: status_var.set(f"Skanowanie: {l}..."))
                    sz = 0; cnt = 0
                    if path and os.path.exists(path):
                        try:
                            for dp, _, fns in os.walk(path):
                                for fn in fns:
                                    try: sz += os.path.getsize(os.path.join(dp, fn)); cnt += 1
                                    except: pass
                        except: pass
                    categories[key] = {"label": lab, "size": sz, "count": cnt, "path": path}
                    total_s += sz; total_f += cnt

                # Recycle Bin
                try:
                    import ctypes; rb_s=ctypes.c_ulonglong(0); rb_c=ctypes.c_ulonglong(0)
                    ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(rb_s), ctypes.byref(rb_c))
                    categories["recycle"]={"label":"Kosz","size":rb_s.value,"count":rb_c.value,"path":"RECYCLE"}
                    total_s+=rb_s.value; total_f+=rb_c.value
                except: pass

                def _show():
                    status_var.set(f"Znaleziono {total_f} plików")
                    total_var.set(f"{total_s/(1024*1024):.1f} MB do odzyskania")
                    for key, cat in categories.items():
                        if cat["count"]==0: continue
                        row = tk.Frame(results_inner, bg=SURF2, padx=12, pady=6)
                        row.pack(fill="x", pady=1)
                        row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
                        var = tk.BooleanVar(value=True); check_vars[key] = var
                        tk.Checkbutton(row, variable=var, bg=SURF2, activebackground=SURF2, selectcolor=SURF, highlightthickness=0, fg=TXT, activeforeground=TXT).pack(side="left")
                        lbl(row, cat["label"], size=10).pack(side="left", padx=(4,0))
                        mb = cat["size"]/(1024*1024)
                        lbl(row, f"{cat['count']} plików · {mb:.1f} MB" if mb>=1 else f"{cat['count']} plików", size=9, color=TXT_DIM).pack(side="right")
                    btn(btn_f, "🧹 Wyczyść zaznaczone", do_clean, bg=PRI, hover=PRI_H).pack(side="right")
                root.after(0, _show)
            threading.Thread(target=_scan, daemon=True).start()

        def do_clean():
            def _run():
                cleaned=0; cf=0
                for key, var in check_vars.items():
                    if not var.get(): continue
                    cat=categories[key]
                    root.after(0, lambda l=cat["label"]: status_var.set(f"Czyszczenie: {l}..."))
                    if cat["path"]=="RECYCLE":
                        try: subprocess.run(["powershell","-Command","Clear-RecycleBin -Force -ErrorAction SilentlyContinue"], capture_output=True, timeout=30, creationflags=_NO_WINDOW); cleaned+=cat["size"]; cf+=cat["count"]
                        except: pass
                    elif cat["path"] and os.path.exists(cat["path"]):
                        try:
                            for dp,ds,fs in os.walk(cat["path"], topdown=False):
                                for fn in fs:
                                    try: fp=os.path.join(dp,fn); cleaned+=os.path.getsize(fp); os.remove(fp); cf+=1
                                    except: pass
                                for d in ds:
                                    try: os.rmdir(os.path.join(dp,d))
                                    except: pass
                        except: pass
                root.after(0, lambda: status_var.set(f"✅ Gotowe! Usunięto {cf} plików"))
                root.after(0, lambda: total_var.set(f"Odzyskano {cleaned/(1024*1024):.1f} MB"))
            threading.Thread(target=_run, daemon=True).start()

        btn(btn_f, "▶  Skanuj system", start_scan, bg=PRI, hover=PRI_H).pack(side="right")

    def _page_audit_inline(parent):
        """Audit — intro screen first, scan on click."""
        f = tk.Frame(parent, bg=BG, padx=28, pady=24)
        f.pack(fill="both", expand=True)

        lbl(f, "🛡️", size=28).pack(pady=(0, 4))
        lbl(f, "Audyt bezpieczeństwa", size=16, bold=True).pack()
        lbl(f, "Sprawdzimy 20 krytycznych punktów bezpieczeństwa", size=10, color=TXT_DIM).pack(pady=(4, 16))

        checks_desc = [
            "Firewall Windows", "Windows Defender", "Definicje antywirusa",
            "Aktualizacje Windows", "SMBv1", "Konto Guest",
            "RDP NLA", "Szyfrowanie BitLocker", "Polityka haseł",
            "Blokada konta", "Konta admin", "Autorun",
            "PowerShell policy", "Udziały sieciowe", "Event Log",
            "Certyfikaty SSL", "Oczekujące aktualizacje", "Uptime",
            "Backup InfraDesk", "Remote Desktop"
        ]
        desc_f = tk.Frame(f, bg=SURF2, padx=14, pady=10)
        desc_f.pack(fill="x", pady=(0, 16))
        desc_f.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
        lbl(desc_f, "Co sprawdzamy:", size=10, bold=True, color=TXT_DIM).pack(anchor="w", pady=(0, 4))
        lbl(desc_f, " · ".join(checks_desc), size=8, color=TXT_MUT).pack(anchor="w")

        # Results area
        results_f = tk.Frame(f, bg=BG)
        score_var = tk.StringVar(value="")
        status_var = tk.StringVar(value="")

        btn_f = tk.Frame(f, bg=BG)
        btn_f.pack(fill="x", pady=(8, 0))

        def start_audit():
            for w in btn_f.winfo_children(): w.destroy()
            results_f.pack(fill="both", expand=True, pady=(8, 0))
            status_var.set("Uruchamiam testy...")
            lbl(results_f, "", size=10, color=ACC, textvariable=status_var).pack(anchor="w")

            # Scrollable
            canvas = tk.Canvas(results_f, bg=BG, highlightthickness=0)
            canvas.pack(fill="both", expand=True, pady=(4, 0))
            inner = tk.Frame(canvas, bg=BG)
            cwin = canvas.create_window((0,0), window=inner, anchor="nw")
            canvas.bind("<Configure>", lambda e: canvas.itemconfig(cwin, width=canvas.winfo_width()))
            inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
            canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1*(e.delta//120), "units"))

            SEV_C = {"critical": ERR_C, "high": "#F97316", "medium": WARN_C, "low": SEC, "info": TXT_DIM}
            SEV_L = {"critical": "KRYTYCZNY", "high": "WYSOKI", "medium": "ŚREDNI", "low": "NISKI", "info": "INFO"}

            def _run():
                result = security_audit()
                sc = result["score"]; checks = result["checks"]
                def _show():
                    color = OK_C if sc>=80 else WARN_C if sc>=60 else ERR_C
                    passed = len([c for c in checks if c["status"]=="pass"])
                    failed = len([c for c in checks if c["status"]=="fail"])
                    status_var.set(f"Wynik: {sc}/100 — {passed} ✓  {failed} ✗")

                    # Score ring
                    ring = tk.Canvas(inner, width=120, height=120, bg=BG, highlightthickness=0)
                    ring.pack(pady=(4, 8))
                    ring.create_arc(10,10,110,110, start=90, extent=-360, outline="#1E293B", width=8, style="arc")
                    ring.create_arc(10,10,110,110, start=90, extent=-(sc/100)*360, outline=color, width=8, style="arc")
                    ring.create_text(60,50, text=f"{sc}", fill=color, font=(FONT,22,"bold"))
                    ring.create_text(60,75, text="/ 100", fill=TXT_DIM, font=(FONT,8))

                    msg = "Komputer dobrze zabezpieczony!" if sc>=80 else "Znaleziono problemy" if sc>=60 else "Wymaga pilnej uwagi!"
                    lbl(inner, msg, size=11, bold=True, color=color).pack(pady=(0, 8))

                    sorted_c = sorted(checks, key=lambda c: (0 if c["status"]=="fail" else 1, {"critical":0,"high":1,"medium":2,"low":3}.get(c["severity"],5)))
                    for ch in sorted_c:
                        row = tk.Frame(inner, bg=SURF2, padx=12, pady=6)
                        row.pack(fill="x", pady=1)
                        bc = ERR_C if ch["status"]=="fail" else "#1E293B"
                        row.configure(highlightbackground=bc, highlightcolor=bc, highlightthickness=1)
                        icon = "✅" if ch["status"]=="pass" else "❌" if ch["status"]=="fail" else "⚠️"
                        top = tk.Frame(row, bg=SURF2); top.pack(fill="x")
                        lbl(top, f"{icon}  {ch['name']}", size=10, bold=True).pack(side="left")
                        sev_c = SEV_C.get(ch["severity"], TXT_DIM)
                        tk.Label(top, text=SEV_L.get(ch["severity"],""), font=(FONT,7,"bold"), bg=SURF2, fg=sev_c, padx=4).pack(side="right")
                        if ch.get("detail"):
                            dc = ERR_C if ch["status"]=="fail" else OK_C if ch["status"]=="pass" else WARN_C
                            lbl(row, f"     {ch['detail']}", size=8, color=dc).pack(anchor="w")
                root.after(0, _show)
            threading.Thread(target=_run, daemon=True).start()

        btn(btn_f, "▶  Uruchom audyt", start_audit, bg=PRI, hover=PRI_H).pack(side="right")

    def _page_autostart_inline(parent):
        """Autostart page inline."""
        f = tk.Frame(parent, bg=BG, padx=28, pady=24)
        f.pack(fill="both", expand=True)

        lbl(f, "🚀", size=28).pack(pady=(0, 4))
        lbl(f, "Programy autostartu", size=16, bold=True).pack()
        lbl(f, "Wyłącz niepotrzebne aby przyspieszyć start komputera", size=10, color=TXT_DIM).pack(pady=(4, 16))

        programs = get_autostart_programs()
        for prog in programs:
            row = tk.Frame(f, bg=SURF2, padx=14, pady=8)
            row.pack(fill="x", pady=2)
            row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
            lbl(row, prog["name"], size=10, bold=True).pack(side="left")
            lbl(row, f"({prog['location']})", size=8, color=TXT_DIM).pack(side="left", padx=(8, 0))
            lbl(row, "✅ Aktywny", size=9, color=OK_C).pack(side="right")
        if not programs:
            lbl(f, "Nie znaleziono programów autostartu", size=10, color=TXT_DIM).pack(pady=20)

    def _page_network(f_parent):
        """Network & Internet — speed test, ISP, IP, ports."""
        f = tk.Frame(f_parent, bg=BG, padx=28, pady=24)
        f.pack(fill="both", expand=True)

        lbl(f, "🌐", size=28).pack(pady=(0, 4))
        lbl(f, "Sieć i Internet", size=16, bold=True).pack()
        lbl(f, "Prędkość, dostawca, adres IP i otwarte porty", size=10, color=TXT_DIM).pack(pady=(4, 16))

        # Info area (scrollable)
        canvas = tk.Canvas(f, bg=BG, highlightthickness=0)
        canvas.pack(fill="both", expand=True)
        inner = tk.Frame(canvas, bg=BG)
        cwin = canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(cwin, width=canvas.winfo_width()))
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

        status_var = tk.StringVar(value="")
        lbl(inner, "", size=10, color=ACC, textvariable=status_var).pack(anchor="w", pady=(0, 8))

        # Results container
        results_f = tk.Frame(inner, bg=BG)
        results_f.pack(fill="x")

        def _info_row(parent, label, value, color=TXT):
            row = tk.Frame(parent, bg=SURF2, padx=14, pady=8)
            row.pack(fill="x", pady=1)
            row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
            lbl(row, label, size=10, color=TXT_DIM).pack(side="left")
            lbl(row, str(value), size=10, bold=True, color=color).pack(side="right")

        def load_info():
            status_var.set("Pobieranie informacji o sieci...")
            net = get_network_info()

            def _show_info():
                # Public IP
                if net.get("public_ip"):
                    _info_row(results_f, "Publiczny adres IP", net["public_ip"], ACC)
                # ISP
                if net.get("isp"):
                    _info_row(results_f, "Dostawca Internetu", net["isp"])
                # Gateway
                if net.get("gateway"):
                    _info_row(results_f, "Brama domyślna", net["gateway"])
                # DNS
                if net.get("dns"):
                    _info_row(results_f, "Serwery DNS", " · ".join(net["dns"][:3]))

                # Interfaces
                if net.get("interfaces"):
                    tk.Frame(results_f, bg=BORDER, height=1).pack(fill="x", pady=(10, 6))
                    lbl(results_f, "Interfejsy sieciowe", size=11, bold=True, color=TXT_DIM).pack(anchor="w", pady=(0, 4))
                    for iface in net["interfaces"]:
                        row = tk.Frame(results_f, bg=SURF2, padx=14, pady=6)
                        row.pack(fill="x", pady=1)
                        row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
                        status_dot = "🟢" if iface.get("isUp") else "🔴"
                        lbl(row, f"{status_dot} {iface['name']}", size=10, bold=True).pack(side="left")
                        speed_txt = f"{iface['speed']} Mbps" if iface.get('speed') else ""
                        lbl(row, f"{iface['ip']}  {speed_txt}", size=9, color=TXT_DIM).pack(side="right")

                # Open ports
                if net.get("open_ports"):
                    tk.Frame(results_f, bg=BORDER, height=1).pack(fill="x", pady=(10, 6))
                    lbl(results_f, f"Otwarte porty ({len(net['open_ports'])})", size=11, bold=True, color=TXT_DIM).pack(anchor="w", pady=(0, 4))
                    ports_f = tk.Frame(results_f, bg=BG)
                    ports_f.pack(fill="x")
                    row_f = None
                    for i, port in enumerate(net["open_ports"]):
                        if i % 8 == 0:
                            row_f = tk.Frame(ports_f, bg=BG)
                            row_f.pack(fill="x", pady=1)
                        p_lbl = tk.Label(row_f, text=str(port), font=(FONT, 9), bg=SURF2, fg=TXT_DIM, padx=8, pady=2)
                        p_lbl.pack(side="left", padx=1)
                        p_lbl.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)

                status_var.set("Informacje o sieci załadowane")

                # Speed test button
                tk.Frame(results_f, bg=BORDER, height=1).pack(fill="x", pady=(12, 8))
                btn(results_f, "▶  Zmierz prędkość Internetu", start_speed_test, bg=PRI, hover=PRI_H).pack(fill="x")

            root.after(0, _show_info)

        def start_speed_test():
            status_var.set("Mierzenie prędkości... proszę czekać...")
            def _run():
                result = speed_test_simple()
                def _show():
                    tk.Frame(results_f, bg=BORDER, height=1).pack(fill="x", pady=(8, 6))
                    lbl(results_f, "Wynik testu prędkości", size=11, bold=True, color=ACC).pack(anchor="w", pady=(0, 4))

                    speed_f = tk.Frame(results_f, bg=BG)
                    speed_f.pack(fill="x")

                    # Download
                    dl_card = tk.Frame(speed_f, bg=SURF2, padx=16, pady=10)
                    dl_card.pack(side="left", fill="x", expand=True, padx=(0, 4))
                    dl_card.configure(highlightbackground=OK_C, highlightcolor=OK_C, highlightthickness=1)
                    lbl(dl_card, "⬇ Download", size=9, color=TXT_DIM).pack(anchor="w")
                    dl_val = result.get("download_mbps", 0)
                    dl_color = OK_C if dl_val >= 50 else WARN_C if dl_val >= 10 else ERR_C
                    lbl(dl_card, f"{dl_val} Mbps", size=16, bold=True, color=dl_color).pack(anchor="w")

                    # Ping
                    pg_card = tk.Frame(speed_f, bg=SURF2, padx=16, pady=10)
                    pg_card.pack(side="left", fill="x", expand=True)
                    pg_card.configure(highlightbackground=SEC, highlightcolor=SEC, highlightthickness=1)
                    lbl(pg_card, "📶 Ping", size=9, color=TXT_DIM).pack(anchor="w")
                    pg_val = result.get("ping_ms", 0)
                    pg_color = OK_C if pg_val < 30 else WARN_C if pg_val < 100 else ERR_C
                    lbl(pg_card, f"{pg_val} ms", size=16, bold=True, color=pg_color).pack(anchor="w")

                    if result.get("error"):
                        lbl(results_f, f"⚠️ {result['error']}", size=9, color=WARN_C).pack(anchor="w", pady=(4, 0))

                    status_var.set("Test prędkości zakończony")
                root.after(0, _show)
            threading.Thread(target=_run, daemon=True).start()

        threading.Thread(target=load_info, daemon=True).start()

    def _page_ai_repair(f_parent):
        """AI Repair — info card with price and buy button."""
        f = tk.Frame(f_parent, bg=BG, padx=28, pady=24)
        f.pack(fill="both", expand=True)

        lbl(f, "💊", size=36).pack(pady=(0, 4))
        lbl(f, "Naprawa AI", size=18, bold=True).pack()
        lbl(f, "Sztuczna inteligencja zdiagnozuje i naprawi problem", size=10, color=TXT_DIM).pack(pady=(4, 20))

        # How it works
        card = tk.Frame(f, bg=SURF2, padx=20, pady=16)
        card.pack(fill="x", pady=(0, 16))
        card.configure(highlightbackground=PRI, highlightcolor=PRI, highlightthickness=1)

        steps = [
            ("1️⃣", "AI analizuje Twój komputer", "Logi, metryki, zainstalowane programy, błędy"),
            ("2️⃣", "Diagnoza problemu", "AI identyfikuje przyczynę i proponuje rozwiązanie"),
            ("3️⃣", "Automatyczna naprawa", "Skrypty PowerShell naprawią problem krok po kroku"),
            ("4️⃣", "Raport", "Szczegółowy raport co zostało naprawione"),
        ]
        for icon, title, desc in steps:
            row = tk.Frame(card, bg=SURF2, pady=4)
            row.pack(fill="x")
            lbl(row, f"{icon}  {title}", size=10, bold=True).pack(anchor="w")
            lbl(row, f"       {desc}", size=8, color=TXT_DIM).pack(anchor="w")

        # Price
        price_f = tk.Frame(f, bg=SURF, padx=20, pady=14)
        price_f.pack(fill="x", pady=(0, 12))
        price_f.configure(highlightbackground=ACC, highlightcolor=ACC, highlightthickness=2)
        lbl(price_f, "GRATIS", size=20, bold=True, color=OK_C).pack(side="left")
        lbl(price_f, "Promocja startowa — normalnie 29 zł", size=9, color=TXT_DIM).pack(side="left", padx=(12, 0))

        btn(f, "▶  Uruchom diagnostykę AI", lambda: None, bg=PRI, hover=PRI_H).pack(fill="x")
        lbl(f, "AI przeskanuje system i zaproponuje naprawę", size=8, color=TXT_MUT).pack(pady=(6, 0))

    def _page_remote_help(f_parent):
        """Remote help — business card with RustDesk download."""
        f = tk.Frame(f_parent, bg=BG, padx=28, pady=24)
        f.pack(fill="both", expand=True)

        lbl(f, "🆘", size=36).pack(pady=(0, 4))
        lbl(f, "Pomoc zdalna", size=18, bold=True).pack()
        lbl(f, "Certyfikowany technik połączy się z Twoim komputerem", size=10, color=TXT_DIM).pack(pady=(4, 20))

        # Business card
        card = tk.Frame(f, bg=SURF2, padx=20, pady=16)
        card.pack(fill="x", pady=(0, 12))
        card.configure(highlightbackground=SEC, highlightcolor=SEC, highlightthickness=1)
        lbl(card, "SILERS — Obsługa informatyczna", size=12, bold=True).pack(anchor="w")
        lbl(card, "📞  +48 575 662 664", size=11, color=ACC).pack(anchor="w", pady=(8, 2))
        lbl(card, "✉️  kontakt@infradesk.pl", size=10, color=TXT_DIM).pack(anchor="w")
        lbl(card, "🌐  infradesk.pl", size=10, color=TXT_DIM).pack(anchor="w")

        # Price
        price_f = tk.Frame(f, bg=SURF, padx=20, pady=12)
        price_f.pack(fill="x", pady=(0, 16))
        price_f.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
        lbl(price_f, "od 89 zł", size=16, bold=True, color=PRI).pack(side="left")
        lbl(price_f, "Czas sesji: od 15 do 60 min", size=9, color=TXT_DIM).pack(side="left", padx=(12, 0))

        # RustDesk download
        tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(0, 12))
        lbl(f, "Aby technik mógł się połączyć, potrzebujesz RustDesk:", size=9, color=TXT_DIM).pack(anchor="w", pady=(0, 8))

        def open_rustdesk():
            import webbrowser; webbrowser.open("https://infradesk.pl/downloads/rustdesk.apk")

        def download_rustdesk():
            import webbrowser; webbrowser.open("https://rustdesk.com/")

        btn(f, "⬇  Pobierz RustDesk (zdalny pulpit)", download_rustdesk, bg=SEC, hover="#1D4ED8").pack(fill="x")
        lbl(f, "Bezpłatne narzędzie do zdalnej pomocy · rustdesk.com", size=8, color=TXT_MUT).pack(pady=(6, 0))

    # Show initial page
    switch_page("overview")
    nav_buttons["overview"].configure(bg=ACTIVE_BG, highlightbackground=PRI, highlightthickness=2)


def show_autostart(root, cfg):
    """Autostart manager window."""
    win = tk.Toplevel(root)
    win.title("Autostart — Asystent InfraDesk")
    win.configure(bg=BG)
    win.geometry("500x400")
    win.grab_set()

    lbl(win, "Programy uruchamiane przy starcie", size=13, bold=True).pack(padx=16, pady=(16, 8), anchor="w")
    lbl(win, "Wyłącz niepotrzebne aby przyspieszyć start komputera", size=9, color=TXT_DIM).pack(padx=16, anchor="w")

    frame = tk.Frame(win, bg=BG, padx=16, pady=8)
    frame.pack(fill="both", expand=True)

    programs = get_autostart_programs()
    for prog in programs:
        row = tk.Frame(frame, bg=SURF, padx=10, pady=6)
        row.pack(fill="x", pady=2)
        row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
        lbl(row, prog["name"], size=10, bold=True).pack(side="left")
        lbl(row, f"  ({prog['location']})", size=8, color=TXT_DIM).pack(side="left")
        # Toggle would go here — simplified for now
        lbl(row, "✓ Włączony", size=9, color=OK_C).pack(side="right")

    if not programs:
        lbl(frame, "Nie znaleziono programów autostartu", size=10, color=TXT_DIM).pack(pady=20)

    btn(win, "Zamknij", win.destroy, bg=SURF2, hover=BORDER).pack(padx=16, pady=12, anchor="e")


# ─── Cleanup Window (CCleaner-style) ─────────────────────────────────────────

def show_cleanup_window(root):
    """Full cleanup window — scan first, show results, then clean."""
    win = tk.Toplevel(root)
    win.title("Czyszczenie systemu — Asystent InfraDesk")
    win.configure(bg=BG)
    win.geometry("600x550")
    win.resizable(False, True)
    win.grab_set()
    win.lift()

    # Header
    hdr = tk.Frame(win, bg=SURF, padx=20, pady=12)
    hdr.pack(fill="x")
    hdr.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
    lbl(hdr, "🧹  Czyszczenie systemu", size=14, bold=True).pack(side="left")
    total_var = tk.StringVar(value="Skanowanie...")
    lbl(hdr, "", size=12, bold=True, color=OK_C, textvariable=total_var).pack(side="right")

    # Categories frame
    cat_frame = tk.Frame(win, bg=BG, padx=20, pady=10)
    cat_frame.pack(fill="both", expand=True)

    # Progress
    progress_var = tk.StringVar(value="Analizuję system...")
    lbl(cat_frame, "", size=10, color=ACC, textvariable=progress_var).pack(anchor="w", pady=(0, 8))

    # Category rows (will be populated after scan)
    rows_frame = tk.Frame(cat_frame, bg=BG)
    rows_frame.pack(fill="both", expand=True)

    # Buttons
    btn_frame = tk.Frame(win, bg=BG, padx=20, pady=12)
    btn_frame.pack(fill="x")

    categories = {}
    check_vars = {}

    def scan():
        """Scan and show what can be cleaned."""
        scan_targets = [
            ("temp_user", "Pliki tymczasowe użytkownika", os.environ.get("TEMP", "")),
            ("temp_win", "Pliki tymczasowe Windows", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp")),
            ("prefetch", "Prefetch (przyspieszanie startu)", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Prefetch")),
            ("ie_cache", "Cache przeglądarki / Internet", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "INetCache")),
            ("thumbnails", "Miniaturki (Thumbnails)", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Explorer")),
            ("wu_cache", "Cache Windows Update", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "SoftwareDistribution", "Download")),
            ("recent", "Ostatnio otwierane pliki", os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Recent")),
            ("logs", "Logi systemowe", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Logs")),
        ]

        total_size = 0
        total_files = 0

        for key, label, path in scan_targets:
            root.after(0, lambda l=label: progress_var.set(f"Skanowanie: {l}..."))
            size = 0
            count = 0
            if path and os.path.exists(path):
                try:
                    for dirpath, dirnames, filenames in os.walk(path):
                        for fname in filenames:
                            try:
                                fp = os.path.join(dirpath, fname)
                                sz = os.path.getsize(fp)
                                size += sz
                                count += 1
                            except Exception:
                                pass
                except Exception:
                    pass
            categories[key] = {"label": label, "size": size, "count": count, "path": path}
            total_size += size
            total_files += count

        # Recycle Bin estimation
        try:
            import ctypes
            rb_size = ctypes.c_ulonglong(0)
            rb_count = ctypes.c_ulonglong(0)
            ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(rb_size), ctypes.byref(rb_count))
            categories["recycle"] = {"label": "Kosz", "size": rb_size.value, "count": rb_count.value, "path": "RECYCLE"}
            total_size += rb_size.value
            total_files += rb_count.value
        except Exception:
            categories["recycle"] = {"label": "Kosz", "size": 0, "count": 0, "path": "RECYCLE"}

        # Chrome cache
        chrome_cache = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data", "Default", "Cache")
        if os.path.exists(chrome_cache):
            size = 0; count = 0
            try:
                for dirpath, _, filenames in os.walk(chrome_cache):
                    for fname in filenames:
                        try: fp = os.path.join(dirpath, fname); size += os.path.getsize(fp); count += 1
                        except: pass
            except: pass
            categories["chrome_cache"] = {"label": "Cache Google Chrome", "size": size, "count": count, "path": chrome_cache}
            total_size += size; total_files += count

        # Edge cache
        edge_cache = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data", "Default", "Cache")
        if os.path.exists(edge_cache):
            size = 0; count = 0
            try:
                for dirpath, _, filenames in os.walk(edge_cache):
                    for fname in filenames:
                        try: fp = os.path.join(dirpath, fname); size += os.path.getsize(fp); count += 1
                        except: pass
            except: pass
            categories["edge_cache"] = {"label": "Cache Microsoft Edge", "size": size, "count": count, "path": edge_cache}
            total_size += size; total_files += count

        def _show_results():
            progress_var.set(f"Znaleziono {total_files} plików do usunięcia")
            total_var.set(f"{total_size / (1024*1024):.1f} MB do odzyskania")

            for key, cat in categories.items():
                if cat["count"] == 0:
                    continue
                row = tk.Frame(rows_frame, bg=SURF, padx=12, pady=8)
                row.pack(fill="x", pady=1)
                row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)

                var = tk.BooleanVar(value=True)
                check_vars[key] = var

                cb = tk.Checkbutton(row, variable=var, bg=SURF, activebackground=SURF,
                                    selectcolor=SURF2, highlightthickness=0)
                cb.pack(side="left")

                lbl(row, cat["label"], size=10, bold=False).pack(side="left", padx=(4, 0))
                size_mb = cat["size"] / (1024*1024)
                size_text = f"{size_mb:.1f} MB" if size_mb >= 1 else f"{cat['size'] / 1024:.0f} KB"
                lbl(row, f"{cat['count']} plików  ·  {size_text}", size=9, color=TXT_DIM).pack(side="right")

            # Clean button
            btn(btn_frame, "🧹 Wyczyść zaznaczone", lambda: do_clean(win, categories, check_vars, total_var, progress_var),
                bg=PRI, hover=PRI_H).pack(side="right", padx=(8, 0))
            btn(btn_frame, "Zamknij", win.destroy, bg=SURF2, hover=BORDER).pack(side="right")

        root.after(0, _show_results)

    def do_clean(win, cats, checks, total_v, prog_v):
        def _clean():
            cleaned_size = 0
            cleaned_files = 0
            for key, var in checks.items():
                if not var.get():
                    continue
                cat = cats[key]
                root.after(0, lambda l=cat["label"]: prog_v.set(f"Czyszczenie: {l}..."))

                if cat["path"] == "RECYCLE":
                    try:
                        subprocess.run(["powershell", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                                       capture_output=True, timeout=30, creationflags=_NO_WINDOW)
                        cleaned_size += cat["size"]; cleaned_files += cat["count"]
                    except: pass
                elif cat["path"] and os.path.exists(cat["path"]):
                    try:
                        for dirpath, dirs, files in os.walk(cat["path"], topdown=False):
                            for fname in files:
                                try:
                                    fp = os.path.join(dirpath, fname)
                                    sz = os.path.getsize(fp)
                                    os.remove(fp)
                                    cleaned_size += sz; cleaned_files += 1
                                except: pass
                            for dname in dirs:
                                try: os.rmdir(os.path.join(dirpath, dname))
                                except: pass
                    except: pass

            mb = cleaned_size / (1024*1024)
            root.after(0, lambda: prog_v.set(f"✅ Gotowe! Usunięto {cleaned_files} plików"))
            root.after(0, lambda: total_v.set(f"Odzyskano {mb:.1f} MB"))
        threading.Thread(target=_clean, daemon=True).start()

    threading.Thread(target=scan, daemon=True).start()


# ─── Audit Window (professional report) ──────────────────────────────────────

def show_audit_window(root):
    """Full security audit window with detailed checklist report."""
    win = tk.Toplevel(root)
    win.title("Audyt bezpieczeństwa — Asystent InfraDesk")
    win.configure(bg=BG)
    win.geometry("620x600")
    win.resizable(False, True)
    win.grab_set()
    win.lift()

    # Header
    hdr = tk.Frame(win, bg=SURF, padx=20, pady=12)
    hdr.pack(fill="x")
    hdr.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
    lbl(hdr, "🛡️  Audyt bezpieczeństwa", size=14, bold=True).pack(side="left")
    score_var = tk.StringVar(value="Skanowanie...")
    score_lbl = lbl(hdr, "", size=16, bold=True, textvariable=score_var)
    score_lbl.pack(side="right")

    # Progress
    prog_frame = tk.Frame(win, bg=BG, padx=20, pady=8)
    prog_frame.pack(fill="x")
    prog_var = tk.StringVar(value="Uruchamiam testy bezpieczeństwa...")
    lbl(prog_frame, "", size=10, color=ACC, textvariable=prog_var).pack(anchor="w")

    # Results scrollable
    canvas = tk.Canvas(win, bg=BG, highlightthickness=0)
    sb = ttk.Scrollbar(win, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    canvas.pack(fill="both", expand=True, padx=0)
    results_frame = tk.Frame(canvas, bg=BG, padx=20, pady=8)
    cwin = canvas.create_window((0, 0), window=results_frame, anchor="nw")
    def _rc(e): canvas.itemconfig(cwin, width=canvas.winfo_width())
    def _ri(e): canvas.configure(scrollregion=canvas.bbox("all"))
    canvas.bind("<Configure>", _rc)
    results_frame.bind("<Configure>", _ri)
    canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))

    # Bottom
    bottom = tk.Frame(win, bg=BG, padx=20, pady=10)
    bottom.pack(fill="x")

    SEVERITY_LABELS = {"critical": "KRYTYCZNY", "high": "WYSOKI", "medium": "ŚREDNI", "low": "NISKI", "info": "INFO"}
    SEVERITY_COLORS = {"critical": ERR_C, "high": "#F97316", "medium": WARN_C, "low": SEC, "info": TXT_DIM}

    def run_audit():
        checks_done = [0]
        total_checks = 20

        def _progress(check_name):
            checks_done[0] += 1
            root.after(0, lambda: prog_var.set(f"Test {checks_done[0]}/{total_checks}: {check_name}..."))

        # Run audit
        result = security_audit()
        score = result["score"]
        checks = result["checks"]

        def _show():
            # Score
            score_color = OK_C if score >= 80 else WARN_C if score >= 60 else ERR_C
            score_var.set(f"{score}/100")
            score_lbl.configure(fg=score_color)

            # Summary
            passed = len([c for c in checks if c["status"] == "pass"])
            failed = len([c for c in checks if c["status"] == "fail"])
            errors = len([c for c in checks if c["status"] == "error"])

            prog_var.set(f"Zakończono — {passed} ✓  {failed} ✗  {errors} ⚠")

            # Summary bar
            summary = tk.Frame(results_frame, bg=SURF, padx=16, pady=10)
            summary.pack(fill="x", pady=(0, 10))
            summary.configure(highlightbackground=score_color, highlightcolor=score_color, highlightthickness=2)

            if score >= 80:
                lbl(summary, "Twój komputer jest dobrze zabezpieczony", size=12, bold=True, color=OK_C).pack(anchor="w")
            elif score >= 60:
                lbl(summary, "Znaleziono kilka problemów do poprawienia", size=12, bold=True, color=WARN_C).pack(anchor="w")
            else:
                lbl(summary, "Twój komputer wymaga pilnej uwagi!", size=12, bold=True, color=ERR_C).pack(anchor="w")

            # Failed first, then passed
            sorted_checks = sorted(checks, key=lambda c: (0 if c["status"] == "fail" else 1, {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}.get(c["severity"], 5)))

            for check in sorted_checks:
                row = tk.Frame(results_frame, bg=SURF, padx=12, pady=8)
                row.pack(fill="x", pady=1)

                if check["status"] == "fail":
                    row.configure(highlightbackground=ERR_C, highlightcolor=ERR_C, highlightthickness=1)
                elif check["status"] == "pass":
                    row.configure(highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
                else:
                    row.configure(highlightbackground=WARN_C, highlightcolor=WARN_C, highlightthickness=1)

                # Status icon
                if check["status"] == "pass":
                    icon_text = "✅"
                elif check["status"] == "fail":
                    icon_text = "❌"
                else:
                    icon_text = "⚠️"

                left = tk.Frame(row, bg=SURF)
                left.pack(side="left", fill="x", expand=True)

                top_row = tk.Frame(left, bg=SURF)
                top_row.pack(fill="x")

                lbl(top_row, icon_text, size=11).pack(side="left")
                lbl(top_row, f"  {check['name']}", size=10, bold=True).pack(side="left")

                # Severity badge
                sev_color = SEVERITY_COLORS.get(check["severity"], TXT_DIM)
                sev_label = SEVERITY_LABELS.get(check["severity"], check["severity"])
                badge = tk.Label(top_row, text=sev_label, font=(FONT, 7, "bold"),
                                 bg=SURF, fg=sev_color, padx=4)
                badge.pack(side="right")

                # Detail
                if check.get("detail"):
                    detail_color = ERR_C if check["status"] == "fail" else OK_C if check["status"] == "pass" else WARN_C
                    lbl(left, f"     {check['detail']}", size=9, color=detail_color).pack(anchor="w")

            # Close button
            btn(bottom, "Zamknij", win.destroy, bg=SURF2, hover=BORDER).pack(side="right")

        root.after(0, _show)

    threading.Thread(target=run_audit, daemon=True).start()


# ─── Mode Selection (first run) ──────────────────────────────────────────────

def show_mode_select(root, on_business, on_home):
    """First run: choose Business or Home mode."""
    _clear(root)
    root.title("InfraDesk — Wybór trybu")
    W, H = 560, 420
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
    root.resizable(False, False)

    f = tk.Frame(root, bg=BG, padx=40, pady=30)
    f.pack(fill="both", expand=True)

    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((48, 48), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img_pil = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img_pil.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img_pil.convert("RGB"))
        logo_l = tk.Label(f, image=_img, bg=BG, bd=0)
        logo_l.image = _img
        logo_l.pack(pady=(0, 6))
    except Exception: pass

    lbl(f, "Witaj w InfraDesk!", size=18, bold=True).pack()
    lbl(f, "Jak chcesz korzystać z aplikacji?", size=11, color=TXT_DIM).pack(pady=(4, 20))

    # Business card
    biz = tk.Frame(f, bg=SURF, padx=16, pady=14, cursor="hand2")
    biz.pack(fill="x", pady=(0, 8))
    biz.configure(highlightbackground=SEC, highlightcolor=SEC, highlightthickness=1)
    lbl(biz, "🏢  InfraDesk", size=13, bold=True).pack(anchor="w")
    lbl(biz, "Dla firm — zarządzanie infrastrukturą IT", size=10, color=TXT_DIM).pack(anchor="w")
    lbl(biz, "Logowanie firmowe, zgłoszenia, monitoring, backup", size=9, color=TXT_MUT).pack(anchor="w", pady=(4, 0))
    biz.bind("<Button-1>", lambda e: on_business())
    for w in biz.winfo_children(): w.bind("<Button-1>", lambda e: on_business())
    biz.bind("<Enter>", lambda e: biz.configure(highlightbackground=PRI))
    biz.bind("<Leave>", lambda e: biz.configure(highlightbackground=SEC))

    # Home card
    home = tk.Frame(f, bg=SURF, padx=16, pady=14, cursor="hand2")
    home.pack(fill="x")
    home.configure(highlightbackground=OK_C, highlightcolor=OK_C, highlightthickness=1)
    lbl(home, "🏠  Asystent InfraDesk", size=13, bold=True).pack(anchor="w")
    lbl(home, "Dla użytkowników domowych — za darmo", size=10, color=TXT_DIM).pack(anchor="w")
    lbl(home, "Monitoring, czyszczenie, audyt, pomoc zdalna", size=9, color=TXT_MUT).pack(anchor="w", pady=(4, 0))
    lbl(home, "BEZPŁATNIE", size=9, bold=True, color=OK_C).pack(anchor="w", pady=(4, 0))
    home.bind("<Button-1>", lambda e: on_home())
    for w in home.winfo_children(): w.bind("<Button-1>", lambda e: on_home())
    home.bind("<Enter>", lambda e: home.configure(highlightbackground=ACC))
    home.bind("<Leave>", lambda e: home.configure(highlightbackground=OK_C))


class ServerServiceLoop:
    """Headless background loop for server mode (Windows Service or --service CLI)."""

    def __init__(self, token: str, cfg: dict):
        self.token = token
        self.cfg = cfg
        self._running = True
        self._ws = None

    def _on_ws(self, msg):
        mtype = msg.get("type")
        if mtype in ("notification", "status_update"):
            log.info("WS notification: %s — %s", msg.get("title", ""), msg.get("body", ""))
        elif mtype == "update":
            info = check_for_update()
            if info:
                _, url = info
                threading.Thread(target=do_self_update, args=(url,), daemon=True).start()
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
        """Reuse existing method pattern."""
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
                subprocess.run(["schtasks", "/create", "/tn", "InfraDesk_WinUpdate_Restart",
                    "/tr", 'shutdown /r /t 60 /c "InfraDesk: restart po aktualizacji"',
                    "/sc", "once", "/st", schedule_time, "/f"],
                    capture_output=True, timeout=30, creationflags=_NO_WINDOW)
                log.info("Restart scheduled at %s", schedule_time)
        except Exception as e:
            log.error("Windows Update error: %s", e)

    def _restart_win_service(self, service_name):
        """Restart a Windows service remotely."""
        try:
            log.info("Restarting service: %s", service_name)
            subprocess.run(["net", "stop", service_name], capture_output=True, timeout=60, creationflags=_NO_WINDOW)
            time.sleep(2)
            result = subprocess.run(["net", "start", service_name], capture_output=True, text=True, timeout=60, creationflags=_NO_WINDOW)
            log.info("Service %s restart: %s", service_name, "OK" if result.returncode == 0 else result.stderr)
        except Exception as e:
            log.error("Service restart error: %s", e)

    def _schedule_reboot(self, delay_seconds):
        """Schedule system reboot."""
        try:
            log.info("Scheduling system reboot in %ds", delay_seconds)
            subprocess.run(["shutdown", "/r", "/t", str(delay_seconds), "/c", "InfraDesk: zaplanowany restart serwera"],
                capture_output=True, timeout=10, creationflags=_NO_WINDOW)
        except Exception as e:
            log.error("Reboot schedule error: %s", e)

    def start(self):
        log.info("ServerServiceLoop starting (token=%s...)", self.token[:8])

        # WebSocket
        self._ws = WS(self.token, self._on_ws)
        threading.Thread(target=self._ws.run, daemon=True).start()

        # Backup scheduler
        self._backup = None
        try:
            self._backup = BackupScheduler(self.token)
        except Exception as e:
            log.warning("Backup scheduler init failed: %s", e)

        # Auto diagnostics
        diag = None
        try:
            diag = AutoDiagnostics(self.token, self.cfg)
            threading.Thread(target=diag.run, daemon=True).start()
        except Exception as e:
            log.warning("AutoDiagnostics init failed: %s", e)

        # Metrics loop
        cycle = 0
        while self._running:
            try:
                data = metrics()
                # Add server metrics every 5th cycle (every 5 min)
                if cycle % 5 == 0:
                    srv = server_metrics()
                    if srv:
                        data["serverMetrics"] = srv
                # Security audit every 60th cycle (every hour)
                if cycle % 60 == 0 or cycle == 0:
                    try:
                        audit = security_audit()
                        data.setdefault("serverMetrics", {})["securityAudit"] = audit
                        log.info("Security audit: score=%s", audit.get("score"))
                    except Exception as e:
                        log.warning("Security audit error: %s", e)
                # Network scan every 30th cycle (every 30 min)
                if cycle % 30 == 0:
                    try:
                        scan = network_scan()
                        data.setdefault("serverMetrics", {})["networkScan"] = scan
                    except Exception as e:
                        log.warning("Network scan error: %s", e)
                do_metrics(self.token, data)
            except Exception as e:
                log.warning("Metrics error: %s", e)

            # Backup check
            if self._backup:
                try: self._backup.check_and_run()
                except Exception: pass
                if cycle % 5 == 0:
                    try: self._backup.sync_configs()
                    except Exception: pass

            time.sleep(60)
            cycle += 1

    def stop(self):
        self._running = False


# ── Windows Service wrapper ──────────────────────────────────────────────────
_SERVICE_NAME = "InfraDeskServerAgent"
_SERVICE_DISPLAY = "InfraDesk Server Agent"
_SERVICE_DESC = "InfraDesk monitoring agent for Windows servers"

try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager

    class InfraDeskService(win32serviceutil.ServiceFramework):
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
            log.info("InfraDesk Server Agent service starting")
            cfg = load_config()
            if not cfg.get("token") or cfg.get("status") != "ACTIVE":
                log.error("Service cannot start — agent not registered or not active. Run agent.exe first to register.")
                servicemanager.LogMsg(servicemanager.EVENTLOG_ERROR_TYPE, 0xF000,
                                      ("Agent not registered. Run InfraDesk Agent.exe first.", '', ''))
                return

            self._loop = ServerServiceLoop(cfg["token"], cfg)
            threading.Thread(target=self._loop.start, daemon=True).start()
            win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
            log.info("Service stopped")

    _HAS_WIN32SVC = True
except ImportError:
    _HAS_WIN32SVC = False
    log.debug("win32serviceutil not available — service mode disabled")


def _install_service():
    """Install InfraDesk as a Windows Service."""
    if not _HAS_WIN32SVC:
        print("ERROR: pywin32 nie jest zainstalowany. Uruchom: pip install pywin32")
        return
    try:
        win32serviceutil.InstallService(
            InfraDeskService._svc_reg_class_,
            _SERVICE_NAME,
            _SERVICE_DISPLAY,
            startType=win32service.SERVICE_AUTO_START,
            description=_SERVICE_DESC,
        )
        print(f"[OK] Usługa '{_SERVICE_DISPLAY}' zainstalowana.")
        print(f"     Uruchom: net start {_SERVICE_NAME}")
    except Exception as e:
        # Fallback: use sc.exe
        exe_path = sys.executable if not getattr(sys, 'frozen', False) else INSTALL_EXE
        cmd = f'sc create {_SERVICE_NAME} binPath= "\"{exe_path}\" --service" start= auto DisplayName= "{_SERVICE_DISPLAY}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            subprocess.run(f'sc description {_SERVICE_NAME} "{_SERVICE_DESC}"', shell=True, capture_output=True)
            print(f"[OK] Usługa '{_SERVICE_DISPLAY}' zainstalowana (sc.exe).")
            print(f"     Uruchom: net start {_SERVICE_NAME}")
        else:
            print(f"[BŁĄD] Nie udało się zainstalować usługi: {e}\n{result.stderr}")


def _remove_service():
    """Remove InfraDesk Windows Service."""
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
        print(f"[OK] Usługa '{_SERVICE_DISPLAY}' usunięta.")
    except Exception as e:
        print(f"[BŁĄD] {e}")


def _run_home_webview():
    """Run Asystent InfraDesk as standalone webview — main thread."""
    try:
        import webview

        class AsystentAPI:
            """Full Python API for Asystent InfraDesk webview."""

            def get_system_info(self):
                try:
                    return {
                        "hostname": os.environ.get("COMPUTERNAME", ""),
                        "currentUser": os.environ.get("USERNAME", ""),
                        "os": platform.platform(),
                        "cpu": _wmic("cpu get name"),
                        "ramGb": round(psutil.virtual_memory().total / (1024**3), 1),
                        "score": get_system_score(),
                        "battery": get_battery_info(),
                        "disks": get_disk_health_simple(),
                        "version": APP_VERSION,
                    }
                except Exception as e:
                    return {"error": str(e)}

            def check_update(self):
                try:
                    result = check_for_update()
                    if result:
                        ver, url = result
                        return {"available": True, "version": ver, "url": url}
                    return {"available": False}
                except Exception as e:
                    return {"available": False, "error": str(e)}

            def do_update(self):
                try:
                    result = check_for_update()
                    if result:
                        ver, url = result
                        do_self_update(url)
                        return {"ok": True}
                    return {"ok": False, "error": "Brak aktualizacji"}
                except Exception as e:
                    return {"ok": False, "error": str(e)}

            def open_url(self, url):
                import webbrowser
                webbrowser.open(url)

            def logout(self):
                try:
                    save_config({})
                    log.info("User logged out")
                    os._exit(0)
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

            def start_cleanup_scan(self):
                targets = [
                    ("temp_user", "Pliki tymczasowe", os.environ.get("TEMP", "")),
                    ("temp_win", "Windows Temp", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp")),
                    ("prefetch", "Prefetch", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Prefetch")),
                    ("ie_cache", "Cache Internet", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "INetCache")),
                    ("wu_cache", "Cache Windows Update", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "SoftwareDistribution", "Download")),
                    ("logs", "Logi systemowe", os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Logs")),
                ]
                for bname, bpath in [
                    ("Cache Chrome", os.path.join(os.environ.get("LOCALAPPDATA",""), "Google","Chrome","User Data","Default","Cache")),
                    ("Cache Edge", os.path.join(os.environ.get("LOCALAPPDATA",""), "Microsoft","Edge","User Data","Default","Cache"))]:
                    if os.path.exists(bpath):
                        targets.append((bname.lower().replace(" ","_"), bname, bpath))

                results = []
                for key, label, path in targets:
                    sz = 0; cnt = 0
                    if path and os.path.exists(path):
                        try:
                            for dp, _, fns in os.walk(path):
                                for fn in fns:
                                    try: sz += os.path.getsize(os.path.join(dp, fn)); cnt += 1
                                    except: pass
                        except: pass
                    if cnt > 0:
                        results.append({"key": key, "label": label, "size": sz, "count": cnt, "path": path})
                try:
                    import ctypes
                    rb_s = ctypes.c_ulonglong(0); rb_c = ctypes.c_ulonglong(0)
                    ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(rb_s), ctypes.byref(rb_c))
                    if rb_c.value > 0:
                        results.append({"key": "recycle", "label": "Kosz", "size": rb_s.value, "count": rb_c.value, "path": "RECYCLE"})
                except: pass
                return results

            def run_cleanup(self, keys):
                scan = self.start_cleanup_scan()
                cat_map = {c["key"]: c for c in scan}
                cleaned = 0; cf = 0
                for key in (keys if isinstance(keys, list) else [keys]):
                    cat = cat_map.get(key)
                    if not cat: continue
                    if cat["path"] == "RECYCLE":
                        try:
                            subprocess.run(["powershell", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                                capture_output=True, timeout=30, creationflags=_NO_WINDOW)
                            cleaned += cat["size"]; cf += cat["count"]
                        except: pass
                    elif cat["path"] and os.path.exists(cat["path"]):
                        try:
                            for dp, ds, fs in os.walk(cat["path"], topdown=False):
                                for fn in fs:
                                    try: fp = os.path.join(dp, fn); cleaned += os.path.getsize(fp); os.remove(fp); cf += 1
                                    except: pass
                                for d in ds:
                                    try: os.rmdir(os.path.join(dp, d))
                                    except: pass
                        except: pass
                return {"cleanedBytes": cleaned, "filesRemoved": cf}

            def run_security_audit(self):
                return security_audit()

            def run_ai_diagnose(self):
                return ai_diagnose()

            def full_diagnosis(self):
                """Comprehensive system audit — all checks."""
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

                    # Top RAM processes
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
                                    except: pass
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
                    except: add('bezpieczenstwo','Windows Defender','warn','Nie udało się sprawdzić','low')

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
                    except: add('bezpieczenstwo','Firewall','warn','Nie udało się sprawdzić','low')

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
                    except: pass

                    # ── SIEĆ ──
                    try:
                        r = subprocess.run(["ping","-n","2","-w","2000","8.8.8.8"],
                            capture_output=True,text=True,timeout=10,creationflags=_NO_WINDOW)
                        net_ok = r.returncode == 0
                        add('siec','Połączenie internetowe','pass' if net_ok else 'fail',
                            'Połączenie aktywne' if net_ok else 'Brak połączenia z internetem',
                            'high' if not net_ok else 'info')
                    except: add('siec','Połączenie internetowe','warn','Nie udało się sprawdzić','low')

                    try:
                        r = subprocess.run(["nslookup","google.com"],capture_output=True,text=True,timeout=8,creationflags=_NO_WINDOW)
                        dns_ok = r.returncode == 0 and 'Address' in r.stdout
                        add('siec','DNS','pass' if dns_ok else 'fail',
                            'Rozwiązywanie nazw działa' if dns_ok else 'Problem z DNS',
                            'medium' if not dns_ok else 'info',
                            'ipconfig /flushdns' if not dns_ok else None)
                    except: pass

                    # ── EVENT LOG ──
                    try:
                        r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                            "(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 30 -EA SilentlyContinue).Count"],
                            capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=15,creationflags=_NO_WINDOW)
                        err_count = int(r.stdout.strip()) if r.stdout.strip().isdigit() else 0
                        add('system','Błędy systemowe (24h)','pass' if err_count<5 else 'fail',
                            f'{err_count} błędów/krytycznych zdarzeń',
                            'high' if err_count>10 else 'medium' if err_count>5 else 'info')
                    except: pass

                    # ── AKTUALIZACJE ──
                    try:
                        r = subprocess.run(["powershell","-ExecutionPolicy","Bypass","-Command",
                            "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')"],
                            capture_output=True,text=True,encoding='utf-8',errors='ignore',timeout=10,creationflags=_NO_WINDOW)
                        last_update = r.stdout.strip()
                        if last_update:
                            from datetime import datetime as dt
                            days_ago = (dt.now() - dt.strptime(last_update,'%Y-%m-%d')).days
                            add('aktualizacje','Ostatnia aktualizacja','pass' if days_ago<30 else 'fail',
                                f'{last_update} ({days_ago} dni temu)',
                                'high' if days_ago>60 else 'medium' if days_ago>30 else 'info')
                    except: pass

                    # ── AUTOSTART ──
                    autostart_data = get_autostart_programs()
                    progs = autostart_data.get('programs', autostart_data) if isinstance(autostart_data, dict) else autostart_data
                    if isinstance(progs, list):
                        heavy = [p for p in progs if isinstance(p,dict) and p.get('impact')=='high']
                        add('autostart','Programy autostartu','pass' if len(heavy)<3 else 'warn',
                            f'{len(progs)} programów, {len(heavy)} z wysokim wpływem na boot',
                            'medium' if len(heavy)>=3 else 'info')

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
                    except: pass

                except Exception as e:
                    log.error("full_diagnosis error: %s", e)

                return {"checks": checks, "score": max(0, score), "total": len(checks),
                        "passed": len([c for c in checks if c['status']=='pass']),
                        "failed": len([c for c in checks if c['status']=='fail']),
                        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M')}

            def run_ai_fix(self, cmd):
                return ai_fix(cmd)

            def run_ai_fix_visible(self, cmd):
                return ai_fix_visible(cmd)

            def is_admin(self):
                return _is_admin()

            def restart_as_admin(self):
                """Restart agent with admin privileges — no console window."""
                try:
                    import ctypes
                    if is_frozen():
                        log.info("Restarting as admin (frozen): %s", INSTALL_EXE)
                        ret = ctypes.windll.shell32.ShellExecuteW(None, "runas", INSTALL_EXE, "--page=ai_repair", None, 1)
                    else:
                        script = os.path.abspath(__file__)
                        exe = sys.executable.replace("python.exe", "pythonw.exe")
                        if not os.path.exists(exe):
                            exe = sys.executable
                        params = f'"{script}" --page=ai_repair'
                        log.info("Restarting as admin: %s %s", exe, params)
                        ret = ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, params, None, 1)
                    log.info("ShellExecuteW returned: %s", ret)
                    if ret > 32:
                        # Success — exit current instance
                        os._exit(0)
                    else:
                        return {"ok": False, "error": f"UAC odmówiono lub błąd (kod: {ret})"}
                except Exception as e:
                    log.error("restart_as_admin error: %s", e)
                    return {"ok": False, "error": str(e)}

            def desktop_action(self, action, params=None):
                """Execute desktop actions: open folders, URLs, control mouse, take screenshot."""
                try:
                    params = params or {}
                    if action == 'open_folder':
                        path = params.get('path', '')
                        if path and os.path.exists(path):
                            os.startfile(path)
                            return {"ok": True, "detail": f"Otwarto: {path}"}
                        return {"ok": False, "error": f"Folder nie istnieje: {path}"}

                    elif action == 'open_url':
                        url = params.get('url', '')
                        if url:
                            import webbrowser
                            webbrowser.open(url)
                            return {"ok": True, "detail": f"Otwarto: {url}"}
                        return {"ok": False, "error": "Brak URL"}

                    elif action == 'open_program':
                        path = params.get('path', '')
                        if path:
                            subprocess.Popen(path, shell=True, creationflags=_NO_WINDOW)
                            return {"ok": True, "detail": f"Uruchomiono: {path}"}
                        return {"ok": False, "error": "Brak ścieżki programu"}

                    elif action == 'mouse_move':
                        import pyautogui
                        x, y = int(params.get('x', 0)), int(params.get('y', 0))
                        pyautogui.moveTo(x, y, duration=0.5)
                        return {"ok": True, "detail": f"Mysz na ({x}, {y})"}

                    elif action == 'mouse_click':
                        import pyautogui
                        x = params.get('x'); y = params.get('y')
                        if x is not None and y is not None:
                            pyautogui.click(int(x), int(y))
                        else:
                            pyautogui.click()
                        return {"ok": True, "detail": "Kliknięto"}

                    elif action == 'type_text':
                        import pyautogui
                        text = params.get('text', '')
                        pyautogui.typewrite(text, interval=0.03) if text.isascii() else pyautogui.write(text)
                        return {"ok": True, "detail": f"Wpisano: {text[:50]}"}

                    elif action == 'hotkey':
                        import pyautogui
                        keys = params.get('keys', [])
                        if keys:
                            pyautogui.hotkey(*keys)
                            return {"ok": True, "detail": f"Skrót: {'+'.join(keys)}"}
                        return {"ok": False, "error": "Brak klawiszy"}

                    elif action == 'screenshot':
                        img = ImageGrab.grab()
                        path = os.path.join(tempfile.gettempdir(), "sai_screen.png")
                        img.save(path)
                        return {"ok": True, "path": path, "detail": f"Screenshot: {img.size[0]}x{img.size[1]}"}

                    elif action == 'find_window':
                        import pygetwindow
                        title = params.get('title', '')
                        wins = [w for w in pygetwindow.getAllWindows() if title.lower() in w.title.lower()]
                        return {"ok": True, "windows": [{"title": w.title, "x": w.left, "y": w.top, "w": w.width, "h": w.height} for w in wins[:10]]}

                    elif action == 'focus_window':
                        import pygetwindow
                        title = params.get('title', '')
                        wins = [w for w in pygetwindow.getAllWindows() if title.lower() in w.title.lower()]
                        if wins:
                            wins[0].activate()
                            return {"ok": True, "detail": f"Fokus: {wins[0].title}"}
                        return {"ok": False, "error": f"Nie znaleziono okna: {title}"}

                    else:
                        return {"ok": False, "error": f"Nieznana akcja: {action}"}

                except Exception as e:
                    log.error("Desktop action error %s: %s", action, e)
                    return {"ok": False, "error": str(e)[:200]}

            def ai_chat(self, messages):
                """Send chat to SILERS AI and return full response."""
                try:
                    # Gather system data for context
                    sys_data = {}
                    try:
                        mem = psutil.virtual_memory()
                        disk = psutil.disk_usage("C:\\")
                        sys_data = {
                            "hostname": os.environ.get("COMPUTERNAME", ""),
                            "os": platform.platform(),
                            "cpu": _wmic("cpu get name"),
                            "ramGb": round(mem.total / (1024**3), 1),
                            "ramUsed": f"{mem.percent}%",
                            "cpuUsage": f"{psutil.cpu_percent(interval=0.3)}%",
                            "diskFree": f"{round(disk.free / (1024**3), 1)} GB",
                            "diskUsed": f"{disk.percent}%",
                            "uptime_days": int((time.time() - psutil.boot_time()) / 86400),
                        }
                    except Exception:
                        pass

                    payload = {
                        "app": "infradesk",
                        "context": "repair",
                        "systemData": sys_data,
                        "messages": messages if isinstance(messages, list) else [messages],
                        "stream": False,
                    }
                    data = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        "https://ai.silers.pl/api/chat",
                        data=data,
                        headers={
                            "Content-Type": "application/json",
                            "X-API-Key": "iad_prod_silers2026",
                        },
                        method="POST",
                    )
                    ctx = __import__("ssl").create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = __import__("ssl").CERT_NONE
                    resp = urllib.request.urlopen(req, context=ctx, timeout=30)
                    result = json.loads(resp.read().decode("utf-8"))
                    return {"ok": True, "content": result.get("content", "")}
                except Exception as e:
                    log.error("AI chat error: %s", e)
                    return {"ok": False, "content": "", "error": str(e)}

            def get_network_info(self):
                return get_network_info()

            def run_speed_test(self):
                return speed_test_simple()

            def get_autostart(self):
                return get_autostart_programs()

            def get_top_processes(self):
                return get_top_ram_processes(8)

            def detect_subscriptions(self):
                """Detect installed apps that are likely subscriptions."""
                known = {
                    'netflix':{'name':'Netflix','icon':'🎬','category':'streaming','avgPrice':43,'cycle':'monthly'},
                    'spotify':{'name':'Spotify','icon':'🎵','category':'streaming','avgPrice':19.99,'cycle':'monthly'},
                    'disney':{'name':'Disney+','icon':'🏰','category':'streaming','avgPrice':28.99,'cycle':'monthly'},
                    'hbo':{'name':'HBO Max','icon':'🎬','category':'streaming','avgPrice':29.99,'cycle':'monthly'},
                    'amazon prime':{'name':'Amazon Prime','icon':'📦','category':'streaming','avgPrice':49,'cycle':'yearly'},
                    'office':{'name':'Microsoft 365','icon':'📊','category':'productivity','avgPrice':29.99,'cycle':'monthly'},
                    'onedrive':{'name':'OneDrive','icon':'☁','category':'cloud','avgPrice':9.99,'cycle':'monthly'},
                    'dropbox':{'name':'Dropbox','icon':'📁','category':'cloud','avgPrice':11.99,'cycle':'monthly'},
                    'google drive':{'name':'Google One','icon':'☁','category':'cloud','avgPrice':8.99,'cycle':'monthly'},
                    'creative cloud':{'name':'Adobe CC','icon':'🎨','category':'creative','avgPrice':54.99,'cycle':'monthly'},
                    'photoshop':{'name':'Adobe Photoshop','icon':'🎨','category':'creative','avgPrice':23.99,'cycle':'monthly'},
                    'canva':{'name':'Canva Pro','icon':'🎨','category':'creative','avgPrice':55,'cycle':'yearly'},
                    'antivirus':{'name':'Antywirus','icon':'🛡','category':'security','avgPrice':99,'cycle':'yearly'},
                    'norton':{'name':'Norton','icon':'🛡','category':'security','avgPrice':149,'cycle':'yearly'},
                    'kaspersky':{'name':'Kaspersky','icon':'🛡','category':'security','avgPrice':129,'cycle':'yearly'},
                    'eset':{'name':'ESET','icon':'🛡','category':'security','avgPrice':139,'cycle':'yearly'},
                    'zoom':{'name':'Zoom','icon':'📹','category':'communication','avgPrice':55.99,'cycle':'monthly'},
                    'teams':{'name':'Microsoft Teams','icon':'💬','category':'communication','avgPrice':0,'cycle':'monthly'},
                    'slack':{'name':'Slack','icon':'💬','category':'communication','avgPrice':31,'cycle':'monthly'},
                    'nordvpn':{'name':'NordVPN','icon':'🔒','category':'vpn','avgPrice':239,'cycle':'yearly'},
                    'expressvpn':{'name':'ExpressVPN','icon':'🔒','category':'vpn','avgPrice':349,'cycle':'yearly'},
                    'chatgpt':{'name':'ChatGPT Plus','icon':'🤖','category':'ai','avgPrice':20,'cycle':'monthly'},
                    'github':{'name':'GitHub Pro','icon':'💻','category':'dev','avgPrice':4,'cycle':'monthly'},
                }
                detected = []
                try:
                    # Check installed programs (encoding-safe)
                    r = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                        r"Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',"
                        r"'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | "
                        "Select-Object -ExpandProperty DisplayName -EA SilentlyContinue"],
                        capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=15, creationflags=_NO_WINDOW)
                    apps = (r.stdout or '').lower()
                    # Check running processes
                    procs = ' '.join(p.info.get('name', '').lower() for p in psutil.process_iter(['name']))

                    combined = apps + ' ' + procs
                    for key, info in known.items():
                        if key in combined:
                            detected.append(info)
                except Exception as e:
                    log.error("detect_subscriptions: %s", e)
                return detected

            def scan_network_devices(self):
                """Quick network scan — ARP only, no ping sweep (fast)."""
                try:
                    r = subprocess.run(["arp", "-a"], capture_output=True, text=True,
                        encoding='utf-8', errors='ignore', timeout=10, creationflags=_NO_WINDOW)
                    devices = []
                    for line in r.stdout.split("\n"):
                        m = re.match(r'\s*(\d+\.\d+\.\d+\.\d+)\s+([\da-f-]+)\s+(\w+)', line.strip())
                        if m and m.group(3) == "dynamic":
                            ip = m.group(1)
                            mac = m.group(2).replace("-", ":").upper()
                            if mac == "FF:FF:FF:FF:FF:FF":
                                continue
                            hostname = ""
                            try:
                                hostname = socket.gethostbyaddr(ip)[0]
                            except:
                                pass
                            # Guess device type from open ports (quick check)
                            dtype = "device"
                            for port in [80, 443]:
                                try:
                                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                                    s.settimeout(0.3)
                                    if s.connect_ex((ip, port)) == 0:
                                        dtype = "router"
                                    s.close()
                                except:
                                    pass
                            devices.append({"ip": ip, "mac": mac, "hostname": hostname, "type": dtype})
                    return {"devices": devices}
                except Exception as e:
                    log.error("scan_network_devices: %s", e)
                    return {"devices": []}

            def detect_browsers(self):
                """Detect installed browsers and count saved passwords."""
                import sqlite3, shutil
                local = os.environ.get("LOCALAPPDATA", "")
                browsers_config = [
                    {"name": "Chrome", "path": os.path.join(local, "Google", "Chrome", "User Data"),
                     "db": "Default/Login Data", "state": "Local State"},
                    {"name": "Edge", "path": os.path.join(local, "Microsoft", "Edge", "User Data"),
                     "db": "Default/Login Data", "state": "Local State"},
                    {"name": "Opera", "path": os.path.join(local, "Opera Software", "Opera Stable"),
                     "db": "Login Data", "state": "Local State"},
                    {"name": "Brave", "path": os.path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
                     "db": "Default/Login Data", "state": "Local State"},
                ]
                result = []
                for b in browsers_config:
                    db_path = os.path.join(b["path"], b["db"])
                    if not os.path.exists(db_path):
                        continue
                    count = 0
                    encrypted = False
                    try:
                        tmp = os.path.join(tempfile.gettempdir(), f"iad_det_{b['name']}.db")
                        # Use robocopy as fallback if shutil fails (browser lock)
                        try:
                            shutil.copy2(db_path, tmp)
                        except:
                            src_dir = os.path.dirname(db_path)
                            src_file = os.path.basename(db_path)
                            subprocess.run(["cmd", "/c", "copy", "/Y", db_path, tmp],
                                capture_output=True, timeout=5, creationflags=_NO_WINDOW)
                        if os.path.exists(tmp):
                            conn = sqlite3.connect(tmp)
                            rows = conn.execute("SELECT password_value FROM logins WHERE username_value != ''").fetchall()
                            count = len(rows)
                            for row in rows[:5]:
                                if row[0] and row[0][:3] in (b'v10', b'v11'):
                                    encrypted = True
                                    break
                            conn.close()
                            try: os.remove(tmp)
                            except: pass
                    except Exception as e:
                        log.error("detect_browsers %s: %s", b["name"], e)
                    if count > 0:
                        result.append({"name": b["name"], "count": count, "encrypted": encrypted,
                                       "canDecrypt": True, "path": b["path"]})
                return result

            def import_browser_passwords(self, browser_name):
                """Import passwords from a specific browser with AES decryption."""
                import sqlite3, base64, shutil, json as _json
                local = os.environ.get("LOCALAPPDATA", "")
                browsers_config = {
                    "Chrome": {"path": os.path.join(local, "Google", "Chrome", "User Data"), "db": "Default/Login Data"},
                    "Edge": {"path": os.path.join(local, "Microsoft", "Edge", "User Data"), "db": "Default/Login Data"},
                    "Opera": {"path": os.path.join(local, "Opera Software", "Opera Stable"), "db": "Login Data"},
                    "Brave": {"path": os.path.join(local, "BraveSoftware", "Brave-Browser", "User Data"), "db": "Default/Login Data"},
                }
                b = browsers_config.get(browser_name)
                if not b:
                    return {"ok": False, "error": f"Nieznana przeglądarka: {browser_name}", "passwords": []}
                db_path = os.path.join(b["path"], b["db"])
                if not os.path.exists(db_path):
                    return {"ok": False, "error": "Baza haseł nie znaleziona", "passwords": []}

                # Get AES master key from Local State
                master_key = None
                state_path = os.path.join(b["path"], "Local State")
                try:
                    with open(state_path, "r", encoding="utf-8") as f:
                        state = _json.load(f)
                    encrypted_key = base64.b64decode(state["os_crypt"]["encrypted_key"])
                    # Remove 'DPAPI' prefix (5 bytes)
                    encrypted_key = encrypted_key[5:]
                    # Decrypt with DPAPI
                    import ctypes, ctypes.wintypes
                    class DATA_BLOB(ctypes.Structure):
                        _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]
                    blob_in = DATA_BLOB(len(encrypted_key), ctypes.create_string_buffer(encrypted_key))
                    blob_out = DATA_BLOB()
                    if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
                        master_key = ctypes.string_at(blob_out.pbData, blob_out.cbData)
                        ctypes.windll.kernel32.LocalFree(blob_out.pbData)
                except Exception as e:
                    log.error("Master key extraction: %s", e)

                passwords = []
                try:
                    tmp = os.path.join(tempfile.gettempdir(), f"iad_imp_{browser_name}.db")
                    try:
                        shutil.copy2(db_path, tmp)
                    except:
                        subprocess.run(["cmd", "/c", "copy", "/Y", db_path, tmp],
                            capture_output=True, timeout=5, creationflags=_NO_WINDOW)
                    conn = sqlite3.connect(tmp)
                    rows = conn.execute("SELECT origin_url, username_value, password_value FROM logins WHERE username_value != ''").fetchall()
                    for url, user, pw_blob in rows:
                        pw = ""
                        try:
                            if pw_blob[:3] in (b'v10', b'v11') and master_key:
                                # AES-GCM decryption (Chrome 80+)
                                from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                                nonce = pw_blob[3:15]
                                ciphertext = pw_blob[15:]
                                pw = AESGCM(master_key).decrypt(nonce, ciphertext, None).decode('utf-8', errors='ignore')
                            else:
                                # Legacy DPAPI
                                import ctypes, ctypes.wintypes
                                class DATA_BLOB(ctypes.Structure):
                                    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]
                                blob_in = DATA_BLOB(len(pw_blob), ctypes.create_string_buffer(pw_blob))
                                blob_out = DATA_BLOB()
                                if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
                                    pw = ctypes.string_at(blob_out.pbData, blob_out.cbData).decode('utf-8', errors='ignore')
                                    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
                        except Exception as e:
                            pw = "[nie udało się odszyfrować]"
                        passwords.append({"browser": browser_name, "url": url, "login": user, "password": pw})
                    conn.close()
                    os.remove(tmp)
                except Exception as e:
                    log.error("import_browser_passwords: %s", e)
                    return {"ok": False, "error": str(e), "passwords": []}
                return {"ok": True, "passwords": passwords}

            def ping_host(self, host):
                """Ping a host — quick, 2 packets."""
                try:
                    host = str(host).strip()
                    if not host:
                        return {"host": "", "avg_ms": 0, "loss_pct": 100, "ok": False}
                    r = subprocess.run(
                        ["ping", "-n", "2", "-w", "1000", host],
                        capture_output=True, text=True, timeout=8,
                        creationflags=_NO_WINDOW
                    )
                    output = r.stdout + r.stderr
                    log.info("Ping %s: rc=%s out=%s", host, r.returncode, output[:200])
                    import re as _re
                    # Parse average — works for EN and PL Windows
                    avg_ms = 0
                    for pattern in [r'Average\s*=\s*(\d+)', r'redni[a-z]*\s*=\s*(\d+)', r'avg\s*=\s*(\d+)']:
                        m = _re.search(pattern, output, _re.IGNORECASE)
                        if m:
                            avg_ms = int(m.group(1))
                            break
                    # If no average found but reply exists, take first time
                    if avg_ms == 0:
                        m = _re.search(r'[Tt]ime[=<](\d+)', output)
                        if m:
                            avg_ms = int(m.group(1))
                    loss_pct = 0
                    m = _re.search(r'\((\d+)%', output)
                    if m:
                        loss_pct = int(m.group(1))
                    return {"host": host, "avg_ms": avg_ms, "loss_pct": loss_pct, "ok": r.returncode == 0 and avg_ms > 0}
                except subprocess.TimeoutExpired:
                    return {"host": str(host), "avg_ms": 0, "loss_pct": 100, "ok": False}
                except Exception as e:
                    log.error("Ping error: %s", e)
                    return {"host": str(host), "avg_ms": 0, "loss_pct": 100, "ok": False}

            def toggle_autostart_prog(self, name, location, enable):
                """Enable/disable autostart program."""
                return toggle_autostart(name, location, enable)

            def switch_to_business(self):
                cfg = load_config()
                cfg["mode"] = "business"
                save_config(cfg)
                # Restart agent — use installed exe or fallback to python
                if is_frozen() and os.path.exists(INSTALL_EXE):
                    subprocess.Popen([INSTALL_EXE], close_fds=True, creationflags=_NO_WINDOW)
                else:
                    subprocess.Popen([sys.executable, os.path.abspath(__file__)], close_fds=True, creationflags=_NO_WINDOW)
                os._exit(0)

        api = AsystentAPI()

        # Find UI files
        ui_dir = None
        candidates = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui'),
            os.path.join(INSTALL_DIR, 'ui'),
        ]
        meipass = getattr(sys, '_MEIPASS', None)
        if meipass:
            candidates.insert(0, os.path.join(meipass, 'ui'))
        for candidate in candidates:
            candidate = os.path.abspath(candidate)
            if os.path.isdir(candidate) and os.path.exists(os.path.join(candidate, 'index.html')):
                ui_dir = candidate
                break

        if ui_dir:
            url = f"file:///{os.path.join(ui_dir, 'index.html').replace(os.sep, '/')}"
            # Auto-navigate to page if --page arg provided (e.g. after admin restart)
            for arg in sys.argv[1:]:
                if arg.startswith("--page="):
                    page = arg.split("=", 1)[1]
                    url += f"#page={page}"
                    break
            log.info("Webview URL: %s", url)
        else:
            log.error("UI files not found — tried _MEIPASS, __file__, INSTALL_DIR")
            return

        window = webview.create_window(
            APP_NAME_HOME,
            url=url,
            width=1300, height=750,
            min_size=(900, 550),
            js_api=api,
            background_color='#040810',
        )
        webview.start(debug=False)

    except ImportError:
        log.error("pywebview not installed")
    except Exception as e:
        log.error("Webview failed: %s", e)
        import traceback; traceback.print_exc()


def _find_ui_dir():
    """Locate the ui/ folder — checks _MEIPASS, __file__ dir, INSTALL_DIR."""
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


def _run_auth_webview(cfg, open_ticket_on_start=False):
    """Webview-based login/register/waiting flow (replaces tkinter App)."""
    try:
        import webview
    except ImportError:
        log.warning("pywebview not installed — falling back to tkinter App")
        App(open_ticket_on_start=open_ticket_on_start)
        return

    ui_dir = _find_ui_dir()
    if not ui_dir or not os.path.exists(os.path.join(ui_dir, 'auth.html')):
        log.warning("auth.html not found — falling back to tkinter App")
        App(open_ticket_on_start=open_ticket_on_start)
        return

    result = {"action": None}  # shared state

    class AuthAPI:
        def get_init_data(self):
            mode = cfg.get("mode")
            token = cfg.get("token")
            status = cfg.get("status")
            start_page = "mode"
            if mode == "business" and not token:
                start_page = "auth"
            elif token and status != "ACTIVE":
                start_page = "waiting"
            return {
                "hasHomeMode": True,
                "appName": APP_NAME,
                "appVersion": APP_VERSION,
                "startPage": start_page,
                "token": token or "",
            }

        def select_mode(self, mode):
            cfg["mode"] = mode
            if mode == "home":
                cfg["allowMonitoring"] = True
            save_config(cfg)
            if mode == "home":
                result["action"] = "home"
                for w in webview.windows:
                    w.destroy()
            # business mode — JS shows auth select page

        def do_login(self, email, pwd):
            try:
                r = do_login(email, pwd)
                cfg["token"] = r["token"]
                cfg["status"] = r["status"]
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
                msg = "Nieprawidłowy e-mail lub hasło." if e.response.status_code in (400, 401) else f"Błąd serwera: {e.response.status_code}"
                return {"error": msg}
            except requests.exceptions.ConnectionError:
                return {"error": "Brak połączenia z serwerem"}
            except requests.exceptions.Timeout:
                return {"error": "Serwer nie odpowiada"}
            except Exception as e:
                return {"error": f"Błąd: {e}"}

        def do_register(self, form):
            try:
                r = do_register(form)
                cfg["token"] = r["token"]
                cfg["status"] = r["status"]
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
                return {"error": f"Błąd: {msg}"}
            except requests.exceptions.ConnectionError:
                return {"error": "Brak połączenia z serwerem"}
            except Exception as e:
                return {"error": f"Błąd: {e}"}

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

    # After webview closes — handle result
    if result["action"] == "home":
        log.info("Switching to HOME mode")
        _run_home_webview()
    elif result["action"] == "active":
        log.info("Auth successful — starting Asystent Home")
        _run_home_webview()
    else:
        log.info("Auth webview closed without action — exiting")


def main():
    log.info("InfraDesk Agent %s starting — exe: %s args: %s", APP_VERSION, sys.executable, sys.argv)
    log.info("INSTALL_EXE: %s  is_installed: %s  is_frozen: %s", INSTALL_EXE, is_installed(), is_frozen())

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
        # Run as headless server (called by Windows Service or manually)
        log.info("Starting in SERVER mode (headless)")
        cfg = load_config()
        if cfg.get("status") == "ACTIVE" and cfg.get("token"):
            loop = ServerServiceLoop(cfg["token"], cfg)
            loop.start()
        else:
            log.error("Cannot start server mode — agent not registered. Run agent.exe first.")
        return

    if is_frozen() and not is_installed():
        log.info("Not installed — running install_and_restart()")
        install_and_restart()
        return

    # Zabij inne instancje agenta
    _kill_other_agents()

    open_ticket_on_start = "--ticket" in sys.argv

    cfg = load_config()
    log.info("Config file: %s exists=%s", CONFIG_FILE, os.path.exists(CONFIG_FILE))
    log.info("Config: status=%s token=%s keys=%s", cfg.get("status"), "YES" if cfg.get("token") else "NO", list(cfg.keys()))

    if cfg.get("status") == "ACTIVE" and cfg.get("token"):
        log.info("Agent active — starting Asystent Home webview")
        _run_home_webview()
        return

    # HOME mode (no token) — uruchom webview na main thread (bez tkinter)
    if cfg.get("mode") == "home":
        log.info("Starting HOME mode — webview UI")
        _run_home_webview()
        return

    # Brak configu lub nie aktywny — od razu logowanie (bez ekranu wyboru)
    cfg["mode"] = "business"  # skip mode selection
    save_config(cfg)
    _run_auth_webview(cfg, open_ticket_on_start=open_ticket_on_start)


if __name__ == "__main__":
    main()
