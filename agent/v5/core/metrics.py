"""
core/metrics.py — machine_info, metrics, full_inventory,
server_metrics, network_scan, lan_scan_diff, license_audit,
screen_lock_report, security_events, collect_new_events, speedtest.

Canonical extraction from asystent_business.py (v4.14.6).
"""
from __future__ import annotations

import json
import os
import platform
import re
import socket
import subprocess
import time
from datetime import datetime

import psutil

from .config import APP_VERSION, API_BASE, INSTALL_DIR, SILERS_MSI_URL, log, load_config
from .system import (
    _anydesk_id, _cpu_temp, _rustdesk_id, _software, _teamviewer_id, _wmic,
)
from .utils import NO_WINDOW


# ── machine_info / metrics / full_inventory ──────────────────────────────────

def machine_info() -> dict:
    info: dict = {
        "hostname":    socket.gethostname(),
        "osInfo":      f"{platform.system()} {platform.release()}",
        "domain":      os.environ.get("USERDOMAIN", ""),
        "currentUser": os.environ.get("USERNAME", ""),
    }
    try:
        info["ipAddress"] = socket.gethostbyname(info["hostname"])
    except Exception:
        info["ipAddress"] = "127.0.0.1"
    try:
        info["windowsVersion"] = platform.version()
        info["cpuModel"]   = platform.processor()
        info["cpuCores"]   = psutil.cpu_count(logical=False) or 1
        info["cpuThreads"] = psutil.cpu_count(logical=True) or 1
        info["ramTotalGb"] = round(psutil.virtual_memory().total / (1024**3), 2)
    except Exception:
        pass
    for key, q in [("gpuModel", "path win32_VideoController get Name"),
                   ("serialNumber", "bios get SerialNumber"),
                   ("motherboard", "baseboard get Product")]:
        val = _wmic(q).strip()
        if val and val.lower() not in (key, "serialnumber", "to be filled by o.e.m.", "product", "name"):
            info[key] = val
    try:
        info["lastBootTime"] = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        pass
    try:
        disks = []
        for p in psutil.disk_partitions():
            try:
                u = psutil.disk_usage(p.mountpoint)
                disks.append({
                    "device": p.device, "mountpoint": p.mountpoint,
                    "fstype": p.fstype,
                    "totalGb": round(u.total / (1024**3), 2),
                    "freeGb":  round(u.free  / (1024**3), 2),
                    "usedPct": u.percent,
                })
            except Exception:
                pass
        info["diskInfo"] = disks
    except Exception:
        pass
    try:
        addrs, stats = psutil.net_if_addrs(), psutil.net_if_stats()
        ifaces = []
        for name, al in addrs.items():
            ip4 = mac = ""
            for a in al:
                if a.family == socket.AF_INET:
                    ip4 = a.address
                elif a.family == psutil.AF_LINK:
                    mac = a.address
            s = stats.get(name)
            ifaces.append({"name": name, "ip": ip4, "mac": mac, "isUp": s.isup if s else False})
        info["networkIfaces"] = ifaces
    except Exception:
        pass
    rd = _rustdesk_id()
    if rd:
        info["rustdeskId"] = rd
    ad = _anydesk_id()
    if ad:
        info["anydeskId"] = ad
    tv = _teamviewer_id()
    if tv:
        info["teamviewerId"] = tv
    return info


def metrics() -> dict:
    d = machine_info()
    d["appVersion"] = APP_VERSION
    try:
        c = psutil.disk_usage("C:\\")
        d["diskFree"]  = round(c.free  / (1024**3), 2)
        d["diskTotal"] = round(c.total / (1024**3), 2)
    except Exception:
        pass
    d["cpuUsage"] = psutil.cpu_percent(interval=1)
    d["ramUsage"] = psutil.virtual_memory().percent
    t = _cpu_temp()
    if t is not None:
        d["cpuTempC"] = t
    return d


