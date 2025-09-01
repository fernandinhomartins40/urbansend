#!/bin/bash

# UltraZend Automated Cleanup Script
# Performs regular maintenance tasks to keep the server healthy

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ultrazend"
APP_DIR="/var/www/ultrazend"
LOG_DIR="/var/www/ultrazend/logs"
DATA_DIR="/var/www/ultrazend/data"
BACKUP_DIR="/var/www/ultrazend/backups"
MAX_LOG_SIZE="50M"
LOG_RETENTION_DAYS=7
DB_BACKUP_RETENTION_DAYS=14
CLEANUP_LOG="/var/www/ultrazend/logs/cleanup.log"

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> $CLEANUP_LOG
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" >> $CLEANUP_LOG
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" >> $CLEANUP_LOG
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >> $CLEANUP_LOG
}

# Function to cleanup old log files
cleanup_logs() {
    echo_info "Cleaning up old log files..."
    
    # Remove logs older than retention period
    local removed=0
    
    # Application logs
    find $LOG_DIR -name "*.log" -type f -mtime +$LOG_RETENTION_DAYS -exec rm -f {} \; -print | while read file; do
        echo_info "Removed old log: $(basename $file)"
        removed=$((removed + 1))
    done
    
    # Rotated logs
    find $LOG_DIR -name "*.log.*" -type f -mtime +$LOG_RETENTION_DAYS -exec rm -f {} \; -print | while read file; do
        echo_info "Removed old rotated log: $(basename $file)"
        removed=$((removed + 1))
    done
    
    # PM2 logs
    pm2 flush $APP_NAME 2>/dev/null || echo_warning "Could not flush PM2 logs"
    
    echo_success "Log cleanup completed"
}

