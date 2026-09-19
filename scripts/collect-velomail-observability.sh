#!/usr/bin/env bash
# P0 / T-001 — coleta passiva e reproduzível de capacidade do VeloMail.
#
# Execute somente no host autorizado, durante uma janela de tráfego conhecida:
#   bash scripts/collect-velomail-observability.sh --duration 900 --interval 30 \
#     --label normal-traffic > velomail-observability-$(date -u +%Y%m%dT%H%M%SZ).tsv
#
# O script não faz requests HTTP, não acessa ENV, não executa SQL, não altera
# containers, serviços, imagens, volumes, logs ou arquivos. A única saída é stdout.

set -euo pipefail

API_CONTAINER="${API_CONTAINER:-ultrazend-api}"
DB_CONTAINER="${DB_CONTAINER:-ultrazend-postgres}"
DURATION_SECONDS=900
INTERVAL_SECONDS=30
LABEL="unspecified"

usage() {
  cat <<'EOF'
Uso: collect-velomail-observability.sh [opções]

  --duration SEGUNDOS   Duração da janela (padrão: 900)
  --interval SEGUNDOS   Intervalo entre amostras (padrão: 30)
  --label TEXTO         Contexto da janela, por exemplo normal-traffic ou deploy-observed
  --help                Exibe esta ajuda

Saída: TSV em stdout. Redirecione para um arquivo novo fora do repositório ou
para um diretório de evidência aprovado. O script não cria arquivos por conta própria.
EOF
}

positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

while (($#)); do
  case "$1" in
    --duration) DURATION_SECONDS="${2:-}"; shift 2 ;;
    --interval) INTERVAL_SECONDS="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) printf 'Argumento desconhecido: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

if ! positive_integer "$DURATION_SECONDS" || ! positive_integer "$INTERVAL_SECONDS"; then
  printf 'Duração e intervalo devem ser inteiros positivos.\n' >&2
  exit 2
fi
if (( INTERVAL_SECONDS > DURATION_SECONDS )); then
  printf 'O intervalo não pode ser maior que a duração.\n' >&2
  exit 2
fi
if [[ -z "$LABEL" || "$LABEL" == *$'\t'* || "$LABEL" == *$'\n'* ]]; then
  printf 'O label deve ser não vazio e não pode conter tabulação ou quebra de linha.\n' >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker não está disponível neste host.\n' >&2
  exit 3
fi
for container in "$API_CONTAINER" "$DB_CONTAINER"; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    printf 'Container não encontrado ou inacessível: %s\n' "$container" >&2
    exit 3
  fi
done

sanitize() {
  tr '\t\n\r' '   '
}

emit() {
  local timestamp="$1" scope="$2" metric="$3" value="$4" unit="$5"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$timestamp" "$LABEL" "$scope" "$metric" "$value" "$unit"
}

emit_file_metric() {
  local timestamp="$1" scope="$2" metric="$3" path="$4" unit="$5"
  if [[ -r "$path" ]]; then
    emit "$timestamp" "$scope" "$metric" "$(<"$path")" "$unit"
  else
    emit "$timestamp" "$scope" "$metric" "NOT_MEASURED" "$unit"
  fi
}

emit_cgroup_metrics() {
  local timestamp="$1" container="$2" metric line key value
  # `docker exec` roda somente `cat` nos pseudoarquivos cgroup do container.
  # Não lê variáveis de ambiente nem chama a aplicação/banco.
  while IFS= read -r line; do
    key="${line%% *}"
    value="${line#* }"
    [[ "$key" == "$line" ]] && continue
    case "$key" in
      memory_current|memory_peak)
        emit "$timestamp" "$container" "cgroup_${key}" "$value" "bytes"
        ;;
      max|oom|oom_kill|nr_periods|nr_throttled|throttled_usec|usage_usec|user_usec|system_usec)
        emit "$timestamp" "$container" "cgroup_${key}" "$value" "counter"
        ;;
    esac
  done < <(docker exec "$container" sh -c '
    if [ -r /sys/fs/cgroup/memory.current ]; then
      printf "memory_current %s\\n" "$(cat /sys/fs/cgroup/memory.current)"
    else
      printf "memory_current NOT_MEASURED\\n"
    fi
    if [ -r /sys/fs/cgroup/memory.peak ]; then
      printf "memory_peak %s\\n" "$(cat /sys/fs/cgroup/memory.peak)"
    else
      printf "memory_peak NOT_MEASURED\\n"
    fi
    cat /sys/fs/cgroup/memory.events /sys/fs/cgroup/cpu.stat 2>/dev/null
  ' 2>/dev/null | awk '!seen[$1]++' || true)
}