def full_inventory() -> dict:
    d = metrics()
    try:
        d["installedSoftware"] = _software()
    except Exception:
        pass
    return d


# ── server_metrics: S.M.A.R.T., RAID, services, events, certs, top procs ────

def server_metrics() -> dict:
    result: dict = {}
    try:
        # S.M.A.R.T. disk health
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,MediaType,HealthStatus,OperationalStatus,Size | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if ps.stdout.strip():
                disks = json.loads(ps.stdout)
                if isinstance(disks, dict):
                    disks = [disks]
                result["smartDisks"] = [{
                    "id":      str(d.get("DeviceId", "")),
                    "name":    d.get("FriendlyName", ""),
                    "type":    d.get("MediaType", ""),
                    "health":  d.get("HealthStatus", "Unknown"),
                    "status":  d.get("OperationalStatus", "Unknown"),
                    "sizeGb":  round(d.get("Size", 0) / 1073741824, 1) if d.get("Size") else 0,
                } for d in disks]
        except Exception as e:
            log.debug("S.M.A.R.T. collection error: %s", e)

        # RAID / Storage Pool status
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-StoragePool | Where-Object IsPrimordial -eq $false | Select-Object FriendlyName,HealthStatus,OperationalStatus,Size | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if ps.stdout.strip():
                pools = json.loads(ps.stdout)
                if isinstance(pools, dict):
                    pools = [pools]
                result["storagePools"] = [{
                    "name":   p.get("FriendlyName", ""),
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
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if ps.stdout.strip():
                svcs = json.loads(ps.stdout)
                if isinstance(svcs, dict):
                    svcs = [svcs]
                result["services"] = [{
                    "name":        s.get("Name", ""),
                    "displayName": s.get("DisplayName", ""),
                    "status": ("Running" if s.get("Status") == 4
                               else "Stopped" if s.get("Status") == 1
                               else str(s.get("Status", ""))),
                } for s in svcs]
        except Exception:
            pass

        # Critical event log (24h)
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-WinEvent -FilterHashtable @{LogName='System','Application';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 20 -ErrorAction SilentlyContinue | "
                 "Select-Object TimeCreated,LevelDisplayName,ProviderName,Message | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if ps.stdout.strip():
                events = json.loads(ps.stdout)
                if isinstance(events, dict):
                    events = [events]
                result["criticalEvents"] = [{
                    "time":    str(e.get("TimeCreated", ""))[:19],
                    "level":   e.get("LevelDisplayName", ""),
                    "source":  e.get("ProviderName", ""),
                    "message": (e.get("Message", "") or "")[:200],
                } for e in events[:20]]
        except Exception:
            pass

        # SSL certificates expiring within 60 days
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-ChildItem Cert:\\LocalMachine\\My | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(60) } | "
                 "Select-Object Subject,NotAfter,Thumbprint | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if ps.stdout.strip():
                certs = json.loads(ps.stdout)
                if isinstance(certs, dict):
                    certs = [certs]
                result["expiringCerts"] = [{
                    "subject":    c.get("Subject", ""),
                    "expiresAt":  str(c.get("NotAfter", ""))[:10],
                    "thumbprint": c.get("Thumbprint", "")[:16],
                } for c in certs]
        except Exception:
            pass

        # Top 5 CPU
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
                "pid":  p['pid'],
                "name": p['name'],
                "cpu":  round(p.get('cpu_percent', 0), 1),
                "ram":  round(p.get('memory_percent', 0), 1),
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

        # Hyper-V VMs
        try:
            ps = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "if (Get-Command Get-VM -ErrorAction SilentlyContinue) { Get-VM | Select-Object Name,State,CPUUsage,MemoryAssigned,Uptime | ConvertTo-Json -Compress }"],
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if ps.stdout.strip():
                vms = json.loads(ps.stdout)
                if isinstance(vms, dict):
                    vms = [vms]
                result["hyperVMs"] = [{
                    "name":     v.get("Name", ""),
                    "state":    str(v.get("State", "")),
                    "cpuUsage": v.get("CPUUsage"),
                    "memoryMb": round(v.get("MemoryAssigned", 0) / 1048576) if v.get("MemoryAssigned") else 0,
                } for v in vms]
        except Exception:
            pass

    except Exception as e:
        log.error("server_metrics error: %s", e)

    return result


# ── Network scan + LAN diff ──────────────────────────────────────────────────

_LAN_KNOWN_FILE = os.path.join(INSTALL_DIR, "lan_known.json")


def network_scan() -> dict:
    """Scan local network: ARP + ping + port-scan."""
    result = {
        "scannedAt": datetime.now().isoformat()[:19],
        "subnet": "", "gateway": "", "devices": [],
    }
    try:
        ps = subprocess.run(
            ["powershell", "-Command",
             "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Select-Object -First 1).NextHop"],
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW)
        gw = ps.stdout.strip()
        if not gw:
            return result
        result["gateway"] = gw
        parts = gw.split(".")
        if len(parts) != 4:
            return result
        subnet = f"{parts[0]}.{parts[1]}.{parts[2]}"
        result["subnet"] = f"{subnet}.0/24"

        subprocess.run(["powershell", "-Command",
            f"1..254 | ForEach-Object {{ Test-Connection -ComputerName '{subnet}.$_' -Count 1 -TimeoutSeconds 1 -EA SilentlyContinue | Out-Null }}"],
            capture_output=True, timeout=120, creationflags=NO_WINDOW)

        arp_out = subprocess.run(
            ["arp", "-a"], capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        ).stdout
        devices = []
        for line in arp_out.split("\n"):
            m = re.match(r'\s*(\d+\.\d+\.\d+\.\d+)\s+([\da-f-]+)\s+(\w+)', line.strip())
            if m and m.group(3) == "dynamic" and m.group(1).startswith(subnet + "."):
                ip = m.group(1)
                mac = m.group(2).replace("-", ":").upper()
                if mac == "FF:FF:FF:FF:FF:FF":
                    continue
                hostname = ""
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except Exception:
                    pass
                open_ports = []
                for port in [22, 80, 443, 445, 3389, 5900, 8080, 9100]:
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(0.3)
                        if s.connect_ex((ip, port)) == 0:
                            open_ports.append(port)
                        s.close()
                    except Exception:
                        pass
                dtype = "unknown"
                if ip == gw:
                    dtype = "router"
                elif 9100 in open_ports:
                    dtype = "printer"
                elif 3389 in open_ports and 445 in open_ports:
                    dtype = "server"
                elif 3389 in open_ports:
                    dtype = "windows"
                elif 22 in open_ports:
                    dtype = "linux"
                elif 80 in open_ports or 443 in open_ports:
                    dtype = "network"
                devices.append({"ip": ip, "mac": mac, "hostname": hostname,
                                "ports": open_ports, "type": dtype})

        result["devices"] = sorted(devices, key=lambda d: [int(x) for x in d["ip"].split(".")])
        log.info("Network scan: %d devices in %s", len(devices), result["subnet"])
    except Exception as e:
        log.error("Network scan error: %s", e)
    return result


def _load_lan_known() -> dict:
    try:
        if os.path.exists(_LAN_KNOWN_FILE):
            with open(_LAN_KNOWN_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_lan_known(db: dict) -> None:
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_LAN_KNOWN_FILE, "w") as f:
            json.dump(db, f)
    except Exception:
        pass


def lan_scan_diff() -> dict:
    scan = network_scan()
    now_iso = datetime.now().isoformat()[:19]
    db = _load_lan_known()
    new_devices = []
    for d in scan.get("devices", []):
        mac = d.get("mac", "")
        if not mac:
            continue
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


# ── License audit ────────────────────────────────────────────────────────────

def license_audit() -> dict:
    """Zbiera klucze produktów (Windows/Office) + status aktywacji."""
    import winreg

    result = {"measuredAt": datetime.now().isoformat()[:19], "licenses": []}

    try:
        ps = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             "$sls = Get-CimInstance SoftwareLicensingService; "
             "$prod = Get-CimInstance SoftwareLicensingProduct | Where-Object { $_.PartialProductKey -and $_.LicenseStatus -ne 0 } | "
             "Select-Object Name,Description,PartialProductKey,LicenseStatus,@{N='GraceDays';E={[math]::Round($_.GracePeriodRemaining/1440,0)}}; "
             "@{ OA3Key=$sls.OA3xOriginalProductKey; Products=$prod } | ConvertTo-Json -Compress -Depth 3"],
            capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
        raw = (ps.stdout or "").strip()
        if raw:
            data = json.loads(raw)
            oem = data.get("OA3Key", "") or ""
            if oem:
                result["licenses"].append({
                    "product": "Windows (OEM)", "key": oem, "source": "BIOS (OA3)",
                })
            prods = data.get("Products") or []
            if isinstance(prods, dict):
                prods = [prods]
            status_map = {0: "Unlicensed", 1: "Licensed", 2: "OOB Grace", 3: "OOT Grace",
                          4: "Non-Genuine", 5: "Notification", 6: "Extended Grace"}
            for p in prods:
                name = p.get("Name", "")
                nm_lower = name.lower()
                if not ("windows" in nm_lower or "office" in nm_lower
                        or "visio" in nm_lower or "project" in nm_lower):
                    continue
                result["licenses"].append({
                    "product":     name,
                    "partialKey":  p.get("PartialProductKey", ""),
                    "status":      status_map.get(p.get("LicenseStatus", 0), "Unknown"),
                    "graceDays":   p.get("GraceDays", 0),
                    "description": p.get("Description", ""),
                })
    except Exception as e:
        log.debug("License audit (Windows) error: %s", e)

    try:
        for hive, path in [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Office\ClickToRun\Configuration"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Office\ClickToRun\Configuration"),
        ]:
            try:
                with winreg.OpenKey(hive, path) as k:
                    def _rv(n):
                        try:
                            return winreg.QueryValueEx(k, n)[0]
                        except Exception:
                            return ""
                    prod = _rv("ProductReleaseIds")
                    ver  = _rv("VersionToReport")
                    if prod:
                        result["licenses"].append({
                            "product": f"Microsoft Office ({prod})",
                            "version": ver,
                            "source":  "ClickToRun",
                        })
                        break
            except Exception:
                pass
    except Exception:
        pass

    return result


