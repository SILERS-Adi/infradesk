"""
core/diagnostics.py — AutoDiagnostics (scheduled ticket creation),
SelfHealer (safe auto-fixes), security_audit (20 checks), full_diagnosis,
system score.
"""
from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import tempfile
import time
import winreg
from datetime import datetime

import psutil

from .api import do_ticket
from .config import INSTALL_DIR, log, load_config
from .metrics import _classify_event, collect_new_events
from .utils import NO_WINDOW


# ── Security audit whitelist/descriptions ────────────────────────────────────

SECURITY_CHECK_INFO: dict[str, dict] = {
    "firewall": {
        "desc": "Zapora Windows Firewall chroni komputer przed nieautoryzowanymi połączeniami sieciowymi.",
        "why":  "Wyłączona zapora naraża na ataki z sieci lokalnej i Internetu.",
        "fix_info": "Włącza wszystkie 3 profile (Domain/Private/Public). Trwałe.",
    },
    "defender": {
        "desc": "Windows Defender — ochrona antywirusowa w czasie rzeczywistym.",
        "why":  "Bez Defendera brak ochrony przed malware, ransomware, wirusami.",
        "fix_info": "Włącza Real-Time Protection. Trwałe.",
    },
    "defender_defs": {
        "desc": "Aktualność definicji wirusów Windows Defender (<7 dni).",
        "why":  "Stare definicje = brak ochrony przed nowymi zagrożeniami.",
        "fix_info": "Pobiera najnowsze sygnatury. Zajmuje 1-2 min.",
    },
    "updates": {
        "desc": "Ostatnia aktualizacja systemu (<30 dni).",
        "why":  "Nieaktualny system = znane luki bezpieczeństwa.",
        "fix_info": "Wymaga ręcznej instalacji Windows Update (zbyt długie dla 1-klik).",
    },
    "smb1": {
        "desc": "SMBv1 — przestarzały protokół udostępniania plików.",
        "why":  "Słynne podatności WannaCry / EternalBlue używają SMBv1.",
        "fix_info": "Wyłącza funkcję systemową. Wymaga restartu komputera.",
    },
    "guest": {
        "desc": "Konto Guest (gość) w Windows — dostęp bez hasła.",
        "why":  "Aktywne konto Guest umożliwia nieautoryzowany dostęp lokalny.",
        "fix_info": "Wyłącza konto. Identyfikowane po SID (-501) niezależnie od nazwy.",
    },
    "rdp_nla": {
        "desc": "Network Level Authentication dla Pulpitu Zdalnego.",
        "why":  "Bez NLA atakujący może łączyć się RDP przed uwierzytelnieniem.",
        "fix_info": "Włącza NLA w rejestrze. Trwałe, działa od razu.",
    },
    "bitlocker": {
        "desc": "Szyfrowanie dysku systemowego (BitLocker).",
        "why":  "Bez szyfrowania: kradzież dysku = wyciek wszystkich danych.",
        "fix_info": "Wymaga ręcznej konfiguracji (wybór TPM/hasło, backup klucza).",
    },
    "password_policy": {
        "desc": "Minimalna długość hasła lokalnego (min. 8 znaków).",
        "why":  "Krótkie hasła łatwe do złamania brute-force.",
        "fix_info": "Ustawia lokalnie. UWAGA: GPO domenowe może nadpisać — sprawdź zasady domeny.",
    },
    "lockout_policy": {
        "desc": "Blokada konta po kilku nieudanych próbach (1-10).",
        "why":  "Bez blokady: bez ograniczeń na brute-force haseł.",
        "fix_info": "Ustawia próg 5 prób. GPO domenowe może nadpisać.",
    },
    "admin_count": {
        "desc": "Liczba kont w grupie Administratorzy (maks. 3).",
        "why":  "Za wielu adminów = większa powierzchnia ataku.",
        "fix_info": "Brak auto-fix — wymaga ręcznej weryfikacji kto ma być adminem.",
    },
    "autorun": {
        "desc": "Autouruchamianie z nośników USB/CD.",
        "why":  "Autorun był wektorem ataków przez pendrive'y (Stuxnet).",
        "fix_info": "Wyłącza NoDriveTypeAutoRun w rejestrze. Trwałe.",
    },
    "ps_policy": {
        "desc": "Polityka wykonywania skryptów PowerShell.",
        "why":  "Unrestricted = atakujący może uruchomić dowolny skrypt.",
        "fix_info": "Ustawia RemoteSigned. GPO może nadpisać ExecutionPolicy.",
    },
    "open_shares": {
        "desc": "Udostępnione foldery sieciowe (poza standardowymi $).",
        "why":  "Otwarte udziały mogą ujawniać wrażliwe dane.",
        "fix_info": "Brak auto-fix — zależy od polityki firmy (czy mają być).",
    },
    "event_errors": {
        "desc": "Błędy krytyczne w dzienniku zdarzeń (ostatnie 24h).",
        "why":  "Duża liczba błędów = niestabilny system.",
        "fix_info": "Brak auto-fix — wymaga analizy konkretnych zdarzeń.",
    },
    "cert_expiry": {
        "desc": "Certyfikaty SSL/TLS wygasające w ciągu 30 dni.",
        "why":  "Wygasły certyfikat = ostrzeżenia dla użytkowników, utracone połączenia HTTPS.",
        "fix_info": "Brak auto-fix — certyfikat musi zostać odnowiony w CA.",
    },
    "pending_updates": {
        "desc": "Oczekujące aktualizacje Windows.",
        "why":  "Brak aktualizacji = otwarte znane luki.",
        "fix_info": "Użyj przycisku 'Aktualizuj Windows' w panelu — fix zbyt długi dla 1-klik.",
    },
    "uptime": {
        "desc": "Czas pracy komputera bez restartu (<30 dni).",
        "why":  "Długi uptime = aktualizacje wymagające restartu nie zostały zastosowane.",
        "fix_info": "Zaplanuj restart w oknie serwisowym.",
    },
    "backup_status": {
        "desc": "Konfiguracja Backup InfraDesk Business.",
        "why":  "Bez backupu: ransomware = utrata danych.",
        "fix_info": "Skonfiguruj w sekcji Kopie zapasowe asystenta — wymaga wyboru lokalizacji i harmonogramu.",
    },
    "remote_desktop": {
        "desc": "Stan Remote Desktop (informacyjny).",
        "why":  "Nie fail-level — tylko info czy RDP włączony.",
        "fix_info": "Nie wymaga naprawy — zależy od polityki firmy.",
    },
}


