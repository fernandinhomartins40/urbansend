#!/bin/bash

# 💾 ULTRAZEND - Automated Backup & Rollback System
# Complete backup solution with automated scheduling

set -euo pipefail

# Configuration
APP_NAME="ultrazend"
APP_PATH="/var/www/ultrazend"
BACKUP_PATH="/var/backups/ultrazend"
DB_PATH="$APP_PATH/data/database.sqlite"
S3_BUCKET="ultrazend-backups" # Optional: configure for cloud backup
RETENTION_DAYS=30
MAX_BACKUPS=50

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[BACKUP] $1${NC}"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

# Functions
create_backup() {
    local backup_type="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$BACKUP_PATH/${backup_type}-${timestamp}"
    
    log "Criando backup $backup_type: $backup_dir"
    
    # Create backup directory
    mkdir -p "$backup_dir"
    
    # Backup application files
    if [ -d "$APP_PATH/backend" ]; then
        log "Backup do backend..."
        cp -r "$APP_PATH/backend" "$backup_dir/"
    fi
    
    if [ -d "$APP_PATH/frontend" ]; then
        log "Backup do frontend..."
        cp -r "$APP_PATH/frontend" "$backup_dir/"
    fi
    
    # Backup database with WAL files
    if [ -f "$DB_PATH" ]; then
        log "Backup do banco de dados..."
        mkdir -p "$backup_dir/data"
        
        # Stop database connections temporarily
        systemctl stop ultrazend 2>/dev/null || true
        sleep 2
        
        # Copy database files
        cp "$DB_PATH" "$backup_dir/data/" 2>/dev/null || true
        cp "${DB_PATH}-wal" "$backup_dir/data/" 2>/dev/null || true
        cp "${DB_PATH}-shm" "$backup_dir/data/" 2>/dev/null || true
        
        # Restart application
        systemctl start ultrazend 2>/dev/null || true
    fi
    
    # Backup configuration files
    log "Backup das configurações..."
    mkdir -p "$backup_dir/config"
    cp "$APP_PATH/ecosystem.config.js" "$backup_dir/config/" 2>/dev/null || true
    cp "$APP_PATH/backend/.env" "$backup_dir/config/" 2>/dev/null || true
    cp "/etc/nginx/sites-available/ultrazend" "$backup_dir/config/nginx.conf" 2>/dev/null || true
    
    # Backup logs (last 7 days)
    if [ -d "$APP_PATH/logs" ]; then
        log "Backup dos logs..."
        mkdir -p "$backup_dir/logs"
        find "$APP_PATH/logs" -name "*.log" -mtime -7 -exec cp {} "$backup_dir/logs/" \; 2>/dev/null || true
    fi
    
    # Create backup metadata
    cat > "$backup_dir/backup-info.json" << EOF
{
  "backup_id": "${backup_type}-${timestamp}",
  "backup_type": "$backup_type",
  "timestamp": "$timestamp",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "app_version": "$(cd $APP_PATH/backend && node -e "console.log(require('./package.json').version)" 2>/dev/null || echo 'unknown')",
  "git_commit": "$(cd $APP_PATH && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "pm2_status": "$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.status' || echo 'unknown')",
  "database_size": "$(du -h $DB_PATH 2>/dev/null | cut -f1 || echo 'unknown')",
  "backup_size": "$(du -sh $backup_dir | cut -f1)"
}
EOF
    
    # Compress backup
    log "Comprimindo backup..."
    tar -czf "${backup_dir}.tar.gz" -C "$BACKUP_PATH" "$(basename $backup_dir)"
    rm -rf "$backup_dir"
    
    success "Backup criado: ${backup_dir}.tar.gz"
    echo "${backup_dir}.tar.gz"
}

