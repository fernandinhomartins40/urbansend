#!/usr/bin/env python3
"""
VPS GUARDIAN -- vigilancia continua e limpeza segura de uma VPS multi-projeto.

Evolucao do vps-maintenance.py. Diferencas principais:

  * Mantem ESTADO entre execucoes (/var/lib/vps-guardian/state.json), o que
    permite detectar CRESCIMENTO -- lixo novo aparecendo -- e nao so o estado
    absoluto num instante.
  * Age por LIMIAR: em disco normal faz o basico; conforme o disco sobe, libera
    progressivamente operacoes mais fortes (sempre dentro do que e reconstruivel).
  * Modo --watch: roda em loop como daemon systemd, verificando periodicamente.
  * Relatorio historico: guarda as ultimas N execucoes para mostrar tendencia.

FILOSOFIA DE SEGURANCA -- a regra que governa todo o arquivo:

    REMOVE apenas o que pode ser reconstruido a partir do codigo-fonte.
    RELATA tudo o que e dado.

O que e reconstruivel: imagem dangling, build cache, log rotacionado, container
parado (o compose recria). O que NAO e: volume, banco, upload, backup.

Travas:
  1. Dry-run por padrao; so age com --apply.
  2. NUNCA remove volumes. Nao existe 'docker volume rm' neste arquivo.
  3. NUNCA remove container em estado running.
  4. Sem 'prune -a' e sem 'rm -rf'. Cada operacao e explicita e filtrada.
  5. Allowlist de comandos: qualquer comando fora da lista e recusado em runtime.
  6. Idade minima por categoria.
  7. Lock file com deteccao de processo morto.
  8. Log auditavel separando FEITO de RELATADO.
  9. Em disco critico, ALERTA -- nunca escala para remover dados.

Uso:
    vps-guardian.py --report          # so relatorio
    vps-guardian.py                   # dry-run
    vps-guardian.py --apply           # executa limpeza segura
    vps-guardian.py --watch --apply   # daemon: vigia e limpa quando precisa
    vps-guardian.py --history         # tendencia das ultimas execucoes
"""

import argparse
import errno
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

VERSION = "2.0"

# --------------------------------------------------------------------------
# Configuracao
# --------------------------------------------------------------------------

STATE_DIR = "/var/lib/vps-guardian"
STATE_FILE = os.path.join(STATE_DIR, "state.json")
LOCK_FILE = "/var/run/vps-guardian.lock"
LOG_FILE = "/var/log/vps-guardian.log"

HISTORY_MAX = 60          # execucoes guardadas
LOCK_STALE_SECONDS = 6 * 3600

# Limiares de disco (%) que liberam acoes progressivamente.
DISK_OK = 70
DISK_WARN = 80
DISK_HIGH = 88
DISK_CRIT = 93

# Idades minimas
EXITED_MIN_AGE_DAYS = 7
BUILD_CACHE_AGE_H_NORMAL = 168     # 7 dias
BUILD_CACHE_AGE_H_AGGRESSIVE = 48  # disco alto
CONTAINER_LOG_MAX_MB = 100
CONTAINER_LOG_MAX_MB_AGGRESSIVE = 50
JOURNAL_SIZE_NORMAL = "200M"
JOURNAL_SIZE_AGGRESSIVE = "100M"

# Intervalo do modo --watch
WATCH_INTERVAL_SECONDS = 3600

# Crescimento que dispara alerta entre duas execucoes
GROWTH_ALERT_PCT = 3        # disco subiu N pontos percentuais
GROWTH_ALERT_CONTAINERS = 5  # N containers novos

PROTECTED_PROJECTS = set()
PROTECTED_CONTAINERS = set()

DOCKER_TIMEOUT = 300

# Allowlist: prefixos de comando permitidos. Defesa em profundidade -- mesmo que
# alguem edite uma string de comando, execucao fora desta lista e recusada.
ALLOWED_PREFIXES = (
    "df ", "docker ps", "docker images", "docker image prune",
    "docker builder prune", "docker inspect", "docker rm ", "docker system df",
    "docker volume ls", "journalctl ", "find /var/lib/docker/containers",
    "truncate -s 0 ", "stat ", "ls ", "cat /proc/",
)

