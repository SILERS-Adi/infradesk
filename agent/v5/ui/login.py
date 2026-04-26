"""
ui/login.py — tkinter login/register/waiting windows (used by Home variant
in 5.1; stub here for Business phase 1 since Business uses webview auth).

Canonical port from agent.py v4.14.6 with rebranding.
"""
from __future__ import annotations

import threading
import tkinter as tk
from typing import Callable

import requests

from ..core import APP_NAME, PORTAL_URL
from ..core.api import api_get, do_login, do_register
from .theme import BG, BORDER, ERR_C, OK_C, PRI, PRI_H, TXT, TXT_DIM
from .widgets import (
    Toggle, btn, btn_secondary, entry, get_val, lbl, password_strength, sep,
)


def _clear(root: tk.Misc) -> None:
    for w in root.winfo_children():
        w.destroy()


def show_login(root: tk.Tk, on_login: Callable, on_register: Callable,
               on_back_to_home: Callable | None = None) -> None:
    """Top-level mode-picker (login vs register). Delegates to panels below."""
    _clear(root)
    root.title(APP_NAME)

    W, H = 520, 480
    root.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    x, y = max(0, (sw - W) // 2), max(0, (sh - H) // 2)
    root.geometry(f"{W}x{H}+{x}+{y}")
    root.resizable(False, False)

    f = tk.Frame(root, bg=BG, padx=40, pady=30)
    f.pack(fill="both", expand=True)

    lbl(f, APP_NAME, size=18, bold=True).pack()
    lbl(f, "Zarządzanie infrastrukturą IT", size=10, color=TXT_DIM).pack(pady=(2, 20))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=(0, 20))
    lbl(f, "Wybierz opcję", size=12, color=TXT_DIM).pack(pady=(0, 16))

    btn(f, "  Zaloguj się  ",
        lambda: _show_login_panel(root, on_login, on_register)).pack(fill="x", pady=(0, 8))
    btn_secondary(f, "  Zarejestruj nowego asystenta  ",
                  lambda: _show_register_panel(root, on_login, on_register)).pack(fill="x")


def _show_login_panel(root: tk.Tk, on_login: Callable, on_register: Callable) -> None:
    _clear(root)
    root.title(APP_NAME)
    f = tk.Frame(root, bg=BG, padx=40, pady=30)
    f.pack(fill="both", expand=True)

    lbl(f, "Zaloguj się", size=16, bold=True).pack(anchor="w")
    lbl(f, "Podaj e-mail i hasło asystenta", size=9, color=TXT_DIM).pack(anchor="w", pady=(0, 16))

    lbl(f, "E-mail", size=9, color=TXT_DIM).pack(anchor="w", pady=(8, 4))
    e_mail = entry(f, placeholder="adres@firma.pl")
    e_mail.pack(fill="x")

    lbl(f, "Hasło", size=9, color=TXT_DIM).pack(anchor="w", pady=(12, 4))
    e_pwd = entry(f, show="*", width=30)
    e_pwd.pack(fill="x")

    err = tk.StringVar()
    tk.Label(f, textvariable=err, bg=BG, fg=ERR_C).pack(anchor="w", pady=(4, 0))

    def _go():
        threading.Thread(
            target=_login_thread,
            args=(root, get_val(e_mail), get_val(e_pwd), on_login, err),
            daemon=True,
        ).start()

    btn(f, "  Zaloguj  ", _go).pack(fill="x", pady=(16, 6))
    btn_secondary(f, "Wróć", lambda: show_login(root, on_login, on_register)).pack(fill="x")


