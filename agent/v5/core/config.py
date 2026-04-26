"""
core/config.py — branding constants, paths, DPAPI token encryption, config I/O.

InfraDesk Business 5.0.0 — SILERS, Błaszczykowski Adrian.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import sys

# ── Branding / versioning ────────────────────────────────────────────────────

__version__ = "5.0.4"

APP_NAME     = "InfraDesk Business"
APP_VERSION  = __version__
PUBLISHER    = "SILERS — Błaszczykowski Adrian"
SERVICE_NAME = "InfraDeskBusiness"
SERVICE_DISPLAY = "InfraDesk Business"
SERVICE_DESC = "InfraDesk Business — monitoring, backup, diagnostyka"

INSTALL_DIR = os.path.join(os.environ.get("APPDATA", ""), "SILERS", "InfraDesk Business")
INSTALL_EXE = os.path.join(INSTALL_DIR, "InfraDesk Business.exe")
CONFIG_FILE = os.path.join(INSTALL_DIR, "config.json")
TENANT_FILE = os.path.join(INSTALL_DIR, "tenant.json")

# ── Network endpoints ────────────────────────────────────────────────────────

API_BASE       = "https://infradesk.pl/api"
PORTAL_URL     = "https://infradesk.pl/portal"
WS_BASE        = "wss://infradesk.pl/api/agent/ws"
VERSION_URL    = "https://infradesk.pl/downloads/version.json"
SILERS_MSI_URL = "https://infradesk.pl/downloads/silers.msi"

# ── Legacy install dirs for migration ────────────────────────────────────────

_OLD_DIRS = [
    os.path.join(os.environ.get("APPDATA", ""), "SILERS", "Asystent Business"),
    os.path.join(os.environ.get("APPDATA", ""), "InfraDesk"),
]


def _migrate_old_config() -> None:
    """Migrate config from Asystent Business / InfraDesk to InfraDesk Business."""
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


# Run migration eagerly on import.
_migrate_old_config()
os.makedirs(INSTALL_DIR, exist_ok=True)

# ── Logging ──────────────────────────────────────────────────────────────────

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


# ── Resource resolver (bundled via PyInstaller _MEIPASS) ─────────────────────

def res(name: str) -> str:
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, name)
    here = os.path.dirname(os.path.abspath(__file__))
    for d in [here, os.path.join(here, ".."), os.path.join(here, "..", "..", "GRAFIKI")]:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return name


# ── DPAPI token encryption (with plaintext fallback) ─────────────────────────

def _dpapi_encrypt(plaintext: str) -> str:
    try:
        import base64
        import win32crypt  # type: ignore

        blob = win32crypt.CryptProtectData(
            plaintext.encode("utf-8"), "InfraDesk Token", None, None, None, 0
        )
        return "dpapi:" + base64.b64encode(blob).decode("ascii")
    except Exception as e:
        log.warning("DPAPI unavailable — token saved as plaintext: %s", e)
        return plaintext


def _dpapi_decrypt(encrypted: str) -> str:
    if not encrypted.startswith("dpapi:"):
        return encrypted
    try:
        import base64
        import win32crypt  # type: ignore

        blob = base64.b64decode(encrypted[6:])
        _, data = win32crypt.CryptUnprotectData(blob, None, None, None, 0)
        return data.decode("utf-8")
    except Exception as e:
        log.warning("DPAPI decrypt failed: %s", e)
        return encrypted


# ── Config I/O ───────────────────────────────────────────────────────────────

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


def save_config(data: dict) -> None:
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
        try:
            os.remove(tmp)
        except Exception:
            pass
    log.info("Config SAVED: %s (keys=%s)", CONFIG_FILE, list(to_save.keys()))


def load_tenant_key() -> str | None:
    """Load tenant key from config.json → tenant.json → CLI --tenant-key=..."""
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
