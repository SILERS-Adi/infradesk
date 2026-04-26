"""
core/api.py — HTTP API client (POST/GET/PATCH), login/register,
metrics/ticket/screenshot helpers, status polling.
"""
from __future__ import annotations

import os

import requests

from .config import API_BASE, load_config, load_tenant_key, log
from .metrics import full_inventory, metrics


# ── Low-level HTTP ───────────────────────────────────────────────────────────

def api_post(path: str, data: dict, token: str | None = None) -> dict:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{API_BASE}{path}", json=data, headers=h, timeout=15)
    r.raise_for_status()
    return r.json()


def api_get(path: str, token: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.get(f"{API_BASE}{path}", headers=h, timeout=10)
    r.raise_for_status()
    return r.json()


def api_patch(path: str, data: dict, token: str | None = None) -> dict:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.patch(f"{API_BASE}{path}", json=data, headers=h, timeout=15)
    r.raise_for_status()
    return r.json()


# ── Auth flows ──────────────────────────────────────────────────────────────

def do_login(email: str, pwd: str) -> dict:
    cfg = load_config()
    body = {"email": email, "password": pwd, "agentType": "CLIENT", **metrics()}
    if cfg.get("deviceId"):
        body["deviceId"] = cfg["deviceId"]
    tenant_key = load_tenant_key()
    if tenant_key:
        body["tenantKey"] = tenant_key
    return api_post("/agent/register", body)


def do_register(form: dict) -> dict:
    body = {k: v for k, v in {**form, "agentType": "CLIENT", **full_inventory()}.items()
            if v is not None}
    tenant_key = load_tenant_key()
    if tenant_key:
        body["tenantKey"] = tenant_key
    return api_post("/agent/register", body)


# ── Metrics / ticket / screenshot ───────────────────────────────────────────

def do_metrics(token: str, data: dict | None = None) -> None:
    if data is None:
        data = metrics()
    api_post("/agent/metrics", data, token=token)


def do_ticket(token: str, title: str, desc: str, priority: str,
              due_iso: str | None = None) -> dict:
    p = {"title": title, "description": desc, "priority": priority}
    if due_iso:
        p["dueAt"] = due_iso
    return api_post("/agent/ticket", p, token=token)


def upload_screenshot(path_: str, token: str) -> str | None:
    try:
        with open(path_, "rb") as f:
            r = requests.post(
                f"{API_BASE}/agent/upload",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": (os.path.basename(path_), f, "image/jpeg")},
                timeout=30,
            )
            r.raise_for_status()
            return f"https://infradesk.pl{r.json()['url']}"
    except Exception as e:
        log.error("Screenshot upload error: %s", e)
        return None


def check_status(token: str) -> dict | None:
    try:
        return api_get("/agent/status", token)
    except Exception:
        return None


def fetch_contact() -> dict:
    """Pull IT support contact info from API with local fallback."""
    try:
        return api_get("/agent/contact")
    except Exception:
        return {
            "infolinia":     "+48 575 662 664",
            "email":         "zgloszenia@silers.pl",
            "opiekun":       "Błaszczykowski Adrian",
            "opiekunTel":    "+48 604 292 831",
            "opiekunEmail":  "adrian@silers.pl",
        }