SECURITY_FIX_WHITELIST: dict[str, str | None] = {
    "firewall":        "Set-NetFirewallProfile -All -Enabled True",
    "defender":        "Set-MpPreference -DisableRealtimeMonitoring $false",
    "defender_defs":   "Update-MpSignature",
    "smb1":            "Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart",
    "guest":           "Get-LocalUser | Where-Object { $_.SID -like '*-501' } | Disable-LocalUser",
    "rdp_nla":         "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name UserAuthentication -Value 1",
    "autorun":         "New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name NoDriveTypeAutoRun -Value 255 -PropertyType DWord -Force",
    "ps_policy":       "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force",
    "cert_expiry":     None,
    "password_policy": "net accounts /minpwlen:8",
    "lockout_policy":  "net accounts /lockoutthreshold:5",
}


_AUDIT_CACHE_FILE = os.path.join(INSTALL_DIR, "last_audit.json")


def _save_audit_cache(audit: dict) -> None:
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
    except Exception:
        pass
    return None


def run_security_fix(check_id: str) -> dict:
    """Wykonuje predefiniowaną komendę naprawczą dla checka bezpieczeństwa."""
    cmd = SECURITY_FIX_WHITELIST.get(check_id)
    if not cmd:
        return {"ok": False, "error": f"Brak zdefiniowanego fixu dla '{check_id}'"}
    try:
        r = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW,
        )
        stdout = (r.stdout or "").strip()
        stderr = (r.stderr or "").strip()
        combined = (stdout + "\n" + stderr).lower()

        gpo_phrases = [
            "zastąpione zasadą",
            "overridden by a policy",
            "zdefiniowane przez zasadę",
            "defined by a group policy",
            "determined by policy",
        ]
        is_gpo_override = any(p in combined for p in gpo_phrases)

        ok = r.returncode == 0
        out = (stdout or stderr)[-400:]
        log.info("security_fix %s → rc=%d gpo=%s", check_id, r.returncode, is_gpo_override)

        if (ok or is_gpo_override) and os.path.exists(_AUDIT_CACHE_FILE):
            try:
                os.remove(_AUDIT_CACHE_FILE)
            except Exception:
                pass

        if is_gpo_override:
            return {
                "ok": True, "partial": True, "rc": r.returncode,
                "output": out, "checkId": check_id, "cmd": cmd,
                "warning": "Ustawiono lokalnie, ale GPO domenowe wymusza inną wartość. Aby trwale zmienić — edytuj zasady na kontrolerze domeny (gpedit/Active Directory).",
            }
        return {"ok": ok, "rc": r.returncode, "output": out, "checkId": check_id, "cmd": cmd}
    except Exception as e:
        log.error("security_fix %s error: %s", check_id, e)
        return {"ok": False, "error": str(e), "checkId": check_id}


