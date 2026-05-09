"""
main.py — InfraDesk Business 5.0 entry point.

Phase 1 only builds the Business variant; Home (5.1) and Server (5.1)
are placeholders. The CLI flags (--service, --install-service,
--remove-service, --uninstall, --tenant-key=) are handled inside the
chosen variant.
"""
from __future__ import annotations

import sys


def _acquire_single_instance_mutex() -> object | None:
    """Refuse to start a second instance. Returns the mutex handle (must stay
    in scope for the lifetime of the process) or None on platforms without
    win32event (Linux dev)."""
    try:
        import win32event  # type: ignore
        import win32api  # type: ignore
        import winerror  # type: ignore
        mutex = win32event.CreateMutex(None, True, "Global\\InfraDeskBusiness_v5")
        if win32api.GetLastError() == winerror.ERROR_ALREADY_EXISTS:
            sys.stderr.write("InfraDesk Business is already running.\n")
            sys.exit(0)
        return mutex
    except ImportError:
        return None
    except Exception:
        return None


_mutex_handle: object | None = None


def main() -> None:
    global _mutex_handle
    # Hold mutex for process lifetime — gc'ing it would release on second start.
    _mutex_handle = _acquire_single_instance_mutex()
    # Phase 1: only business variant is shipped.
    # Future detection: --home / --server CLI flags or separate exe names.
    from v5.variants import business

    business.run()


if __name__ == "__main__":
    main()
