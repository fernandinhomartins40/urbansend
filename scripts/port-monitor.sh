#!/bin/bash

# UltraZend Port Monitoring Script
# Monitors critical ports and alerts when conflicts occur

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CRITICAL_PORTS=(25 80 443 3001)
EXPECTED_PROCESSES=("smtpServer" "node" "node" "node")
LOG_FILE="/var/www/ultrazend/logs/port-monitor.log"

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> $LOG_FILE
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" >> $LOG_FILE
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" >> $LOG_FILE
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >> $LOG_FILE
}

# Function to get process info for a port
get_port_info() {
    local port=$1
    local info=$(lsof -ti :$port 2>/dev/null)
    
    if [ ! -z "$info" ]; then
        local pid=$info
        local process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
        local cmd=$(ps -p $pid -o args= 2>/dev/null || echo "unknown")
        echo "$pid|$process_name|$cmd"
    else
        echo ""
    fi
}

# Function to check if port is legitimate
is_legitimate_process() {
    local port=$1
    local cmd=$2
    
    case $port in
        25)
            # SMTP server should be our application
            if [[ $cmd == *"ultrazend"* ]] || [[ $cmd == *"smtpServer"* ]]; then
                return 0
            fi
            ;;
        80|443|3001)
            # HTTP/HTTPS should be our Node.js application
            if [[ $cmd == *"ultrazend"* ]] || [[ $cmd == *"node"* ]] && [[ $cmd == *"/var/www/ultrazend/"* ]]; then
                return 0
            fi
            ;;
    esac
    return 1
}

# Function to monitor ports
monitor_ports() {
    echo_info "Starting port monitoring check..."
    local alerts=0
    
    for i in "${!CRITICAL_PORTS[@]}"; do
        local port=${CRITICAL_PORTS[$i]}
        local info=$(get_port_info $port)
        
        if [ -z "$info" ]; then
            echo_warning "Port $port is FREE (should be in use by our application)"
            alerts=$((alerts + 1))
        else
            IFS='|' read -r pid process_name cmd <<< "$info"
            
            if is_legitimate_process $port "$cmd"; then
                echo_success "Port $port: OK - PID $pid ($process_name)"
            else
                echo_error "Port $port: CONFLICT - PID $pid ($process_name)"
                echo_error "  Command: $cmd"
                alerts=$((alerts + 1))
                
                # Log detailed process information
                echo_info "Process details for PID $pid:"
                ps -p $pid -f 2>/dev/null || echo_warning "Could not get process details"
            fi
        fi
    done
    
    # Check PM2 status
    if pm2 describe ultrazend > /dev/null 2>&1; then
        local pm2_status=$(pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.status' 2>/dev/null || echo "unknown")
        if [ "$pm2_status" = "online" ]; then
            echo_success "PM2 ultrazend process: ONLINE"
        else
            echo_error "PM2 ultrazend process: $pm2_status"
            alerts=$((alerts + 1))
        fi
    else
        echo_error "PM2 ultrazend process: NOT FOUND"
        alerts=$((alerts + 1))
    fi
    
    # Summary
    if [ $alerts -eq 0 ]; then
        echo_success "Port monitoring check completed: ALL OK"
        return 0
    else
        echo_error "Port monitoring check completed: $alerts ALERTS found"
        return 1
    fi
}

# Function to kill illegitimate processes
cleanup_conflicts() {
    echo_info "Cleaning up port conflicts..."
    
    for port in "${CRITICAL_PORTS[@]}"; do
        local info=$(get_port_info $port)
        
        if [ ! -z "$info" ]; then
            IFS='|' read -r pid process_name cmd <<< "$info"
            
            if ! is_legitimate_process $port "$cmd"; then
                echo_warning "Killing illegitimate process on port $port: PID $pid ($process_name)"
                kill -TERM $pid
                sleep 2
                
                # Check if still running
                if kill -0 $pid 2>/dev/null; then
                    echo_warning "Process $pid still running, forcing kill"
                    kill -KILL $pid
                fi
                
                echo_success "Illegitimate process on port $port terminated"
            fi
        fi
    done
}

# Function for continuous monitoring
continuous_monitor() {
    echo_info "Starting continuous port monitoring (every 60 seconds)..."
    
    while true; do
        if ! monitor_ports > /dev/null 2>&1; then
            echo_error "Port conflicts detected at $(date)"
            monitor_ports  # Show detailed output
            
            read -p "Auto-cleanup conflicts? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                cleanup_conflicts
            fi
        fi
        
        sleep 60
    done
}

# Function to generate report
generate_report() {
    echo_info "Generating port monitoring report..."
    
    echo "==============================================="
    echo "UltraZend Port Monitoring Report"
    echo "Generated: $(date)"
    echo "==============================================="
    echo
    
    monitor_ports
    
    echo
    echo "System Information:"
    echo "- Uptime: $(uptime)"
    echo "- Load: $(cat /proc/loadavg)"
    echo "- Memory: $(free -h | grep Mem)"
    echo "- Disk: $(df -h / | tail -1)"
    
    echo
    echo "Recent log entries:"
    tail -20 $LOG_FILE
}

# Ensure log directory exists
mkdir -p /var/www/ultrazend/logs

# Main script logic
case "$1" in
    monitor)
        monitor_ports
        ;;
    cleanup)
        cleanup_conflicts
        ;;
    continuous)
        continuous_monitor
        ;;
    report)
        generate_report
        ;;
    *)
        echo "Usage: $0 {monitor|cleanup|continuous|report}"
        echo ""
        echo "Commands:"
        echo "  monitor     - Check ports once and report status"
        echo "  cleanup     - Kill illegitimate processes on critical ports"
        echo "  continuous  - Monitor continuously (every 60s)"
        echo "  report      - Generate detailed monitoring report"
        exit 1
        ;;
esac

exit 0