def security_audit() -> dict:
    """Run 20 security checks; return score 0-100 + per-check detail."""
    WEIGHTS = {"critical": 15, "high": 10, "medium": 5, "low": 2, "info": 0}
    checks = []
    total_weight = 0

    def _ck(cid, name, sev, cmd, pass_fn, detail_fn=None):
        nonlocal total_weight
        total_weight += WEIGHTS.get(sev, 0)
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command", cmd],
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW,
            )
            o = (r.stdout or "").strip()
            ok = pass_fn(o)
            detail = detail_fn(o) if detail_fn else (o[:150] if o else "")
            info = SECURITY_CHECK_INFO.get(cid, {})
            checks.append({
                "id": cid, "name": name,
                "status": "pass" if ok else "fail",
                "severity": sev, "detail": detail,
                "fixable": not ok and cid in SECURITY_FIX_WHITELIST
                           and SECURITY_FIX_WHITELIST[cid] is not None,
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
        lambda o: "False" not in o,
        lambda o: "Wlaczony" if "False" not in o else "Profil wylaczony!")
    _ck("defender", "Windows Defender", "critical",
        "(Get-MpComputerStatus).RealTimeProtectionEnabled",
        lambda o: o == "True",
        lambda o: "Aktywny" if o == "True" else "Wylaczony!")
    _ck("defender_defs", "Definicje antywirusa", "critical",
        "((Get-Date) - (Get-MpComputerStatus).AntivirusSignatureLastUpdated).Days",
        lambda o: o.isdigit() and int(o) < 7,
        lambda o: f"{o} dni temu" if o.isdigit() else "Brak danych")
    _ck("updates", "Aktualizacje Windows (<30d)", "critical",
        "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')",
        lambda o: len(o) >= 10 and (datetime.now() - datetime.strptime(o[:10], '%Y-%m-%d')).days < 30,
        lambda o: f"Ostatnia: {o[:10]}" if len(o) >= 10 else "Brak danych")
    _ck("smb1", "SMBv1 wylaczony", "critical",
        "(Get-SmbServerConfiguration).EnableSMB1Protocol",
        lambda o: o == "False",
        lambda o: "Wylaczony" if o == "False" else "WLACZONY!")
    _ck("guest", "Konto Guest wylaczone", "critical",
        "$g=Get-LocalUser | Where-Object { $_.SID -like '*-501' }; if($g){$g.Enabled}else{'NOTFOUND'}",
        lambda o: o == "False" or o == "NOTFOUND",
        lambda o: "Brak konta Guest" if o == "NOTFOUND" else ("Wylaczone" if o == "False" else "AKTYWNE!"))
    _ck("rdp_nla", "RDP NLA", "high",
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -EA SilentlyContinue).UserAuthentication",
        lambda o: o == "1",
        lambda o: "NLA wlaczone" if o == "1" else "NLA wylaczone")
    _ck("bitlocker", "Szyfrowanie dyskow", "high",
        "Get-BitLockerVolume -EA SilentlyContinue | Select-Object -ExpandProperty ProtectionStatus",
        lambda o: "1" in o or "On" in o,
        lambda o: "Zaszyfrowane" if "1" in o or "On" in o else "Brak BitLocker")
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
        lambda o: o.isdigit() and int(o) <= 3,
        lambda o: f"{o} kont" if o.isdigit() else "Brak danych")
    _ck("autorun", "Autorun wylaczony", "medium",
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name NoDriveTypeAutoRun -EA SilentlyContinue).NoDriveTypeAutoRun",
        lambda o: o != "" and o != "0",
        lambda o: "Wylaczony" if o and o != "0" else "Wlaczony")
    _ck("ps_policy", "PowerShell policy", "medium",
        "Get-ExecutionPolicy",
        lambda o: o in ("Restricted", "AllSigned", "RemoteSigned"),
        lambda o: o)
    _ck("open_shares", "Udzialy sieciowe (max 3)", "medium",
        "(Get-SmbShare | Where-Object { $_.Name -notmatch '\\$$' }).Count",
        lambda o: o.isdigit() and int(o) <= 3,
        lambda o: f"{o} udzialow" if o.isdigit() else "0")
    _ck("event_errors", "Bledy Event Log (24h)", "medium",
        "(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -EA SilentlyContinue).Count",
        lambda o: not o.isdigit() or int(o) < 10,
        lambda o: f"{o} zdarzen" if o.isdigit() else "0")
    _ck("cert_expiry", "Certyfikaty (30 dni)", "medium",
        "(Get-ChildItem Cert:\\LocalMachine\\My -EA SilentlyContinue | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(30) }).Count",
        lambda o: o in ("", "0"),
        lambda o: f"{o} wygasa" if o and o != "0" else "OK")
    _ck("pending_updates", "Oczekujace aktualizacje", "medium",
        "if (Get-Command Get-WindowsUpdate -EA SilentlyContinue) { (Get-WindowsUpdate).Count } else { '0' }",
        lambda o: o in ("0", ""),
        lambda o: f"{o} czeka" if o.isdigit() and o != "0" else "OK")

    # Uptime
    try:
        days = int((time.time() - psutil.boot_time()) / 86400)
        total_weight += WEIGHTS["low"]
        _info = SECURITY_CHECK_INFO.get("uptime", {})
        checks.append({
            "id": "uptime", "name": "Uptime (<30 dni)", "severity": "low",
            "status": "pass" if days < 30 else "fail", "detail": f"{days} dni",
            "fixable": False,
            "description": _info.get("desc", ""),
            "why": _info.get("why", ""),
            "fixInfo": _info.get("fix_info", ""),
        })
    except Exception:
        pass

    # Backup config
    has_bk = load_config().get("backupMode", False)
    total_weight += WEIGHTS["high"]
    _info = SECURITY_CHECK_INFO.get("backup_status", {})
    checks.append({
        "id": "backup_status", "name": "Backup InfraDesk", "severity": "high",
        "status": "pass" if has_bk else "fail",
        "detail": "Aktywny" if has_bk else "Brak konfiguracji",
        "fixable": False,
        "description": _info.get("desc", ""),
        "why": _info.get("why", ""),
        "fixInfo": _info.get("fix_info", ""),
    })

    _ck("remote_desktop", "Remote Desktop", "info",
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -EA SilentlyContinue).fDenyTSConnections",
        lambda o: True,
        lambda o: "Wylaczony" if o == "1" else "Wlaczony")

    fail_w = sum(WEIGHTS.get(c["severity"], 0) for c in checks if c["status"] == "fail")
    score = max(0, min(100, round(100 - (fail_w / max(total_weight, 1)) * 100)))
    return {"score": score, "checks": checks, "timestamp": datetime.now().isoformat()[:19]}


# ── System score (1-10) ─────────────────────────────────────────────────────

