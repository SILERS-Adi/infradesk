"""InfraDesk Business 5.0 — core package."""
from .config import (
    APP_NAME, APP_VERSION, PUBLISHER, __version__,
    INSTALL_DIR, INSTALL_EXE, CONFIG_FILE, TENANT_FILE,
    API_BASE, PORTAL_URL, WS_BASE, VERSION_URL, SILERS_MSI_URL,
    SERVICE_NAME, SERVICE_DISPLAY, SERVICE_DESC,
    log, res, load_config, save_config, load_tenant_key,
)

__all__ = [
    "APP_NAME", "APP_VERSION", "PUBLISHER", "__version__",
    "INSTALL_DIR", "INSTALL_EXE", "CONFIG_FILE", "TENANT_FILE",
    "API_BASE", "PORTAL_URL", "WS_BASE", "VERSION_URL", "SILERS_MSI_URL",
    "SERVICE_NAME", "SERVICE_DISPLAY", "SERVICE_DESC",
    "log", "res", "load_config", "save_config", "load_tenant_key",
]
