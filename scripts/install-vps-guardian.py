#!/usr/bin/env python3
"""
Instalador do VPS Guardian via paramiko.

Envia o guardian para a VPS, instala a unit systemd e o timer, e valida a
instalacao rodando um ciclo em modo --report (que nao altera nada).

Credenciais vem SEMPRE de variaveis de ambiente -- nunca gravadas em arquivo:

    VPS_HOST=72.60.10.108
    VPS_USER=root
    VPS_PASS=...            (ou VPS_KEY=/caminho/para/chave)

Uso:
    python3 install-vps-guardian.py                 # instala + valida (--report)
    python3 install-vps-guardian.py --enable-timer  # instala e ATIVA o timer
    python3 install-vps-guardian.py --uninstall     # remove o guardian

O timer NAO e ativado por padrao. Voce revisa o relatorio primeiro e decide.
"""

import argparse
import os
import sys

try:
    import paramiko
except ImportError:
    sys.exit("paramiko nao instalado: pip install paramiko")

REMOTE_DIR = "/opt/vps-guardian"
REMOTE_BIN = REMOTE_DIR + "/vps-guardian.py"
STATE_DIR = "/var/lib/vps-guardian"

LOCAL_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "vps-guardian.py")

# --------------------------------------------------------------------------
# Unidades systemd
# --------------------------------------------------------------------------

SERVICE_UNIT = """\
[Unit]
Description=VPS Guardian - limpeza segura e vigilancia
Documentation=file://{remote_dir}/vps-guardian.py
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
# nice/ionice: o guardian nunca deve competir com a producao.
ExecStart=/usr/bin/nice -n 19 /usr/bin/ionice -c3 /usr/bin/python3 {bin} --apply
TimeoutStartSec=3600

# Endurecimento: o guardian nao precisa de quase nada do sistema.
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
# ProtectSystem=strict exigiria abrir varios caminhos do docker; usamos full,
# que ja deixa /usr e /boot somente-leitura.
ProtectSystem=full
ReadWritePaths={state_dir} /var/log /var/run /var/lib/docker

[Install]
WantedBy=multi-user.target
"""

TIMER_UNIT = """\
[Unit]
Description=Executa o VPS Guardian periodicamente
Documentation=file://{remote_dir}/vps-guardian.py

[Timer]
# Diario as 04:00, com folga aleatoria de 30min para nao coincidir com backups.
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=1800
Persistent=true

[Install]
WantedBy=timers.target
"""

REPORT_SERVICE = """\
[Unit]
Description=VPS Guardian - relatorio diario (nao altera nada)
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/nice -n 19 /usr/bin/ionice -c3 /usr/bin/python3 {bin} --report
TimeoutStartSec=1800
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths={state_dir} /var/log /var/run
"""

REPORT_TIMER = """\
[Unit]
Description=Relatorio diario do VPS Guardian

[Timer]
OnCalendar=*-*-* 06:00:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
"""


def connect():
    host = os.environ.get("VPS_HOST")
    if not host:
        sys.exit("defina VPS_HOST")
    user = os.environ.get("VPS_USER", "root")
    key = os.environ.get("VPS_KEY")
    pwd = os.environ.get("VPS_PASS")
    if not key and not pwd:
        sys.exit("defina VPS_PASS ou VPS_KEY")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs = dict(hostname=host, username=user, timeout=60,
                  banner_timeout=60, auth_timeout=60)
    if key:
        kwargs["key_filename"] = key
    else:
        kwargs["password"] = pwd
    c.connect(**kwargs)
    print("[OK] conectado em {}@{}".format(user, host))
    return c


def sh(c, cmd, timeout=300, quiet=False):
    _i, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace").rstrip()
    rc = o.channel.recv_exit_status()
    err = e.read().decode("utf-8", "replace").strip()
    if not quiet:
        if out:
            print(out)
        if err and rc != 0:
            print("[stderr]", err[:500])
    return rc, out, err


def put_text(c, path, content):
    """Escreve texto num caminho remoto via sftp."""
    sftp = c.open_sftp()
    with sftp.open(path, "w") as f:
        f.write(content)
    sftp.close()