# ── Screen lock report ───────────────────────────────────────────────────────

def _user_idle_seconds() -> int:
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
    try:
        for p in psutil.process_iter(["name"]):
            try:
                if (p.info["name"] or "").lower() == "logonui.exe":
                    return True
            except Exception:
                pass
    except Exception:
        pass
    return False


def screen_lock_report(unlocked_idle_threshold: int = 900) -> dict:
    idle = _user_idle_seconds()
    locked = _is_workstation_locked()
    flagged = (not locked) and idle > unlocked_idle_threshold
    return {
        "idleSeconds":      idle,
        "locked":           locked,
        "flagged":          flagged,
        "thresholdSeconds": unlocked_idle_threshold,
        "measuredAt":       datetime.now().isoformat()[:19],
    }


# ── Security events (failed logins, new users, RDP new IPs, USB) ────────────

_SEC_CURSOR_FILE = os.path.join(INSTALL_DIR, "sec_cursor.json")


def _load_sec_state() -> dict:
    try:
        if os.path.exists(_SEC_CURSOR_FILE):
            with open(_SEC_CURSOR_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {"rdpIps": [], "lastTime": ""}


def _save_sec_state(state: dict) -> None:
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_SEC_CURSOR_FILE, "w") as f:
            json.dump(state, f)
    except Exception as e:
        log.debug("Sec state save failed: %s", e)