# Padroes que jamais podem aparecer num comando, mesmo dentro da allowlist.
FORBIDDEN_PATTERNS = (
    "volume rm", "volume prune", "prune -a", "--volumes", "rm -rf",
    "mkfs", "dd if=", "> /dev/sd", "shutdown", "reboot",
)


# --------------------------------------------------------------------------
# Log
# --------------------------------------------------------------------------

_logfh = None


def log(msg, level="INFO"):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    line = "[{}] {:8} {}".format(ts, level + ":", msg)
    print(line, flush=True)
    global _logfh
    if _logfh:
        try:
            _logfh.write(line + "\n")
            _logfh.flush()
        except (OSError, ValueError):
            pass


def open_logfile():
    global _logfh
    try:
        _logfh = open(LOG_FILE, "a", encoding="utf-8")
    except OSError:
        _logfh = None  # sem permissao: segue so com stdout


class Report:
    def __init__(self):
        self.done, self.would, self.alerts, self.errors = [], [], [], []

    def did(self, m):
        self.done.append(m); log(m, "FEITO")

    def would_do(self, m):
        self.would.append(m); log(m, "FARIA")

    def alert(self, m):
        self.alerts.append(m); log(m, "ALERTA")

    def error(self, m):
        self.errors.append(m); log(m, "ERRO")


# --------------------------------------------------------------------------
# Execucao de comandos, com allowlist
# --------------------------------------------------------------------------

def run(cmd, timeout=DOCKER_TIMEOUT):
    """Executa comando shell validado. Retorna (rc, stdout, stderr)."""
    for bad in FORBIDDEN_PATTERNS:
        if bad in cmd:
            return 126, "", "RECUSADO: padrao proibido '{}' em: {}".format(bad, cmd)
    if not any(cmd.startswith(p) or cmd.lstrip("(").startswith(p)
               for p in ALLOWED_PREFIXES):
        return 126, "", "RECUSADO: comando fora da allowlist: {}".format(cmd[:80])
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True,
                           text=True, timeout=timeout)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, "", "timeout apos {}s".format(timeout)
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)


# --------------------------------------------------------------------------
# Lock
# --------------------------------------------------------------------------

def _pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError as e:
        return e.errno == errno.EPERM
    except (ValueError, TypeError):
        return False


def acquire_lock():
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE) as f:
                old = int((f.read() or "0").strip() or 0)
            age = time.time() - os.path.getmtime(LOCK_FILE)
            if old and _pid_alive(old) and age < LOCK_STALE_SECONDS:
                log("outra execucao viva (pid {}, {:.0f}s). Saindo.".format(old, age))
                return False
            log("lock orfao (pid {}, {:.0f}s). Assumindo.".format(old, age))
        except (OSError, ValueError):
            pass
    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(os.getpid()))
        return True
    except OSError as e:
        log("sem lock ({}); prosseguindo".format(e), "AVISO")
        return True


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except OSError:
        pass


# --------------------------------------------------------------------------
# Estado persistente
# --------------------------------------------------------------------------

def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"version": VERSION, "history": []}


def save_state(state):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        state["history"] = state.get("history", [])[-HISTORY_MAX:]
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, STATE_FILE)  # atomico
    except OSError as e:
        log("nao consegui salvar estado: {}".format(e), "AVISO")


# --------------------------------------------------------------------------
# Coleta
# --------------------------------------------------------------------------

def disk_pct():
    rc, out, _ = run("df --output=pcent / | tail -1", timeout=30)
    if rc != 0:
        return None
    try:
        return int(out.strip().rstrip("%"))
    except ValueError:
        return None


def docker_df():
    """Tamanhos por tipo. Retorna dict ou None se o daemon nao responder."""
    rc, out, _ = run("docker system df --format '{{.Type}}|{{.TotalCount}}|"
                     "{{.Size}}|{{.Reclaimable}}'", timeout=200)
    if rc != 0 or not out:
        return None
    d = {}
    for line in out.splitlines():
        p = line.split("|")
        if len(p) >= 4:
            d[p[0]] = {"count": p[1], "size": p[2], "reclaimable": p[3]}
    return d


