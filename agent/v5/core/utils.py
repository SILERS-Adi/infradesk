"""
core/utils.py — tiny shared helpers: is_frozen, is_installed,
_kill_others, Wake-on-LAN, subprocess CREATE_NO_WINDOW flag.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys

import psutil

from .config import INSTALL_EXE, log

NO_WINDOW = subprocess.CREATE_NO_WINDOW


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def is_installed() -> bool:
    """Return True when running from the canonical install location."""
    if not is_frozen():
        return True
    exe_path = os.path.abspath(sys.executable).lower()
    if exe_path == INSTALL_EXE.lower():
        return True
    prog_dirs = [
        os.environ.get("PROGRAMFILES", ""),
        os.environ.get("PROGRAMFILES(X86)", ""),
    ]
    for d in prog_dirs:
        if d and exe_path.startswith(d.lower()):
            return True
    return False


def kill_other_instances() -> None:
    """Kill other InfraDesk Business / Asystent Business processes."""
    cur = os.getpid()
    for p in psutil.process_iter(["pid", "name", "exe"]):
        try:
            if p.pid == cur:
                continue
            pname = (p.info.get("name") or "").lower()
            pexe = (p.info.get("exe") or "").lower()
            if ("infradesk business" in pname
                    or "asystent business" in pname
                    or INSTALL_EXE.lower() == pexe):
                p.terminate()
                p.wait(timeout=3)
        except Exception:
            pass


def send_wol(mac: str) -> None:
    """Send a Wake-on-LAN magic packet for given MAC (format: any)."""
    try:
        mac_clean = mac.replace(":", "").replace("-", "").upper()
        if len(mac_clean) != 12 or not all(c in "0123456789ABCDEF" for c in mac_clean):
            log.warning("WoL: nieprawidlowy MAC: %s", mac)
            return
        magic = bytes.fromhex("FF" * 6 + mac_clean * 16)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.sendto(magic, ("255.255.255.255", 9))
        log.info("WoL wyslany do %s", mac)
    except Exception as e:
        log.error("WoL blad: %s", e)


# Back-compat aliases (used internally in legacy code patterns).
_kill_others = kill_other_instances
_send_wol = send_wol
