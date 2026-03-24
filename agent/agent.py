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

APP_NAME    = "InfraDesk Agent"
APP_VERSION = "1.5.3"
INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "InfraDesk")
INSTALL_EXE = os.path.join(INSTALL_DIR, "InfraDesk Agent.exe")
CONFIG_FILE = os.path.join(INSTALL_DIR, "config.json")
API_BASE     = "https://infradesk.pl/api"
PORTAL_URL   = "https://infradesk.pl/portal"
WS_BASE      = "wss://infradesk.pl/api/agent/ws"
VERSION_URL  = "https://infradesk.pl/downloads/version.json"
RUSTDESK_URL = "https://rustdesk.com/build/tasks/8c0348ed-a46f-48a9-88d9-1d81eca0bd7f/files/silers.exe"

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

BG      = "#060B1A"
SURF    = "#0f1525"
SURF2   = "#1a2035"
PRI     = "#6366f1"
PRI_H   = "#4f52cc"
TXT     = "#e2e8f0"
TXT_DIM = "#6b7280"
OK_C    = "#10b981"
ERR_C   = "#ef4444"
WARN_C  = "#f59e0b"
BORDER  = "#1a2540"
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
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


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
    """Tworzy skrót na pulpicie uruchamiający nowe zgłoszenie serwisowe."""
    try:
        desktop = _get_desktop_path()
        lnk_name = "Zgloszenie serwisowe.lnk"
        lnk      = os.path.join(desktop, lnk_name)
        target   = INSTALL_EXE
        log.info("Creating shortcut: desktop=%s target=%s", desktop, target)

        # Upewnij się, że target istnieje (agent może być uruchomiony spoza INSTALL_DIR)
        if not os.path.exists(target):
            target = sys.executable
            log.info("INSTALL_EXE not found, using sys.executable: %s", target)

        ps1 = os.path.join(tempfile.gettempdir(), "infradesk_shortcut.ps1")
        # Użyj ASCII-safe nazwy pliku LNK, żeby uniknąć problemów z kodowaniem
        with open(ps1, "w", encoding="utf-8") as f:
            f.write('$s = New-Object -ComObject WScript.Shell\n')
            f.write(f'$l = $s.CreateShortcut("{lnk}")\n')
            f.write(f'$l.TargetPath       = "{target}"\n')
            f.write( '$l.Arguments        = "--ticket"\n')
            f.write(f'$l.WorkingDirectory = "{INSTALL_DIR}"\n')
            f.write( '$l.Description      = "Nowe zgloszenie serwisowe InfraDesk"\n')
            f.write(f'$l.IconLocation     = "{target},0"\n')
            f.write( '$l.Save()\n')

        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
            creationflags=_NO_WINDOW, timeout=20,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        try: os.remove(ps1)
        except Exception: pass

        if result.returncode == 0 and os.path.exists(lnk):
            log.info("Desktop shortcut created: %s", lnk)
        else:
            err = result.stderr.decode(errors="replace")
            log.warning("Shortcut PS returncode=%s err=%s", result.returncode, err)
            # Fallback: spróbuj przez win32com jeśli dostępne
            try:
                import win32com.client as wc
                shell = wc.Dispatch("WScript.Shell")
                sc = shell.CreateShortcut(lnk)
                sc.TargetPath = target
                sc.Arguments  = "--ticket"
                sc.WorkingDirectory = INSTALL_DIR
                sc.Description = "Nowe zgloszenie serwisowe InfraDesk"
                sc.IconLocation = f"{target},0"
                sc.Save()
                log.info("Desktop shortcut created via win32com: %s", lnk)
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


def _rustdesk_id() -> str | None:
    toml = os.path.join(os.environ.get("APPDATA", ""), "RustDesk", "config", "RustDesk.toml")
    try:
        with open(toml) as f:
            for line in f:
                if line.strip().startswith("id ="):
                    return line.split("=", 1)[1].strip().strip('"')
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
    return info


