"""
core/system.py — Windows system introspection helpers.
_wmic, _rustdesk_id / AnyDesk / TeamViewer, _cpu_temp, _software list.
"""
from __future__ import annotations

import os
import subprocess
import winreg

from .config import log
from .utils import NO_WINDOW


def _wmic(q: str) -> str:
    try:
        r = subprocess.run(
            ["wmic"] + q.split(),
            capture_output=True, text=True, timeout=6,
            creationflags=NO_WINDOW,
        )
        lines = [l.strip() for l in r.stdout.splitlines() if l.strip()]
        return lines[-1] if len(lines) >= 2 else ""
    except Exception:
        return ""


# ── RustDesk / SILERS remote access ─────────────────────────────────────────

_RUSTDESK_EXE_CANDIDATES = [
    r"C:\Program Files\SILERS\SILERS.exe",
    r"C:\Program Files\SILERS\rustdesk.exe",
    r"C:\Program Files\SILERS\RustDesk\rustdesk.exe",
    r"C:\Program Files\RustDesk\rustdesk.exe",
    r"C:\Program Files (x86)\RustDesk\rustdesk.exe",
]


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
    for exe in _RUSTDESK_EXE_CANDIDATES:
        if os.path.exists(exe):
            return exe
    return None


def _rustdesk_set_one_time_password(length: int = 6) -> str | None:
    """Set a one-time RustDesk password, return it. None if RustDesk missing."""
    exe = _rustdesk_exe()
    if not exe:
        return None
    import secrets

    pwd = "".join(secrets.choice("0123456789") for _ in range(length))
    try:
        subprocess.run(
            [exe, "--password", pwd],
            capture_output=True, timeout=10, creationflags=NO_WINDOW,
        )
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
        for exe in _RUSTDESK_EXE_CANDIDATES:
            if os.path.exists(exe):
                r = subprocess.run(
                    [exe, "--get-id"], capture_output=True, text=True,
                    timeout=6, creationflags=NO_WINDOW,
                )
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
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        )
        val = r.stdout.strip()
        if val and len(val) > 3:
            return val
    except Exception:
        pass

    return None


def is_rustdesk_installed() -> bool:
    for p in [r"C:\Program Files\SILERS\SILERS.exe",
              r"C:\Program Files\RustDesk\rustdesk.exe",
              r"C:\Program Files (x86)\RustDesk\rustdesk.exe"]:
        if os.path.exists(p):
            return True
    return False


def _anydesk_id() -> str | None:
    paths = [
        os.path.join(os.environ.get("PROGRAMDATA", ""), "AnyDesk", "system.conf"),
        os.path.join(os.environ.get("APPDATA", ""), "AnyDesk", "system.conf"),
    ]
    for p in paths:
        try:
            with open(p) as f:
                for line in f:
                    if line.strip().startswith("ad.anynet.id"):
                        return line.split("=", 1)[1].strip()
        except Exception:
            pass
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
                if val:
                    return str(val)
        except Exception:
            pass
    return None


def _cpu_temp() -> float | None:
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-WmiObject -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature"
             " -ErrorAction SilentlyContinue).CurrentTemperature |"
             " ForEach-Object { [math]::Round($_ / 10.0 - 273.15, 1) }"],
            capture_output=True, text=True, timeout=8, creationflags=NO_WINDOW,
        )
        vals = [float(v) for v in r.stdout.split() if v.strip()]
        return round(sum(vals) / len(vals), 1) if vals else None
    except Exception:
        return None


def _software() -> list:
    """Installed software list from Uninstall registry keys (filtered)."""
    SKIP = ("update for", "hotfix", "security update", "service pack", "kb",
            "microsoft .net", "microsoft visual c++", "windows sdk", "windows driver")
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
                                try:
                                    return winreg.QueryValueEx(s, n)[0]
                                except Exception:
                                    return ""

                            def vi(n):
                                try:
                                    return int(winreg.QueryValueEx(s, n)[0])
                                except Exception:
                                    return 0

                            name = v("DisplayName")
                            if not name:
                                continue
                            if vi("SystemComponent"):
                                continue
                            if v("ParentKeyName"):
                                continue
                            if not v("UninstallString"):
                                continue
                            if any(name.lower().startswith(p) for p in SKIP):
                                continue
                            idate = v("InstallDate")
                            if idate and len(str(idate)) == 8:
                                idate = f"{str(idate)[:4]}-{str(idate)[4:6]}-{str(idate)[6:8]}"
                            sw[name] = {
                                "name": name, "version": v("DisplayVersion"),
                                "publisher": v("Publisher"),
                                "installDate": idate or "",
                                "sizeMB": round(vi("EstimatedSize") / 1024, 1) if vi("EstimatedSize") else 0,
                            }
                    except Exception:
                        pass
        except Exception:
            pass
    return sorted(sw.values(), key=lambda x: x["name"].lower())