emit_container_stats() {
  local timestamp="$1" line name cpu mem mem_pct net block pids
  while IFS='|' read -r name cpu mem mem_pct net block pids; do
    [[ -z "$name" ]] && continue
    emit "$timestamp" "$name" "docker_cpu_percent" "$cpu" "percent"
    emit "$timestamp" "$name" "docker_memory_usage_limit" "$mem" "reported"
    emit "$timestamp" "$name" "docker_memory_percent" "$mem_pct" "percent"
    emit "$timestamp" "$name" "docker_network_io" "$net" "reported"
    emit "$timestamp" "$name" "docker_block_io" "$block" "reported"
    emit "$timestamp" "$name" "docker_pids" "$pids" "count"
  done < <(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}' "$API_CONTAINER" "$DB_CONTAINER")
}

emit_declared_container_limits() {
  local timestamp="$1" container="$2" memory reservation nano_cpus pids
  # HostConfig contém somente os limites declarados pelo runtime Docker; não
  # expõe ENV, mounts, argumentos ou dados da aplicação. Zero/nulo significa
  # "não declarado" e não deve ser confundido com consumo/reserva efetivos.
  IFS='|' read -r memory reservation nano_cpus pids < <(
    docker inspect --format '{{.HostConfig.Memory}}|{{.HostConfig.MemoryReservation}}|{{.HostConfig.NanoCPUs}}|{{.HostConfig.PidsLimit}}' "$container"
  )
  emit "$timestamp" "$container" "docker_declared_memory_limit" "${memory:-NOT_MEASURED}" "bytes"
  emit "$timestamp" "$container" "docker_declared_memory_reservation" "${reservation:-NOT_MEASURED}" "bytes"
  emit "$timestamp" "$container" "docker_declared_nano_cpus" "${nano_cpus:-NOT_MEASURED}" "nanocpus"
  emit "$timestamp" "$container" "docker_declared_pids_limit" "${pids:-NOT_MEASURED}" "count"
}

emit_docker_disk_summary() {
  local timestamp="$1" type size reclaimable metric_type
  # Tamanhos de `docker system df` são lógicos/compartilhados e não equivalem
  # automaticamente a espaço físico recuperável. São emitidos como reportados
  # para que a análise não os trate como bytes de filesystem.
  while IFS='|' read -r type size reclaimable; do
    [[ -z "$type" ]] && continue
    metric_type="$(printf '%s' "$type" | tr '[:upper:] ' '[:lower:]_')"
    emit "$timestamp" docker "docker_${metric_type}_size" "$size" "reported"
    emit "$timestamp" docker "docker_${metric_type}_reclaimable" "$reclaimable" "reported"
  done < <(docker system df --format '{{.Type}}|{{.Size}}|{{.Reclaimable}}')
}

emit_docker_data_root_disk() {
  local timestamp="$1" data_root usage available
  data_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  if [[ -z "$data_root" || ! -d "$data_root" ]]; then
    emit "$timestamp" docker "data_root_disk_used" "NOT_MEASURED" "percent"
    emit "$timestamp" docker "data_root_disk_available" "NOT_MEASURED" "bytes"
    return
  fi
  usage="$(df -P "$data_root" | awk 'NR == 2 {print $5}')"
  available="$(df -PB1 "$data_root" | awk 'NR == 2 {print $4}')"
  emit "$timestamp" docker "data_root_disk_used" "${usage:-NOT_MEASURED}" "percent"
  emit "$timestamp" docker "data_root_disk_available" "${available:-NOT_MEASURED}" "bytes"
}

emit_network_counters() {
  local timestamp="$1" container="$2" line direction value
  # Contadores por interface, sem conexão, payload ou endpoint de aplicação.
  while IFS=' ' read -r direction value; do
    case "$direction" in
      rx|tx)
        emit "$timestamp" "$container" "network_${direction}_bytes" "$value" "bytes"
        ;;
    esac
  done < <(docker exec "$container" sh -c '
    for direction in rx tx; do
      path="/sys/class/net/eth0/statistics/${direction}_bytes"
      if [ -r "$path" ]; then
        printf "%s %s\\n" "$direction" "$(cat "$path")"
      else
        printf "%s NOT_MEASURED\\n" "$direction"
      fi
    done
  ' 2>/dev/null || true)
}

