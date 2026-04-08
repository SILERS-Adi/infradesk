# InfraDesk Business Agent — Specyfikacja Przebudowy v3.0

## Producent
**SILERS — Błaszczykowski Adrian**

## Nowa nazwa
**InfraDesk Business** (dawniej: Asystent Business)

---

## CEL PRZEBUDOWY

Trzy osobne pliki Python (agent.py 6622 linii, agent_server.py 3814 linii, asystent_business.py 2946 linii) zawierają ~80% zduplikowanego kodu. Przebudowa ma:

1. Skonsolidować wspólny kod do modułów (DRY)
2. Zachować WSZYSTKIE istniejące funkcje i wygląd
3. Zmienić branding: "Asystent Business" → "InfraDesk Business", producent: "SILERS — Błaszczykowski Adrian"
4. Naprawić znalezione problemy bezpieczeństwa
5. Utrzymać 3 warianty kompilacji (Home, Business, Server) z jednego codebase

---

## ARCHITEKTURA DOCELOWA

```
agent/
├── core/
│   ├── __init__.py
│   ├── config.py          # load_config, save_config, DPAPI encrypt/decrypt, constants
│   ├── ws.py              # WS class (WebSocket z exponential backoff)
│   ├── api.py             # api_post, api_get, do_login, do_register, do_metrics, etc.
│   ├── metrics.py         # machine_info, metrics, full_inventory, server_metrics, security_audit, network_scan
│   ├── backup.py          # BackupScheduler class (cron, SQL dump, folder, encrypt, upload)
│   ├── diagnostics.py     # AutoDiagnostics class
│   ├── update.py          # check_for_update, do_self_update, verify_signature
│   ├── install.py         # install_and_restart, _set_autostart, create_shortcut, service mgmt, uninstall
│   ├── remote.py          # Remote command handlers (scan_databases, test_db, etc.)
│   ├── system.py          # _wmic, _rustdesk_id, _anydesk_id, _teamviewer_id, _cpu_temp, _software
│   └── utils.py           # _send_wol, is_frozen, is_installed, _kill_others
├── ui/
│   ├── __init__.py
│   ├── theme.py           # Color constants, tkinter styles
│   ├── widgets.py         # Toggle, lbl, entry, btn, btn_secondary, sep, section_lbl, _scrollable
│   ├── login.py           # show_login, show_waiting, password_strength
│   ├── ticket.py          # open_ticket_window
│   ├── dialogs.py         # open_about_window, open_faq_window, open_contact_window
│   └── tray.py            # System tray icon setup
├── variants/
│   ├── home.py            # App class — Asystent Home (tkinter + webview)
│   ├── business.py        # BusinessAPI class — InfraDesk Business (webview)
│   └── server.py          # Headless server agent (no UI)
├── main.py                # Entry point: parse CLI args, detect variant, launch
├── requirements.txt
├── InfraDesk Business.spec
├── InfraDesk Home.spec
└── InfraDesk Server.spec
```

---

## BRANDING — CO ZMIENIĆ

### Stałe (core/config.py)

```python
# Business variant
APP_NAME        = "InfraDesk Business"
APP_VERSION     = "3.0.0"
PUBLISHER       = "SILERS — Błaszczykowski Adrian"
INSTALL_DIR     = os.path.join(os.environ.get("APPDATA", "."), "SILERS", "InfraDesk Business")
INSTALL_EXE     = os.path.join(INSTALL_DIR, "InfraDesk Business.exe")
CONFIG_FILE     = os.path.join(INSTALL_DIR, "config.json")
TENANT_FILE     = os.path.join(INSTALL_DIR, "tenant.json")
SERVICE_NAME    = "InfraDeskBusiness"
SERVICE_DISPLAY = "InfraDesk Business Agent"

# Home variant
APP_NAME_HOME    = "InfraDesk Home"
INSTALL_DIR_HOME = os.path.join(os.environ.get("APPDATA", "."), "SILERS", "InfraDesk Home")

# Server variant
APP_NAME_SERVER    = "InfraDesk Server Agent"
INSTALL_DIR_SERVER = os.path.join(os.environ.get("APPDATA", "."), "InfraDesk Server")

# Shared
API_BASE     = "https://infradesk.pl/api"
PORTAL_URL   = "https://infradesk.pl/portal"
WS_BASE      = "wss://infradesk.pl/api/agent/ws"
VERSION_URL  = "https://infradesk.pl/downloads/version.json"
```

### Rejestr Windows (core/install.py)

```python
# Add/Remove Programs
reg_key = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\InfraDeskBusiness"
values = {
    "DisplayName": "InfraDesk Business",
    "Publisher": "SILERS — Błaszczykowski Adrian",
    "DisplayVersion": APP_VERSION,
    "UninstallString": f'"{INSTALL_EXE}" --uninstall',
}
```

### Autostart

```python
# HKCU\Software\Microsoft\Windows\CurrentVersion\Run
key_name = "InfraDesk Business"
value = f'"{INSTALL_EXE}"'
```

### Tray icon

