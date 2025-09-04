#!/bin/bash

# =============================================================================
# 🚀 ULTRAZEND SMTP MONITORING SCRIPT
# Monitora a saúde do servidor SMTP UltraZend e envia alertas
# =============================================================================

# Configurações
API_URL="http://localhost:3001"
ALERT_WEBHOOK="${ALERT_WEBHOOK_URL:-}"  # URL para alertas (Slack, Discord, etc.)
LOG_FILE="/var/log/ultrazend/monitor.log"
HEALTH_CHECK_TIMEOUT=30
EMAIL_QUEUE_THRESHOLD=100
FAILED_EMAIL_THRESHOLD=50

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função de log
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

# Função para enviar alertas
send_alert() {
    local severity="$1"
    local title="$2" 
    local message="$3"
    
    log "ALERT" "[$severity] $title: $message"
    
    if [[ -n "$ALERT_WEBHOOK" ]]; then
        local emoji="🚨"
        case "$severity" in
            "CRITICAL") emoji="🚨" ;;
            "WARNING") emoji="⚠️" ;;
            "INFO") emoji="ℹ️" ;;
        esac
        
        local payload=$(cat <<EOF
{
    "text": "$emoji UltraZend SMTP Alert",
    "attachments": [
        {
            "color": "$([[ "$severity" == "CRITICAL" ]] && echo "danger" || echo "warning")",
            "title": "$title",
            "text": "$message",
            "footer": "UltraZend SMTP Monitor",
            "ts": $(date +%s)
        }
    ]
}
EOF
)
        
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "$payload" >/dev/null 2>&1
    fi
}

# Verificar se a API está respondendo
check_api_health() {
    log "INFO" "Checking UltraZend API health..."
    
    local response=$(curl -s -w "%{http_code}" --max-time $HEALTH_CHECK_TIMEOUT "$API_URL/monitoring/health")
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        log "SUCCESS" "API health check passed"
        echo "$body"
        return 0
    else
        log "ERROR" "API health check failed - HTTP $http_code"
        send_alert "CRITICAL" "UltraZend API Down" "API health check failed with HTTP code $http_code"
        return 1
    fi
}

# Verificar status das filas
check_queue_health() {
    log "INFO" "Checking queue health..."
    
    local response=$(curl -s --max-time $HEALTH_CHECK_TIMEOUT "$API_URL/monitoring/queue-status")
    
    if [[ -z "$response" ]]; then
        send_alert "CRITICAL" "Queue Status Unavailable" "Unable to get queue status from API"
        return 1
    fi
    
    # Parse JSON response (básico - assumindo que jq está disponível)
    if command -v jq >/dev/null 2>&1; then
        local email_waiting=$(echo "$response" | jq -r '.queues.email.waiting // 0')
        local email_failed=$(echo "$response" | jq -r '.queues.email.failed // 0')
        local healthy=$(echo "$response" | jq -r '.healthy // false')
        
        log "INFO" "Queue stats - Waiting: $email_waiting, Failed: $email_failed, Healthy: $healthy"
        
        # Alertas baseados em thresholds
        if [[ "$email_waiting" -gt "$EMAIL_QUEUE_THRESHOLD" ]]; then
            send_alert "WARNING" "High Email Queue" "Email queue has $email_waiting pending emails (threshold: $EMAIL_QUEUE_THRESHOLD)"
        fi
        
        if [[ "$email_failed" -gt "$FAILED_EMAIL_THRESHOLD" ]]; then
            send_alert "CRITICAL" "High Email Failures" "Too many failed emails: $email_failed (threshold: $FAILED_EMAIL_THRESHOLD)"
        fi
        
        if [[ "$healthy" == "false" ]]; then
            send_alert "CRITICAL" "Queue Unhealthy" "Email queue system is reporting unhealthy status"
            return 1
        fi
    else
        log "WARNING" "jq not available - skipping detailed queue analysis"
    fi
    
    return 0
}

# Verificar métricas de entrega
check_delivery_metrics() {
    log "INFO" "Checking delivery metrics..."
    
    local response=$(curl -s --max-time $HEALTH_CHECK_TIMEOUT "$API_URL/monitoring/delivery-stats?range=1h")
    
    if [[ -n "$response" ]] && command -v jq >/dev/null 2>&1; then
        local total=$(echo "$response" | jq -r '.summary.total // 0')
        local delivery_rate=$(echo "$response" | jq -r '.summary.delivery_rate // "0%"')
        local failure_rate=$(echo "$response" | jq -r '.summary.failure_rate // "0%"')
        
        log "INFO" "Delivery metrics (1h) - Total: $total, Success rate: $delivery_rate, Failure rate: $failure_rate"
        
        # Alertar se taxa de falha for muito alta
        local failure_num=$(echo "$failure_rate" | sed 's/%//')
        if (( $(echo "$failure_num > 10" | bc -l) 2>/dev/null || [[ "${failure_num%.*}" -gt 10 ]] )); then
            send_alert "WARNING" "High Failure Rate" "Email failure rate is $failure_rate in the last hour"
        fi
    fi
}