def security_events() -> dict:
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
            capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW)
        raw = (ps.stdout or "").strip()
        if raw:
            evs = json.loads(raw)
            if isinstance(evs, dict):
                evs = [evs]
            failed_count = 0
            for e in evs:
                eid = e.get("Id")
                msg = e.get("Msg", "") or ""
                t = str(e.get("Time", ""))[:19]
                if eid == 4625:
                    failed_count += 1
                elif eid == 4720:
                    m = (re.search(r"New Account:[\s\S]*?Account Name:\s*(\S+)", msg)
                         or re.search(r"Nowe konto:[\s\S]*?Nazwa konta:\s*(\S+)", msg))
                    out["newUsers"].append({"time": t, "account": m.group(1) if m else "?"})
                elif eid == 4732:
                    if "Administrator" in msg or "Administrators" in msg or "Administratorzy" in msg:
                        m = (re.search(r"Member:[\s\S]*?Account Name:\s*(\S+)", msg)
                             or re.search(r"Członek:[\s\S]*?Nazwa konta:\s*(\S+)", msg))
                        out["newAdmins"].append({"time": t, "account": m.group(1) if m else "?"})
                elif eid == 4624:
                    if ("Logon Type:\t\t10" in msg or "Logon Type:  10" in msg
                            or "Typ logowania:\t\t10" in msg or "LogonType 10" in msg):
                        m = (re.search(r"Source Network Address:\s*(\S+)", msg)
                             or re.search(r"Źródłowy adres sieciowy:\s*(\S+)", msg))
                        ip = m.group(1) if m else ""
                        if ip and ip not in ("-", "::1", "127.0.0.1") and ip not in known_ips:
                            known_ips.append(ip)
                            out["rdpNewIp"].append({"time": t, "ip": ip})
            out["failedLogins"] = failed_count
    except Exception as e:
        log.debug("Security events error: %s", e)

    # USB — new PnP devices in last 24h
    try:
        ps = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
             f"$since=(Get-Date).AddHours(-{cutoff_hours});"
             f"Get-WinEvent -FilterHashtable @{{LogName='Microsoft-Windows-DriverFrameworks-UserMode/Operational';Id=2003;StartTime=$since}} "
             f"-MaxEvents 50 -ErrorAction SilentlyContinue | "
             f"Select-Object @{{N='Time';E={{$_.TimeCreated.ToString('o')}}}},"
             f"@{{N='Msg';E={{($_.Message -replace '\\s+',' ').Substring(0,[Math]::Min(300,$_.Message.Length))}}}} | "
             f"ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=45, creationflags=NO_WINDOW)
        raw = (ps.stdout or "").strip()
        if raw:
            evs = json.loads(raw)
            if isinstance(evs, dict):
                evs = [evs]
            for e in evs[:20]:
                out["usbDevices"].append({
                    "time": str(e.get("Time", ""))[:19],
                    "info": (e.get("Msg", "") or "")[:200],
                })
    except Exception:
        pass

    state["rdpIps"] = known_ips[-50:]
    _save_sec_state(state)
    return out