restore_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        error "Arquivo de backup não encontrado: $backup_file"
    fi
    
    warning "ATENÇÃO: Restauração irá sobrescrever dados atuais!"
    read -p "Continuar? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Restauração cancelada"
        exit 0
    fi
    
    local restore_dir="/tmp/ultrazend-restore-$(date +%s)"
    local current_backup_dir="/tmp/ultrazend-current-$(date +%s)"
    
    log "Criando backup dos dados atuais..."
    create_backup "pre-restore" > /dev/null
    
    log "Extraindo backup: $backup_file"
    mkdir -p "$restore_dir"
    tar -xzf "$backup_file" -C "$restore_dir"
    
    local extracted_dir=$(find "$restore_dir" -maxdepth 1 -type d | tail -n 1)
    
    # Stop application
    log "Parando aplicação..."
    pm2 stop ultrazend 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    
    # Restore files
    log "Restaurando arquivos..."
    
    if [ -d "$extracted_dir/backend" ]; then
        rm -rf "$APP_PATH/backend.old" 2>/dev/null || true
        mv "$APP_PATH/backend" "$APP_PATH/backend.old" 2>/dev/null || true
        cp -r "$extracted_dir/backend" "$APP_PATH/"
        chown -R www-data:www-data "$APP_PATH/backend"
    fi
    
    if [ -d "$extracted_dir/frontend" ]; then
        rm -rf "$APP_PATH/frontend.old" 2>/dev/null || true
        mv "$APP_PATH/frontend" "$APP_PATH/frontend.old" 2>/dev/null || true
        cp -r "$extracted_dir/frontend" "$APP_PATH/"
        chown -R www-data:www-data "$APP_PATH/frontend"
    fi
    
    if [ -d "$extracted_dir/data" ]; then
        log "Restaurando banco de dados..."
        rm -f "${DB_PATH}.backup" 2>/dev/null || true
        cp "$DB_PATH" "${DB_PATH}.backup" 2>/dev/null || true
        cp "$extracted_dir/data/database.sqlite" "$DB_PATH" 2>/dev/null || true
        chown www-data:www-data "$DB_PATH"
    fi
    
    if [ -d "$extracted_dir/config" ]; then
        log "Restaurando configurações..."
        cp "$extracted_dir/config/.env" "$APP_PATH/backend/" 2>/dev/null || true
        cp "$extracted_dir/config/ecosystem.config.js" "$APP_PATH/" 2>/dev/null || true
    fi
    
    # Start services
    log "Reiniciando serviços..."
    systemctl start nginx
    pm2 start "$APP_PATH/ecosystem.config.js" --env production
    
    # Wait and test
    sleep 10
    if curl -f -s -m 10 http://localhost:3001/health > /dev/null; then
        success "Restauração concluída com sucesso!"
        rm -rf "$restore_dir"
    else
        error "Falha na restauração. Verifique os logs."
    fi
}