# Function to cleanup large log files
truncate_large_logs() {
    echo_info "Checking for large log files..."
    
    for logfile in $LOG_DIR/*.log; do
        if [ -f "$logfile" ]; then
            local size=$(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile")
            local size_mb=$((size / 1024 / 1024))
            
            # Convert MAX_LOG_SIZE to bytes
            local max_size_bytes=52428800  # 50MB
            
            if [ $size -gt $max_size_bytes ]; then
                echo_warning "Large log file detected: $(basename $logfile) (${size_mb}MB)"
                
                # Keep last 2000 lines and compress the rest
                local backup_name="${logfile}.$(date +%Y%m%d_%H%M%S).bak"
                cp "$logfile" "$backup_name"
                tail -n 2000 "$logfile" > "$logfile.tmp" && mv "$logfile.tmp" "$logfile"
                gzip "$backup_name"
                
                echo_success "Truncated and backed up: $(basename $logfile)"
            fi
        fi
    done
}

# Function to cleanup temporary files
cleanup_temp_files() {
    echo_info "Cleaning up temporary files..."
    
    # Remove temp files older than 1 day
    find /tmp -name "*ultrazend*" -type f -mtime +1 -delete 2>/dev/null || true
    find /tmp -name "pm2*" -type f -mtime +1 -delete 2>/dev/null || true
    
    # Clean up upload temp files if any
    if [ -d "$APP_DIR/temp" ]; then
        find "$APP_DIR/temp" -type f -mtime +1 -delete 2>/dev/null || true
    fi
    
    echo_success "Temporary file cleanup completed"
}

# Function to backup database
backup_database() {
    echo_info "Creating database backup..."
    
    # Ensure backup directory exists
    mkdir -p $BACKUP_DIR
    
    local db_file="$DATA_DIR/database.sqlite"
    local backup_file="$BACKUP_DIR/database_$(date +%Y%m%d_%H%M%S).sqlite"
    
    if [ -f "$db_file" ]; then
        cp "$db_file" "$backup_file"
        gzip "$backup_file"
        echo_success "Database backed up to: $(basename $backup_file).gz"
        
        # Remove old backups
        find $BACKUP_DIR -name "database_*.sqlite.gz" -type f -mtime +$DB_BACKUP_RETENTION_DAYS -delete
        echo_info "Old database backups cleaned up"
    else
        echo_warning "Database file not found: $db_file"
    fi
}

# Function to check disk space
check_disk_space() {
    echo_info "Checking disk space..."
    
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ $usage -gt 85 ]; then
        echo_error "Disk usage is at ${usage}% - WARNING!"
        
        # Emergency cleanup
        echo_warning "Performing emergency cleanup..."
        
        # Remove old backups
        find $BACKUP_DIR -name "*.gz" -type f -mtime +3 -delete 2>/dev/null || true
        
        # Clean system logs
        journalctl --vacuum-time=3d 2>/dev/null || true
        
        # Clean package cache
        apt-get clean 2>/dev/null || true
        
        echo_warning "Emergency cleanup completed"
    else
        echo_success "Disk usage is at ${usage}% - OK"
    fi
}

# Function to check memory usage
check_memory() {
    echo_info "Checking memory usage..."
    
    local mem_info=$(free | grep Mem)
    local total=$(echo $mem_info | awk '{print $2}')
    local used=$(echo $mem_info | awk '{print $3}')
    local usage=$((used * 100 / total))
    
    if [ $usage -gt 85 ]; then
        echo_warning "Memory usage is at ${usage}%"
        
        # Check for memory leaks in our application
        local app_memory=$(ps -p $(pgrep -f $APP_NAME) -o rss= 2>/dev/null || echo "0")
        local app_memory_mb=$((app_memory / 1024))
        
        if [ $app_memory_mb -gt 800 ]; then
            echo_error "Application using ${app_memory_mb}MB memory - possible leak!"
            echo_warning "Consider restarting the application"
        fi
    else
        echo_success "Memory usage is at ${usage}% - OK"
    fi
}

# Function to check process health
check_process_health() {
    echo_info "Checking process health..."
    
    # Check PM2 process
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        local status=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .pm2_env.status' 2>/dev/null || echo "unknown")
        local restarts=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .pm2_env.restart_time' 2>/dev/null || echo "0")
        local uptime=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .pm2_env.pm_uptime' 2>/dev/null || echo "0")
        
        if [ "$status" = "online" ]; then
            echo_success "PM2 process: ONLINE (restarts: $restarts)"
        else
            echo_error "PM2 process: $status"
        fi
        
        # Check if process is restarting too frequently
        local current_time=$(date +%s)
        local uptime_seconds=$(( (current_time - uptime / 1000) ))
        
        if [ $restarts -gt 5 ] && [ $uptime_seconds -lt 3600 ]; then
            echo_warning "Process has restarted $restarts times in the last hour"
        fi
    else
        echo_error "PM2 process not found"
    fi
}

# Function to optimize database
optimize_database() {
    echo_info "Optimizing database..."
    
    local db_file="$DATA_DIR/database.sqlite"
    
    if [ -f "$db_file" ]; then
        # Run VACUUM to optimize database
        sqlite3 "$db_file" "VACUUM;" 2>/dev/null || echo_warning "Could not vacuum database"
        
        # Analyze database for query optimization
        sqlite3 "$db_file" "ANALYZE;" 2>/dev/null || echo_warning "Could not analyze database"
        
        echo_success "Database optimization completed"
    else
        echo_warning "Database file not found for optimization"
    fi
}

# Function to generate cleanup report
generate_report() {
    echo_info "Generating cleanup report..."
    
    echo "==============================================="
    echo "UltraZend Automated Cleanup Report"
    echo "Generated: $(date)"
    echo "==============================================="
    echo
    
    echo "System Status:"
    check_disk_space
    check_memory
    check_process_health
    
    echo
    echo "Directory Sizes:"
    du -sh $LOG_DIR 2>/dev/null || echo "Logs: N/A"
    du -sh $DATA_DIR 2>/dev/null || echo "Data: N/A"
    du -sh $BACKUP_DIR 2>/dev/null || echo "Backups: N/A"
    
    echo
    echo "Recent Cleanup Activities:"
    tail -20 $CLEANUP_LOG 2>/dev/null || echo "No recent activities"
}

# Function to run full cleanup
full_cleanup() {
    echo_info "Starting full automated cleanup..."
    
    cleanup_temp_files
    cleanup_logs
    truncate_large_logs
    backup_database
    optimize_database
    check_disk_space
    check_memory
    check_process_health
    
    echo_success "Full cleanup completed successfully"
}

# Function to run quick cleanup
quick_cleanup() {
    echo_info "Starting quick cleanup..."
    
    cleanup_temp_files
    truncate_large_logs
    check_disk_space
    
    echo_success "Quick cleanup completed"
}

# Ensure required directories exist
mkdir -p $LOG_DIR $DATA_DIR $BACKUP_DIR

# Main script logic
case "$1" in
    full)
        full_cleanup
        ;;
    quick)
        quick_cleanup
        ;;
    logs)
        cleanup_logs
        ;;
    database)
        backup_database
        optimize_database
        ;;
    report)
        generate_report
        ;;
    monitor)
        check_disk_space
        check_memory
        check_process_health
        ;;
    *)
        echo "Usage: $0 {full|quick|logs|database|report|monitor}"
        echo ""
        echo "Commands:"
        echo "  full      - Run complete cleanup (logs, temp, database backup, optimization)"
        echo "  quick     - Run quick cleanup (temp files, large logs, disk check)"
        echo "  logs      - Clean up old log files only"
        echo "  database  - Backup and optimize database"
        echo "  report    - Generate cleanup and system status report"
        echo "  monitor   - Check system health (disk, memory, processes)"
        exit 1
        ;;
esac

exit 0