```python
# Menu
menu = pystray.Menu(
    pystray.MenuItem("InfraDesk Business v3.0.0", None, enabled=False),
    pystray.MenuItem("SILERS — Błaszczykowski Adrian", None, enabled=False),
    pystray.Menu.SEPARATOR,
    pystray.MenuItem("Otwórz panel", open_portal),
    pystray.MenuItem("Zgłoś problem", open_ticket),
    pystray.Menu.SEPARATOR,
    pystray.MenuItem("Zamknij", exit_app),
)
```

### PyInstaller spec

```python
# InfraDesk Business.spec
a = Analysis(['main.py'], ...)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas,
    name='InfraDesk Business',
    icon='ui/icon.ico',
    console=False,
    version_info={
        'CompanyName': 'SILERS — Błaszczykowski Adrian',
        'ProductName': 'InfraDesk Business',
        'FileVersion': '3.0.0',
    },
)
```

---

## ZACHOWANE FUNKCJE — PEŁNA LISTA

### 1. Rejestracja i logowanie
- Login: email + hasło → POST /agent/login → token + status
- Rejestracja: formularz (email, imię, firma, hasło, opcje) → POST /agent/register
- Token szyfrowany DPAPI (fallback plaintext)
- Stan PENDING → polling /agent/status do ACTIVE
- Tenant key z config/tenant.json/CLI

### 2. WebSocket (real-time)
- Połączenie: wss://infradesk.pl/api/agent/ws z Bearer token
- Exponential backoff reconnect (5s → 300s)
- Obsługiwane typy wiadomości:
  - `notification` / `status_update` → powiadomienie tray
  - `update` → auto-update
  - `backup_run` → uruchom backup natychmiast
  - `wake` → Wake-on-LAN
  - `windows_update` → instalacja Windows updates
  - `restart_service` → restart usługi Windows
  - `system_reboot` → restart systemu z opóźnieniem
  - `remote_command` → delegacja do remote handlers

### 3. Metryki
- Co 60s: CPU%, RAM%, dysk%, sieć, bateria, connectivity, RustDesk ID
- Co 5 min: server_metrics (S.M.A.R.T., RAID, SSL certs, top procesy, event log)
- Co 30 min: network_scan (urządzenia w sieci, porty)
- Co 60 min: security_audit (firewall, defender, updates, UAC)
- Startup: full_inventory (pełne info hardware)

### 4. Backup
- Sync konfiguracji z API co 5 min
- Cron parser (5 pól: min hour dom month dow)
- Typy: SQL_MYSQL, SQL_POSTGRES, SQL_MSSQL, FOLDER
- Hasła SQL przez zmienne środowiskowe (nie CLI args)
- Szyfrowanie backup: Fernet
- Upload: Google Drive, InfraDesk Cloud, lokalny/sieciowy path
- Retencja: automatyczne usuwanie starych backupów
- Raportowanie: /agent/backup/start → /agent/backup/complete|failed

### 5. Auto-diagnostyka
- Sprawdzanie co 5 min: dysk <5%, Windows updates, krytyczne usługi
- Automatyczne tworzenie ticketów przy problemach

### 6. Auto-update
- Sprawdzanie: startup + co 2h (home) / 6h (server)
- Pobranie → weryfikacja SHA256 → opcjonalnie weryfikacja podpisu → install → restart
- URL: https://infradesk.pl/downloads/version.json

### 7. Remote commands (via WebSocket)
- scan_databases — skanowanie portów DB
- test_db_connection — test połączenia MySQL/PostgreSQL/MSSQL
- scan_system — info o systemie
- get_services — lista usług Windows
- get_processes — lista procesów (top CPU/RAM)
- get_installed_software — zainstalowane oprogramowanie
- get_event_log — dziennik zdarzeń Windows
- get_network_info — interfejsy sieciowe, gateway, DNS
- get_scheduled_tasks — zaplanowane zadania
- restart_print_spooler — restart usługi drukarki

### 8. Instalacja / Serwis
- `--install` → kopiowanie do APPDATA, autostart, skrót na pulpicie, rejestr Add/Remove
- `--uninstall` → usuwanie serwisu, plików, rejestru
- `--install-service` → Windows Service (AUTO_START)
- `--remove-service` → usuwanie serwisu
- `--service` → tryb headless (ServerServiceLoop)
- `--ticket` → otwórz okno zgłoszenia

### 9. UI
- **Tkinter** (Home/Server): login, rejestracja, waiting, ticket, FAQ, kontakt, about
- **Pywebview** (Business): HTML/CSS/JS webview z BusinessAPI bridge
- **Tray icon**: pystray z menu (otwórz panel, zgłoś problem, zamknij)
- **Dark theme**: BG=#080D19, SURF=#0C1220, PRI=#6D28D9, TXT=#F3F4F6

### 10. Detekcja remote access
- RustDesk: ID z config/registry/pliku .toml
- AnyDesk: ID z rejestru
- TeamViewer: ID z rejestru
- Automatyczna instalacja RustDesk (download + install MSI)

---

## PROBLEMY DO NAPRAWIENIA PRZY PRZEBUDOWIE