def _show_register_panel(root: tk.Tk, on_login: Callable, on_register: Callable) -> None:
    _clear(root)
    root.title(APP_NAME)
    f = tk.Frame(root, bg=BG, padx=40, pady=24)
    f.pack(fill="both", expand=True)

    lbl(f, "Zarejestruj asystenta", size=16, bold=True).pack(anchor="w")
    lbl(f, "Dane zostaną wysłane do panelu IT", size=9, color=TXT_DIM).pack(anchor="w", pady=(0, 10))

    lbl(f, "E-mail", size=9, color=TXT_DIM).pack(anchor="w", pady=(6, 2))
    e_mail = entry(f, placeholder="adres@firma.pl")
    e_mail.pack(fill="x")

    lbl(f, "Imię i nazwisko", size=9, color=TXT_DIM).pack(anchor="w", pady=(8, 2))
    e_name = entry(f)
    e_name.pack(fill="x")

    lbl(f, "Firma", size=9, color=TXT_DIM).pack(anchor="w", pady=(8, 2))
    e_company = entry(f)
    e_company.pack(fill="x")

    lbl(f, "Hasło", size=9, color=TXT_DIM).pack(anchor="w", pady=(8, 2))
    e_pwd = entry(f, show="*")
    e_pwd.pack(fill="x")

    strength = tk.StringVar(value="—")
    tk.Label(f, textvariable=strength, bg=BG, fg=TXT_DIM).pack(anchor="w", pady=(2, 4))

    def _pwd_check(_e=None):
        _, label, color = password_strength(get_val(e_pwd))
        strength.set(f"Siła hasła: {label}")
        f.winfo_children()[-1].config(fg=color)

    e_pwd.bind("<KeyRelease>", _pwd_check)

    err = tk.StringVar()
    tk.Label(f, textvariable=err, bg=BG, fg=ERR_C).pack(anchor="w", pady=(4, 0))

    def _go():
        form = {
            "email":    get_val(e_mail),
            "password": get_val(e_pwd),
            "name":     get_val(e_name),
            "company":  get_val(e_company),
        }
        threading.Thread(target=_register_thread, args=(root, form, on_register, err), daemon=True).start()

    btn(f, "  Zarejestruj  ", _go).pack(fill="x", pady=(16, 6))
    btn_secondary(f, "Wróć", lambda: show_login(root, on_login, on_register)).pack(fill="x")


def _login_thread(root: tk.Tk, mail: str, pwd: str, on_login: Callable, err_v: tk.StringVar) -> None:
    try:
        r = do_login(mail, pwd)
        root.after(0, lambda: on_login(r))
    except requests.HTTPError as e:
        msg = ("Nieprawidlowy e-mail lub haslo."
               if e.response.status_code in (400, 401)
               else f"Blad serwera: {e.response.status_code}")
        root.after(0, lambda: err_v.set(msg))
    except requests.exceptions.ConnectionError:
        root.after(0, lambda: err_v.set("Brak polaczenia z serwerem"))
    except Exception as e:
        root.after(0, lambda: err_v.set(f"Blad: {e}"))


def _register_thread(root: tk.Tk, form: dict, on_submit: Callable, err_v: tk.StringVar) -> None:
    try:
        r = do_register(form)
        root.after(0, lambda: on_submit(r))
    except requests.HTTPError as e:
        try:
            body = e.response.json()
            msg = body.get("error") or body.get("message") or str(e)
        except Exception:
            msg = f"HTTP {e.response.status_code}"
        root.after(0, lambda: err_v.set(f"Blad: {msg}"))
    except requests.exceptions.ConnectionError:
        root.after(0, lambda: err_v.set("Brak polaczenia z serwerem"))
    except Exception as e:
        root.after(0, lambda: err_v.set(f"Blad: {e}"))


def show_waiting(root: tk.Tk, token: str, on_activated: Callable,
                 on_cancel: Callable) -> None:
    """Waiting screen: polls /agent/status until status == ACTIVE."""
    _clear(root)
    root.title(APP_NAME)
    f = tk.Frame(root, bg=BG, padx=40, pady=30)
    f.pack(fill="both", expand=True)

    lbl(f, "Oczekiwanie na aktywację", size=16, bold=True).pack(anchor="w")
    lbl(f, "Admin musi zatwierdzić ten asystent w panelu.",
        size=10, color=TXT_DIM).pack(anchor="w", pady=(4, 14))
    sep(f)

    status = tk.StringVar(value="PENDING — sprawdzam co 10s...")
    tk.Label(f, textvariable=status, bg=BG, fg=TXT).pack(anchor="w", pady=(6, 14))

    stop = [False]

    def _poll():
        while not stop[0]:
            try:
                resp = api_get("/agent/status", token)
                s = resp.get("status") if isinstance(resp, dict) else resp
                if s == "ACTIVE":
                    root.after(0, lambda: on_activated())
                    return
            except Exception:
                pass
            import time
            time.sleep(10)

    threading.Thread(target=_poll, daemon=True).start()

    btn_secondary(f, "Anuluj", lambda: (stop.__setitem__(0, True), on_cancel())).pack(fill="x")
