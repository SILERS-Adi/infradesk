"""
Remote Command Handlers for Asystent Business v3.0
Secure, whitelisted commands executed on agent machine.
Results sent back to panel via WebSocket.
"""

import os
import re
import json
import socket
import subprocess
import logging
import platform
import tempfile

log = logging.getLogger("remote_cmd")

# ── Input Validation ──────────────────────────────────────────

_RE_HOST = re.compile(r'^[a-zA-Z0-9._\-\\]+$')
_RE_DBNAME = re.compile(r'^[a-zA-Z0-9_\-]+$')
_RE_USERNAME = re.compile(r'^[a-zA-Z0-9_@.\-\\]+$')


def _validate_host(val: str) -> str:
    val = str(val).strip()
    if not val or len(val) > 255 or not _RE_HOST.match(val):
        raise ValueError(f"Invalid host: {val!r}")
    return val


def _validate_port(val) -> int:
    port = int(val)
    if port < 1 or port > 65535:
        raise ValueError(f"Invalid port: {port}")
    return port


def _validate_dbname(val: str) -> str:
    val = str(val).strip()
    if not val or len(val) > 128 or not _RE_DBNAME.match(val):
        raise ValueError(f"Invalid database name: {val!r}")
    return val


def _validate_username(val: str) -> str:
    val = str(val).strip()
    if not val or len(val) > 128 or not _RE_USERNAME.match(val):
        raise ValueError(f"Invalid username: {val!r}")
    return val

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

    log.info("AUDIT: remote command '%s' received (requestId=%s)", command, request_id)
    try:
        result = _execute_command(command, payload)
        log.info("AUDIT: remote command '%s' completed OK (requestId=%s)", command, request_id)
        ws_send_fn(json.dumps({
            "requestId": request_id,
            "data": result,
        }))
    except Exception as e:
        log.error("AUDIT: remote command '%s' FAILED (requestId=%s): %s", command, request_id, e)
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
        "get_processes": _get_processes,
        "get_installed_software": _get_installed_software,
        "get_event_log": _get_event_log,
        "get_network_info": _get_network_info,
        "get_scheduled_tasks": _get_scheduled_tasks,
        "restart_print_spooler": _restart_print_spooler,
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
    host = _validate_host(payload.get("host", "127.0.0.1"))
    port = _validate_port(payload.get("port", 0) or 0)
    user = _validate_username(payload.get("user", ""))
    password = str(payload.get("password", ""))
    database = _validate_dbname(payload["database"]) if payload.get("database") else None

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
    """Test MySQL connection using mysql -e (password via env to avoid process list exposure)"""
    try:
        cmd = ["mysql", f"--host={host}", f"--port={port}", f"--user={user}"]

        if database:
            cmd.extend(["-e", "SELECT 1", database])
        else:
            cmd.extend(["-e", "SHOW DATABASES"])

        # Security: pass password via env var instead of CLI arg (visible in process list)
        env = os.environ.copy()
        if password:
            env["MYSQL_PWD"] = password

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, env=env, creationflags=_NO_WINDOW)

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
    """Test MSSQL connection using sqlcmd (password via env to avoid process list exposure)"""
    try:
        env = os.environ.copy()
        cmd = ["sqlcmd", f"-S{host},{port}", f"-U{user}"]
        if password:
            env["SQLCMDPASSWORD"] = password

        if database:
            cmd.extend(["-d", database, "-Q", "SELECT 1"])
        else:
            cmd.extend(["-Q", "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb')"])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, env=env, creationflags=_NO_WINDOW)

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


# ── Get Processes ──────────────────────────────────────────────

def _get_processes(payload: dict) -> dict:
    """List running processes sorted by CPU or memory usage."""
    import psutil
    sort_by = payload.get("sortBy", "memory")  # "cpu" or "memory"
    limit = min(int(payload.get("limit", 50)), 200)

    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "username", "create_time"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"],
                "cpu": info.get("cpu_percent", 0) or 0,
                "memMb": round((info.get("memory_info") or p.memory_info()).rss / (1024 * 1024), 1),
                "status": info.get("status", ""),
                "user": info.get("username", ""),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    key = "memMb" if sort_by == "memory" else "cpu"
    procs.sort(key=lambda x: x[key], reverse=True)
    return {"processes": procs[:limit], "total": len(procs)}


# ── Get Installed Software ─────────────────────────────────────

