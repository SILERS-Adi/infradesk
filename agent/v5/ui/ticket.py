"""
ui/ticket.py — tkinter "Report a problem" / "Request remote help" dialogs.

These open from the tray menu when the user clicks "Zgłoś problem" or
"Poproś o pomoc zdalną". Business variant uses these; the full-featured
multi-step ticket form lives in business.html (webview).
"""
from __future__ import annotations

import os
import socket
import threading
import tkinter as tk
from tkinter import messagebox
from typing import Callable

import psutil
import requests

from ..core import API_BASE, APP_NAME, APP_VERSION, log, res
from ..core.system import _rustdesk_exe, _rustdesk_id, _rustdesk_set_one_time_password


def _submit_ticket(token: str, title: str, description: str,
                   priority: str = "MEDIUM") -> tuple[bool, str]:
    """POST /agent/ticket with context about this machine. Returns (ok, id_or_err)."""
    try:
        try:
            host = socket.gethostname()
        except Exception:
            host = "?"
        user = os.environ.get("USERNAME") or os.environ.get("USER") or "?"
        try:
            cpu = psutil.cpu_percent(interval=0.2)
            ram = psutil.virtual_memory().percent
            disk_free = psutil.disk_usage("C:\\").free / (1024**3)
            ctx = f"CPU {cpu:.0f}% · RAM {ram:.0f}% · Dysk C: {disk_free:.1f} GB wolne"
        except Exception:
            ctx = ""

        full_desc = (description or "").strip()
        full_desc += f"\n\n— Zgłoszone z {APP_NAME} —"
        full_desc += f"\nKomputer: {host}"
        full_desc += f"\nUżytkownik: {user}"
        full_desc += f"\nWersja: {APP_VERSION}"
        if ctx:
            full_desc += f"\nStan systemu: {ctx}"

        payload = {"title": title[:200], "description": full_desc, "priority": priority}
        h = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        r = requests.post(f"{API_BASE}/agent/ticket", json=payload, headers=h, timeout=20)
        if r.status_code >= 400:
            log.error("Ticket failed: %s %s", r.status_code, r.text[:300])
            return False, f"Kod {r.status_code}: {r.text[:200]}"
        data = r.json()
        return True, data.get("ticketNumber") or data.get("id") or "OK"
    except Exception as e:
        log.error("Ticket exception: %s", e)
        return False, str(e)


def open_ticket_window(root: tk.Misc | None, token: str,
                       on_done: Callable | None = None) -> None:
    """Open the "Zgłoś problem" dialog. `root` may be None → independent Tk."""
    fg = "#E5E7EB"
    bg = "#0F1628"
    fld = "#1A2238"
    accent = "#6D28D9"

    win = tk.Toplevel(root) if root is not None else tk.Tk()
    win.title("Zgłoś problem do IT")
    win.geometry("520x460")
    win.configure(bg=bg)
    try:
        icon_path = res("ikona.png")
        if os.path.exists(icon_path):
            win.iconphoto(True, tk.PhotoImage(file=icon_path))
    except Exception:
        pass

    tk.Label(win, text="Zgłoś problem do IT",
             font=("Segoe UI", 14, "bold"), fg=fg, bg=bg
             ).pack(padx=18, pady=(16, 2), anchor="w")
    tk.Label(win, text="Opisz problem — IT dostanie zgłoszenie z danymi komputera.",
             font=("Segoe UI", 9), fg="#9CA3AF", bg=bg
             ).pack(padx=18, anchor="w")

    tk.Label(win, text="Tytuł", font=("Segoe UI", 9, "bold"),
             fg=fg, bg=bg).pack(padx=18, pady=(14, 2), anchor="w")
    e_title = tk.Entry(win, font=("Segoe UI", 10), bg=fld, fg=fg,
                       insertbackground=fg, relief="flat", bd=6)
    e_title.pack(padx=18, fill="x")

    tk.Label(win, text="Opis problemu", font=("Segoe UI", 9, "bold"),
             fg=fg, bg=bg).pack(padx=18, pady=(12, 2), anchor="w")
    t_desc = tk.Text(win, height=8, font=("Segoe UI", 10), bg=fld, fg=fg,
                     insertbackground=fg, relief="flat", bd=6, wrap="word")
    t_desc.pack(padx=18, fill="both", expand=True)

    row = tk.Frame(win, bg=bg)
    row.pack(padx=18, pady=(10, 0), fill="x")
    tk.Label(row, text="Priorytet:", font=("Segoe UI", 9),
             fg=fg, bg=bg).pack(side="left")
    v_prio = tk.StringVar(value="MEDIUM")
    for val, lab in [("LOW", "Niski"), ("MEDIUM", "Średni"),
                     ("HIGH", "Wysoki"), ("CRITICAL", "Krytyczny")]:
        tk.Radiobutton(row, text=lab, variable=v_prio, value=val,
                       font=("Segoe UI", 9), fg=fg, bg=bg, selectcolor=fld,
                       activebackground=bg, activeforeground=fg
                       ).pack(side="left", padx=4)

    btns = tk.Frame(win, bg=bg)
    btns.pack(padx=18, pady=14, fill="x")
    tk.Button(btns, text="Anuluj", command=win.destroy,
              font=("Segoe UI", 10), bg=fld, fg=fg, activebackground=fld,
              relief="flat", padx=14, pady=6
              ).pack(side="right", padx=(8, 0))
    btn_send = tk.Button(btns, text="Wyślij do IT",
                         font=("Segoe UI", 10, "bold"), bg=accent, fg="#fff",
                         activebackground=accent, relief="flat", padx=14, pady=6)
    btn_send.pack(side="right")

    def _submit():
        title = e_title.get().strip()
        desc = t_desc.get("1.0", "end").strip()
        prio = v_prio.get()
        if len(title) < 3:
            messagebox.showwarning(APP_NAME, "Tytuł musi mieć min. 3 znaki.")
            return
        if len(desc) < 5:
            messagebox.showwarning(APP_NAME, "Opis musi mieć min. 5 znaków.")
            return
        btn_send.config(state="disabled", text="Wysyłam...")
        win.update_idletasks()
        ok, msg = _submit_ticket(token, title, desc, prio)
        if ok:
            messagebox.showinfo(APP_NAME, f"Zgłoszenie wysłane do IT.\nNumer: {msg}")
            win.destroy()
            if on_done:
                try:
                    on_done()
                except Exception:
                    pass
        else:
            btn_send.config(state="normal", text="Wyślij do IT")
            messagebox.showerror(APP_NAME, f"Nie udało się wysłać zgłoszenia.\n\n{msg}")

    btn_send.config(command=_submit)

    e_title.focus_set()
    win.lift()
    win.attributes("-topmost", True)
    win.after(300, lambda: win.attributes("-topmost", False))
    if root is None:
        win.mainloop()