# ── Event Viewer bridge ──────────────────────────────────────────────────────

_EVENT_CURSOR_FILE = os.path.join(INSTALL_DIR, "event_cursor.json")

CRITICAL_EVENT_PATTERNS = [
    ("Microsoft-Windows-Kernel-Power", 41,  "HIGH",     "Nieoczekiwany restart/wyłączenie (Kernel-Power 41)"),
    ("disk",                           7,   "HIGH",     "Błąd dysku (disk 7)"),
    ("disk",                           51,  "HIGH",     "Błąd I/O stronicowania (disk 51)"),
    ("Ntfs",                           55,  "HIGH",     "Uszkodzenie systemu plików NTFS (55)"),
    ("volmgr",                         161, "HIGH",     "Awaria woluminu (volmgr 161)"),
    ("Microsoft-Windows-WHEA-Logger",  None, "CRITICAL", "Błąd sprzętu WHEA"),
    ("Service Control Manager",        7031, "MEDIUM",  "Usługa nieoczekiwanie przerwała pracę"),
    ("Service Control Manager",        7034, "MEDIUM",  "Usługa zakończyła pracę awaryjnie"),
    ("BugCheck",                       None, "CRITICAL", "BSOD wykryty (BugCheck)"),
]


def _load_event_cursor() -> str:
    try:
        if os.path.exists(_EVENT_CURSOR_FILE):
            with open(_EVENT_CURSOR_FILE) as f:
                return json.load(f).get("lastTime", "")
    except Exception:
        pass
    return ""


