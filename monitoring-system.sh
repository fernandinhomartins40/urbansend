#!/bin/bash

# 📊 ULTRAZEND - Complete Monitoring & Health Check System
# Advanced monitoring with alerts, metrics, and auto-recovery

set -euo pipefail

# Configuration
APP_NAME="ultrazend"
APP_PATH="/var/www/ultrazend"
MONITOR_PATH="/var/log/ultrazend/monitoring"
ALERT_EMAIL="admin@ultrazend.com.br"
SLACK_WEBHOOK="" # Configure if using Slack
HEALTH_URL="http://localhost:3001/health"
API_URL="http://localhost:3001/api"
WEB_URL="https://www.ultrazend.com.br"

# Thresholds
CPU_THRESHOLD=80
MEMORY_THRESHOLD=80
DISK_THRESHOLD=85
RESPONSE_TIME_THRESHOLD=5000  # milliseconds
ERROR_RATE_THRESHOLD=5        # percentage

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[MONITOR] $1${NC}"; }
success() { echo -e "${GREEN}[OK] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

# Create monitoring directories
setup_directories() {
    mkdir -p "$MONITOR_PATH"/{health,metrics,alerts,reports}
    mkdir -p /var/log/ultrazend
    touch /var/log/ultrazend/monitoring.log
}

# Health check functions
check_application_health() {
    local timestamp=$(date -Iseconds)
    local status="UNKNOWN"
    local response_time=0
    local error_message=""
    
    log "Verificando saúde da aplicação..."
    
    # Test application health endpoint
    if response=$(curl -s -w "%{time_total},%{http_code}" -m 10 "$HEALTH_URL" 2>/dev/null); then
        response_time=$(echo "$response" | tail -1 | cut -d',' -f1)
        http_code=$(echo "$response" | tail -1 | cut -d',' -f2)
        
        response_time_ms=$(echo "$response_time * 1000" | bc)
        
        if [ "$http_code" = "200" ]; then
            if [ $(echo "$response_time_ms > $RESPONSE_TIME_THRESHOLD" | bc) -eq 1 ]; then
                status="SLOW"
                error_message="Response time ${response_time_ms}ms exceeds threshold"
                warning "Aplicação respondendo lentamente: ${response_time_ms}ms"
            else
                status="HEALTHY"
                success "Aplicação saudável (${response_time_ms}ms)"
            fi
        else
            status="UNHEALTHY"
            error_message="HTTP $http_code"
            error "Aplicação retornou HTTP $http_code"
        fi
    else
        status="DOWN"
        error_message="Connection failed"
        error "Aplicação não está respondendo"
    fi
    
    # Log health status
    echo "{\"timestamp\":\"$timestamp\",\"status\":\"$status\",\"response_time_ms\":$response_time_ms,\"http_code\":\"${http_code:-0}\",\"error\":\"$error_message\"}" >> "$MONITOR_PATH/health/app-health.jsonl"
    
    echo "$status"
}

check_system_resources() {
    local timestamp=$(date -Iseconds)
    
    log "Verificando recursos do sistema..."
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
    cpu_usage=${cpu_usage:-0}
    
    # Memory usage
    local memory_info=$(free | grep Mem)
    local total_mem=$(echo $memory_info | awk '{print $2}')
    local used_mem=$(echo $memory_info | awk '{print $3}')
    local memory_usage=$(echo "scale=2; $used_mem * 100 / $total_mem" | bc)
    
    # Disk usage
    local disk_usage=$(df "$APP_PATH" | tail -1 | awk '{print $5}' | sed 's/%//')
    disk_usage=${disk_usage:-0}
    
    # Process count
    local process_count=$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .monit.cpu' | wc -l)
    
    # Log system metrics
    cat >> "$MONITOR_PATH/metrics/system-metrics.jsonl" << EOF
{"timestamp":"$timestamp","cpu_usage":$cpu_usage,"memory_usage":$memory_usage,"disk_usage":$disk_usage,"process_count":$process_count}
EOF
    
    # Check thresholds
    local alerts=()
    
    if [ $(echo "$cpu_usage > $CPU_THRESHOLD" | bc) -eq 1 ]; then
        alerts+=("CPU usage high: ${cpu_usage}%")
        warning "CPU usage alto: ${cpu_usage}%"
    fi
    
    if [ $(echo "$memory_usage > $MEMORY_THRESHOLD" | bc) -eq 1 ]; then
        alerts+=("Memory usage high: ${memory_usage}%")
        warning "Uso de memória alto: ${memory_usage}%"
    fi
    
    if [ $disk_usage -gt $DISK_THRESHOLD ]; then
        alerts+=("Disk usage high: ${disk_usage}%")
        warning "Uso de disco alto: ${disk_usage}%"
    fi
    
    if [ ${#alerts[@]} -gt 0 ]; then
        send_alert "System Resources Alert" "$(IFS=$'\n'; echo "${alerts[*]}")"
    else
        success "Recursos do sistema OK (CPU: ${cpu_usage}%, RAM: ${memory_usage}%, Disk: ${disk_usage}%)"
    fi
}

check_pm2_status() {
    log "Verificando status do PM2..."
    
    local pm2_status=$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.status')
    local restart_count=$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.restart_time')
    
    if [ "$pm2_status" = "online" ]; then
        success "PM2 status: $pm2_status (restarts: $restart_count)"
    else
        error "PM2 status: $pm2_status"
        
        # Auto-recovery
        log "Tentando recuperação automática..."
        pm2 restart ultrazend
        sleep 10
        
        local new_status=$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.status')
        if [ "$new_status" = "online" ]; then
            success "Recuperação automática bem-sucedida"
            send_alert "Auto-Recovery Successful" "PM2 process was restarted automatically"
        else
            error "Falha na recuperação automática"
            send_alert "Auto-Recovery Failed" "PM2 process could not be restarted"
        fi
    fi
}

check_database() {
    log "Verificando banco de dados..."
    
    local db_path="$APP_PATH/data/database.sqlite"
    local db_status="UNKNOWN"
    local db_size=0
    
    if [ -f "$db_path" ]; then
        # Check database integrity
        if sqlite3 "$db_path" "PRAGMA integrity_check;" | grep -q "ok"; then
            db_status="HEALTHY"
            db_size=$(stat -f%z "$db_path" 2>/dev/null || stat -c%s "$db_path")
            success "Banco de dados íntegro ($(numfmt --to=iec $db_size))"
        else
            db_status="CORRUPTED"
            error "Banco de dados corrompido!"
            send_alert "Database Corruption" "Database integrity check failed"
        fi
    else
        db_status="MISSING"
        error "Arquivo do banco de dados não encontrado!"
        send_alert "Database Missing" "Database file not found at $db_path"
    fi
    
    echo "{\"timestamp\":\"$(date -Iseconds)\",\"status\":\"$db_status\",\"size\":$db_size}" >> "$MONITOR_PATH/health/db-health.jsonl"
}

check_nginx_status() {
    log "Verificando Nginx..."
    
    if systemctl is-active --quiet nginx; then
        success "Nginx ativo"
        
        # Test external access
        if curl -s -f -m 10 "$WEB_URL" > /dev/null; then
            success "Site acessível externamente"
        else
            warning "Site pode não estar acessível externamente"
            send_alert "External Access Warning" "Website may not be accessible from outside"
        fi
    else
        error "Nginx inativo"
        
        # Auto-recovery
        log "Reiniciando Nginx..."
        systemctl start nginx
        
        if systemctl is-active --quiet nginx; then
            success "Nginx reiniciado com sucesso"
            send_alert "Nginx Restarted" "Nginx was automatically restarted"
        else
            error "Falha ao reiniciar Nginx"
            send_alert "Nginx Restart Failed" "Could not restart Nginx service"
        fi
    fi
}

check_ssl_certificates() {
    log "Verificando certificados SSL..."
    
    local cert_path="/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem"
    
    if [ -f "$cert_path" ]; then
        local expiry_date=$(openssl x509 -enddate -noout -in "$cert_path" | cut -d= -f2)
        local expiry_timestamp=$(date -d "$expiry_date" +%s)
        local current_timestamp=$(date +%s)
        local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
        
        if [ $days_until_expiry -lt 30 ]; then
            warning "Certificado SSL expira em $days_until_expiry dias"
            send_alert "SSL Certificate Expiring" "SSL certificate expires in $days_until_expiry days"
        else
            success "Certificado SSL válido ($days_until_expiry dias restantes)"
        fi
    else
        error "Certificado SSL não encontrado"
        send_alert "SSL Certificate Missing" "SSL certificate file not found"
    fi
}

send_alert() {
    local subject="$1"
    local message="$2"
    local timestamp=$(date -Iseconds)
    local hostname=$(hostname)
    
    # Log alert
    cat >> "$MONITOR_PATH/alerts/alerts.jsonl" << EOF
{"timestamp":"$timestamp","hostname":"$hostname","subject":"$subject","message":"$message"}
EOF
    
    # Send email alert
    if command -v mail > /dev/null && [ -n "$ALERT_EMAIL" ]; then
        cat << EOF | mail -s "[UltraZend Alert] $subject" "$ALERT_EMAIL"
UltraZend Monitoring Alert

Time: $timestamp
Server: $hostname
Subject: $subject

Message:
$message

---
This is an automated alert from UltraZend monitoring system.
EOF
    fi
    
    # Send Slack notification (if configured)
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 *UltraZend Alert*\n*Subject:* $subject\n*Message:* $message\n*Server:* $hostname\n*Time:* $timestamp\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
}

generate_health_report() {
    local report_file="$MONITOR_PATH/reports/health-report-$(date +%Y%m%d-%H%M).json"
    local timestamp=$(date -Iseconds)
    
    log "Gerando relatório de saúde..."
    
    # Get latest metrics
    local app_health=$(tail -1 "$MONITOR_PATH/health/app-health.jsonl" 2>/dev/null || echo '{"status":"UNKNOWN"}')
    local system_metrics=$(tail -1 "$MONITOR_PATH/metrics/system-metrics.jsonl" 2>/dev/null || echo '{}')
    local db_health=$(tail -1 "$MONITOR_PATH/health/db-health.jsonl" 2>/dev/null || echo '{"status":"UNKNOWN"}')
    
    # Generate report
    cat > "$report_file" << EOF
{
  "report_timestamp": "$timestamp",
  "hostname": "$(hostname)",
  "app_health": $app_health,
  "system_metrics": $system_metrics,
  "database_health": $db_health,
  "services": {
    "pm2": "$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.status')",
    "nginx": "$(systemctl is-active nginx)",
    "postfix": "$(systemctl is-active postfix 2>/dev/null || echo 'inactive')"
  },
  "uptime": {
    "system": "$(uptime -p)",
    "app": "$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.pm_uptime' | xargs -I {} date -d @{} +%s 2>/dev/null | xargs -I {} echo $(($(date +%s) - {})) | xargs -I {} echo 'scale=2; {}/3600' | bc) hours"
  }
}
EOF
    
    success "Relatório gerado: $report_file"
}

setup_monitoring() {
    log "Configurando sistema de monitoramento..."
    
    setup_directories
    
    # Create monitoring script
    cat > /usr/local/bin/ultrazend-monitor.sh << 'SCRIPT_EOF'
#!/bin/bash
source /etc/environment
cd "$(dirname "$0")"
SCRIPT_EOF
    
    # Add all functions to the monitoring script
    cat >> /usr/local/bin/ultrazend-monitor.sh << EOF
$(declare -f setup_directories check_application_health check_system_resources check_pm2_status check_database check_nginx_status check_ssl_certificates send_alert generate_health_report log success error warning)

APP_NAME="$APP_NAME"
APP_PATH="$APP_PATH"
MONITOR_PATH="$MONITOR_PATH"
ALERT_EMAIL="$ALERT_EMAIL"
SLACK_WEBHOOK="$SLACK_WEBHOOK"
HEALTH_URL="$HEALTH_URL"
API_URL="$API_URL"
WEB_URL="$WEB_URL"
CPU_THRESHOLD=$CPU_THRESHOLD
MEMORY_THRESHOLD=$MEMORY_THRESHOLD
DISK_THRESHOLD=$DISK_THRESHOLD
RESPONSE_TIME_THRESHOLD=$RESPONSE_TIME_THRESHOLD
ERROR_RATE_THRESHOLD=$ERROR_RATE_THRESHOLD

RED='$RED'
GREEN='$GREEN'
YELLOW='$YELLOW'
BLUE='$BLUE'
NC='$NC'

# Run all checks
setup_directories
check_application_health
check_system_resources
check_pm2_status
check_database
check_nginx_status
check_ssl_certificates

# Log monitoring completion
echo "\$(date -Iseconds): Monitoring cycle completed" >> /var/log/ultrazend/monitoring.log
EOF
    
    chmod +x /usr/local/bin/ultrazend-monitor.sh
    
    # Setup cron jobs
    (crontab -l 2>/dev/null; echo "# UltraZend Monitoring") | crontab -
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/ultrazend-monitor.sh") | crontab -
    (crontab -l 2>/dev/null; echo "0 */6 * * * cd $(pwd) && ./monitoring-system.sh report") | crontab -
    (crontab -l 2>/dev/null; echo "0 1 * * * cd $(pwd) && ./monitoring-system.sh ssl-check") | crontab -
    
    # Setup log rotation
    cat > /etc/logrotate.d/ultrazend-monitoring << 'LOGROTATE_EOF'
/var/log/ultrazend/monitoring.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
}

/var/log/ultrazend/monitoring/**/*.jsonl {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
}
LOGROTATE_EOF
    
    success "Sistema de monitoramento configurado"
    log "Monitoramento executará a cada 5 minutos"
    log "Relatórios serão gerados a cada 6 horas"
    log "Verificação SSL diária às 01:00"
}

# Install dependencies
install_dependencies() {
    log "Instalando dependências do monitoramento..."
    
    # Install required packages
    apt update
    apt install -y bc jq curl mailutils sqlite3
    
    # Install Node.js packages for advanced monitoring (optional)
    if command -v npm > /dev/null; then
        npm install -g pm2-logrotate 2>/dev/null || true
    fi
    
    success "Dependências instaladas"
}

# Main script logic
case "${1:-help}" in
    "install")
        install_dependencies
        setup_monitoring
        ;;
    "check")
        setup_directories
        check_application_health
        check_system_resources
        check_pm2_status
        check_database
        check_nginx_status
        ;;
    "ssl-check")
        check_ssl_certificates
        ;;
    "report")
        generate_health_report
        ;;
    "alert-test")
        send_alert "Test Alert" "This is a test alert from UltraZend monitoring system"
        ;;
    "help"|*)
        echo "UltraZend Monitoring System"
        echo "Usage: $0 {install|check|ssl-check|report|alert-test|help}"
        echo ""
        echo "Commands:"
        echo "  install      - Instalar e configurar monitoramento"
        echo "  check        - Executar verificações manuais"
        echo "  ssl-check    - Verificar certificados SSL"
        echo "  report       - Gerar relatório de saúde"
        echo "  alert-test   - Testar sistema de alertas"
        echo "  help         - Mostrar esta ajuda"
        ;;
esac