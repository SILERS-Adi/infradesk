"""
ui/tray.py — pystray system tray icon: rendered as a CPU/RAM gauge with
percentage center label. Menu opens portal, dashboard, ticket, remote help.
"""
from __future__ import annotations

import os
import threading
import time
import webbrowser

import psutil
import pystray
from PIL import Image, ImageDraw

from ..core import APP_NAME, APP_VERSION, PORTAL_URL, log


def render_gauge_icon(cpu_pct: float, ram_pct: float) -> Image.Image:
    """Render a tray icon: colored ring around CPU% with number in the center."""
    size = 128
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if cpu_pct >= 85:
        fg = (239, 68, 68, 255)
        bg = (80, 20, 20, 200)
    elif cpu_pct >= 60:
        fg = (245, 158, 11, 255)
        bg = (80, 55, 10, 200)
    else:
        fg = (34, 197, 94, 255)
        bg = (20, 60, 35, 200)

    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=22, fill=(15, 22, 40, 230))

    pad = 10
    d.ellipse([pad, pad, size - pad, size - pad], outline=bg, width=12)

    pct = max(0.0, min(100.0, float(cpu_pct)))
    end_angle = -90 + int(360 * pct / 100.0)
    if pct > 0:
        d.arc([pad, pad, size - pad, size - pad],
              start=-90, end=end_angle, fill=fg, width=12)

    try:
        from PIL import ImageFont

        font = ImageFont.truetype("arialbd.ttf", 44)
    except Exception:
        from PIL import ImageFont

        font = ImageFont.load_default()

    text = f"{int(round(pct))}"
    try:
        bbox = d.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        tw, th = (40, 40)
    d.text(((size - tw) // 2 - 2, (size - th) // 2 - 6),
           text, fill=(255, 255, 255, 255), font=font)

    return img


class TrayIcon:
    """Tray icon + live gauge + menu action wiring."""

    def __init__(self, on_dashboard, on_report, on_remote_help, on_speedtest, on_dysk):
        self._on_dashboard = on_dashboard
        self._on_report = on_report
        self._on_remote_help = on_remote_help
        self._on_speedtest = on_speedtest
        self._on_dysk = on_dysk
        self._tray: pystray.Icon | None = None

    def start(self) -> None:
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self) -> None:
        try:
            try:
                icon_img = render_gauge_icon(0.0, 0.0)
            except Exception:
                icon_img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
                d = ImageDraw.Draw(icon_img)
                d.rounded_rectangle([0, 0, 127, 127], radius=22, fill=(109, 40, 217, 255))

            menu = pystray.Menu(
                pystray.MenuItem(f"  {APP_NAME} v{APP_VERSION}", None, enabled=False),
                pystray.MenuItem("  SILERS — Błaszczykowski Adrian", None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem(f"  Otworz {APP_NAME}",
                                 lambda i, it: webbrowser.open(PORTAL_URL),
                                 default=True),
                pystray.MenuItem("  Dashboard...",
                                 lambda i, it: threading.Thread(target=self._on_dashboard, daemon=True).start()),
                pystray.MenuItem("  Dysk - pliki do pobrania",
                                 lambda i, it: threading.Thread(target=self._on_dysk, daemon=True).start()),
                pystray.MenuItem("  Zglos problem do IT...",
                                 lambda i, it: threading.Thread(target=self._on_report, daemon=True).start()),
                pystray.MenuItem("  Poproś o pomoc zdalna...",
                                 lambda i, it: threading.Thread(target=self._on_remote_help, daemon=True).start()),
                pystray.MenuItem("  Test prędkości sieci...",
                                 lambda i, it: threading.Thread(target=self._on_speedtest, daemon=True).start()),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("  Zamknij", lambda i, it: (i.stop(), os._exit(0))),
            )
            self._tray = pystray.Icon(APP_NAME, icon_img, APP_NAME, menu)
            threading.Thread(target=self._gauge_loop, daemon=True).start()
            self._tray.run()
        except Exception as e:
            log.error("Tray error: %s", e)

    def _gauge_loop(self) -> None:
        time.sleep(2)
        while True:
            try:
                cpu = psutil.cpu_percent(interval=1.0)
                ram = psutil.virtual_memory().percent
                if self._tray is not None:
                    self._tray.icon = render_gauge_icon(cpu, ram)
                    self._tray.title = f"{APP_NAME} — CPU {int(round(cpu))}% · RAM {int(round(ram))}%"
            except Exception as e:
                log.debug("Gauge update error: %s", e)
            time.sleep(2)
