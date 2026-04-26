"""
ui/dysk.py — tkinter window for browsing files from InfraDesk Dysk.

Fetches files from GET /agent/downloads (filtered by workspace + visibility on
backend) and lets the user save any of them locally via GET /agent/downloads/:id/file.
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Any

import requests

from ..core import API_BASE, APP_NAME, log, res


def _human_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    if n < 1024 * 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    return f"{n / (1024 * 1024 * 1024):.2f} GB"


def _fetch_files(token: str) -> list[dict[str, Any]]:
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API_BASE}/agent/downloads", headers=h, timeout=15)
    r.raise_for_status()
    data = r.json()
    return list(data.get("files", []))


def _download_file(token: str, file_id: str, dest_path: str) -> None:
    h = {"Authorization": f"Bearer {token}"}
    with requests.get(f"{API_BASE}/agent/downloads/{file_id}/file",
                      headers=h, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as out:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    out.write(chunk)


def open_dysk_window(token: str) -> None:
    """Open the "Dysk" file browser window. Independent Tk root."""
    fg = "#E5E7EB"
    bg = "#0F1628"
    fld = "#1A2238"
    fld_h = "#222C44"
    accent = "#6D28D9"
    mute = "#9CA3AF"
    ok = "#22C55E"

    win = tk.Tk()
    win.title(f"{APP_NAME} — Dysk")
    win.geometry("780x520")
    win.configure(bg=bg)
    try:
        icon_path = res("ikona.png")
        if os.path.exists(icon_path):
            win.iconphoto(True, tk.PhotoImage(file=icon_path))
    except Exception:
        pass

    # ── Header ──────────────────────────────────────────────────────────────
    hdr = tk.Frame(win, bg=bg)
    hdr.pack(fill="x", padx=18, pady=(14, 4))
    tk.Label(hdr, text="Dysk — pliki od opiekuna IT",
             font=("Segoe UI", 14, "bold"), fg=fg, bg=bg).pack(side="left")

    status = tk.Label(hdr, text="", font=("Segoe UI", 9), fg=mute, bg=bg)
    status.pack(side="right")

    tk.Label(win, text="Pobierz instalator, instrukcję lub narzędzie udostępnione przez Twojego serwisanta.",
             font=("Segoe UI", 9), fg=mute, bg=bg
             ).pack(padx=18, anchor="w")

    # ── Filter bar ─────────────────────────────────────────────────────────
    bar = tk.Frame(win, bg=bg)
    bar.pack(fill="x", padx=18, pady=(12, 6))

    tk.Label(bar, text="Szukaj:", font=("Segoe UI", 9), fg=mute, bg=bg
             ).pack(side="left")
    search_var = tk.StringVar()
    search_e = tk.Entry(bar, textvariable=search_var,
                        font=("Segoe UI", 10), bg=fld, fg=fg,
                        insertbackground=fg, relief="flat", bd=4, width=24)
    search_e.pack(side="left", padx=(6, 12))

    tk.Label(bar, text="Kategoria:", font=("Segoe UI", 9), fg=mute, bg=bg
             ).pack(side="left")
    cat_var = tk.StringVar(value="(wszystkie)")
    cat_menu = ttk.Combobox(bar, textvariable=cat_var, state="readonly",
                            values=["(wszystkie)"], width=18)
    cat_menu.pack(side="left", padx=(6, 0))

    # ── List frame ─────────────────────────────────────────────────────────
    list_outer = tk.Frame(win, bg=bg)
    list_outer.pack(fill="both", expand=True, padx=18, pady=(6, 6))

    canvas = tk.Canvas(list_outer, bg=bg, highlightthickness=0)
    sb = tk.Scrollbar(list_outer, orient="vertical", command=canvas.yview,
                      bg=fld, troughcolor=bg, activebackground=fld_h)
    canvas.configure(yscrollcommand=sb.set)
    canvas.pack(side="left", fill="both", expand=True)
    sb.pack(side="right", fill="y")

    list_frame = tk.Frame(canvas, bg=bg)
    list_window = canvas.create_window((0, 0), window=list_frame, anchor="nw")

    def _on_list_configure(_e: Any = None) -> None:
        canvas.configure(scrollregion=canvas.bbox("all"))

    list_frame.bind("<Configure>", _on_list_configure)

    def _on_canvas_configure(e: Any) -> None:
        canvas.itemconfig(list_window, width=e.width)

    canvas.bind("<Configure>", _on_canvas_configure)

    def _on_mousewheel(e: Any) -> None:
        canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")

    canvas.bind_all("<MouseWheel>", _on_mousewheel)

    # ── Footer (refresh + close) ───────────────────────────────────────────
    foot = tk.Frame(win, bg=bg)
    foot.pack(fill="x", padx=18, pady=(4, 14))

    def _btn(parent: tk.Misc, text: str, cmd: Any, primary: bool = False) -> tk.Button:
        return tk.Button(parent, text=text, command=cmd,
                         font=("Segoe UI", 9, "bold" if primary else "normal"),
                         bg=accent if primary else fld,
                         fg="#fff" if primary else fg,
                         activebackground=accent if primary else fld_h,
                         activeforeground="#fff",
                         relief="flat", padx=14, pady=7, cursor="hand2")

    state: dict[str, Any] = {"all_files": [], "loading": False}

    def _render() -> None:
        for w in list_frame.winfo_children():
            w.destroy()

        q = (search_var.get() or "").strip().lower()
        cat = cat_var.get()
        files = state["all_files"]
        if cat and cat != "(wszystkie)":
            files = [f for f in files if (f.get("category") or "") == cat]
        if q:
            def _match(f: dict[str, Any]) -> bool:
                hay = " ".join([
                    f.get("name") or "",
                    f.get("description") or "",
                    f.get("fileName") or "",
                    f.get("category") or "",
                ]).lower()
                return q in hay

            files = [f for f in files if _match(f)]

        if not files:
            tk.Label(list_frame,
                     text="Brak plików do wyświetlenia." if not state["all_files"]
                          else "Nic nie pasuje do filtra.",
                     font=("Segoe UI", 10), fg=mute, bg=bg
                     ).pack(pady=40)
            return

        for f in files:
            row = tk.Frame(list_frame, bg=fld)
            row.pack(fill="x", pady=3, padx=2, ipady=4)

            left = tk.Frame(row, bg=fld)
            left.pack(side="left", fill="x", expand=True, padx=10, pady=6)

            cat_label = (f.get("category") or "").upper()
            tk.Label(left, text=cat_label, font=("Segoe UI", 8, "bold"),
                     fg=accent, bg=fld
                     ).pack(anchor="w")
            tk.Label(left, text=f.get("name") or f.get("fileName") or "?",
                     font=("Segoe UI", 11, "bold"), fg=fg, bg=fld
                     ).pack(anchor="w")
            desc = f.get("description")
            if desc:
                tk.Label(left, text=desc[:140],
                         font=("Segoe UI", 9), fg=mute, bg=fld,
                         wraplength=520, justify="left"
                         ).pack(anchor="w", pady=(2, 0))

            try:
                size = int(f.get("sizeBytes") or 0)
            except Exception:
                size = 0
            meta_txt = f"{f.get('fileName') or '?'}  ·  {_human_bytes(size)}"
            tk.Label(left, text=meta_txt, font=("Segoe UI", 8),
                     fg=mute, bg=fld).pack(anchor="w", pady=(2, 0))

            # Download button (binds the current file dict)
            def _make_dl(file_meta: dict[str, Any]):
                def _do() -> None:
                    fname = file_meta.get("fileName") or "plik"
                    dest = filedialog.asksaveasfilename(
                        parent=win,
                        title=f"Zapisz {fname}",
                        initialfile=fname,
                        defaultextension=os.path.splitext(fname)[1] or "",
                    )
                    if not dest:
                        return

                    def _worker() -> None:
                        try:
                            status.config(text=f"Pobieranie {fname}...", fg=accent)
                            _download_file(token, file_meta["id"], dest)
                            status.config(text=f"Pobrano: {os.path.basename(dest)}",
                                          fg=ok)
                            try:
                                if sys.platform == "win32":
                                    subprocess.Popen(["explorer", "/select,", dest])
                                elif sys.platform == "darwin":
                                    subprocess.Popen(["open", "-R", dest])
                                else:
                                    subprocess.Popen(["xdg-open",
                                                      os.path.dirname(dest)])
                            except Exception:
                                pass
                        except Exception as e:
                            log.error("Dysk download failed: %s", e)
                            status.config(text="Błąd pobierania", fg="#EF4444")
                            messagebox.showerror("Błąd",
                                                 f"Nie udało się pobrać pliku:\n{e}",
                                                 parent=win)

                    threading.Thread(target=_worker, daemon=True).start()

                return _do

            _btn(row, "Pobierz", _make_dl(f), primary=True
                 ).pack(side="right", padx=10, pady=10)

    def _refresh() -> None:
        if state["loading"]:
            return
        state["loading"] = True
        status.config(text="Ładowanie...", fg=mute)
        for w in list_frame.winfo_children():
            w.destroy()
        tk.Label(list_frame, text="Ładowanie listy plików...",
                 font=("Segoe UI", 10), fg=mute, bg=bg
                 ).pack(pady=40)

        def _worker() -> None:
            try:
                files = _fetch_files(token)
                state["all_files"] = files
                cats = sorted({(f.get("category") or "") for f in files
                               if f.get("category")})
                cat_menu.config(values=["(wszystkie)"] + cats)
                if cat_var.get() not in (["(wszystkie)"] + cats):
                    cat_var.set("(wszystkie)")
                status.config(text=f"{len(files)} plików",
                              fg=ok if files else mute)
                _render()
            except Exception as e:
                log.error("Dysk fetch failed: %s", e)
                status.config(text="Błąd ładowania", fg="#EF4444")
                for w in list_frame.winfo_children():
                    w.destroy()
                tk.Label(list_frame,
                         text=f"Nie udało się pobrać listy plików:\n{e}",
                         font=("Segoe UI", 10), fg="#EF4444", bg=bg,
                         justify="left", wraplength=600
                         ).pack(pady=40, padx=20)
            finally:
                state["loading"] = False

        threading.Thread(target=_worker, daemon=True).start()

    search_var.trace_add("write", lambda *_: _render())
    cat_menu.bind("<<ComboboxSelected>>", lambda _e: _render())

    _btn(foot, "Odśwież", _refresh).pack(side="left")
    _btn(foot, "Zamknij", win.destroy).pack(side="right")

    win.after(100, _refresh)
    win.lift()
    win.attributes("-topmost", True)
    win.after(500, lambda: win.attributes("-topmost", False))
    win.mainloop()
