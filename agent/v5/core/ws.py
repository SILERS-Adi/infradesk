"""
core/ws.py — WebSocket client with exponential backoff (5s → 300s + jitter).
"""
from __future__ import annotations

import json
import random
import socket
import threading
import time

import websocket

from .config import WS_BASE, log


class WS:
    _BACKOFF_MIN = 5
    _BACKOFF_MAX = 300

    def __init__(self, token: str, on_msg):
        self.token = token
        self.cb = on_msg
        self._sock = None
        self._backoff = self._BACKOFF_MIN

    def start(self) -> None:
        threading.Thread(target=self._run, daemon=True).start()

    def send(self, data) -> None:
        """Thread-safe raw-socket send on the active connection."""
        try:
            s = self._sock
            if s:
                from websocket import ABNF
                s.send(data, ABNF.OPCODE_TEXT)
        except Exception as e:
            log.error("WS send error: %s", e)

    def _run(self) -> None:
        while True:
            try:
                ws_url = f"{WS_BASE}?hostname={socket.gethostname()}"
                app = websocket.WebSocketApp(
                    ws_url,
                    header=[f"Authorization: Bearer {self.token}"],
                    on_open=lambda ws: self._on_open(ws),
                    on_message=lambda ws, m: self._on(m),
                    on_close=lambda ws, *a: setattr(self, '_sock', None),
                )
                app.run_forever(ping_interval=30)
            except Exception as e:
                log.warning("WS connection error: %s", e)
            self._sock = None
            jitter = random.uniform(0, self._backoff * 0.3)
            delay = self._backoff + jitter
            log.debug("WS reconnect in %.1fs (backoff=%.0fs)", delay, self._backoff)
            time.sleep(delay)
            self._backoff = min(self._backoff * 2, self._BACKOFF_MAX)

    def _on_open(self, ws) -> None:
        self._sock = ws
        self._backoff = self._BACKOFF_MIN
        log.info("WS connected")

    def _on(self, raw) -> None:
        try:
            self.cb(json.loads(raw))
        except Exception as e:
            log.warning("WS message parse error: %s", e)