def _get_installed_software(_payload: dict) -> dict:
    """List installed software from Windows registry."""
    if platform.system() != "Windows":
        return {"software": [], "error": "Not Windows"}

    import winreg
    software = []
    paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    seen = set()
    for hive, path in paths:
        try:
            with winreg.OpenKey(hive, path) as key:
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, subkey_name) as sub:
                            name = winreg.QueryValueEx(sub, "DisplayName")[0]
                            if name and name not in seen:
                                seen.add(name)
                                version = ""
                                publisher = ""
                                try: version = winreg.QueryValueEx(sub, "DisplayVersion")[0]
                                except FileNotFoundError: pass
                                try: publisher = winreg.QueryValueEx(sub, "Publisher")[0]
                                except FileNotFoundError: pass
                                software.append({"name": name, "version": version, "publisher": publisher})
                    except (FileNotFoundError, OSError):
                        pass
        except FileNotFoundError:
            pass

    software.sort(key=lambda x: x["name"].lower())
    return {"software": software, "count": len(software)}


# ── Get Event Log ──────────────────────────────────────────────

def _get_event_log(payload: dict) -> dict:
    """Query Windows Event Log — recent errors/warnings."""
    if platform.system() != "Windows":
        return {"events": [], "error": "Not Windows"}

    log_name = payload.get("logName", "System")
    level = payload.get("level", "error")  # error, warning, critical
    limit = min(int(payload.get("limit", 50)), 200)

    level_map = {"critical": 1, "error": 2, "warning": 3}
    wmi_level = level_map.get(level, 2)

    ps_cmd = (
        f"Get-WinEvent -FilterHashtable @{{LogName='{log_name}'; Level={wmi_level}}} "
        f"-MaxEvents {limit} -ErrorAction SilentlyContinue | "
        f"Select-Object TimeCreated,Id,ProviderName,Message | "
        f"ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
        )
        if result.returncode != 0:
            return {"events": [], "error": result.stderr.strip()[:200]}

        import json as _json
        events = _json.loads(result.stdout) if result.stdout.strip() else []
        if isinstance(events, dict):
            events = [events]
        return {"events": events[:limit], "count": len(events)}
    except Exception as e:
        return {"events": [], "error": str(e)[:200]}


# ── Get Network Info ───────────────────────────────────────────

def _get_network_info(_payload: dict) -> dict:
    """Return network interfaces, IPs, gateway, DNS."""
    import psutil
    interfaces = []
    for name, addrs in psutil.net_if_addrs().items():
        iface = {"name": name, "addresses": []}
        for addr in addrs:
            if addr.family == socket.AF_INET:
                iface["addresses"].append({"type": "IPv4", "address": addr.address, "netmask": addr.netmask})
            elif addr.family == socket.AF_INET6:
                iface["addresses"].append({"type": "IPv6", "address": addr.address})
        if iface["addresses"]:
            interfaces.append(iface)

    # Get default gateway
    gateway = ""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1).NextHop"],
            capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW
        )
        gateway = result.stdout.strip()
    except Exception:
        pass

    # Get DNS servers
    dns_servers = []
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses | Select-Object -Unique"],
            capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW
        )
        dns_servers = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
    except Exception:
        pass

    return {"interfaces": interfaces, "gateway": gateway, "dnsServers": dns_servers}


# ── Get Scheduled Tasks ───────────────────────────────────────

def _get_scheduled_tasks(_payload: dict) -> dict:
    """List scheduled tasks from Task Scheduler."""
    if platform.system() != "Windows":
        return {"tasks": [], "error": "Not Windows"}

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-ScheduledTask | Where-Object {$_.State -ne 'Disabled'} | "
             "Select-Object TaskName,TaskPath,State,@{N='NextRun';E={($_ | Get-ScheduledTaskInfo).NextRunTime}} | "
             "ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW
        )
        if result.returncode != 0:
            return {"tasks": [], "error": result.stderr.strip()[:200]}

        import json as _json
        tasks = _json.loads(result.stdout) if result.stdout.strip() else []
        if isinstance(tasks, dict):
            tasks = [tasks]
        return {"tasks": tasks, "count": len(tasks)}
    except Exception as e:
        return {"tasks": [], "error": str(e)[:200]}


# ── Restart Print Spooler ─────────────────────────────────────

def _restart_print_spooler(_payload: dict) -> dict:
    """Restart the Windows Print Spooler service."""
    if platform.system() != "Windows":
        return {"success": False, "error": "Not Windows"}

    try:
        subprocess.run(["net", "stop", "spooler"], capture_output=True, timeout=30, creationflags=_NO_WINDOW)
        import time
        time.sleep(2)
        result = subprocess.run(["net", "start", "spooler"], capture_output=True, text=True, timeout=30, creationflags=_NO_WINDOW)
        if result.returncode == 0:
            log.info("AUDIT: Print Spooler restarted successfully")
            return {"success": True, "message": "Print Spooler restarted"}
        return {"success": False, "error": result.stderr.strip()[:200]}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}
