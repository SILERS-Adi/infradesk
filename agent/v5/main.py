"""
main.py — InfraDesk Business 5.0 entry point.

Phase 1 only builds the Business variant; Home (5.1) and Server (5.1)
are placeholders. The CLI flags (--service, --install-service,
--remove-service, --uninstall, --tenant-key=) are handled inside the
chosen variant.
"""
from __future__ import annotations

import os
import sys


# Sentry DSN dla agenta — DSN to publiczny klucz (jak frontend), bezpieczny
# do bundlowania w EXE. ENV override pozwala dev-em wyłączyć (`SENTRY_DSN_AGENT=`)
# albo wskazać własny projekt testowy. Sentry events pomagają znaleźć cichych
# crashy u klientów — bez tego nie wiemy że coś się sypie.
_SENTRY_DSN_DEFAULT = "https://5744e66abf6753182e1de952f12a1127@o4511364994105344.ingest.de.sentry.io/4511366982664272"


def _init_sentry() -> None:
    """Init Sentry SDK. Default DSN bundled, override przez ENV `SENTRY_DSN_AGENT`
    (pusty string = wyłącz na konkretnej maszynie, np. dev test bez Sentry)."""
    dsn = os.environ.get("SENTRY_DSN_AGENT", _SENTRY_DSN_DEFAULT)
    if not dsn:
        return
    try:
        import sentry_sdk  # type: ignore
        from .core.config import APP_VERSION
        sentry_sdk.init(
            dsn=dsn,
            release=f"agent-v5@{APP_VERSION}",
            environment=os.environ.get("SENTRY_ENV", "production"),
            traces_sample_rate=0.05,
            send_default_pii=False,
            before_send=_filter_sentry_event,
        )
    except ImportError:
        return
    except Exception:
        return


def _filter_sentry_event(event, hint):
    # Pomijamy znane czasowe błędy WS które same się rozwiązują.
    if event.get("logger") == "websocket":
        return None
    return event


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
    _init_sentry()
    # Hold mutex for process lifetime — gc'ing it would release on second start.
    _mutex_handle = _acquire_single_instance_mutex()
    # Phase 1: only business variant is shipped.
    # Future detection: --home / --server CLI flags or separate exe names.
    from v5.variants import business

    business.run()


if __name__ == "__main__":
    main()