cleanup_old_backups() {
    log "Limpando backups antigos..."
    
    # Remove backups older than retention period
    find "$BACKUP_PATH" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    
    # Keep only MAX_BACKUPS most recent
    if [ $(ls -1 "$BACKUP_PATH"/*.tar.gz 2>/dev/null | wc -l) -gt $MAX_BACKUPS ]; then
        ls -t "$BACKUP_PATH"/*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f
    fi
    
    success "Limpeza concluída"
}

list_backups() {
    log "Backups disponíveis em $BACKUP_PATH:"
    echo ""
    
    if [ ! -d "$BACKUP_PATH" ] || [ -z "$(ls -A $BACKUP_PATH 2>/dev/null)" ]; then
        warning "Nenhum backup encontrado"
        return
    fi
    
    printf "%-20s %-15s %-10s %s\n" "DATA/HORA" "TIPO" "TAMANHO" "ARQUIVO"
    printf "%-20s %-15s %-10s %s\n" "--------" "----" "-------" "-------"
    
    for backup in $(ls -t "$BACKUP_PATH"/*.tar.gz 2>/dev/null); do
        local filename=$(basename "$backup")
        local size=$(du -h "$backup" | cut -f1)
        local date=$(echo "$filename" | grep -o '[0-9]\{8\}-[0-9]\{6\}' | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
        local type=$(echo "$filename" | sed 's/-[0-9]\{8\}-[0-9]\{6\}.tar.gz$//')
        
        printf "%-20s %-15s %-10s %s\n" "$date" "$type" "$size" "$filename"
    done
}

setup_automated_backups() {
    log "Configurando backups automáticos..."
    
    # Create backup directories
    mkdir -p "$BACKUP_PATH"
    
    # Create backup script
    cat > /usr/local/bin/ultrazend-backup.sh << 'SCRIPT_EOF'
#!/bin/bash
source /etc/environment
cd "$(dirname "$0")"
SCRIPT_EOF
    
    cat >> /usr/local/bin/ultrazend-backup.sh << EOF
$(declare -f create_backup cleanup_old_backups log success error warning)
APP_NAME="$APP_NAME"
APP_PATH="$APP_PATH"
BACKUP_PATH="$BACKUP_PATH"
DB_PATH="$DB_PATH"
RETENTION_DAYS=$RETENTION_DAYS
MAX_BACKUPS=$MAX_BACKUPS
RED='$RED'
GREEN='$GREEN'
YELLOW='$YELLOW'
BLUE='$BLUE'
NC='$NC'

# Daily backup
create_backup "daily" > /dev/null
cleanup_old_backups

# Log backup completion
echo "\$(date): Daily backup completed" >> /var/log/ultrazend/backup.log
EOF
    
    chmod +x /usr/local/bin/ultrazend-backup.sh
    
    # Setup cron jobs
    (crontab -l 2>/dev/null; echo "# UltraZend Automated Backups") | crontab -
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/ultrazend-backup.sh") | crontab -
    (crontab -l 2>/dev/null; echo "0 3 * * 0 cd $(pwd) && ./backup-system.sh create weekly") | crontab -
    (crontab -l 2>/dev/null; echo "0 4 1 * * cd $(pwd) && ./backup-system.sh create monthly") | crontab -
    
    # Create log directory
    mkdir -p /var/log/ultrazend
    touch /var/log/ultrazend/backup.log
    
    # Setup logrotate
    cat > /etc/logrotate.d/ultrazend-backup << 'LOGROTATE_EOF'
/var/log/ultrazend/backup.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
}
LOGROTATE_EOF
    
    success "Backups automáticos configurados"
    log "Schedule:"
    log "  - Diário: 02:00 (mantém $RETENTION_DAYS dias)"
    log "  - Semanal: 03:00 Domingo"
    log "  - Mensal: 04:00 dia 1"
}

# Main script logic
case "${1:-help}" in
    "create")
        backup_type="${2:-manual}"
        create_backup "$backup_type"
        ;;
    "restore")
        if [ -z "${2:-}" ]; then
            error "Especifique o arquivo de backup para restaurar"
        fi
        restore_backup "$2"
        ;;
    "list")
        list_backups
        ;;
    "cleanup")
        cleanup_old_backups
        ;;
    "setup")
        setup_automated_backups
        ;;
    "help"|*)
        echo "UltraZend Backup System"
        echo "Usage: $0 {create|restore|list|cleanup|setup|help}"
        echo ""
        echo "Commands:"
        echo "  create [type]     - Criar backup (tipos: manual, daily, weekly, monthly)"
        echo "  restore <file>    - Restaurar backup específico"
        echo "  list             - Listar backups disponíveis"
        echo "  cleanup          - Limpar backups antigos"
        echo "  setup            - Configurar backups automáticos"
        echo "  help             - Mostrar esta ajuda"
        echo ""
        echo "Examples:"
        echo "  $0 create manual"
        echo "  $0 restore $BACKUP_PATH/manual-20240101-120000.tar.gz"
        echo "  $0 list"
        ;;
esac