def metrics() -> dict:
    d = machine_info()
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
    for p in [r"C:\Program Files\RustDesk\rustdesk.exe",
              r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
        if os.path.exists(p): return True
    return False


def install_rustdesk(notify_fn=None) -> bool:
    exe = os.path.join(tempfile.gettempdir(), "rustdesk_silers.exe")

    def _notify(msg):
        log.info(msg)
        if notify_fn:
            try: notify_fn(msg)
            except Exception: pass

    try:
        if is_rustdesk_installed():
            _notify("RustDesk już zainstalowany.")
            return True

        _notify("Pobieranie RustDesk… (może potrwać chwilę)")
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(RUSTDESK_URL, context=ctx, timeout=120) as resp:
            with open(exe, "wb") as f:
                f.write(resp.read())
        log.info("RustDesk downloaded: %s bytes", os.path.getsize(exe))

        _notify("Instalowanie RustDesk — zaakceptuj monit UAC…")
        import ctypes
        ret = ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, "/S", None, 1)
        log.info("ShellExecute ret=%s", ret)

        if ret <= 32:
            # Brak uprawnień lub odmowa UAC — spróbuj bez podnoszenia
            _notify("Brak uprawnień administratora — próba bez UAC…")
            subprocess.Popen([exe, "/S"], creationflags=_NO_WINDOW)

        # Czekaj do 3 minut na zakończenie instalacji
        for _ in range(180):
            time.sleep(1)
            if is_rustdesk_installed():
                _notify("RustDesk zainstalowany pomyślnie.")
                # Usuń plik po instalacji
                try: os.remove(exe)
                except Exception: pass
                return True

        _notify("RustDesk nie został wykryty po instalacji.")
        return False
    except Exception as e:
        log.error("RustDesk install error: %s", e)
        _notify(f"Błąd instalacji RustDesk: {e}")
        return False
    finally:
        # Próba usunięcia — ignoruj błąd jeśli plik zajęty
        try: os.remove(exe)
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

        current_exe = sys.executable
        updater = os.path.join(tempfile.gettempdir(), "infradesk_updater.bat")
        with open(updater, "w") as f:
            f.write("@echo off\n")
            f.write("ping 127.0.0.1 -n 4 > nul\n")          # czekaj ~3s aż stary proces zakończy
            f.write(f'copy /y "{new_exe}" "{current_exe}"\n')
            f.write(f'start "" "{current_exe}"\n')
            f.write(f'del "{new_exe}"\n')
            f.write('del "%~f0"\n')

        _notify("Restartuję agenta…")
        subprocess.Popen(
            ["cmd.exe", "/c", updater],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
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
    body = {"email": email, "password": pwd, **metrics()}
    if cfg.get("deviceId"):
        body["deviceId"] = cfg["deviceId"]
    return api_post("/agent/register", body)


def do_register(form):
    # Filtruj None → Zod nie akceptuje null dla pól optional
    body = {k: v for k, v in {**form, **full_inventory()}.items() if v is not None}
    return api_post("/agent/register", body)


def do_metrics(token):
    data = metrics()
    data["appVersion"] = APP_VERSION
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
                             lightcolor=SURF2, darkcolor=SURF2, padding=8)
    s.map("TEntry", bordercolor=[("focus", PRI)],
                    fieldbackground=[("focus", SURF2)])
    s.configure("TScrollbar", background=SURF2, troughcolor=BG,
                               bordercolor=BG, arrowcolor=TXT_DIM)
    s.configure("Prog.Horizontal.TProgressbar",
                troughcolor=BORDER, background=PRI, thickness=4)
    s.configure("TCheckbutton", background=BG, foreground=TXT,
                                selectcolor=SURF2)
    s.configure("TOptionMenu",  background=SURF2, foreground=TXT)


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


def btn(parent, text, cmd, bg=PRI, hover=PRI_H, height=2, **kw):
    b = tk.Button(parent, text=text, command=cmd,
                  bg=bg, fg=TXT, activebackground=hover, activeforeground=TXT,
                  relief="flat", bd=0, font=(FONT, 11, "bold"),
                  cursor="hand2", pady=height, **kw)
    return b


def sep(parent):
    tk.Frame(parent, bg=BORDER, height=1).pack(fill="x", pady=8)