def _save_event_cursor(last_time: str) -> None:
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_EVENT_CURSOR_FILE, "w") as f:
            json.dump({"lastTime": last_time}, f)
    except Exception as e:
        log.debug("Event cursor save failed: %s", e)


def _classify_event(provider: str, event_id) -> tuple[str, str] | None:
    try:
        eid = int(event_id) if event_id is not None else None
    except Exception:
        eid = None
    prov = (provider or "").lower()
    for pat_prov, pat_id, prio, title in CRITICAL_EVENT_PATTERNS:
        if pat_prov.lower() in prov and (pat_id is None or pat_id == eid):
            return prio, title
    return None


def collect_new_events(max_events: int = 100) -> list[dict]:
    cursor = _load_event_cursor()
    if cursor:
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
            capture_output=True, text=True, timeout=45, creationflags=NO_WINDOW)
        out = (ps.stdout or "").strip()
        if not out:
            return []
        evs = json.loads(out)
        if isinstance(evs, dict):
            evs = [evs]
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
            if t > newest:
                newest = t
        if newest and newest != cursor:
            _save_event_cursor(newest)
        return results
    except Exception as e:
        log.debug("Event collection error: %s", e)
        return []


# ── Log shipping (IIS/MSSQL) ─────────────────────────────────────────────────

_LOG_CURSOR_FILE = os.path.join(INSTALL_DIR, "log_cursor.json")
_LOG_MAX_LINES_PER_FILE = 50
_LOG_MAX_FILE_SIZE = 50 * 1024 * 1024


def _autodetect_log_sources() -> list[dict]:
    sources = []
    iis_root = r"C:\inetpub\logs\LogFiles"
    if os.path.isdir(iis_root):
        try:
            for sub in os.listdir(iis_root):
                full = os.path.join(iis_root, sub)
                if os.path.isdir(full) and sub.upper().startswith("W3SVC"):
                    logs = sorted(
                        [f for f in os.listdir(full) if f.lower().endswith(".log")],
                        key=lambda f: os.path.getmtime(os.path.join(full, f)),
                        reverse=True,
                    )
                    if logs:
                        sources.append({"type": "iis", "site": sub,
                                        "path": os.path.join(full, logs[0])})
        except Exception:
            pass

    for base in [r"C:\Program Files\Microsoft SQL Server",
                 r"C:\Program Files (x86)\Microsoft SQL Server"]:
        if not os.path.isdir(base):
            continue
        try:
            for inst in os.listdir(base):
                log_dir = os.path.join(base, inst, "MSSQL", "Log")
                errorlog = os.path.join(log_dir, "ERRORLOG")
                if os.path.isfile(errorlog):
                    sources.append({"type": "mssql", "instance": inst, "path": errorlog})
        except Exception:
            pass
    return sources