def install(c, enable_timer):
    print("\n--- instalando ---")
    sh(c, "mkdir -p {} {}".format(REMOTE_DIR, STATE_DIR))

    sftp = c.open_sftp()
    sftp.put(LOCAL_BIN, REMOTE_BIN)
    sftp.chmod(REMOTE_BIN, 0o755)
    sftp.close()
    print("[OK] guardian enviado para", REMOTE_BIN)

    fmt = dict(bin=REMOTE_BIN, state_dir=STATE_DIR, remote_dir=REMOTE_DIR)
    put_text(c, "/etc/systemd/system/vps-guardian.service",
             SERVICE_UNIT.format(**fmt))
    put_text(c, "/etc/systemd/system/vps-guardian.timer",
             TIMER_UNIT.format(**fmt))
    put_text(c, "/etc/systemd/system/vps-guardian-report.service",
             REPORT_SERVICE.format(**fmt))
    put_text(c, "/etc/systemd/system/vps-guardian-report.timer",
             REPORT_TIMER.format(**fmt))
    print("[OK] units systemd instaladas")

    sh(c, "systemctl daemon-reload")

    if enable_timer:
        sh(c, "systemctl enable --now vps-guardian.timer "
              "vps-guardian-report.timer")
        print("[OK] timers ATIVADOS")
        sh(c, "systemctl list-timers 'vps-guardian*' --no-pager")
    else:
        print("[!] timers NAO ativados (use --enable-timer).")
        print("    Para ativar depois:")
        print("      systemctl enable --now vps-guardian.timer vps-guardian-report.timer")


def validate(c):
    """Roda um ciclo em --report: nao altera nada, prova que funciona."""
    print("\n--- validando (modo --report, nao altera nada) ---")
    cmd = "nice -n 19 ionice -c3 python3 {} --report".format(REMOTE_BIN)
    _i, o, e = c.exec_command(cmd, timeout=1800)
    for line in iter(o.readline, ""):
        print(line.rstrip())
        sys.stdout.flush()
    rc = o.channel.recv_exit_status()
    err = e.read().decode("utf-8", "replace").strip()
    if err:
        print("[stderr]", err[:1000])
    print("[EXIT]", rc)
    return rc


def uninstall(c):
    print("\n--- removendo guardian ---")
    sh(c, "systemctl disable --now vps-guardian.timer "
          "vps-guardian-report.timer 2>/dev/null; true")
    sh(c, "rm -f /etc/systemd/system/vps-guardian*.service "
          "/etc/systemd/system/vps-guardian*.timer")
    sh(c, "systemctl daemon-reload")
    sh(c, "rm -f " + REMOTE_BIN)
    print("[OK] guardian removido.")
    print("[!] o estado em {} foi PRESERVADO (historico).".format(STATE_DIR))
    print("    Para apagar tambem: rm -rf {}".format(STATE_DIR))


def main():
    ap = argparse.ArgumentParser(description="Instala o VPS Guardian via SSH.")
    ap.add_argument("--enable-timer", action="store_true",
                    help="ativa os timers systemd imediatamente")
    ap.add_argument("--uninstall", action="store_true", help="remove o guardian")
    ap.add_argument("--no-validate", action="store_true",
                    help="pula o ciclo de validacao")
    args = ap.parse_args()

    if not os.path.isfile(LOCAL_BIN):
        sys.exit("nao achei {}".format(LOCAL_BIN))

    c = connect()
    try:
        if args.uninstall:
            uninstall(c)
            return 0
        install(c, args.enable_timer)
        if not args.no_validate:
            validate(c)
        print("\n--- pronto ---")
        print("Comandos uteis na VPS:")
        print("  python3 {} --report     # relatorio, nao altera nada".format(REMOTE_BIN))
        print("  python3 {}              # dry-run".format(REMOTE_BIN))
        print("  python3 {} --apply      # limpeza segura".format(REMOTE_BIN))
        print("  python3 {} --history    # tendencia".format(REMOTE_BIN))
        print("  journalctl -u vps-guardian -n 50")
        return 0
    finally:
        c.close()


if __name__ == "__main__":
    sys.exit(main())