def list_containers():
    fmt = ('{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Image}}\t'
           '{{.Label "com.docker.compose.project"}}\t'
           '{{.Label "com.docker.compose.project.working_dir"}}')
    rc, out, err = run("docker ps -a --format '{}'".format(fmt))
    if rc != 0:
        return None, "docker ps falhou: {}".format(err or "timeout")
    items = []
    for line in out.splitlines():
        p = (line.split("\t") + [""] * 6)[:6]
        items.append(dict(zip(
            ("name", "state", "status", "image", "project", "workdir"), p)))
    return items, None


def exited_age_days(name):
    rc, out, _ = run("docker inspect -f '{{.State.FinishedAt}}' " + name, timeout=60)
    if rc != 0 or not out or out.startswith("0001"):
        return None
    try:
        ts = out.strip().replace("Z", "+00:00")
        m = re.match(r"^(.*?)\.(\d+)(.*)$", ts)
        if m:
            ts = "{}.{}{}".format(m.group(1), m.group(2)[:6], m.group(3) or "+00:00")
        return (datetime.now(timezone.utc)
                - datetime.fromisoformat(ts)).total_seconds() / 86400.0
    except (ValueError, TypeError):
        return None


# --------------------------------------------------------------------------
# Deteccao -- sempre relata, nunca remove
# --------------------------------------------------------------------------

_RELEASE_PROJECT_RE = re.compile(r"^[0-9a-f]{7}-\d{14}$")


def detect_release_orphans(rep, containers):
    """Dois casos distintos, com gravidades diferentes:

    A) release APAGADA e container ainda rodando -> bomba-relogio: se o container
       cair, nao sobe (o compose que o define nao existe mais).
    B) projeto compose e um hash de release -> deploy nao derrubou a versao velha.
    """
    gone, hashed = [], []
    for c in containers:
        if c["state"] != "running":
            continue
        wd = c["workdir"]
        if not wd or "/releases/" not in wd:
            continue
        if not os.path.isdir(wd):
            gone.append(c)
        elif _RELEASE_PROJECT_RE.match(c["project"] or ""):
            hashed.append(c)

    if gone:
        rep.alert("=== {} CONTAINERS RODANDO COM A RELEASE APAGADA DO DISCO ==="
                  .format(len(gone)))
        rep.alert("CRITICO: estao vivos so porque nunca reiniciaram. Se cairem, "
                  "NAO sobem -- o compose que os define nao existe mais.")
        for c in gone:
            rep.alert("  {} {} | {} | {}".format(
                "[BANCO!]" if _is_data(c["image"]) else "        ",
                c["name"], c["image"], c["status"]))

    if hashed:
        rep.alert("=== {} CONTAINERS DE RELEASES ANTIGAS AINDA RODANDO ==="
                  .format(len(hashed)))
        rep.alert("O deploy criou release nova sem derrubar a anterior.")
        for c in hashed:
            rep.alert("  {} {} | {} | {}".format(
                "[BANCO!]" if _is_data(c["image"]) else "        ",
                c["name"], c["image"], c["status"]))

    if not gone and not hashed:
        log("nenhum orfao de release detectado.")
    return len(gone) + len(hashed)


def _is_data(image):
    return any(k in (image or "").lower()
               for k in ("postgres", "mysql", "mongo", "redis", "maria", "minio"))


def detect_dangling_volumes(rep):
    """SO relata. Ver filosofia no topo do arquivo."""
    rc, out, _ = run("docker volume ls -qf dangling=true")
    if rc != 0:
        rep.error("nao consegui listar volumes dangling")
        return 0
    vols = [v for v in out.splitlines() if v.strip()]
    if not vols:
        log("nenhum volume dangling.")
        return 0
    rep.alert("=== {} VOLUMES DANGLING (NUNCA REMOVIDOS AUTOMATICAMENTE) ==="
              .format(len(vols)))
    rep.alert("'Dangling' = nenhum container EXISTENTE usa. Nao significa lixo: "
              "se voce deu 'compose down' num projeto ativo, o banco dele esta aqui.")
    for v in vols:
        rep.alert("  {} {}".format(
            "[DADOS?]" if any(k in v.lower() for k in
                              ("db", "data", "postgres", "mysql", "upload", "storage"))
            else "        ", v))
    rep.alert("Inspecionar: docker run --rm -v <vol>:/v alpine ls -la /v")
    return len(vols)


