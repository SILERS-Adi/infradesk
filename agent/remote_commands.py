"""
Remote Command Handlers for Asystent Business v1.1
Secure, whitelisted commands executed on agent machine.
Results sent back to panel via WebSocket.
"""

import os
import json
import socket
import subprocess
import logging
import platform
import tempfile

log = logging.getLogger("remote_cmd")

_NO_WINDOW = subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0


def handle_remote_command(msg, ws_send_fn):
    """
    Handle incoming remote_command from panel.
    msg: { type: 'remote_command', requestId: str, command: str, payload: dict }
    ws_send_fn: function to send JSON back to server
    """
    request_id = msg.get("requestId")
    command = msg.get("command")
    payload = msg.get("payload", {})

    if not request_id or not command:
        return

    try:
        result = _execute_command(command, payload)
        ws_send_fn(json.dumps({
            "requestId": request_id,
            "data": result,
        }))
    except Exception as e:
        log.error("Remote command '%s' failed: %s", command, e)
        ws_send_fn(json.dumps({
            "requestId": request_id,
            "error": str(e),
        }))


def _execute_command(command: str, payload: dict):
    """Route command to handler. Only whitelisted commands."""
    handlers = {
        "scan_databases": _scan_databases,
        "test_db_connection": _test_db_connection,
        "scan_system": _scan_system,
        "get_services": _get_services,
    }

    handler = handlers.get(command)
    if not handler:
        raise ValueError(f"Unknown command: {command}")

    return handler(payload)


# ── Scan Databases ─────────────────────────────────────────────

def _scan_databases(_payload: dict) -> dict:
    """Scan machine for running database services and open ports."""
    results = []

    # Check common DB ports
    db_ports = [
        (3306, "MySQL"),
        (5432, "PostgreSQL"),
        (1433, "MSSQL"),
        (27017, "MongoDB"),
        (6379, "Redis"),
        (5984, "CouchDB"),
    ]

    for port, name in db_ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex(("127.0.0.1", port))
            sock.close()
            if result == 0:
                results.append({
                    "type": name,
                    "port": port,
                    "host": "127.0.0.1",
                    "status": "running",
                    "databases": _list_databases_quick(name, port),
                })
        except Exception:
            pass

    # Check Windows services for DB engines
    services = _find_db_services()

    return {
        "databases": results,
        "services": services,
        "hostname": socket.gethostname(),
        "os": platform.system(),
    }


def _list_databases_quick(db_type: str, port: int) -> list:
    """Try to list databases without auth (for discovery only)."""
    # This will fail without credentials — that's OK, we just detect the engine
    return []


def _find_db_services() -> list:
    """Find database-related Windows services."""
    services = []
    if platform.system() != "Windows":
        return services

    try:
        output = subprocess.run(
            ["sc", "query", "type=", "service", "state=", "all"],
            capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW
        ).stdout

        db_keywords = ["mysql", "postgres", "pgsql", "mssql", "sqlserver", "mongodb", "mariadb", "redis"]
        current_service = None

        for line in output.split("\n"):
            line = line.strip()
            if line.startswith("SERVICE_NAME:"):
                current_service = line.split(":", 1)[1].strip()
            elif line.startswith("STATE") and current_service:
                running = "RUNNING" in line
                if any(kw in current_service.lower() for kw in db_keywords):
                    services.append({
                        "name": current_service,
                        "running": running,
                    })
                current_service = None
    except Exception as e:
        log.warning("Service scan failed: %s", e)

    return services


# ── Test DB Connection ─────────────────────────────────────────

def _test_db_connection(payload: dict) -> dict:
    """Test database connection with provided credentials."""
    db_type = payload.get("type", "").upper()
    host = payload.get("host", "127.0.0.1")
    port = int(payload.get("port", 0))
    user = payload.get("user", "")
    password = payload.get("password", "")
    database = payload.get("database")

    if not db_type or not user:
        raise ValueError("type and user are required")

    if db_type in ("MYSQL", "SQL_MYSQL"):
        return _test_mysql(host, port or 3306, user, password, database)
    elif db_type in ("POSTGRES", "POSTGRESQL", "SQL_POSTGRES"):
        return _test_postgres(host, port or 5432, user, password, database)
    elif db_type in ("MSSQL", "SQL_MSSQL"):
        return _test_mssql(host, port or 1433, user, password, database)
    else:
        raise ValueError(f"Unsupported database type: {db_type}")


