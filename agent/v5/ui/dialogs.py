"""
ui/dialogs.py — About / FAQ / Contact tkinter dialogs used by tray menu.
Canonical rebranded port from agent.py v4.14.6.
"""
from __future__ import annotations

import tkinter as tk
from tkinter import ttk

from ..core import APP_NAME, APP_VERSION, res
from ..core.api import api_get, fetch_contact
from .theme import BG, BORDER, FONT, PRI, SURF, SURF2, TXT, TXT_DIM
from .widgets import btn, lbl


def open_about_window(root: tk.Misc) -> None:
    win = tk.Toplevel(root)
    win.title("O programie")
    win.configure(bg=BG)
    win.geometry("400x400")
    win.resizable(False, False)
    win.grab_set()
    win.lift()

    f = tk.Frame(win, bg=BG, padx=32, pady=24)
    f.pack(fill="both", expand=True)

    try:
        from PIL import Image, ImageTk

        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((72, 72), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img.convert("RGB"))
        tk.Label(f, image=_img, bg=BG, bd=0).pack(pady=(0, 8))
        f._logo = _img  # type: ignore[attr-defined]
    except Exception:
        pass

    lbl(f, APP_NAME, size=15, bold=True).pack()
    lbl(f, f"Wersja {APP_VERSION}", size=10, color=TXT_DIM).pack(pady=(2, 16))

    tk.Frame(f, bg=PRI, height=1).pack(fill="x", pady=(0, 14))

    info = [
        ("Producent", "SILERS — Błaszczykowski Adrian"),
        ("Adres",     "ul. Żeromskiego 29, 08-400 Garwolin"),
        ("NIP",       "826-194-10-94"),
        ("Telefon",   "+48 575 662 664"),
        ("WWW",       "www.silers.pl"),
    ]
    for label, val in info:
        r = tk.Frame(f, bg=BG)
        r.pack(fill="x", pady=2)
        lbl(r, f"{label}:", size=10, color=TXT_DIM, bold=True).pack(side="left", padx=(0, 8))
        lbl(r, val, size=10).pack(side="left")

    tk.Frame(f, bg=PRI, height=1).pack(fill="x", pady=(14, 10))
    lbl(f, "© 2026 SILERS. Wszelkie prawa zastrzeżone.", size=9, color=TXT_DIM).pack()

    tk.Button(
        f, text="Zamknij", bg=PRI, fg="white",
        relief="flat", padx=20, pady=6,
        command=win.destroy, cursor="hand2", bd=0,
        font=("Segoe UI", 10, "bold"),
    ).pack(pady=(14, 0))


def fetch_faq() -> list:
    try:
        return api_get("/agent/faq")
    except Exception:
        return []


def open_faq_window(root: tk.Misc) -> None:
    items = fetch_faq()
    win = tk.Toplevel(root)
    win.title("FAQ — Pomoc serwisowa")
    win.configure(bg=BG)
    win.geometry("520x540")
    win.resizable(False, True)
    win.grab_set()
    win.lift()

    hdr = tk.Frame(win, bg=SURF, padx=24, pady=14)
    hdr.pack(fill="x")
    lbl(hdr, "❓  FAQ", size=14, bold=True).pack(anchor="w")
    lbl(hdr, "Często zadawane pytania i wskazówki serwisowe",
        size=10, color=TXT_DIM).pack(anchor="w")

    outer = tk.Frame(win, bg=BG)
    outer.pack(fill="both", expand=True)

    canvas = tk.Canvas(outer, bg=BG, bd=0, highlightthickness=0)
    sb = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
    inner = tk.Frame(canvas, bg=BG)

    inner.bind("<Configure>",
               lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=inner, anchor="nw")
    canvas.configure(yscrollcommand=sb.set)
    canvas.pack(side="left", fill="both", expand=True)
    sb.pack(side="right", fill="y")

    def _on_mousewheel(e):
        canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")

    canvas.bind_all("<MouseWheel>", _on_mousewheel)
    win.bind("<Destroy>", lambda e: canvas.unbind_all("<MouseWheel>"))

    if not items:
        lbl(inner, "Brak wpisów FAQ.", size=11, color=TXT_DIM).pack(pady=40)
    else:
        for i, item in enumerate(items):
            card = tk.Frame(inner, bg=SURF, padx=18, pady=14)
            card.pack(fill="x", padx=16, pady=(12 if i == 0 else 0, 0))

            q_frame = tk.Frame(card, bg=SURF)
            q_frame.pack(fill="x")
            lbl(q_frame, "▶", size=10, color=PRI).pack(side="left", anchor="nw", pady=(2, 0))
            tk.Label(
                q_frame, text=item.get("q", ""), bg=SURF, fg=TXT,
                font=(FONT, 11, "bold"),
                wraplength=430, justify="left", anchor="w",
            ).pack(side="left", fill="x", expand=True, padx=(6, 0))

            tk.Label(
                card, text=item.get("a", ""), bg=SURF, fg=TXT_DIM,
                font=(FONT, 10), wraplength=450, justify="left", anchor="w",
            ).pack(fill="x", pady=(6, 0))

        tk.Frame(inner, bg=BG, height=16).pack()

    foot = tk.Frame(win, bg=SURF, padx=24, pady=12)
    foot.pack(fill="x", side="bottom")
    btn(foot, "Zamknij", win.destroy, bg=SURF2, hover=SURF).pack(side="right")


def open_contact_window(root: tk.Misc) -> None:
    c = fetch_contact()
    win = tk.Toplevel(root)
    win.title("Kontakt")
    win.configure(bg=BG)
    win.geometry("380x360")
    win.resizable(False, False)
    win.grab_set()
    win.lift()

    f = tk.Frame(win, bg=BG, padx=32, pady=24)
    f.pack(fill="both", expand=True)

    try:
        from PIL import Image, ImageTk

        img = Image.open(res("logo.png")).convert("RGBA")
        img.thumbnail((80, 80), Image.LANCZOS)
        bg_rgb = tuple(int(BG.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        bg_img = Image.new("RGBA", img.size, bg_rgb + (255,))
        bg_img.paste(img, mask=img.split()[3])
        _img = ImageTk.PhotoImage(bg_img.convert("RGB"))
        tk.Label(f, image=_img, bg=BG, bd=0).pack(pady=(0, 10))
        f._logo = _img  # type: ignore[attr-defined]
    except Exception:
        pass

    def _row(icon, val):
        r = tk.Frame(f, bg=BG)
        r.pack(fill="x", pady=3)
        lbl(r, icon, size=12).pack(side="left", padx=(0, 8))
        lbl(r, val, size=11).pack(side="left")

    _row("📞", c.get("infolinia", ""))
    _row("✉️", c.get("email", ""))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x", pady=10)
    lbl(f, "Twój opiekun", size=10, color=TXT_DIM).pack(anchor="w")
    lbl(f, c.get("opiekun", ""), size=13, bold=True).pack(anchor="w", pady=(2, 4))
    _row("📱", c.get("opiekunTel", "") + "  (WhatsApp)")
    _row("✉️", c.get("opiekunEmail", ""))

    btn(f, "Zamknij", win.destroy, bg=SURF2, hover=SURF).pack(fill="x", pady=(16, 0))