def _load_log_cursors() -> dict:
    try:
        if os.path.exists(_LOG_CURSOR_FILE):
            with open(_LOG_CURSOR_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_log_cursors(c: dict) -> None:
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        with open(_LOG_CURSOR_FILE, "w") as f:
            json.dump(c, f)
    except Exception:
        pass


def _is_error_line(src_type: str, line: str) -> bool:
    low = line.lower()
    if src_type == "iis":
        m = re.search(r'\s(5\d{2}|4\d{2})\s', line)
        if not m:
            return False
        code = int(m.group(1))
        return code >= 500 or code in (401, 403, 429)
    if src_type == "mssql":
        return ("error" in low or "severity" in low or "fatal" in low
                or "login failed" in low or "deadlock" in low)
    return "error" in low or "fail" in low or "fatal" in low


def log_shipping_collect() -> dict:
    cfg = load_config()
    configured = cfg.get("logSources")
    sources = configured if isinstance(configured, list) and configured else _autodetect_log_sources()
    cursors = _load_log_cursors()
    out = {"collectedAt": datetime.now().isoformat()[:19], "entries": []}

    for src in sources:
        path = src.get("path", "")
        stype = src.get("type", "other")
        if not path or not os.path.isfile(path):
            continue
        try:
            size = os.path.getsize(path)
            if size > _LOG_MAX_FILE_SIZE:
                continue
            prev = cursors.get(path, 0)
            if prev > size:
                prev = 0
            if prev >= size:
                continue

            errors: list[str] = []
            with open(path, "rb") as f:
                f.seek(prev)
                chunk = f.read(min(size - prev, 4 * 1024 * 1024))
            try:
                text = chunk.decode("utf-8", errors="replace")
            except Exception:
                text = chunk.decode("latin-1", errors="replace")
            for ln in text.splitlines():
                ln = ln.strip()
                if not ln or ln.startswith("#"):
                    continue
                if _is_error_line(stype, ln):
                    errors.append(ln[:500])
                    if len(errors) >= _LOG_MAX_LINES_PER_FILE:
                        break

            cursors[path] = size
            if errors:
                out["entries"].append({
                    "type":  stype,
                    "path":  path,
                    "meta":  {k: v for k, v in src.items() if k not in ("type", "path")},
                    "lines": errors,
                    "count": len(errors),
                })
        except Exception as e:
            log.debug("Log shipping %s error: %s", path, e)

    _save_log_cursors(cursors)
    return out


# ── Speedtest ────────────────────────────────────────────────────────────────

def speedtest(download_size_mb: int = 10, upload_size_mb: int = 2) -> dict:
    import statistics

    import requests

    result = {"measuredAt": datetime.now().isoformat()[:19]}
    try:
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
                    result["downloadMbps"]  = round((total * 8) / elapsed / 1_000_000, 2)
                    result["downloadBytes"] = total
            else:
                t0 = time.perf_counter()
                r = requests.get(SILERS_MSI_URL, timeout=60, stream=True)
                total = 0
                for chunk in r.iter_content(chunk_size=65536):
                    total += len(chunk)
                    if total >= download_size_mb * 1024 * 1024:
                        break
                elapsed = max(time.perf_counter() - t0, 0.001)
                if total > 0:
                    result["downloadMbps"]  = round((total * 8) / elapsed / 1_000_000, 2)
                    result["downloadBytes"] = total
        except Exception as e:
            log.debug("Speedtest download failed: %s", e)

        try:
            payload = os.urandom(upload_size_mb * 1024 * 1024)
            t0 = time.perf_counter()
            r = requests.post(f"{API_BASE}/speedtest/upload", data=payload,
                              headers={"Content-Type": "application/octet-stream"}, timeout=60)
            elapsed = max(time.perf_counter() - t0, 0.001)
            if r.status_code < 400:
                result["uploadMbps"]  = round((len(payload) * 8) / elapsed / 1_000_000, 2)
                result["uploadBytes"] = len(payload)
        except Exception as e:
            log.debug("Speedtest upload failed: %s", e)

        log.info("Speedtest: ↓ %s Mbps · ↑ %s Mbps · ping %s ms",
                 result.get("downloadMbps", "?"), result.get("uploadMbps", "?"),
                 result.get("pingMs", "?"))
    except Exception as e:
        log.error("Speedtest error: %s", e)
        result["error"] = str(e)
    return result