emit_process_rss() {
  local timestamp="$1" container="$2" line metric value
  # Soma VmRSS somente de processos Node/PostgreSQL dentro do container. Isso
  # diferencia RSS de heap/cgroup e não lê argumentos, ENV ou payloads.
  while IFS=' ' read -r metric value; do
    [[ "$metric" == "process_rss_bytes" ]] || continue
    emit "$timestamp" "$container" "$metric" "$value" "bytes"
  done < <(docker exec "$container" sh -c '
    total_kb=0
    found=0
    for proc in /proc/[0-9]*; do
      [ -r "$proc/comm" ] || continue
      comm="$(cat "$proc/comm" 2>/dev/null || true)"
      case "$comm" in
        node|postgres)
          rss_kb="$(grep "^VmRSS:" "$proc/status" 2>/dev/null | tr -s " " | cut -d " " -f2 || true)"
          case "$rss_kb" in
            ""|*[!0-9]*) ;;
            *) total_kb=$((total_kb + rss_kb)); found=1 ;;
          esac
          ;;
      esac
    done
    if [ "$found" -eq 1 ]; then
      printf "process_rss_bytes %s\\n" "$((total_kb * 1024))"
    else
      printf "process_rss_bytes NOT_MEASURED\\n"
    fi
  ' 2>/dev/null || true)
}

emit_host_cpu_counters() {
  local timestamp="$1" cpu_label user nice system idle iowait irq softirq steal guest guest_nice
  read -r cpu_label user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
  emit "$timestamp" host "cpu_user_jiffies" "${user:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_nice_jiffies" "${nice:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_system_jiffies" "${system:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_idle_jiffies" "${idle:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_iowait_jiffies" "${iowait:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_irq_jiffies" "${irq:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_softirq_jiffies" "${softirq:-NOT_MEASURED}" "jiffies"
  emit "$timestamp" host "cpu_steal_jiffies" "${steal:-NOT_MEASURED}" "jiffies"
}

collect_once() {
  local timestamp load memory_total memory_used memory_available memory_cache memory_swap_used disk_use disk_available inode_use psi_memory psi_io
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  load="$(awk '{print $1 "/" $2 "/" $3}' /proc/loadavg)"
  memory_total="$(free -b | awk '/^Mem:/ {print $2}')"
  memory_used="$(free -b | awk '/^Mem:/ {print $3}')"
  memory_available="$(awk '/MemAvailable:/ {print $2 * 1024}' /proc/meminfo)"
  memory_cache="$(free -b | awk '/^Mem:/ {print $6}')"
  memory_swap_used="$(free -b | awk '/^Swap:/ {print $3}')"
  disk_use="$(df -P / | awk 'NR == 2 {print $5}')"
  disk_available="$(df -PB1 / | awk 'NR == 2 {print $4}')"
  inode_use="$(df -Pi / | awk 'NR == 2 {print $5}')"
  psi_memory="$(awk '/^some / {print $2}' /proc/pressure/memory 2>/dev/null || printf NOT_MEASURED)"
  psi_io="$(awk '/^some / {print $2}' /proc/pressure/io 2>/dev/null || printf NOT_MEASURED)"

  emit "$timestamp" host "load_1_5_15" "$load" "load"
  emit "$timestamp" host "memory_total" "$memory_total" "bytes"
  emit "$timestamp" host "memory_used" "$memory_used" "bytes"
  emit "$timestamp" host "memory_available" "$memory_available" "bytes"
  emit "$timestamp" host "memory_cache" "$memory_cache" "bytes"
  emit "$timestamp" host "swap_used" "$memory_swap_used" "bytes"
  emit "$timestamp" host "root_disk_used" "$disk_use" "percent"
  emit "$timestamp" host "root_disk_available" "$disk_available" "bytes"
  emit "$timestamp" host "root_inode_used" "$inode_use" "percent"
  emit "$timestamp" host "psi_memory_some_avg10" "$psi_memory" "ratio"
  emit "$timestamp" host "psi_io_some_avg10" "$psi_io" "ratio"
  emit_host_cpu_counters "$timestamp"
  emit_docker_disk_summary "$timestamp"
  emit_docker_data_root_disk "$timestamp"
  emit_container_stats "$timestamp"
  emit_declared_container_limits "$timestamp" "$API_CONTAINER"
  emit_declared_container_limits "$timestamp" "$DB_CONTAINER"
  emit_cgroup_metrics "$timestamp" "$API_CONTAINER"
  emit_cgroup_metrics "$timestamp" "$DB_CONTAINER"
  emit_network_counters "$timestamp" "$API_CONTAINER"
  emit_network_counters "$timestamp" "$DB_CONTAINER"
  emit_process_rss "$timestamp" "$API_CONTAINER"
  emit_process_rss "$timestamp" "$DB_CONTAINER"
}

printf 'timestamp_utc\tlabel\tscope\tmetric\tvalue\tunit\n'
end_epoch=$(( $(date +%s) + DURATION_SECONDS ))
while :; do
  collect_once
  if (( $(date +%s) >= end_epoch )); then
    break
  fi
  sleep "$INTERVAL_SECONDS"
done
