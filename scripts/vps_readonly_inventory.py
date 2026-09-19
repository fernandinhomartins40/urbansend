#!/usr/bin/env python3
"""Read-only VPS inventory via a password authenticated, host-key pinned SSH session.

Secrets are read from an ignored local .env file and are never printed. The
server fingerprint must match VPS_HOST_KEY_SHA256 before auth_password runs.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import socket
import sys
from pathlib import Path

import paramiko


REQUIRED = (
    "VPS_HOST",
    "VPS_PORT",
    "VPS_USER",
    "VPS_PASSWORD",
    "VPS_HOST_KEY_SHA256",
)

COMMANDS = (
    ("host", "date -u; hostname; uname -srmo; uptime"),
    ("memory", "free -b"),
    ("disk", "df -PB1 /; df -Pi /"),
    ("processes", "ps -eo pid,user,comm,%cpu,%mem,rss,etime --sort=-rss | head -n 31"),
    ("docker-version", "docker version --format '{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}' 2>&1"),
    ("docker-compose-version", "docker compose version 2>&1"),
    ("docker-containers", "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'"),
    (
        "docker-resource-config",
        "ids=$(docker ps -aq); if [ -n \"$ids\" ]; then docker inspect --format '{{.Name}}|image={{.Config.Image}}|restart={{.HostConfig.RestartPolicy.Name}}|memory={{.HostConfig.Memory}}|reservation={{.HostConfig.MemoryReservation}}|nano_cpus={{.HostConfig.NanoCPUs}}|pids={{.HostConfig.PidsLimit}}|health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $ids; fi",
    ),
    ("docker-stats", "docker stats --no-stream --format '{{.Name}}|cpu={{.CPUPerc}}|mem={{.MemUsage}}|mem_pct={{.MemPerc}}|net={{.NetIO}}|block={{.BlockIO}}|pids={{.PIDs}}'"),
    ("docker-disk", "docker system df --format '{{.Type}}|size={{.Size}}|reclaimable={{.Reclaimable}}'"),
)

EXTENDED_COMMANDS = (
    (
        "docker-project-mounts",
        "ids=$(docker ps -aq); if [ -n \"$ids\" ]; then docker inspect --format '{{.Name}}|created={{.Created}}|image_id={{.Image}}|mounts={{range .Mounts}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}:{{.Destination}},{{end}}' $ids; fi",
    ),
    ("docker-volumes", "docker volume ls --format '{{.Name}}|driver={{.Driver}}|scope={{.Scope}}'"),
    ("docker-networks", "docker network ls --format '{{.Name}}|driver={{.Driver}}|scope={{.Scope}}'"),
    (
        "release-directories",
        "for d in /var/www/ultrazend /var/www/urbansend /var/www/digiurban /var/www/aprenderia /opt; do if [ -d \"$d\" ]; then printf '%s|' \"$d\"; stat -c 'owner=%U:%G|mode=%a|modified=%y' \"$d\"; fi; done",
    ),
    (
        "compose-manifests",
        "find /var/www /opt -maxdepth 4 -type f \\( -name 'compose.yml' -o -name 'compose.yaml' -o -name 'docker-compose.yml' -o -name 'docker-compose.yaml' \\) -printf '%p|%s bytes|%TY-%Tm-%TdT%TH:%TM:%TS\\n' 2>/dev/null",
    ),
    (
        "host-services",
        "systemctl list-units --type=service --all --no-pager --plain 2>/dev/null | grep -Ei 'docker|nginx|supervisor|runner|github' || true",
    ),
)

VELOMAIL_SEARCH_COMMANDS = (
    (
        "velomail-paths",
        "find /var/www /opt /srv /home -xdev -maxdepth 6 \\( -iname '*velomail*' -o -iname '*ultrazend*' \\) -printf '%y|%p|%s bytes|%TY-%Tm-%TdT%TH:%TM:%TS\\n' 2>/dev/null",
    ),
    (
        "velomail-service-names",
        "systemctl list-unit-files --no-pager --no-legend 2>/dev/null | grep -Ei 'velomail|ultrazend' || true",
    ),
    (
        "velomail-release-artifacts",
        "for path in /var/www/ultrazend /var/www/ultrazend-static /var/lib/ultrazend /var/lib/ultrazend/configs /var/lib/ultrazend/logs; do if [ -e \"$path\" ]; then stat -c '%F|%n|owner=%U:%G|mode=%a|modified=%y|size=%s' \"$path\"; else printf 'absent|%s\\n' \"$path\"; fi; done",
    ),
    (
        "velomail-docker-artifacts",
        "docker ps -a --filter 'name=^/ultrazend-api$' --filter 'name=^/ultrazend-postgres$' --filter 'name=^/ultrazend-migration$' --format '{{.Names}}|{{.Image}}|{{.Status}}'; docker volume ls --format '{{.Name}}' | grep -Ex 'ultrazend-postgres-data|ultrazend-storage-data' || true; docker network ls --format '{{.Name}}' | grep -Ex 'ultrazend-network' || true; docker image ls --format '{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedSince}}|{{.Size}}' | grep -E '/velomail-(api|migration):|^velomail-(api|migration):' || true",
    ),
    (
        "velomail-nginx-artifacts",
        "find -L /etc/nginx/sites-enabled -maxdepth 1 -type f -printf '%f -> %l\\n' 2>/dev/null | grep -Ei 'ultrazend|velomail' || true; for path in /etc/nginx/sites-available/ultrazend /etc/letsencrypt/live/velomail.com.br; do if [ -e \"$path\" ]; then stat -c '%F|%n|owner=%U:%G|mode=%a|modified=%y|size=%s' \"$path\"; else printf 'absent|%s\\n' \"$path\"; fi; done",
    ),
)

VELOMAIL_PUBLIC_COMMANDS = (
    (
        "nginx-velomail-routing",
        "grep -R -E 'server_name|proxy_pass|return 30[12]' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -Ei 'velomail|aprenderia|server_name|proxy_pass|return 30[12]' | sed -E 's#(proxy_pass[[:space:]]+)[^;]+#\\1[redacted-upstream]#'",
    ),
    (
        "local-velomail-http-headers",
        "curl -k -sS -I --max-time 10 --resolve velomail.com.br:443:127.0.0.1 https://velomail.com.br/ | head -n 20",
    ),
)


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    missing = [key for key in REQUIRED if not values.get(key)]
    if missing:
        raise ValueError(f"missing local access fields: {', '.join(missing)}")
    return values


def fingerprint(key: paramiko.PKey) -> str:
    digest = hashlib.sha256(key.asbytes()).digest()
    return "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")


def run_command(transport: paramiko.Transport, name: str, command: str) -> None:
    channel = transport.open_session(timeout=20)
    channel.settimeout(30)
    channel.exec_command(command)
    stdout = channel.makefile("rb", -1).read().decode("utf-8", "replace").rstrip()
    stderr = channel.makefile_stderr("rb", -1).read().decode("utf-8", "replace").rstrip()
    exit_code = channel.recv_exit_status()
    print(f"--- {name} (exit={exit_code}) ---")
    if stdout:
        print(stdout)
    if stderr:
        print(f"[stderr] {stderr}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="local-vps-access.env")
    parser.add_argument("--extended", action="store_true")
    parser.add_argument("--velomail", action="store_true", help="search only path and unit names")
    parser.add_argument("--velomail-public", action="store_true", help="check VeloMail proxy routing and local headers")
    args = parser.parse_args()

    values = parse_env(Path(args.config))
    port = int(values["VPS_PORT"])
    sock = socket.create_connection((values["VPS_HOST"], port), timeout=20)
    transport = paramiko.Transport(sock)
    try:
        transport.start_client(timeout=20)
        actual = fingerprint(transport.get_remote_server_key())
        if not hmac.compare_digest(values["VPS_HOST_KEY_SHA256"], actual):
            raise RuntimeError("VPS host key fingerprint mismatch; authentication was not attempted")
        print("HOST_KEY_PIN_VERIFIED")
        transport.auth_password(values["VPS_USER"], values["VPS_PASSWORD"])
        if not transport.is_authenticated():
            raise RuntimeError("SSH authentication failed")
        print("SSH_AUTHENTICATED_READ_ONLY_INVENTORY")
        for name, command in COMMANDS:
            run_command(transport, name, command)
        if args.extended:
            for name, command in EXTENDED_COMMANDS:
                run_command(transport, name, command)
        if args.velomail:
            for name, command in VELOMAIL_SEARCH_COMMANDS:
                run_command(transport, name, command)
        if args.velomail_public:
            for name, command in VELOMAIL_PUBLIC_COMMANDS:
                run_command(transport, name, command)
    finally:
        transport.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"VPS_INVENTORY_ERROR: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
