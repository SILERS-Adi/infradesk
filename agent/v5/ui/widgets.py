"""
ui/widgets.py — small tkinter widget helpers: labels, entries, buttons, section,
scrollable frame, Toggle canvas switch, password strength meter.
"""
from __future__ import annotations

import re
import tkinter as tk
from tkinter import ttk

from .theme import BG, BORDER, ERR_C, FONT, OK_C, PRI, PRI_H, SURF, SURF2, TXT, TXT_DIM, WARN_C


def lbl(parent, text, size=11, color=TXT, bold=False, **kw):
    f = "bold" if bold else "normal"
    return tk.Label(
        parent, text=text,
        bg=parent.cget("bg") if hasattr(parent, "cget") else BG,
        fg=color, font=(FONT, size, f), **kw,
    )


def entry(parent, placeholder: str = "", show: str = "", width: int = 30) -> ttk.Entry:
    e = ttk.Entry(parent, show=show, width=width, style="TEntry", font=(FONT, 11))
    if placeholder:
        e.insert(0, placeholder)
        e.configure(foreground=TXT_DIM)

        def _focus_in(ev):
            if e.get() == placeholder:
                e.delete(0, "end")
                e.configure(foreground=TXT)

        def _focus_out(ev):
            if not e.get():
                e.insert(0, placeholder)
                e.configure(foreground=TXT_DIM)

        e.bind("<FocusIn>",  _focus_in)
        e.bind("<FocusOut>", _focus_out)
        e._placeholder = placeholder  # type: ignore[attr-defined]
    return e


def get_val(e: ttk.Entry) -> str:
    v = e.get()
    if hasattr(e, "_placeholder") and v == e._placeholder:  # type: ignore[attr-defined]
        return ""
    return v.strip()


def btn(parent, text, cmd, bg=PRI, hover=PRI_H, height=5, **kw):
    b = tk.Button(
        parent, text=text, command=cmd,
        bg=bg, fg=TXT, activebackground=hover, activeforeground=TXT,
        relief="flat", bd=0, font=(FONT, 10, "bold"),
        cursor="hand2", pady=height, padx=14, **kw,
    )

    def _enter(e):
        b.config(bg=hover)

    def _leave(e):
        b.config(bg=bg)

    b.bind("<Enter>", _enter)
    b.bind("<Leave>", _leave)
    return b


def btn_secondary(parent, text, cmd, **kw):
    return btn(parent, text, cmd, bg=SURF2, hover=BORDER, height=6, **kw)


def sep(parent):
    tk.Frame(parent, bg=BORDER, height=1).pack(fill="x", pady=12)


def section_lbl(parent, text):
    f = tk.Frame(parent, bg=BG)
    f.pack(fill="x", pady=(16, 6))
    tk.Frame(f, bg=BORDER, height=1).pack(fill="x")
    lbl(f, text, size=9, color=TXT_DIM).pack(anchor="w", pady=(6, 0))


def scrollable(parent, height: int = 400):
    """Return (outer, inner) frame — inner is scrollable vertically."""
    outer = tk.Frame(parent, bg=BG)
    canvas = tk.Canvas(outer, bg=BG, highlightthickness=0, height=height)
    sb = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)
    inner = tk.Frame(canvas, bg=BG)
    win = canvas.create_window((0, 0), window=inner, anchor="nw")

    def _resize_canvas(e):
        canvas.itemconfig(win, width=canvas.winfo_width())

    def _resize_inner(e):
        canvas.configure(scrollregion=canvas.bbox("all"))

    canvas.bind("<Configure>", _resize_canvas)
    inner.bind("<Configure>",  _resize_inner)
    canvas.bind_all("<MouseWheel>",
                    lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))
    return outer, inner


class Toggle(tk.Canvas):
    """Simple canvas-drawn ON/OFF switch."""

    def __init__(self, parent, **kw):
        super().__init__(
            parent, width=44, height=22,
            bg=parent.cget("bg"), highlightthickness=0, cursor="hand2", **kw,
        )
        self._on = True
        self._draw()
        self.bind("<Button-1>", lambda e: self._toggle())

    def _draw(self):
        self.delete("all")
        color = PRI if self._on else "#374151"
        self.create_oval(0, 0, 22, 22, fill=color, outline="")
        self.create_oval(22, 0, 44, 22, fill=color, outline="")
        self.create_rectangle(11, 0, 33, 22, fill=color, outline="")
        cx = 32 if self._on else 11
        self.create_oval(cx - 8, 3, cx + 8, 19, fill="white", outline="")

    def _toggle(self):
        self._on = not self._on
        self._draw()

    def get(self) -> bool:
        return self._on

    def set(self, val: bool) -> None:
        self._on = val
        self._draw()


def password_strength(pwd: str):
    """Return (score 0-1, label, color)."""
    s = 0
    if len(pwd) >= 8:  s += 1
    if len(pwd) >= 12: s += 1
    if re.search(r"[A-Z]", pwd): s += 1
    if re.search(r"[a-z]", pwd): s += 1
    if re.search(r"\d",    pwd): s += 1
    if re.search(r"[!@#$%^&*()\-_=+\[\]{};:,.<>?]", pwd): s += 1
    if s <= 2:
        return s / 6, "Słabe",   ERR_C
    if s <= 3:
        return s / 6, "Średnie", WARN_C
    return s / 6, "Silne", OK_C


# Backwards-compat name used in older modules.
_scrollable = scrollable