def open_remote_help_dialog(token: str) -> None:
    """Show RustDesk ID + one-time password, and raise a HIGH-priority ticket."""
    rd_id = _rustdesk_id() or "— (RustDesk niezainstalowany)"
    rd_pass = _rustdesk_set_one_time_password(6) if _rustdesk_exe() else None

    fg = "#E5E7EB"
    bg = "#0F1628"
    fld = "#1A2238"
    accent = "#6D28D9"
    win = tk.Tk()
    win.title("Pomoc zdalna")
    win.geometry("440x400")
    win.configure(bg=bg)

    tk.Label(win, text="Pomoc zdalna", font=("Segoe UI", 14, "bold"),
             fg=fg, bg=bg).pack(padx=18, pady=(16, 2), anchor="w")
    tk.Label(win, text="Wyślij IT prośbę o natychmiastowe zdalne połączenie.",
             font=("Segoe UI", 9), fg="#9CA3AF", bg=bg
             ).pack(padx=18, anchor="w")

    tk.Label(win, text="Twój RustDesk ID:", font=("Segoe UI", 9, "bold"),
             fg=fg, bg=bg).pack(padx=18, pady=(18, 4), anchor="w")
    e = tk.Entry(win, font=("Consolas", 16, "bold"), bg=fld, fg="#A78BFA",
                 insertbackground=fg, relief="flat", bd=8, justify="center")
    e.insert(0, str(rd_id))
    e.config(state="readonly", readonlybackground=fld)
    e.pack(padx=18, fill="x")

    if rd_pass:
        tk.Label(win, text="Jednorazowe hasło:", font=("Segoe UI", 9, "bold"),
                 fg=fg, bg=bg).pack(padx=18, pady=(12, 4), anchor="w")
        ep = tk.Entry(win, font=("Consolas", 16, "bold"), bg=fld, fg="#F59E0B",
                      insertbackground=fg, relief="flat", bd=8, justify="center")
        ep.insert(0, str(rd_pass))
        ep.config(state="readonly", readonlybackground=fld)
        ep.pack(padx=18, fill="x")

    tk.Label(win, text="Po kliknięciu technik otrzyma zgłoszenie z ID i hasłem. "
                       "Stare hasło zostało unieważnione.",
             font=("Segoe UI", 8), fg="#6B7280", bg=bg,
             wraplength=400, justify="left"
             ).pack(padx=18, pady=(8, 0), anchor="w")

    btns = tk.Frame(win, bg=bg)
    btns.pack(padx=18, pady=16, fill="x")
    tk.Button(btns, text="Zamknij", command=win.destroy,
              font=("Segoe UI", 10), bg=fld, fg=fg, activebackground=fld,
              relief="flat", padx=14, pady=6
              ).pack(side="right", padx=(8, 0))

    btn = tk.Button(btns, text="Poproś o pomoc zdalną",
                    font=("Segoe UI", 10, "bold"), bg=accent, fg="#fff",
                    activebackground=accent, relief="flat", padx=14, pady=6)
    btn.pack(side="right")

    def _request():
        btn.config(state="disabled", text="Wysyłam...")
        win.update_idletasks()
        title = f"Prośba o pomoc zdalną · {socket.gethostname()}"
        desc = (f"Użytkownik poprosił o pomoc zdalną z poziomu {APP_NAME}.\n\n"
                f"RustDesk ID: {rd_id}\n"
                + (f"Jednorazowe hasło: {rd_pass}\n" if rd_pass else "")
                + "\nPołącz się jak najszybciej.")
        ok, msg = _submit_ticket(token, title, desc, "HIGH")
        if ok:
            info_msg = f"Prośba wysłana do IT.\nNumer: {msg}\n\nRustDesk ID: {rd_id}"
            if rd_pass:
                info_msg += f"\nHasło: {rd_pass}"
            messagebox.showinfo(APP_NAME, info_msg)
            win.destroy()
        else:
            btn.config(state="normal", text="Poproś o pomoc zdalną")
            messagebox.showerror(APP_NAME, f"Nie udało się wysłać prośby.\n\n{msg}")

    btn.config(command=lambda: threading.Thread(target=_request, daemon=True).start())

    win.lift()
    win.attributes("-topmost", True)
    win.after(300, lambda: win.attributes("-topmost", False))
    win.mainloop()
