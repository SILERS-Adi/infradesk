"""
main.py — InfraDesk Business 5.0 entry point.

Phase 1 only builds the Business variant; Home (5.1) and Server (5.1)
are placeholders. The CLI flags (--service, --install-service,
--remove-service, --uninstall, --tenant-key=) are handled inside the
chosen variant.
"""
from __future__ import annotations

import sys


def main() -> None:
    # Phase 1: only business variant is shipped.
    # Future detection: --home / --server CLI flags or separate exe names.
    from v5.variants import business

    business.run()


if __name__ == "__main__":
    main()