def section_lbl(parent, text):
    f = tk.Frame(parent, bg=BG)
    f.pack(fill="x", pady=(12, 4))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x")
    lbl(f, text, size=10, color=TXT_DIM).pack(anchor="w", pady=(4, 0))


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
    root.geometry("600x860")
    root.resizable(False, False)

    hdr = tk.Frame(root, bg=BG)
    hdr.pack(fill="x")
    try:
        from PIL import ImageTk
        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((160, 160), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img.convert("RGB"))
        lbl_img = tk.Label(hdr, image=_img, bg=BG, bd=0, highlightthickness=0)
        lbl_img.image = _img
        lbl_img.pack(pady=(18, 0))
    except Exception: pass

    tab_bar = tk.Frame(root, bg=BG)
    tab_bar.pack(fill="x", padx=40, pady=(14, 0))
    tk.Frame(root, bg=PRI, height=2).pack(fill="x", padx=40)

    panel_login = tk.Frame(root, bg=BG)
    panel_reg_wrap = tk.Frame(root, bg=BG)
    _tab = [0]

    btn_l = tk.Button(tab_bar, text="Logowanie", relief="flat", bd=0,
                      bg=BG, fg=TXT, font=(FONT, 12, "bold"),
                      activebackground=BG, activeforeground=TXT, cursor="hand2")
    btn_r = tk.Button(tab_bar, text="Nowy użytkownik", relief="flat", bd=0,
                      bg=BG, fg=TXT_DIM, font=(FONT, 12),
                      activebackground=BG, activeforeground=TXT, cursor="hand2")
    btn_l.pack(side="left", padx=(0, 20), pady=4)
    btn_r.pack(side="left", pady=4)

    def switch(idx):
        if _tab[0] == idx: return
        _tab[0] = idx
        if idx == 0:
            btn_l.configure(fg=TXT, font=(FONT, 12, "bold"))
            btn_r.configure(fg=TXT_DIM, font=(FONT, 12))
            panel_reg_wrap.pack_forget()
            panel_login.pack(fill="both", expand=True, padx=40, pady=16)
        else:
            btn_r.configure(fg=TXT, font=(FONT, 12, "bold"))
            btn_l.configure(fg=TXT_DIM, font=(FONT, 12))
            panel_login.pack_forget()
            panel_reg_wrap.pack(fill="both", expand=True)

    btn_l.configure(command=lambda: switch(0))
    btn_r.configure(command=lambda: switch(1))

    # ── Logowanie ──────────────────────────────────────────────────────────────
    lbl(panel_login, "E-mail", size=11, color=TXT_DIM).pack(anchor="w")
    e_mail = entry(panel_login, "adres@firma.pl")
    e_mail.pack(fill="x", ipady=4, pady=(2, 10))
    lbl(panel_login, "Hasło", size=11, color=TXT_DIM).pack(anchor="w")
    prow_l = tk.Frame(panel_login, bg=BG); prow_l.pack(fill="x", pady=(2, 4))
    e_lpwd = ttk.Entry(prow_l, show="•", font=(FONT, 11))
    e_lpwd.pack(side="left", fill="x", expand=True, ipady=4)
    _sh = [False]
    def tshow():
        _sh[0] = not _sh[0]; e_lpwd.configure(show="" if _sh[0] else "•")
    tk.Button(prow_l, text="👁", command=tshow,
              bg=SURF2, fg=TXT_DIM, activebackground=SURF, activeforeground=TXT,
              relief="flat", bd=0, padx=8, cursor="hand2").pack(side="left", padx=(4, 0))
    tk.Button(panel_login, text="Nie pamiętam hasła", command=lambda: _forgot(root),
              bg=BG, fg=TXT_DIM, activebackground=BG, activeforeground=TXT_DIM,
              relief="flat", bd=0, font=(FONT, 10), cursor="hand2").pack(anchor="e")
    lerr_v = tk.StringVar()
    lbl(panel_login, "", size=11, color=ERR_C, textvariable=lerr_v).pack(pady=(4, 0))
    def do_login():
        mail = get_val(e_mail); pwd = e_lpwd.get()
        if not mail or not pwd: lerr_v.set("Wpisz e-mail i hasło."); return
        lerr_v.set("Logowanie…")
        threading.Thread(target=_login_thread, args=(root, mail, pwd, on_login, lerr_v), daemon=True).start()
    btn(panel_login, "ZALOGUJ SIĘ", do_login).pack(fill="x", pady=(12, 0))
    e_mail.bind("<Return>", lambda _: e_lpwd.focus())
    e_lpwd.bind("<Return>", lambda _: do_login())

    # ── Rejestracja (compact, bez scrolla) ────────────────────────────────────
    rf = tk.Frame(panel_reg_wrap, bg=BG, padx=20)
    rf.pack(fill="both", expand=True, pady=(10, 0))

    def _row2(parent, l1, l2):
        r = tk.Frame(parent, bg=BG); r.pack(fill="x", pady=(6, 0))
        c1 = tk.Frame(r, bg=BG); c1.pack(side="left", fill="x", expand=True, padx=(0, 6))
        c2 = tk.Frame(r, bg=BG); c2.pack(side="left", fill="x", expand=True)
        lbl(c1, l1, size=10, color=TXT_DIM).pack(anchor="w")
        lbl(c2, l2, size=10, color=TXT_DIM).pack(anchor="w")
        e1 = entry(c1); e1.pack(fill="x", ipady=3, pady=(1, 0))
        e2 = entry(c2); e2.pack(fill="x", ipady=3, pady=(1, 0))
        return e1, e2

    # Firma + NIP
    r_fn = tk.Frame(rf, bg=BG); r_fn.pack(fill="x", pady=(8, 0))
    c_co = tk.Frame(r_fn, bg=BG); c_co.pack(side="left", fill="x", expand=True, padx=(0, 6))
    c_ni = tk.Frame(r_fn, bg=BG); c_ni.pack(side="left", fill="x", expand=True)
    lbl(c_co, "Nazwa firmy *", size=10, color=TXT_DIM).pack(anchor="w")
    e_company = entry(c_co); e_company.pack(fill="x", ipady=3, pady=(1, 0))
    lbl(c_ni, "NIP", size=10, color=TXT_DIM).pack(anchor="w")
    e_nip = entry(c_ni); e_nip.pack(fill="x", ipady=3, pady=(1, 0))

    # Imię + Nazwisko
    e_fname, e_lname = _row2(rf, "Imię *", "Nazwisko *")

    # Telefon + E-mail
    e_phone, e_remail = _row2(rf, "Telefon", "E-mail *")

    # Hasło + Powtórz
    rp = tk.Frame(rf, bg=BG); rp.pack(fill="x", pady=(6, 0))
    cp1 = tk.Frame(rp, bg=BG); cp1.pack(side="left", fill="x", expand=True, padx=(0, 6))
    cp2 = tk.Frame(rp, bg=BG); cp2.pack(side="left", fill="x", expand=True)
    lbl(cp1, "Hasło *", size=10, color=TXT_DIM).pack(anchor="w")
    pr1 = tk.Frame(cp1, bg=BG); pr1.pack(fill="x", pady=(1, 0))
    e_rpwd = ttk.Entry(pr1, show="•", font=(FONT, 11))
    e_rpwd.pack(side="left", fill="x", expand=True, ipady=3)
    _sp = [False]
    def tpwd():
        _sp[0] = not _sp[0]; e_rpwd.configure(show="" if _sp[0] else "•")
    tk.Button(pr1, text="👁", command=tpwd, bg=SURF2, fg=TXT_DIM,
              activebackground=SURF, activeforeground=TXT, relief="flat", bd=0,
              padx=6, cursor="hand2").pack(side="left", padx=(2, 0))
    lbl(cp2, "Powtórz hasło *", size=10, color=TXT_DIM).pack(anchor="w")
    e_rpwd2 = ttk.Entry(cp2, show="•", font=(FONT, 11))
    e_rpwd2.pack(fill="x", ipady=3, pady=(1, 0))

    str_bar = ttk.Progressbar(rf, style="Prog.Horizontal.TProgressbar",
                               orient="horizontal", mode="determinate", maximum=100)
    str_bar.pack(fill="x", pady=(4, 0))
    str_lbl = lbl(rf, "", size=9, color=TXT_DIM); str_lbl.pack(anchor="e")
    def _upd(*_):
        pct, txt, col = password_strength(e_rpwd.get())
        str_bar["value"] = pct * 100; str_lbl.configure(text=txt, fg=col)
    e_rpwd.bind("<KeyRelease>", _upd)

    # Uwagi
    lbl(rf, "Uwagi dla administratora", size=10, color=TXT_DIM).pack(anchor="w", pady=(6, 0))
    e_notes = tk.Text(rf, height=2, bg=SURF2, fg=TXT, insertbackground=TXT,
                      font=(FONT, 11), relief="flat", padx=8, pady=6, wrap="word")
    e_notes.pack(fill="x", pady=(2, 0))

    # Zgody (poziomo)
    zg = tk.Frame(rf, bg=BG); zg.pack(fill="x", pady=(10, 0))
    def _consent(parent, title, subtitle):
        fr = tk.Frame(parent, bg=SURF, padx=10, pady=8)
        fr.pack(side="left", fill="x", expand=True, padx=(0, 4))
        t = Toggle(fr); t.pack(side="right")
        tf = tk.Frame(fr, bg=SURF); tf.pack(side="left", fill="x", expand=True)
        lbl(tf, title, size=10, bold=True).pack(anchor="w")
        lbl(tf, subtitle, size=9, color=TXT_DIM).pack(anchor="w")
        return t
    t_rd  = _consent(zg, "RustDesk", "Zdalne wsparcie IT")
    t_mon = _consent(zg, "Monitorowanie", "CPU, RAM, dysk")

    rerr_v = tk.StringVar()
    lbl(rf, "", size=11, color=ERR_C, textvariable=rerr_v).pack(pady=(6, 0))

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
            "allowRustdesk": t_rd.get(), "allowMonitoring": t_mon.get(),
        }
        threading.Thread(target=_register_thread, args=(root, form, on_register, rerr_v), daemon=True).start()

    btn(rf, "ZAREJESTRUJ URZĄDZENIE", submit).pack(fill="x", pady=(10, 16))

    panel_login.pack(fill="both", expand=True, padx=40, pady=16)


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
    lbl(f, f"Wersja {APP_VERSION}  ·  2026-03-24", size=10, color=TXT_DIM).pack(pady=(2, 16))

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

    W, H = 560, 640
    win.update_idletasks()
    sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
    win.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")
    win.grab_set(); win.lift()

    f = tk.Frame(win, bg=BG, padx=28, pady=18)
    f.pack(fill="both", expand=True)

    lbl(f, "Nowe zgłoszenie", size=17, bold=True).pack(anchor="w")
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(6, 10))

    lbl(f, "Temat *", size=11, color=TXT_DIM).pack(anchor="w")
    e_title = ttk.Entry(f, font=(FONT, 11))
    e_title.pack(fill="x", ipady=4, pady=(2, 8))

    # ── Priorytet + Data ───────────────────────────────────────────────────────
    row = tk.Frame(f, bg=BG); row.pack(fill="x", pady=(0, 8))
    pf  = tk.Frame(row, bg=BG); pf.pack(side="left", fill="x", expand=True, padx=(0, 8))
    df  = tk.Frame(row, bg=BG); df.pack(side="left", fill="x", expand=True)

    lbl(pf, "Priorytet", size=11, color=TXT_DIM).pack(anchor="w")
    pri_label_v = tk.StringVar(value="Średni")
    pri_m = tk.OptionMenu(pf, pri_label_v, *_PRI_LABELS)
    pri_m.configure(bg=SURF2, fg=TXT, activebackground=SURF, activeforeground=TXT,
                    relief="flat", bd=0, font=(FONT, 11), highlightthickness=0, width=10)
    pri_m["menu"].configure(bg=SURF2, fg=TXT, activebackground=PRI, activeforeground=TXT)
    pri_m.pack(fill="x", pady=(2, 0))

    lbl(df, "Do kiedy należy realizować (opcja)", size=11, color=TXT_DIM).pack(anchor="w")
    date_row = tk.Frame(df, bg=BG); date_row.pack(fill="x", pady=(2, 0))
    e_due = entry(date_row, "dd.mm.rrrr")
    e_due.pack(side="left", fill="x", expand=True, ipady=4)
    tk.Button(date_row, text="📅", bg=SURF2, fg=TXT, relief="flat", bd=0,
              font=(FONT, 12), cursor="hand2", padx=6,
              activebackground=PRI, activeforeground=TXT,
              command=lambda: _open_calendar(win, e_due)).pack(side="left", padx=(4, 0))

    lbl(f, "Opis", size=11, color=TXT_DIM).pack(anchor="w", pady=(0, 2))
    e_desc = tk.Text(f, height=5, bg=SURF2, fg=TXT, insertbackground=TXT,
                     font=(FONT, 11), relief="flat", padx=8, pady=8, wrap="word")
    e_desc.pack(fill="x")

    # ── Zrzuty ekranu ─────────────────────────────────────────────────────────
    lbl(f, "Zrób zrzut ekranu (max 3)", size=11, color=TXT_DIM).pack(anchor="w", pady=(10, 6))
    shots     = [None, None, None]
    shot_btns = []

    def _make_shot(idx):
        def do():
            win.iconify()          # minimalizuj do paska zadań (bezpieczniejsze niż withdraw)
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
            shot_btns[idx].configure(text=f"✓ Zrzut {idx+1}", bg=OK_C, fg="#fff",
                                     font=(FONT, 10, "bold"))
        except Exception as e:
            shot_btns[idx].configure(text="✗ Błąd", bg=ERR_C, fg="#fff")
            log.error("Screenshot %d: %s", idx+1, e)
        finally:
            # Zawsze przywróć okno — nawet jeśli wystąpił błąd
            try:
                win.deiconify()
                win.lift()
                win.focus_force()
                win.after(50, win.grab_set)
            except Exception:
                pass

    sr = tk.Frame(f, bg=BG); sr.pack(fill="x")
    for i in range(3):
        bf = tk.Frame(sr, bg=SURF2, cursor="hand2")
        bf.pack(side="left", padx=(0, 8))
        tk.Label(bf, text="📷", bg=SURF2, fg=TXT,
                 font=(FONT, 22)).pack(pady=(8, 2))
        tk.Label(bf, text=f"Zrób zrzut {i+1}", bg=SURF2, fg=TXT,
                 font=(FONT, 9, "bold")).pack()
        tk.Label(bf, text="(Print Screen)", bg=SURF2, fg=TXT_DIM,
                 font=(FONT, 8)).pack(pady=(0, 8), padx=10)
        cmd = _make_shot(i)
        bf.bind("<Button-1>", lambda e, c=cmd: c())
        for child in bf.winfo_children():
            child.bind("<Button-1>", lambda e, c=cmd: c())
        shot_btns.append(bf)

    err_v = tk.StringVar()
    lbl(f, "", size=11, color=ERR_C, textvariable=err_v).pack(pady=(8, 0))

    def submit():
        title = e_title.get().strip()
        if not title: err_v.set("Podaj temat zgłoszenia."); return
        due_raw = get_val(e_due)
        due_iso = None
        if due_raw:
            try:
                dt = datetime.strptime(due_raw, "%d.%m.%Y")
                due_iso = dt.strftime("%Y-%m-%dT23:59:59+00:00")
            except ValueError:
                err_v.set("Błędny format daty (dd.mm.rrrr)"); return
        desc      = e_desc.get("1.0", "end").strip()
        taken     = [p for p in shots if p]
        pri_api   = _PRI_VALUES[_PRI_LABELS.index(pri_label_v.get())]
        err_v.set("Wysyłanie…")
        win.update()

        def _send():
            try:
                full_desc = desc
                if taken:
                    err_v.set("Przesyłanie zrzutów…")
                    urls = [u for p in taken for u in [upload_screenshot(p, token)] if u]
                    if urls:
                        full_desc += "\n\n📷 Zrzuty ekranu:\n" + "\n".join(urls)
                do_ticket(token, title, full_desc, pri_api, due_iso)
                win.after(0, lambda: (on_done(True), win.destroy()))
            except Exception as e:
                win.after(0, lambda: err_v.set(f"Błąd: {e}"))

        threading.Thread(target=_send, daemon=True).start()

    ab = tk.Frame(f, bg=BG); ab.pack(fill="x", pady=(10, 0))
    btn(ab, "Anuluj", win.destroy, bg=SURF2, hover=SURF).pack(side="right", padx=(6, 0))
    btn(ab, "WYŚLIJ ZGŁOSZENIE", submit).pack(side="right")

    e_title.focus()