def _test_mysql(host, port, user, password, database=None):
    """Test MySQL connection using mysqldump --no-data or mysql -e"""
    try:
        cmd = ["mysql", f"--host={host}", f"--port={port}", f"--user={user}"]
        if password:
            cmd.append(f"--password={password}")

        if database:
            cmd.extend(["-e", "SELECT 1", database])
        else:
            cmd.extend(["-e", "SHOW DATABASES"])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)

        if result.returncode != 0:
            return {"success": False, "error": result.stderr.strip()}

        # Parse database list
        databases = []
        if not database:
            for line in result.stdout.strip().split("\n")[1:]:  # skip header
                db = line.strip()
                if db and db not in ("information_schema", "performance_schema", "sys"):
                    databases.append(db)

        return {"success": True, "databases": databases, "type": "MySQL"}
    except FileNotFoundError:
        return {"success": False, "error": "mysql client not installed on this machine"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _test_postgres(host, port, user, password, database=None):
    """Test PostgreSQL connection using psql"""
    try:
        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        if database:
            cmd = ["psql", f"-h{host}", f"-p{port}", f"-U{user}", "-c", "SELECT 1", database]
        else:
            cmd = ["psql", f"-h{host}", f"-p{port}", f"-U{user}", "-c", "SELECT datname FROM pg_database WHERE datistemplate = false", "postgres"]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, env=env, creationflags=_NO_WINDOW)

        if result.returncode != 0:
            return {"success": False, "error": result.stderr.strip()}

        databases = []
        if not database:
            for line in result.stdout.strip().split("\n")[2:]:  # skip header + separator
                db = line.strip().rstrip("|").strip()
                if db and db not in ("", "postgres") and not db.startswith("(") and not db.startswith("-"):
                    databases.append(db)

        return {"success": True, "databases": databases, "type": "PostgreSQL"}
    except FileNotFoundError:
        return {"success": False, "error": "psql client not installed on this machine"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _test_mssql(host, port, user, password, database=None):
    """Test MSSQL connection using sqlcmd"""
    try:
        cmd = ["sqlcmd", f"-S{host},{port}", f"-U{user}"]
        if password:
            cmd.append(f"-P{password}")

        if database:
            cmd.extend(["-d", database, "-Q", "SELECT 1"])
        else:
            cmd.extend(["-Q", "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb')"])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)

        if result.returncode != 0:
            return {"success": False, "error": result.stderr.strip()}

        databases = []
        if not database:
            for line in result.stdout.strip().split("\n")[2:]:
                db = line.strip()
                if db and not db.startswith("-") and not db.startswith("("):
                    databases.append(db)

        return {"success": True, "databases": databases, "type": "MSSQL"}
    except FileNotFoundError:
        return {"success": False, "error": "sqlcmd not installed on this machine"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Scan System ────────────────────────────────────────────────

def _scan_system(_payload: dict) -> dict:
    """Return basic system info."""
    import psutil
    return {
        "hostname": socket.gethostname(),
        "os": platform.system(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "cpu_count": os.cpu_count(),
        "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        "disk_total_gb": round(psutil.disk_usage("/").total / (1024**3), 1),
        "disk_free_gb": round(psutil.disk_usage("/").free / (1024**3), 1),
    }


# ── Get Services ───────────────────────────────────────────────

def _get_services(_payload: dict) -> dict:
    """List Windows services."""
    if platform.system() != "Windows":
        return {"services": [], "error": "Not Windows"}

    import psutil
    services = []
    for svc in psutil.win_service_iter():
        try:
            info = svc.as_dict()
            services.append({
                "name": info["name"],
                "display_name": info["display_name"],
                "status": info["status"],
                "start_type": info["start_type"],
            })
        except Exception:
            pass

    return {"services": services, "count": len(services)}
