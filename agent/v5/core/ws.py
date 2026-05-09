"""
core/ws.py — WebSocket client with exponential backoff (5s → 300s + jitter).

Auth-failure detection: gdy backend zwraca HTTP 401 lub close code 4001 (token
expired/revoked), zliczamy consecutive auth-fail. Po 3 z rzędu: zapisujemy
INSTALL_DIR/auth_expired.flag (UI/tray czyta to przy starcie), wydłużamy backoff
do 30 min (zamiast hammerować backend), żeby nie hammerować backendu.
"""
from __future__ import annotations

import json
import os
import random
import socket
import threading
import time

import websocket

from .config import INSTALL_DIR, WS_BASE, log

_AUTH_EXPIRED_FLAG = os.path.join(INSTALL_DIR, "auth_expired.flag")


class WS:
    _BACKOFF_MIN = 5
    _BACKOFF_MAX = 300
    _AUTH_FAIL_BACKOFF = 1800  # 30 min gdy seria 401
    _AUTH_FAIL_THRESHOLD = 3

    def __init__(self, token: str, on_msg):
        self.token = token
        self.cb = on_msg
        self._sock = None
        self._backoff = self._BACKOFF_MIN
        self._last_close_code = None
        self._last_close_msg = None
        self._auth_fail_streak = 0

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
            self._last_close_code = None
            self._last_close_msg = None
            try:
                ws_url = f"{WS_BASE}?hostname={socket.gethostname()}"
                app = websocket.WebSocketApp(
                    ws_url,
                    header=[f"Authorization: Bearer {self.token}"],
                    on_open=lambda ws: self._on_open(ws),
                    on_message=lambda ws, m: self._on(m),
                    on_close=self._on_close,
                )
                app.run_forever(ping_interval=30, ping_timeout=10)
            except websocket.WebSocketBadStatusException as e:
                # HTTP 401/403 wracają jako bad status
                self._last_close_code = getattr(e, "status_code", None)
                log.warning("WS bad status: %s", self._last_close_code)
            except Exception as e:
                log.warning("WS connection error: %s", e)
            self._sock = None

            is_auth_fail = (self._last_close_code in (401, 403, 4001))
            if is_auth_fail:
                self._auth_fail_streak += 1
                log.warning("WS auth failed (code=%s, streak=%d)",
                            self._last_close_code, self._auth_fail_streak)
                if self._auth_fail_streak >= self._AUTH_FAIL_THRESHOLD:
                    self._mark_auth_expired()
                    delay = self._AUTH_FAIL_BACKOFF
                else:
                    delay = self._backoff
            else:
                self._auth_fail_streak = 0
                jitter = random.uniform(0, self._backoff * 0.3)
                delay = self._backoff + jitter

            log.debug("WS reconnect in %.1fs (backoff=%.0fs, authFail=%d)",
                      delay, self._backoff, self._auth_fail_streak)
            time.sleep(delay)
            self._backoff = min(self._backoff * 2, self._BACKOFF_MAX)

    def _on_open(self, ws) -> None:
        self._sock = ws
        self._backoff = self._BACKOFF_MIN
        self._auth_fail_streak = 0
        self._clear_auth_expired_flag()
        log.info("WS connected")

    def _on_close(self, ws, code=None, msg=None) -> None:
        self._sock = None
        self._last_close_code = code
        self._last_close_msg = msg
        if code is not None:
            log.info("WS closed (code=%s, msg=%r)", code, str(msg)[:120] if msg else "")

    def _on(self, raw) -> None:
        try:
            self.cb(json.loads(raw))
        except Exception as e:
            log.warning("WS message parse error: %s", e)

    def _mark_auth_expired(self) -> None:
        """Zapisz flagę że token wygasł — UI/tray czyta to przy starcie i pokazuje
        komunikat 'wymagane ponowne logowanie'."""
        try:
            os.makedirs(INSTALL_DIR, exist_ok=True)
            with open(_AUTH_EXPIRED_FLAG, "w", encoding="utf-8") as f:
                f.write(str(time.time()))
            log.warning("Token wygasł — flag file: %s", _AUTH_EXPIRED_FLAG)
        except Exception as e:
            log.warning("Could not write auth-expired flag: %s", e)

    def _clear_auth_expired_flag(self) -> None:
        try:
            if os.path.exists(_AUTH_EXPIRED_FLAG):
                os.remove(_AUTH_EXPIRED_FLAG)
        except Exception:
            pass