# Verificar processos PM2
check_pm2_processes() {
    log "INFO" "Checking PM2 processes..."
    
    if ! command -v pm2 >/dev/null 2>&1; then
        log "WARNING" "PM2 not available - skipping process check"
        return 0
    fi
    
    local pm2_status=$(pm2 jlist 2>/dev/null)
    
    if [[ -z "$pm2_status" ]]; then
        send_alert "CRITICAL" "PM2 Process Check Failed" "Unable to get PM2 process status"
        return 1
    fi
    
    # Verificar se processos UltraZend estão rodando
    local ultrazend_processes=$(echo "$pm2_status" | jq -r '.[] | select(.name | startswith("ultrazend")) | .pm2_env.status' 2>/dev/null | wc -l)
    
    if [[ "$ultrazend_processes" -eq 0 ]]; then
        send_alert "CRITICAL" "No UltraZend Processes Running" "No UltraZend processes found in PM2"
        return 1
    fi
    
    # Verificar processos com erro
    local error_processes=$(echo "$pm2_status" | jq -r '.[] | select(.name | startswith("ultrazend")) | select(.pm2_env.status != "online") | .name' 2>/dev/null)
    
    if [[ -n "$error_processes" ]]; then
        send_alert "WARNING" "UltraZend Process Issues" "Processes with issues: $error_processes"
    else
        log "SUCCESS" "All UltraZend processes are running normally"
    fi
}

# Verificar espaço em disco
check_disk_space() {
    log "INFO" "Checking disk space..."
    
    local disk_usage=$(df /var/www/ultrazend 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [[ -n "$disk_usage" ]]; then
        log "INFO" "Disk usage: ${disk_usage}%"
        
        if [[ "$disk_usage" -gt 90 ]]; then
            send_alert "CRITICAL" "Low Disk Space" "Disk usage is ${disk_usage}% - running out of space"
        elif [[ "$disk_usage" -gt 80 ]]; then
            send_alert "WARNING" "High Disk Usage" "Disk usage is ${disk_usage}% - consider cleanup"
        fi
    fi
}

# Verificar logs de erro recentes
check_error_logs() {
    log "INFO" "Checking for recent errors..."
    
    local error_count=0
    local log_files=(
        "/var/www/ultrazend/logs/ultrazend-api-error.log"
        "/var/www/ultrazend/logs/ultrazend-email-worker-error.log"
        "/var/www/ultrazend/logs/ultrazend-queue-processor-error.log"
    )
    
    for log_file in "${log_files[@]}"; do
        if [[ -f "$log_file" ]]; then
            # Contar erros nas últimas 10 linhas
            local recent_errors=$(tail -10 "$log_file" 2>/dev/null | grep -i error | wc -l)
            error_count=$((error_count + recent_errors))
        fi
    done
    
    if [[ "$error_count" -gt 5 ]]; then
        send_alert "WARNING" "Multiple Recent Errors" "Found $error_count errors in recent logs"
    fi
}

# Função principal de monitoramento
main_monitor() {
    log "INFO" "🚀 Starting UltraZend SMTP monitoring check..."
    
    local checks_passed=0
    local total_checks=6
    
    # Executar todas as verificações
    if check_api_health >/dev/null; then
        ((checks_passed++))
    fi
    
    if check_queue_health; then
        ((checks_passed++))
    fi
    
    if check_delivery_metrics; then
        ((checks_passed++))
    fi
    
    if check_pm2_processes; then
        ((checks_passed++))
    fi
    
    if check_disk_space; then
        ((checks_passed++))
    fi
    
    if check_error_logs; then
        ((checks_passed++))
    fi
    
    # Relatório final
    log "INFO" "Monitoring check completed - $checks_passed/$total_checks checks passed"
    
    if [[ "$checks_passed" -eq "$total_checks" ]]; then
        log "SUCCESS" "✅ All UltraZend SMTP systems healthy"
    elif [[ "$checks_passed" -lt 3 ]]; then
        send_alert "CRITICAL" "Multiple System Failures" "Only $checks_passed/$total_checks checks passed - system may be in critical state"
        exit 1
    else
        log "WARNING" "⚠️ Some issues detected but system is operational"
    fi
}

# Criar diretório de logs se não existir
mkdir -p "$(dirname "$LOG_FILE")"

# Executar baseado no argumento
case "${1:-monitor}" in
    "monitor")
        main_monitor
        ;;
    "health")
        check_api_health
        ;;
    "queue")
        check_queue_health
        ;;
    "processes")
        check_pm2_processes
        ;;
    "disk")
        check_disk_space
        ;;
    *)
        echo "Usage: $0 [monitor|health|queue|processes|disk]"
        echo "  monitor   - Run full monitoring check (default)"
        echo "  health    - Check API health only"
        echo "  queue     - Check queue status only"
        echo "  processes - Check PM2 processes only"
        echo "  disk      - Check disk space only"
        exit 1
        ;;
esac