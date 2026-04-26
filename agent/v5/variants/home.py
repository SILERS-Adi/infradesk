"""
variants/home.py — InfraDesk Home variant (deferred to Phase 5.1).

In Phase 1 this is a stub that raises NotImplementedError. The Home
variant uses tkinter + webview via agent.py in 4.14.6; porting it will
reuse ui/login.py, ui/widgets.py, ui/dialogs.py, ui/ticket.py and the
same core/* modules.
"""
from __future__ import annotations


def run() -> None:
    raise NotImplementedError(
        "InfraDesk Home variant is deferred to Phase 5.1. "
        "Phase 1 ships only InfraDesk Business."
    )
