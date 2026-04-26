"""
core/remote.py — remote command handlers dispatched from the WebSocket channel.
"""
from __future__ import annotations

import json
import os
import platform
import socket
import subprocess
import time

import psutil

from .config import log
from .utils import NO_WINDOW


def handle_remote_command(msg: dict, ws_send_fn) -> None:
    """Handle remote_command message from panel; reply via WS."""
    request_id = msg.get("requestId")
    command = msg.get("command")
    payload = msg.get("payload", {})
    if not request_id or not command:
        return
    try:
        result = exec_remote(command, payload)
        ws_send_fn(json.dumps({"requestId": request_id, "data": result}))
    except Exception as e:
        log.error("Remote command '%s' failed: %s", command, e)
        ws_send_fn(json.dumps({"requestId": request_id, "error": str(e)}))


def exec_remote(command: str, payload: dict) -> dict:
    if command == "scan_databases":
        return scan_databases()
    if command == "test_db_connection":
        return test_db_connection(payload)
    if command == "scan_system":
        return {
            "hostname":     socket.gethostname(),
            "os":           platform.system(),
            "os_version":   platform.version(),
            "cpu_count":    os.cpu_count(),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        }
    if command == "get_services":
        svcs = []
        for s in psutil.win_service_iter():
            try:
                i = s.as_dict()
                svcs.append({"name": i["name"], "display_name": i["display_name"], "status": i["status"]})
            except Exception:
                pass
        return {"services": svcs, "count": len(svcs)}
    if command == "list_files":
        target = payload.get("path", "C:\\")
        if not os.path.isdir(target):
            return {"error": f"Not a directory: {target}"}
        entries = []
        for f in os.listdir(target):
            fp = os.path.join(target, f)
            try:
                st = os.stat(fp)
                entries.append({
                    "name":     f,
                    "size":     st.st_size,
                    "isDir":    os.path.isdir(fp),
                    "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                })
            except Exception:
                entries.append({"name": f, "error": "access denied"})
        return {"path": target, "files": entries, "count": len(entries)}
    if command == "run_backup_now":
        cfg_id = payload.get("configId")
        if not cfg_id:
            return {"error": "configId required"}
        return {"triggered": True, "configId": cfg_id}
    raise ValueError(f"Unknown command: {command}")


def scan_databases() -> dict:
    results = []
    for port, name in [(3306, "MySQL"), (5432, "PostgreSQL"),
                       (1433, "MSSQL"), (27017, "MongoDB")]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                results.append({"type": name, "port": port, "host": "127.0.0.1", "status": "running"})
            s.close()
        except Exception:
            pass

    # Named MSSQL instances via SQL Browser (UDP 1434)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(3)
        sock.sendto(b'\x02', ("127.0.0.1", 1434))
        data, _ = sock.recvfrom(4096)
        sock.close()
        for inst_str in data.decode("ascii", errors="ignore").split(";;"):
            if not inst_str.strip():
                continue
            parts = inst_str.strip("\x00").split(";")
            info = {}
            for i in range(0, len(parts) - 1, 2):
                info[parts[i].lower()] = parts[i + 1]
            inst_name = info.get("instancename", "")
            tcp_port = info.get("tcp", "")
            if inst_name:
                if tcp_port and not any(r["port"] == int(tcp_port) for r in results):
                    results.append({
                        "type": "MSSQL", "port": int(tcp_port) if tcp_port else None,
                        "host": "127.0.0.1", "status": "running", "instance": inst_name,
                    })
                elif not tcp_port:
                    results.append({
                        "type": "MSSQL", "port": None,
                        "host": "127.0.0.1", "status": "running",
                        "instance": inst_name, "note": "named_pipes_only",
                    })
    except Exception:
        pass

    services = []
    try:
        for svc in psutil.win_service_iter():
            try:
                i = svc.as_dict()
                nm = i["name"].lower()
                db_kw = ["mysql", "postgres", "pgsql", "mssql", "sqlserver", "mongodb", "mariadb"]
                if any(k in nm for k in db_kw):
                    services.append({
                        "name":         i["name"],
                        "display_name": i["display_name"],
                        "running":      i["status"] == "running",
                    })
            except Exception:
                pass
    except Exception:
        pass
    return {"databases": results, "services": services, "hostname": socket.gethostname()}


def test_db_connection(p: dict) -> dict:
    db_type = (p.get("type") or "").upper().replace("SQL_", "")
    host = p.get("host", "127.0.0.1")
    port = int(p.get("port") or 0)
    instance = p.get("instance", "")
    user = p.get("user", "")
    pw = p.get("password", "")
    auth_mode = p.get("authMode", "sql")
    if auth_mode != "windows" and not user:
        raise ValueError("user is required")
    if "MYSQL" in db_type:
        cmd = ["mysql", f"--host={host}", f"--port={port or 3306}", f"--user={user}"]
        if pw:
            cmd.append(f"--password={pw}")
        cmd.extend(["-e", "SHOW DATABASES"])
    elif "POSTGRES" in db_type:
        os.environ["PGPASSWORD"] = pw
        cmd = ["psql", f"-h{host}", f"-p{port or 5432}", f"-U{user}", "-c",
               "SELECT datname FROM pg_database WHERE datistemplate = false", "postgres"]
    elif "MSSQL" in db_type:
        if instance:
            server = f"{host}\\{instance}"
        elif port:
            server = f"{host},{port}"
        else:
            server = f"{host},1433"
        if auth_mode == "windows":
            cmd = ["sqlcmd", f"-S{server}", "-E"]
        else:
            cmd = ["sqlcmd", f"-S{server}", f"-U{user}"]
            if pw:
                cmd.append(f"-P{pw}")
        cmd.extend(["-Q", "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb')"])
    else:
        raise ValueError(f"Unsupported: {db_type}")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW)
        if r.returncode != 0:
            return {"success": False, "error": r.stderr.strip()[:200]}
        dbs = [l.strip() for l in r.stdout.strip().split("\n")[1:]
               if l.strip() and not l.startswith("-") and not l.startswith("(")]
        dbs = [d for d in dbs if d not in ("information_schema", "performance_schema", "sys", "")]
        return {"success": True, "databases": dbs, "type": db_type}
    except FileNotFoundError:
        return {"success": False, "error": f"Client ({db_type.lower()}) not installed"}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}