def detect_unhealthy(rep, containers):
    un = [c for c in containers if "unhealthy" in c["status"].lower()]
    if not un:
        return 0
    rep.alert("=== {} CONTAINERS UNHEALTHY ===".format(len(un)))
    rep.alert("Sob CPU/IO saturados healthchecks expiram por timeout: muitos sao "
              "falso positivo, e o retry consome ainda mais CPU.")
    for c in un[:15]:
        rep.alert("  {} | {}".format(c["name"], c["image"]))
    if len(un) > 15:
        rep.alert("  ... e mais {}".format(len(un) - 15))
    return len(un)


def detect_crash_loops(rep, containers):
    """Container parado com exit code != 0 e bug, nao lixo. 137 = OOM killer."""
    n = 0
    for c in containers:
        if c["state"] != "exited":
            continue
        m = re.search(r"Exited \((\d+)\)", c["status"])
        if not m or m.group(1) == "0":
            continue
        code = m.group(1)
        why = " (OOM killer -- ficou sem memoria)" if code == "137" else ""
        rep.alert("container morreu com exit {}{}: {} [{}]".format(
            code, why, c["name"], c["status"]))
        n += 1
    return n


def detect_growth(rep, state, snapshot):
    """Compara com a execucao anterior. E aqui que 'vigilancia' se distingue de
    'limpeza pontual': lixo que volta a crescer indica causa nao corrigida."""
    hist = state.get("history", [])
    if not hist:
        log("primeira execucao: sem baseline para comparar.")
        return
    prev = hist[-1]
    pd, cd = prev.get("disk_pct"), snapshot.get("disk_pct")
    if isinstance(pd, int) and isinstance(cd, int):
        delta = cd - pd
        if delta >= GROWTH_ALERT_PCT:
            rep.alert("DISCO CRESCEU {} pontos desde a ultima verificacao "
                      "({}% -> {}%). Algo esta gerando lixo continuamente."
                      .format(delta, pd, cd))
        elif delta <= -GROWTH_ALERT_PCT:
            log("disco caiu {} pontos ({}% -> {}%).".format(-delta, pd, cd))
    pc, cc = prev.get("containers_total"), snapshot.get("containers_total")
    if isinstance(pc, int) and isinstance(cc, int) and cc - pc >= GROWTH_ALERT_CONTAINERS:
        rep.alert("{} containers a mais desde a ultima verificacao ({} -> {}). "
                  "Deploy pode nao estar derrubando a versao anterior."
                  .format(cc - pc, pc, cc))
    po, co = prev.get("orphans"), snapshot.get("orphans")
    if isinstance(po, int) and isinstance(co, int) and co > po:
        rep.alert("orfaos de release aumentaram de {} para {}: a causa raiz "
                  "no script de deploy continua ativa.".format(po, co))


# --------------------------------------------------------------------------
# Operacoes seguras
# --------------------------------------------------------------------------

def clean_dangling_images(rep, apply):
    rc, out, _ = run("docker images -qf dangling=true")
    if rc != 0:
        rep.error("nao listei imagens dangling (daemon sem resposta)")
        return
    ids = [x for x in out.splitlines() if x.strip()]
    if not ids:
        log("nenhuma imagem dangling.")
        return
    if not apply:
        rep.would_do("remover {} imagens dangling".format(len(ids)))
        return
    rc, out, err = run("docker image prune -f", timeout=600)
    if rc == 0:
        rep.did("imagens dangling removidas ({}). {}".format(
            len(ids), out.splitlines()[-1] if out else ""))
    else:
        rep.error("image prune falhou: {}".format(err))


def clean_build_cache(rep, apply, aggressive):
    hours = BUILD_CACHE_AGE_H_AGGRESSIVE if aggressive else BUILD_CACHE_AGE_H_NORMAL
    if not apply:
        rep.would_do("podar build cache com mais de {}h".format(hours))
        return
    rc, out, err = run(
        "docker builder prune -f --filter until={}h".format(hours), timeout=900)
    if rc == 0:
        rep.did("build cache podado (>{}h). {}".format(
            hours, out.splitlines()[-1] if out else "ok"))
    else:
        rep.error("builder prune falhou: {}".format(err or "timeout"))


