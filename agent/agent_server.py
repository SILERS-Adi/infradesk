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

APP_NAME    = "InfraDesk Server Agent"
APP_VERSION = "4.3.1"
INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "InfraDesk Server")
INSTALL_EXE = os.path.join(INSTALL_DIR, "InfraDesk Server Agent.exe")
CONFIG_FILE = os.path.join(INSTALL_DIR, "config.json")
API_BASE     = "https://infradesk.pl/api"
PORTAL_URL   = "https://infradesk.pl/portal"
WS_BASE      = "wss://infradesk.pl/api/agent/ws"
VERSION_URL  = "https://infradesk.pl/downloads/version-server.json"
SILERS_MSI_URL = "https://infradesk.pl/downloads/silers.msi"

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
    return os.path.abspath(sys.executable).lower() == INSTALL_EXE.lower()


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
            return remote, data.get("url", f"https://infradesk.pl/downloads/InfraDesk%20Agent.exe")
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
    body = {"email": email, "password": pwd, "agentType": "SERVER", **metrics()}
    if cfg.get("deviceId"):
        body["deviceId"] = cfg["deviceId"]
    return api_post("/agent/register", body)


def do_register(form):
    # Filtruj None → Zod nie akceptuje null dla pól optional
    body = {k: v for k, v in {**form, "agentType": "SERVER", **full_inventory()}.items() if v is not None}
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

def show_login(root, on_login, on_register):
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

        self._decide()
        self.root.mainloop()

    def _decide(self):
        token  = self.cfg.get("token")
        status = self.cfg.get("status")
        if not token:
            show_login(self.root, self._on_login, self._on_register)
        elif status == "ACTIVE":
            self.root.withdraw()
            self._start_bg()
            if self.cfg.get("allowRustdesk", True) and not is_rustdesk_installed():
                threading.Thread(target=self._install_rd, daemon=True).start()
            if self._open_ticket_on_start:
                self.root.after(800, self._open_ticket)
            else:
                # Open full desktop panel in webview
                self.root.after(500, self._open_main_window)
        else:
            show_waiting(self.root, token, self._on_activated, self._on_cancel)

    # ── Logowanie / Rejestracja ───────────────────────────────────────────────

    def _on_login(self, result):
        self.cfg = {"token": result["token"], "status": result["status"],
                    "allowMonitoring": True, "allowRustdesk": True}
        if result.get("deviceId"):
            self.cfg["deviceId"] = result["deviceId"]
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
        """Sprawdza aktualizację przy starcie, potem co 6 godzin."""
        while True:
            result = check_for_update()
            if result and result != self._update_info:
                self._update_info = result
                ver, _ = result
                log.info("Update available: %s", ver)
                if self._tray:
                    try: self._tray.notify(f"Dostępna aktualizacja {ver} — otwórz menu agenta aby zaktualizować.", APP_NAME)
                    except Exception: pass
            time.sleep(6 * 3600)

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
        while True:
            result = check_for_update()
            if result: self._update_info = result
            time.sleep(6 * 3600)

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

    result = {"action": None}

    class AuthAPI:
        def get_init_data(self):
            token = cfg.get("token")
            status = cfg.get("status")
            start_page = "auth"  # Server agent — no home mode, go straight to auth
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
            pass  # Server agent has no home mode

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
    if result["action"] == "active":
        log.info("Auth successful — starting server agent")
        cfg_fresh = load_config()
        token = cfg_fresh.get("token", "")
        auto_url = f"{API_BASE}/auth/auto-login?token={token}"
        if open_ticket_on_start:
            App(open_ticket_on_start=True)
        else:
            ok = _start_webview_app(auto_url, token, cfg_fresh)
            if not ok:
                import webbrowser
                webbrowser.open(auto_url)
                bg = _BackgroundServices(token, cfg_fresh)
                bg.start()
                while True:
                    time.sleep(60)
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
        log.info("Agent active — skipping login")

        if open_ticket_on_start:
            App(open_ticket_on_start=True)
            return

        # Auto-login URL
        auto_url = f"{API_BASE}/auth/auto-login?token={cfg['token']}"

        # Uruchom webview lub przeglądarkę
        ok = _start_webview_app(auto_url, cfg["token"], cfg)
        if ok:
            return

        # Fallback — przeglądarka + tray w tle
        import webbrowser
        webbrowser.open(auto_url)
        bg = _BackgroundServices(cfg["token"], cfg)
        bg.start()
        log.info("Running in browser + tray mode")
        while True:
            time.sleep(60)

    # Brak configu lub nie aktywny — logowanie (webview auth)
    _run_auth_webview(cfg, open_ticket_on_start=open_ticket_on_start)


if __name__ == "__main__":
    main()