### Bezpieczeństwo
1. **DPAPI fallback** — gotowe (plaintext zamiast crash)
2. **Subprocess**: zawsze używać list args, NIGDY `shell=True`
3. **Hasła DB**: zawsze przez env vars, nie CLI args (MYSQL_PWD, PGPASSWORD, SQLCMDPASSWORD)
4. **Token storage**: DPAPI z fallback, nie plaintext domyślnie
5. **SSL**: dodać certificate pinning na WebSocket
6. **Walidacja komend**: whitelist w agencie musi matchować backend ALLOWED_COMMANDS
7. **Log sanitization**: nie logować haseł, tokenów, danych klientów

### Architektura
1. **DRY**: 80% kodu jest zduplikowane między 3 plikami — wydzielić do modułów
2. **Retry logic**: ujednolicić (exponential backoff wszędzie)
3. **Error handling**: ujednolicić pattern (log + continue, nie crash)
4. **Config migration**: obsłużyć migrację ze starej nazwy "Asystent Business" → "InfraDesk Business"

### Wydajność
1. **Metryki**: CPU interval=0.5 blokuje wątek — przenieść do osobnego wątku
2. **Software scan**: wolny (rejestr) — cache na 30 min
3. **Network scan**: może trwać minuty — timeout + async

---

## MIGRACJA ZE STAREJ WERSJI

Przy pierwszym uruchomieniu nowej wersji:

```python
def _migrate_old_config():
    """Migrate from old Asystent Business to InfraDesk Business."""
    old_dirs = [
        os.path.join(os.environ.get("APPDATA", ""), "SILERS", "Asystent Business"),
        os.path.join(os.environ.get("APPDATA", ""), "InfraDesk"),
    ]
    for old_dir in old_dirs:
        old_cfg = os.path.join(old_dir, "config.json")
        if os.path.exists(old_cfg) and not os.path.exists(CONFIG_FILE):
            os.makedirs(INSTALL_DIR, exist_ok=True)
            shutil.copy2(old_cfg, CONFIG_FILE)
            # Migrate tenant.json too
            old_tenant = os.path.join(old_dir, "tenant.json")
            if os.path.exists(old_tenant):
                shutil.copy2(old_tenant, TENANT_FILE)
            log.info("Migrated config from %s", old_dir)
            break
```

---

## KOLORYSTYKA UI (zachować identyczną)

```python
BG      = "#080D19"    # Tło główne
SURF    = "#0C1220"    # Surface
SURF2   = "#131B2E"    # Secondary surface
PRI     = "#6D28D9"    # Primary (fiolet)
PRI_H   = "#5B21B6"    # Primary hover
SEC     = "#2563EB"    # Secondary (niebieski)
TXT     = "#F3F4F6"    # Tekst
TXT_DIM = "#71717A"    # Tekst wygaszony
OK_C    = "#10b981"    # Success (zielony)
ERR_C   = "#ef4444"    # Error (czerwony)
WARN_C  = "#f59e0b"    # Warning (bursztyn)
BORDER  = "#1E293B"    # Ramki
FONT    = "Segoe UI"   # Font systemowy
```

---

## ZALEŻNOŚCI (requirements.txt)

```
psutil>=5.9.0
requests>=2.31.0
websocket-client>=1.7.0
pystray>=0.19.5
Pillow>=10.0.0
pywebview>=4.0
pyautogui>=0.9.54
pygetwindow>=0.0.9
cryptography>=41.0
```

---

## PYINSTALLER BUILD

```bash
# Business
pyinstaller --onefile --noconsole --name "InfraDesk Business" --icon ui/icon.ico main.py

# Home
pyinstaller --onefile --noconsole --name "InfraDesk Home" --icon ui/icon.ico main.py --add-data "ui;ui"

# Server
pyinstaller --onefile --noconsole --name "InfraDesk Server Agent" --icon ui/icon.ico main.py
```

---

## CHECKLISTA PO PRZEBUDOWIE

- [ ] Login działa (email + hasło → token)
- [ ] Rejestracja działa (formularz → PENDING → ACTIVE)
- [ ] WebSocket łączy się i reconnectuje
- [ ] Metryki wysyłane co 60s
- [ ] Backup SQL (MySQL/PostgreSQL/MSSQL) działa
- [ ] Backup folder (tar.gz) działa
- [ ] Upload Google Drive działa
- [ ] Upload InfraDesk Cloud działa
- [ ] Remote commands odpowiadają (scan_databases, test_db, etc.)
- [ ] Auto-update sprawdza i instaluje
- [ ] Tray icon z menu działa
- [ ] Autostart po restarcie Windows
- [ ] Install/Uninstall przez CLI
- [ ] Windows Service install/remove
- [ ] DPAPI token encryption (lub fallback plaintext)
- [ ] Nazwa: "InfraDesk Business" wszędzie (tray, rejestr, About, logi)
- [ ] Producent: "SILERS — Błaszczykowski Adrian" w rejestrze i About
- [ ] Migracja config ze starego "Asystent Business" działa
- [ ] PyInstaller build tworzy działający .exe