def clean_journal(rep, apply, aggressive):
    size = JOURNAL_SIZE_AGGRESSIVE if aggressive else JOURNAL_SIZE_NORMAL
    rc, cur, _ = run("journalctl --disk-usage", timeout=60)
    cur = cur if rc == 0 else "desconhecido"
    if not apply:
        rep.would_do("journald vacuum para {} (atual: {})".format(size, cur))
        return
    rc, _, err = run("journalctl --vacuum-size={}".format(size), timeout=300)
    if rc == 0:
        rep.did("journald reduzido para <= {} (antes: {})".format(size, cur))
    else:
        rep.error("journal vacuum falhou: {}".format(err))


def truncate_big_logs(rep, apply, aggressive):
    """Trunca preservando o inode: o daemon continua escrevendo no mesmo arquivo.
    Remover o arquivo, ao contrario, deixaria o Docker escrevendo num inode
    orfao ate reiniciar o container."""
    limit = CONTAINER_LOG_MAX_MB_AGGRESSIVE if aggressive else CONTAINER_LOG_MAX_MB
    rc, out, _ = run(
        "find /var/lib/docker/containers -name '*-json.log' -size +{}M "
        "-printf '%s\\t%p\\n' 2>/dev/null".format(limit), timeout=300)
    if rc != 0:
        rep.error("busca por logs grandes falhou/timeout")
        return
    rows = [l for l in out.splitlines() if l.strip()]
    if not rows:
        log("nenhum log de container acima de {}MB.".format(limit))
        return
    for row in rows:
        try:
            size, path = row.split("\t", 1)
            mb = int(size) / (1024 * 1024)
        except ValueError:
            continue
        if not apply:
            rep.would_do("truncar log {:.0f}MB: {}".format(mb, path))
            continue
        rc2, _, err = run("truncate -s 0 '{}'".format(path), timeout=60)
        if rc2 == 0:
            rep.did("log truncado ({:.0f}MB): {}".format(mb, path))
        else:
            rep.error("falha ao truncar {}: {}".format(path, err))


def clean_old_exited(rep, apply, containers):
    exited = [c for c in containers if c["state"] == "exited"]
    if not exited:
        log("nenhum container parado.")
        return
    for c in exited:
        name = c["name"]
        if name in PROTECTED_CONTAINERS or c["project"] in PROTECTED_PROJECTS:
            rep.alert("parado PROTEGIDO, nao tocado: {}".format(name))
            continue
        age = exited_age_days(name)
        if age is None:
            rep.alert("idade indeterminada, nao removido: {} [{}]".format(
                name, c["status"]))
            continue
        if age < EXITED_MIN_AGE_DAYS:
            log("parado ha {:.1f}d (<{}d), mantido: {}".format(
                age, EXITED_MIN_AGE_DAYS, name))
            continue
        if not apply:
            rep.would_do("remover container parado ha {:.0f}d: {}".format(age, name))
            continue
        rc, _, err = run("docker rm {}".format(name), timeout=120)
        if rc == 0:
            rep.did("container removido (parado ha {:.0f}d): {}".format(age, name))
        else:
            rep.error("falha ao remover {}: {}".format(name, err))


# --------------------------------------------------------------------------
# Ciclo
# --------------------------------------------------------------------------