def get_system_score() -> float:
    score = 5.0
    try:
        cores = psutil.cpu_count(logical=False) or 2
        if cores >= 8:
            score += 1.5
        elif cores >= 4:
            score += 0.8

        ram_gb = psutil.virtual_memory().total / (1024**3)
        if ram_gb >= 32:
            score += 1.5
        elif ram_gb >= 16:
            score += 1.0
        elif ram_gb >= 8:
            score += 0.3
        elif ram_gb < 4:
            score -= 1.0

        try:
            disk = psutil.disk_usage("C:\\")
            free_pct = 100 - disk.percent
            if free_pct > 30:
                score += 0.5
            elif free_pct < 10:
                score -= 1.0
        except Exception:
            pass

        try:
            r = subprocess.run(
                ["powershell", "-Command",
                 "(Get-PhysicalDisk | Select-Object MediaType).MediaType"],
                capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW)
            if "SSD" in r.stdout:
                score += 1.0
        except Exception:
            pass

        cpu = psutil.cpu_percent(interval=1)
        if cpu > 80:
            score -= 0.5
    except Exception:
        pass
    return max(1.0, min(10.0, round(score, 1)))


# ── Full diagnosis (20+ checks; the "InfraDesk Home" port) ──────────────────

def full_diagnosis() -> dict:
    checks = []
    score = 100

    def add(cat, name, status, detail, severity='info', fix_cmd=None):
        nonlocal score
        pen = {'critical': 15, 'high': 8, 'medium': 4, 'low': 1, 'info': 0}.get(severity, 0)
        if status == 'fail':
            score = max(0, score - pen)
        checks.append({"cat": cat, "name": name, "status": status, "detail": detail,
                       "severity": severity, "fixCmd": fix_cmd})

    try:
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\")
        cpu_pct = psutil.cpu_percent(interval=1)
        uptime_d = int((time.time() - psutil.boot_time()) / 86400)

        # Performance
        add('wydajnosc', 'Użycie CPU', 'pass' if cpu_pct < 80 else 'fail',
            f'{cpu_pct}% wykorzystania procesora', 'high' if cpu_pct > 80 else 'low')
        add('wydajnosc', 'Pamięć RAM', 'pass' if mem.percent < 85 else 'fail',
            f'{mem.percent}% zajęte ({round(mem.used/(1024**3),1)}/{round(mem.total/(1024**3),1)} GB)',
            'high' if mem.percent > 85 else 'medium' if mem.percent > 70 else 'info')
        add('wydajnosc', 'Dysk C:', 'pass' if disk.percent < 85 else 'fail',
            f'{disk.percent}% zajęte, wolne {round(disk.free/(1024**3),1)} GB',
            'critical' if disk.percent > 90 else 'high' if disk.percent > 85 else 'info',
            'cleanmgr /d C' if disk.percent > 80 else None)
        add('wydajnosc', 'Czas pracy systemu', 'pass' if uptime_d < 14 else 'warn',
            f'{uptime_d} dni od restartu',
            'medium' if uptime_d > 30 else 'low' if uptime_d > 14 else 'info',
            'shutdown /r /t 300' if uptime_d > 14 else None)

        top = sorted(psutil.process_iter(['name', 'memory_percent']),
                     key=lambda p: p.info.get('memory_percent', 0) or 0, reverse=True)[:5]
        top_str = ', '.join(
            f"{p.info['name']} ({p.info['memory_percent']:.0f}%)"
            for p in top if p.info.get('memory_percent'))
        add('wydajnosc', 'Procesy RAM', 'info', f'Top: {top_str}', 'info')

        # Temp files
        temp_mb = 0
        for d in [os.environ.get("TEMP", ""), os.path.join(os.environ.get("WINDIR", ""), "Temp")]:
            if d and os.path.exists(d):
                for dp, _, fns in os.walk(d):
                    for fn in fns:
                        try:
                            temp_mb += os.path.getsize(os.path.join(dp, fn))
                        except Exception:
                            pass
        temp_mb /= (1024 * 1024)
        add('czyszczenie', 'Pliki tymczasowe', 'fail' if temp_mb > 200 else 'pass',
            f'{temp_mb:.0f} MB plików tymczasowych',
            'medium' if temp_mb > 500 else 'low' if temp_mb > 200 else 'info',
            "Remove-Item $env:TEMP\\* -Recurse -Force -EA SilentlyContinue" if temp_mb > 200 else None)

        # Defender
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "(Get-MpComputerStatus).RealTimeProtectionEnabled"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            defender_on = r.stdout.strip() == 'True'
            add('bezpieczenstwo', 'Windows Defender', 'pass' if defender_on else 'fail',
                'Ochrona w czasie rzeczywistym aktywna' if defender_on else 'Ochrona wyłączona!',
                'critical' if not defender_on else 'info',
                'Set-MpPreference -DisableRealtimeMonitoring $false' if not defender_on else None)
        except Exception:
            add('bezpieczenstwo', 'Windows Defender', 'warn', 'Nie udało się sprawdzić', 'low')

        # Firewall
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-NetFirewallProfile | Where-Object {$_.Enabled -eq $false} | Select-Object -ExpandProperty Name"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            disabled_fw = [p.strip() for p in r.stdout.strip().split("\n") if p.strip()]
            if disabled_fw:
                add('bezpieczenstwo', 'Firewall', 'fail',
                    f'Wyłączone profile: {", ".join(disabled_fw)}',
                    'critical', 'Set-NetFirewallProfile -All -Enabled True')
            else:
                add('bezpieczenstwo', 'Firewall', 'pass', 'Wszystkie profile aktywne', 'info')
        except Exception:
            add('bezpieczenstwo', 'Firewall', 'warn', 'Nie udało się sprawdzić', 'low')

        # Services
        try:
            svcs = ["wuauserv", "WinDefend", "Spooler", "Dnscache", "BITS", "EventLog"]
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-Service -Name " + ",".join(svcs) +
                 " -EA SilentlyContinue | Where-Object {$_.Status -ne 'Running'} | Select-Object -ExpandProperty DisplayName"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            stopped = [s.strip() for s in r.stdout.strip().split("\n") if s.strip()]
            if stopped:
                add('uslugi', 'Usługi systemowe', 'fail',
                    f'Zatrzymane: {", ".join(stopped)}', 'high',
                    "; ".join(f"Start-Service '{s}' -EA SilentlyContinue" for s in svcs))
            else:
                add('uslugi', 'Usługi systemowe', 'pass', 'Wszystkie kluczowe usługi działają', 'info')
        except Exception:
            pass

        # Network
        try:
            r = subprocess.run(
                ["ping", "-n", "2", "-w", "2000", "8.8.8.8"],
                capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW)
            net_ok = r.returncode == 0
            add('siec', 'Połączenie internetowe', 'pass' if net_ok else 'fail',
                'Połączenie aktywne' if net_ok else 'Brak połączenia z internetem',
                'high' if not net_ok else 'info')
        except Exception:
            add('siec', 'Połączenie internetowe', 'warn', 'Nie udało się sprawdzić', 'low')

        try:
            r = subprocess.run(["nslookup", "google.com"],
                               capture_output=True, text=True, timeout=8, creationflags=NO_WINDOW)
            dns_ok = r.returncode == 0 and 'Address' in r.stdout
            add('siec', 'DNS', 'pass' if dns_ok else 'fail',
                'Rozwiązywanie nazw działa' if dns_ok else 'Problem z DNS',
                'medium' if not dns_ok else 'info',
                'ipconfig /flushdns' if not dns_ok else None)
        except Exception:
            pass

        # System events 24h
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-1)} -MaxEvents 30 -EA SilentlyContinue).Count"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=15, creationflags=NO_WINDOW)
            err_count = int(r.stdout.strip()) if r.stdout.strip().isdigit() else 0
            add('system', 'Błędy systemowe (24h)', 'pass' if err_count < 5 else 'fail',
                f'{err_count} błędów/krytycznych zdarzeń',
                'high' if err_count > 10 else 'medium' if err_count > 5 else 'info')
        except Exception:
            pass

        # Last update
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            last_update = r.stdout.strip()
            if last_update:
                days_ago = (datetime.now() - datetime.strptime(last_update, '%Y-%m-%d')).days
                add('aktualizacje', 'Ostatnia aktualizacja', 'pass' if days_ago < 30 else 'fail',
                    f'{last_update} ({days_ago} dni temu)',
                    'high' if days_ago > 60 else 'medium' if days_ago > 30 else 'info')
        except Exception:
            pass

        # Physical disks
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-PhysicalDisk | Select-Object FriendlyName, HealthStatus, OperationalStatus | ConvertTo-Json"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            disks = json.loads(r.stdout) if r.stdout.strip() else []
            if not isinstance(disks, list):
                disks = [disks]
            for d in disks:
                healthy = d.get('HealthStatus', '') == 'Healthy'
                add('dyski', f"Dysk: {d.get('FriendlyName','?')}",
                    'pass' if healthy else 'fail',
                    f"Stan: {d.get('HealthStatus','?')}, Status: {d.get('OperationalStatus','?')}",
                    'critical' if not healthy else 'info')
        except Exception:
            pass

        # CPU temperature
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-WmiObject -Namespace 'root/wmi' -Class MSAcpi_ThermalZoneTemperature -EA SilentlyContinue | ForEach-Object { [math]::Round(($_.CurrentTemperature - 2732) / 10, 0) }"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=8, creationflags=NO_WINDOW)
            temps = [int(x) for x in (r.stdout or '').split()
                     if x.strip().lstrip('-').isdigit()]
            if temps:
                tmax = max(temps)
                sev = 'critical' if tmax > 90 else 'high' if tmax > 80 else 'medium' if tmax > 70 else 'info'
                add('wydajnosc', 'Temperatura CPU', 'fail' if tmax > 80 else 'pass',
                    f'{tmax}°C (najwyższa strefa termiczna)', sev)
        except Exception:
            pass

        # TPM
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "$t=Get-Tpm -EA SilentlyContinue; if($t){ \"$($t.TpmPresent);$($t.TpmReady);$($t.ManufacturerVersion)\" }"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            out = (r.stdout or '').strip()
            if out and ';' in out:
                present, ready, ver = (out.split(';') + ['', '', ''])[:3]
                tpm_ok = present.strip().lower() == 'true' and ready.strip().lower() == 'true'
                add('bezpieczenstwo', 'TPM (Trusted Platform Module)',
                    'pass' if tpm_ok else 'fail',
                    f'Obecny: {present}, Gotowy: {ready}, Firmware: {ver or "?"}',
                    'high' if not tpm_ok else 'info')
        except Exception:
            pass

        # Secure Boot
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Confirm-SecureBootUEFI -EA SilentlyContinue"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=8, creationflags=NO_WINDOW)
            sb = (r.stdout or '').strip().lower() == 'true'
            add('bezpieczenstwo', 'Secure Boot UEFI', 'pass' if sb else 'fail',
                'Włączony' if sb else 'Wyłączony lub BIOS legacy',
                'high' if not sb else 'info', None)
        except Exception:
            pass

        # Time sync
        try:
            r = subprocess.run(["w32tm", "/query", "/status"],
                               capture_output=True, text=True, encoding='utf-8', errors='ignore',
                               timeout=8, creationflags=NO_WINDOW)
            out = r.stdout or ''
            synced = 'unspecified' not in out.lower() and 'not been synchronized' not in out.lower()
            src_match = re.search(r'Source:\s*(.+)', out) or re.search(r'Źródło:\s*(.+)', out)
            src = src_match.group(1).strip() if src_match else '?'
            add('siec', 'Synchronizacja czasu (NTP)', 'pass' if synced else 'fail',
                f'Źródło: {src[:80]}' if synced else 'Zegar niezsynchronizowany',
                'medium' if not synced else 'info',
                'w32tm /resync /force' if not synced else None)
        except Exception:
            pass

        # Battery wear
        try:
            bat = psutil.sensors_battery()
            if bat is not None:
                r = subprocess.run(
                    ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                     "$b=Get-WmiObject -Namespace 'root/wmi' -Class BatteryStaticData -EA SilentlyContinue; $f=Get-WmiObject -Namespace 'root/wmi' -Class BatteryFullChargedCapacity -EA SilentlyContinue; if($b -and $f){ \"$($b.DesignedCapacity);$($f.FullChargedCapacity)\" }"],
                    capture_output=True, text=True, encoding='utf-8', errors='ignore',
                    timeout=10, creationflags=NO_WINDOW)
                out = (r.stdout or '').strip()
                wear_pct = None
                if out and ';' in out:
                    try:
                        des, full = out.split(';', 1)
                        des, full = int(des.strip()), int(full.strip())
                        if des > 0:
                            wear_pct = round(100 * (des - full) / des, 1)
                    except Exception:
                        pass
                if wear_pct is not None:
                    sev = 'high' if wear_pct > 40 else 'medium' if wear_pct > 25 else 'info'
                    add('wydajnosc', 'Zużycie baterii', 'fail' if wear_pct > 25 else 'pass',
                        f'Pojemność: {100-wear_pct:.0f}% nominalnej ({wear_pct:.0f}% zużycia)', sev)
                else:
                    add('wydajnosc', 'Bateria', 'pass',
                        f'Poziom: {bat.percent:.0f}%, zasilanie: {"sieć" if bat.power_plugged else "bateria"}',
                        'info')
        except Exception:
            pass

        # Scheduled tasks
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.State -eq 'Ready' -and $_.TaskPath -notmatch '^\\\\Microsoft\\\\' -and $_.TaskPath -notmatch '^\\\\MicrosoftEdge' } | Measure-Object | Select-Object -ExpandProperty Count"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=20, creationflags=NO_WINDOW)
            cnt = int(r.stdout.strip()) if (r.stdout or '').strip().isdigit() else 0
            add('bezpieczenstwo', 'Nietypowe zaplanowane zadania',
                'pass' if cnt < 10 else 'fail',
                f'{cnt} tasków poza katalogiem Microsoft/',
                'medium' if cnt >= 20 else 'low' if cnt >= 10 else 'info')
        except Exception:
            pass

        # USB blocked
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                r"SYSTEM\CurrentControlSet\Services\USBSTOR") as k:
                start_val = int(winreg.QueryValueEx(k, "Start")[0])
            blocked = start_val == 4
            add('bezpieczenstwo', 'Blokada nośników USB',
                'pass' if blocked else 'info',
                'Zablokowane (polityka korporacyjna)' if blocked else 'Odblokowane (domyślnie)',
                'info')
        except Exception:
            pass

        # Audit policy (logon)
        try:
            r = subprocess.run(
                ["auditpol", "/get", "/subcategory:Logon"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=8, creationflags=NO_WINDOW)
            out = r.stdout or ''
            audited = 'success' in out.lower() or 'sukces' in out.lower() or 'powodzenie' in out.lower()
            add('bezpieczenstwo', 'Audyt logowań (4624/4625)',
                'pass' if audited else 'fail',
                'Zdarzenia logowania są audytowane' if audited else 'Brak audytu logowań!',
                'high' if not audited else 'info',
                'auditpol /set /subcategory:"Logon" /success:enable /failure:enable' if not audited else None)
        except Exception:
            pass

        # Old local password hashes
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-LocalUser -EA SilentlyContinue | Where-Object { $_.Enabled -and $_.PasswordLastSet -and $_.PasswordLastSet -lt (Get-Date).AddDays(-90) } | Select-Object -ExpandProperty Name"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=10, creationflags=NO_WINDOW)
            old = [x.strip() for x in (r.stdout or '').split("\n") if x.strip()]
            if old:
                add('bezpieczenstwo', 'Stare hasła lokalne (>90 dni)', 'fail',
                    f'Konta: {", ".join(old[:5])}{"..." if len(old) > 5 else ""}', 'medium')
            else:
                add('bezpieczenstwo', 'Stare hasła lokalne (>90 dni)', 'pass',
                    'Wszystkie hasła aktualne', 'info')
        except Exception:
            pass

        # Pagefile
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue | Measure-Object AllocatedBaseSize -Sum).Sum"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=8, creationflags=NO_WINDOW)
            pf_mb = int(r.stdout.strip()) if (r.stdout or '').strip().isdigit() else 0
            add('system', 'Plik stronicowania',
                'pass' if pf_mb > 0 else 'fail',
                f'{pf_mb} MB' if pf_mb > 0 else 'Brak pliku stronicowania',
                'medium' if pf_mb == 0 else 'info')
        except Exception:
            pass

        # Disk speed test
        try:
            tmp = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'infradesk_diskspeed.bin')
            size_mb = 50
            if not os.path.exists(tmp) or os.path.getsize(tmp) < size_mb * 1024 * 1024:
                with open(tmp, 'wb') as f:
                    f.write(os.urandom(size_mb * 1024 * 1024))
            t0 = time.perf_counter()
            with open(tmp, 'rb') as f:
                while f.read(1024 * 1024):
                    pass
            elapsed = max(time.perf_counter() - t0, 0.001)
            mb_s = round(size_mb / elapsed, 0)
            sev = 'high' if mb_s < 100 else 'medium' if mb_s < 300 else 'info'
            add('dyski', 'Szybkość dysku systemowego (read)',
                'fail' if mb_s < 100 else 'pass',
                f'{mb_s} MB/s (test sekwencyjny 50 MB)', sev)
        except Exception:
            pass

        # BIOS
        try:
            r = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command",
                 "$b=Get-CimInstance Win32_BIOS -EA SilentlyContinue; if($b){ \"$($b.Manufacturer);$($b.SMBIOSBIOSVersion);$($b.ReleaseDate)\" }"],
                capture_output=True, text=True, encoding='utf-8', errors='ignore',
                timeout=8, creationflags=NO_WINDOW)
            out = (r.stdout or '').strip()
            if out and ';' in out:
                parts = out.split(';')
                mfr = parts[0] if len(parts) > 0 else '?'
                ver = parts[1] if len(parts) > 1 else '?'
                rdate = parts[2] if len(parts) > 2 else ''
                age_years = None
                if rdate and len(rdate) >= 8 and rdate[:8].isdigit():
                    try:
                        rd = datetime.strptime(rdate[:8], '%Y%m%d')
                        age_years = (datetime.now() - rd).days / 365.25
                    except Exception:
                        pass
                detail = f'{mfr} · {ver}' + (f' · {age_years:.1f} lat' if age_years else '')
                status = 'warn' if age_years and age_years > 5 else 'pass'
                sev = 'medium' if age_years and age_years > 7 else 'low' if age_years and age_years > 5 else 'info'
                add('system', 'BIOS / UEFI', status, detail, sev)
        except Exception:
            pass

    except Exception as e:
        log.error("full_diagnosis error: %s", e)

    return {
        "checks":    checks,
        "score":     max(0, score),
        "total":     len(checks),
        "passed":    len([c for c in checks if c['status'] == 'pass']),
        "failed":    len([c for c in checks if c['status'] == 'fail']),
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M'),
    }


