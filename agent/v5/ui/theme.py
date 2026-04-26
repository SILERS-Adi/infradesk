"""
ui/theme.py — color palette + tkinter ttk style setup.
"""
from __future__ import annotations

BG      = "#080D19"
SURF    = "#0C1220"
SURF2   = "#131B2E"
PRI     = "#6D28D9"
PRI_H   = "#5B21B6"
SEC     = "#2563EB"
TXT     = "#F3F4F6"
TXT_DIM = "#71717A"
TXT_MUT = "#52525B"
OK_C    = "#10b981"
ERR_C   = "#ef4444"
WARN_C  = "#f59e0b"
BORDER  = "#1E293B"
ACC     = "#22D3EE"
FONT    = "Segoe UI"


def apply_style() -> None:
    """Configure ttk styles to match the dark palette. Safe to call multiple times."""
    from tkinter import ttk

    s = ttk.Style()
    s.theme_use("clam")
    s.configure(".", background=BG, foreground=TXT, font=(FONT, 10))
    s.configure("TFrame",    background=BG)
    s.configure("TLabel",    background=BG, foreground=TXT)
    s.configure("TEntry",    fieldbackground=SURF2, foreground=TXT,
                             bordercolor=BORDER, insertcolor=TXT,
                             lightcolor=SURF2, darkcolor=SURF2, padding=10)
    s.map("TEntry",
          bordercolor=[("focus", PRI)],
          fieldbackground=[("focus", SURF)])
    s.configure("TScrollbar", background=SURF2, troughcolor=BG,
                              bordercolor=BG, arrowcolor=TXT_DIM)
    s.configure("Prog.Horizontal.TProgressbar",
                troughcolor=BORDER, background=PRI, thickness=4)
    s.configure("TCheckbutton", background=BG, foreground=TXT, selectcolor=SURF2)
    s.configure("TOptionMenu",  background=SURF2, foreground=TXT)
    s.configure("TCombobox",    fieldbackground=SURF2, background=SURF2,
                                foreground=TXT, bordercolor=BORDER,
                                arrowcolor=TXT_DIM, padding=10)
    s.map("TCombobox",
          bordercolor=[("focus", PRI)],
          fieldbackground=[("focus", SURF)])