def run_cycle(args):
    apply = args.apply and not args.report
    rep = Report()
    state = load_state()

    pct = disk_pct()
    aggressive = pct is not None and pct >= DISK_HIGH

    log("disco em {}%".format(pct if pct is not None else "?"))
    if pct is not None:
        if pct >= DISK_CRIT:
            rep.alert("DISCO CRITICO ({}%>={}%). A limpeza segura NAO basta: "
                      "requer decisao humana sobre dados. O guardian NAO escala "
                      "para remover dados.".format(pct, DISK_CRIT))
        elif pct >= DISK_HIGH:
            rep.alert("disco alto ({}%): modo agressivo nas operacoes reconstruiveis."
                      .format(pct))
        elif pct >= DISK_WARN:
            rep.alert("disco em {}% (limiar {}%)".format(pct, DISK_WARN))

    containers, err = list_containers()
    if err:
        rep.error(err)
        containers = []
    running = sum(1 for c in containers if c["state"] == "running")
    log("{} containers ({} running)".format(len(containers), running))

    ddf = docker_df()
    if ddf:
        for k, v in ddf.items():
            log("{}: {} itens, {}, recuperavel {}".format(
                k, v["count"], v["size"], v["reclaimable"]))
    else:
        rep.alert("docker system df nao respondeu -- daemon saturado por I/O.")

    orphans = detect_release_orphans(rep, containers) if containers else 0
    unhealthy = detect_unhealthy(rep, containers) if containers else 0
    if containers:
        detect_crash_loops(rep, containers)
    dangling_vols = detect_dangling_volumes(rep)

    snapshot = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "disk_pct": pct,
        "containers_total": len(containers),
        "containers_running": running,
        "orphans": orphans,
        "unhealthy": unhealthy,
        "dangling_volumes": dangling_vols,
        "docker_df": ddf,
        "mode": "report" if args.report else ("apply" if apply else "dryrun"),
    }
    detect_growth(rep, state, snapshot)

    if not args.report:
        clean_dangling_images(rep, apply)
        clean_build_cache(rep, apply, aggressive)
        clean_journal(rep, apply, aggressive)
        truncate_big_logs(rep, apply, aggressive)
        if containers:
            clean_old_exited(rep, apply, containers)

    pct2 = disk_pct()
    snapshot["disk_pct_after"] = pct2
    snapshot["actions_done"] = len(rep.done)
    snapshot["alerts"] = len(rep.alerts)
    state.setdefault("history", []).append(snapshot)
    save_state(state)

    log("=" * 60)
    log("RESUMO -- feito: {} | dry-run: {} | alertas: {} | erros: {}".format(
        len(rep.done), len(rep.would), len(rep.alerts), len(rep.errors)))
    if pct is not None and pct2 is not None:
        log("disco: {}% -> {}%".format(pct, pct2))
    log("volumes NUNCA sao removidos por este script.")
    log("=" * 60)
    return 1 if rep.errors else 0


def show_history():
    st = load_state()
    h = st.get("history", [])
    if not h:
        print("Sem historico ainda.")
        return 0
    print("\n{:<22} {:>6} {:>7} {:>8} {:>9} {:>8}".format(
        "QUANDO", "DISCO", "CONTAIN", "ORFAOS", "UNHEALTHY", "ACOES"))
    print("-" * 68)
    for s in h[-30:]:
        print("{:<22} {:>5}% {:>7} {:>8} {:>9} {:>8}".format(
            (s.get("ts") or "")[:19],
            s.get("disk_pct", "?"), s.get("containers_total", "?"),
            s.get("orphans", "?"), s.get("unhealthy", "?"),
            s.get("actions_done", 0)))
    print()
    return 0


_stop = False


def _handle_stop(signum, _frame):
    global _stop
    _stop = True
    log("sinal {} recebido: encerrando apos o ciclo atual.".format(signum))


def main():
    ap = argparse.ArgumentParser(
        description="VPS Guardian {}: vigilancia e limpeza segura.".format(VERSION))
    ap.add_argument("--apply", action="store_true", help="executa limpeza segura")
    ap.add_argument("--report", action="store_true", help="so relatorio")
    ap.add_argument("--watch", action="store_true", help="daemon: verifica em loop")
    ap.add_argument("--interval", type=int, default=WATCH_INTERVAL_SECONDS,
                    help="segundos entre ciclos no --watch")
    ap.add_argument("--history", action="store_true", help="mostra tendencia")
    args = ap.parse_args()

    if args.history:
        return show_history()

    open_logfile()
    mode = "RELATORIO" if args.report else ("APLICAR" if args.apply else "DRY-RUN")
    log("VPS GUARDIAN {} -- modo {}{}".format(
        VERSION, mode, " (watch)" if args.watch else ""))

    if not acquire_lock():
        return 0
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)

    try:
        if not args.watch:
            return run_cycle(args)
        while not _stop:
            try:
                run_cycle(args)
            except Exception as e:  # noqa: BLE001 -- daemon nao pode morrer
                log("ciclo falhou: {}: {}".format(type(e).__name__, e), "ERRO")
            for _ in range(args.interval):
                if _stop:
                    break
                time.sleep(1)
        log("guardian encerrado.")
        return 0
    finally:
        release_lock()


if __name__ == "__main__":
    sys.exit(main())