# ── AutoDiagnostics ─────────────────────────────────────────────────────────

class AutoDiagnostics:
    """Cyclic problem detector that auto-creates tickets on regressions."""

    DISK_LOW_THRESHOLD = 10
    CHECK_INTERVAL = 300

    def __init__(self, token: str):
        self.token = token
        self._alerted: set = set()

    def run_checks(self) -> None:
        self._check_disk_space()
        self._check_windows_updates()
        self._check_services()
        self._check_event_log()

    def _check_event_log(self) -> None:
        try:
            events = collect_new_events(max_events=50)
            for ev in events:
                cls = _classify_event(ev.get("source", ""), ev.get("eventId"))
                if not cls:
                    continue
                prio, short = cls
                key = f"evt_{ev.get('source','')}_{ev.get('eventId','')}"
                if key in self._alerted:
                    continue
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

    def _check_disk_space(self) -> None:
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
                                desc=(f"Dysk {p.device} ma tylko {free_gb} GB wolnego "
                                      f"z {total_gb} GB ({free_pct:.0f}% wolnego).\n\n"
                                      f"Wymagane dzialanie: zwolnienie miejsca lub rozszerzenie dysku."),
                                priority="HIGH",
                            )
                    elif free_pct > self.DISK_LOW_THRESHOLD + 5:
                        self._alerted.discard(f"disk_low_{p.device}")
                except Exception:
                    pass
        except Exception as e:
            log.debug("Disk check error: %s", e)

    def _check_windows_updates(self) -> None:
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
                capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW,
            )
            count = int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0
            if count > 5:
                self._alerted.add(alert_key)
                self._create_ticket(
                    title=f"Oczekujace aktualizacje Windows ({count})",
                    desc=(f"Komputer ma {count} oczekujacych aktualizacji Windows.\n\n"
                          f"Zalecamy zaplanowanie aktualizacji w najblizszym oknie serwisowym."),
                    priority="MEDIUM",
                )
        except Exception as e:
            log.debug("Windows update check error: %s", e)

    def _check_services(self) -> None:
        critical_services = ["Spooler", "BITS", "wuauserv", "Dhcp", "Dnscache"]
        try:
            import win32serviceutil  # type: ignore
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
                                    desc=(f"Krytyczna usluga Windows '{svc}' jest zatrzymana.\n"
                                          f"Proba automatycznego restartu nie powiodla sie."),
                                    priority="HIGH",
                                )
                except Exception:
                    pass
        except ImportError:
            pass
        except Exception as e:
            log.debug("Service check error: %s", e)

    def _create_ticket(self, title: str, desc: str, priority: str = "MEDIUM") -> None:
        try:
            hostname = os.environ.get("COMPUTERNAME", "Unknown")
            full_desc = f"[Auto-diagnostyka — {hostname}]\n\n{desc}"
            do_ticket(self.token, title, full_desc, priority, None)
            log.info("Auto-ticket created: %s", title)
        except Exception as e:
            log.error("Auto-ticket failed: %s", e)