# ─── Helper clear ────────────────────────────────────────────────────────────

def _clear(root):
    for w in root.winfo_children():
        w.destroy()


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
            show_waiting(self.root, token, self._on_activated, self._on_cancel)

    # ── Logowanie / Rejestracja ───────────────────────────────────────────────

    def _on_login(self, result):
        self.cfg = {"token": result["token"], "status": result["status"],
                    "allowMonitoring": True, "allowRustdesk": True}
        if result.get("deviceId"):
            self.cfg["deviceId"] = result["deviceId"]
        save_config(self.cfg)
        if result["status"] == "ACTIVE":
            self.root.withdraw()
            self._start_bg()
            if not is_rustdesk_installed():
                threading.Thread(target=self._install_rd, daemon=True).start()
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

    def _on_cancel(self):
        save_config({})
        self.cfg = {}
        show_login(self.root, self._on_login, self._on_register)

    # ── Tło ───────────────────────────────────────────────────────────────────

    def _start_bg(self):
        token = self.cfg.get("token", "")
        self._update_info = None
        if self.cfg.get("allowMonitoring", True):
            threading.Thread(target=self._metrics_loop, daemon=True).start()
        threading.Thread(target=self._update_check_loop, daemon=True).start()
        threading.Thread(target=self._ensure_shortcut, daemon=True).start()
        self._ws = WS(token, self._on_ws)
        self._ws.start()
        self._start_tray()

    def _ensure_shortcut(self):
        """Tworzy skrót na pulpicie jeśli nie istnieje + rejestruje w Dodaj/Usuń."""
        try:
            _register_in_add_remove()
            desktop = _get_desktop_path()
            lnk = os.path.join(desktop, "Zgloszenie serwisowe.lnk")
            if not os.path.exists(lnk):
                create_desktop_shortcut()
            else:
                log.info("Shortcut already exists: %s", lnk)
        except Exception as e:
            log.warning("Ensure shortcut error: %s", e)

    def _metrics_loop(self):
        token = self.cfg.get("token", "")
        try:
            requests.post(f"{API_BASE}/agent/metrics", json=full_inventory(),
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        except Exception: pass
        while True:
            time.sleep(60)
            try: do_metrics(token)
            except Exception: pass

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
        elif mtype == "wake":
            mac = msg.get("mac", "")
            if mac:
                threading.Thread(target=_send_wol, args=(mac,), daemon=True).start()

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
        try:
            icon_img = Image.open(res("ikona.png")).convert("RGBA")
        except Exception:
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
                pystray.MenuItem("📋  Nowe zgłoszenie", lambda i, it: self.root.after(0, self._open_ticket)),
                pystray.MenuItem("❓  FAQ",              lambda i, it: self.root.after(0, self._open_faq)),
                pystray.MenuItem("📞  Kontakt",         lambda i, it: self.root.after(0, self._open_contact)),
                pystray.MenuItem("🌐  Mój panel",        lambda i, it: self._open_portal()),
                pystray.MenuItem("(i) O programie",     lambda i, it: self.root.after(0, self._open_about)),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("❌  Zamknij",          lambda i, it: self._quit(i)),
            ]
            return items

        menu = pystray.Menu(_menu_items)
        self._tray = pystray.Icon(APP_NAME, icon_img, APP_NAME, menu)
        threading.Thread(target=self._tray.run, daemon=True).start()

    def _default_icon(self):
        img = Image.new("RGBA", (64, 64), (99, 102, 241, 255))
        d = ImageDraw.Draw(img)
        d.ellipse([8, 8, 56, 56], fill=(255, 255, 255, 200))
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
        import webbrowser; webbrowser.open(PORTAL_URL)

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


def main():
    log.info("InfraDesk Agent %s starting — args: %s", APP_VERSION, sys.argv)
    if "--uninstall" in sys.argv:
        _do_uninstall()
        return
    # Sprawdź instalację ZANIM powstanie jakiekolwiek okno
    if is_frozen() and not is_installed():
        install_and_restart()
        return
    open_ticket_on_start = "--ticket" in sys.argv
    App(open_ticket_on_start=open_ticket_on_start)


if __name__ == "__main__":
    main()