# ── SelfHealer ──────────────────────────────────────────────────────────────

class SelfHealer:
    """Safe auto-fixes with per-action 1h cooldown."""

    COOLDOWN_SEC = 3600
    CHECK_INTERVAL = 900
    DISK_CRITICAL_PCT = 5
    AUTO_RESTART_SERVICES = ["Spooler", "BITS", "wuauserv", "Dnscache"]

    def __init__(self, token: str):
        self.token = token
        self._last_action: dict[str, float] = {}
        self._actions_log: list[dict] = []

    def _cooled_down(self, key: str) -> bool:
        t = self._last_action.get(key, 0)
        return (time.time() - t) >= self.COOLDOWN_SEC

    def _mark(self, key: str, summary: str) -> None:
        self._last_action[key] = time.time()
        entry = {"action": key, "summary": summary, "at": datetime.now().isoformat()[:19]}
        self._actions_log.append(entry)
        self._actions_log = self._actions_log[-50:]
        log.info("Self-heal: %s — %s", key, summary)

    def run(self) -> list[dict]:
        performed: list[dict] = []
        try:
            performed += self._heal_disk_space()
            performed += self._heal_stuck_services()
            performed += self._heal_dns_cache()
            performed += self._heal_windows_update()
        except Exception as e:
            log.error("SelfHealer.run error: %s", e)
        return performed

    def _heal_disk_space(self) -> list[dict]:
        key = "clean_temp"
        try:
            u = psutil.disk_usage("C:\\")
            free_pct = 100 - u.percent
            if free_pct >= self.DISK_CRITICAL_PCT:
                return []
            if not self._cooled_down(key):
                return []

            import shutil as _sh

            freed_mb = 0
            for tmp in [os.environ.get("TEMP", ""), os.environ.get("TMP", ""),
                        r"C:\Windows\Temp",
                        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp")]:
                if not tmp or not os.path.isdir(tmp):
                    continue
                for entry in os.listdir(tmp):
                    fp = os.path.join(tmp, entry)
                    try:
                        if os.path.isfile(fp):
                            sz = os.path.getsize(fp)
                            os.remove(fp)
                            freed_mb += sz / (1024**2)
                        elif os.path.isdir(fp):
                            sz = sum(os.path.getsize(os.path.join(dp, f))
                                     for dp, _, fs in os.walk(fp) for f in fs
                                     if os.path.isfile(os.path.join(dp, f)))
                            _sh.rmtree(fp, ignore_errors=True)
                            freed_mb += sz / (1024**2)
                    except Exception:
                        pass

            try:
                subprocess.run(["powershell", "-NoProfile", "-Command",
                                "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                               capture_output=True, timeout=30, creationflags=NO_WINDOW)
            except Exception:
                pass

            summary = f"Zwolniono ~{freed_mb:.0f} MB (TEMP + kosz), wolne było {free_pct:.1f}%"
            self._mark(key, summary)
            return [{"action": key, "summary": summary}]
        except Exception as e:
            log.debug("Self-heal disk error: %s", e)
            return []

    def _heal_stuck_services(self) -> list[dict]:
        performed: list[dict] = []
        try:
            import win32serviceutil  # type: ignore
            for svc in self.AUTO_RESTART_SERVICES:
                try:
                    status = win32serviceutil.QueryServiceStatus(svc)[1]
                    if status != 1:
                        continue
                    key = f"restart_{svc}"
                    if not self._cooled_down(key):
                        continue
                    try:
                        win32serviceutil.StartService(svc)
                        summary = f"Usługa {svc} była zatrzymana — uruchomiono"
                        self._mark(key, summary)
                        performed.append({"action": key, "summary": summary})
                    except Exception as e:
                        log.debug("Self-heal start %s failed: %s", svc, e)
                except Exception:
                    pass
        except ImportError:
            pass
        except Exception as e:
            log.debug("Self-heal services error: %s", e)
        return performed

    def _heal_dns_cache(self) -> list[dict]:
        key = "flush_dns"
        if not self._cooled_down(key):
            return []
        try:
            socket.gethostbyname("infradesk.pl")
            return []
        except Exception:
            pass
        try:
            subprocess.run(["ipconfig", "/flushdns"],
                           capture_output=True, timeout=10, creationflags=NO_WINDOW)
            summary = "Wyczyszczono cache DNS (ipconfig /flushdns) po błędzie rozwiązywania"
            self._mark(key, summary)
            return [{"action": key, "summary": summary}]
        except Exception as e:
            log.debug("Self-heal DNS error: %s", e)
            return []

    def _heal_windows_update(self) -> list[dict]:
        key = "reset_wu"
        if not self._cooled_down(key):
            return []
        try:
            import win32serviceutil  # type: ignore
            try:
                st = win32serviceutil.QueryServiceStatus("wuauserv")[1]
            except Exception:
                return []
            if st not in (2, 3):
                return []
            try:
                subprocess.run(["net", "stop", "wuauserv", "/y"],
                               capture_output=True, timeout=60, creationflags=NO_WINDOW)
                subprocess.run(["net", "stop", "bits", "/y"],
                               capture_output=True, timeout=60, creationflags=NO_WINDOW)
                time.sleep(2)
                subprocess.run(["net", "start", "bits"],
                               capture_output=True, timeout=60, creationflags=NO_WINDOW)
                subprocess.run(["net", "start", "wuauserv"],
                               capture_output=True, timeout=60, creationflags=NO_WINDOW)
                summary = "Zresetowano Windows Update (wuauserv + bits zawieszone)"
                self._mark(key, summary)
                return [{"action": key, "summary": summary}]
            except Exception as e:
                log.debug("Self-heal WU reset failed: %s", e)
        except ImportError:
            pass
        except Exception as e:
            log.debug("Self-heal WU error: %s", e)
        return []
