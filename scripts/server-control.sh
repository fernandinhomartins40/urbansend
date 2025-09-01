#!/bin/bash

# UltraZend Server Control Script
# This script provides safe shutdown, restart and cleanup procedures

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
PID_FILE="/root/.pm2/pids/${APP_NAME}-0.pid"
PORTS=(25 80 443 3001)

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0 # Port is in use
    else
        return 1 # Port is free
    fi
}

# Function to kill process on port
kill_port_process() {
    local port=$1
    local pid=$(lsof -ti :$port)
    
    if [ ! -z "$pid" ]; then
        echo_info "Killing process $pid on port $port"
        kill -TERM $pid
        sleep 2
        
        # Check if still running
        if kill -0 $pid 2>/dev/null; then
            echo_warning "Process $pid still running, forcing kill"
            kill -KILL $pid
        fi
        echo_success "Process on port $port terminated"
    fi
}

# Function to clean up stuck processes
cleanup_ports() {
    echo_info "Checking for stuck processes on required ports..."
    
    for port in "${PORTS[@]}"; do
        if check_port $port; then
            echo_warning "Port $port is occupied"
            kill_port_process $port
        else
            echo_success "Port $port is free"
        fi
    done
}

# Function to safe shutdown
safe_shutdown() {
    echo_info "Performing safe shutdown of $APP_NAME..."
    
    # Stop PM2 application gracefully
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        echo_info "Stopping PM2 application: $APP_NAME"
        pm2 stop $APP_NAME
        sleep 3
        
        echo_info "Deleting PM2 application: $APP_NAME"
        pm2 delete $APP_NAME
        sleep 2
    else
        echo_warning "PM2 application $APP_NAME not found"
    fi
    
    # Clean up any remaining processes on our ports
    cleanup_ports
    
    # Wait a bit for cleanup
    sleep 5
    
    echo_success "Safe shutdown completed"
}

# Function to start application
start_app() {
    echo_info "Starting $APP_NAME application..."
    
    # Ensure directories exist
    mkdir -p $LOG_DIR
    mkdir -p /var/www/ultrazend/data
    
    # Start PM2 application
    cd $APP_DIR
    pm2 start ecosystem.config.js --env production
    
    echo_success "Application started successfully"
    
    # Show status
    pm2 status
}

# Function to restart application
restart_app() {
    echo_info "Restarting $APP_NAME application..."
    
    safe_shutdown
    start_app
    
    echo_success "Application restarted successfully"
}

# Function to show status
show_status() {
    echo_info "Application Status:"
    pm2 status
    
    echo_info "Port Status:"
    for port in "${PORTS[@]}"; do
        if check_port $port; then
            echo_success "Port $port: IN USE"
        else
            echo_warning "Port $port: FREE"
        fi
    done
    
    echo_info "Recent logs:"
    pm2 logs $APP_NAME --lines 10 --nostream
}

# Function to health check
health_check() {
    echo_info "Performing health check..."
    
    # Check if PM2 process is running
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        echo_success "PM2 process is running"
    else
        echo_error "PM2 process is not running"
        return 1
    fi
    
    # Check if ports are responding
    for port in 3001 443; do
        if check_port $port; then
            echo_success "Port $port is responding"
        else
            echo_error "Port $port is not responding"
        fi
    done
    
    # Test HTTP endpoint
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo_success "HTTP endpoint is responding"
    else
        echo_error "HTTP endpoint is not responding"
    fi
}

# Function to cleanup logs
cleanup_logs() {
    echo_info "Cleaning up old log files..."
    
    # Remove logs older than 7 days
    find $LOG_DIR -name "*.log" -type f -mtime +7 -delete
    find $LOG_DIR -name "*.log.*" -type f -mtime +7 -delete
    
    # Truncate current logs if they're too large (>100MB)
    for logfile in $LOG_DIR/*.log; do
        if [ -f "$logfile" ] && [ $(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile") -gt 104857600 ]; then
            echo_warning "Truncating large log file: $logfile"
            tail -n 1000 "$logfile" > "$logfile.tmp" && mv "$logfile.tmp" "$logfile"
        fi
    done
    
    echo_success "Log cleanup completed"
}

# Main script logic
case "$1" in
    start)
        start_app
        ;;
    stop)
        safe_shutdown
        ;;
    restart)
        restart_app
        ;;
    status)
        show_status
        ;;
    health)
        health_check
        ;;
    cleanup)
        cleanup_ports
        cleanup_logs
        ;;
    full-cleanup)
        safe_shutdown
        cleanup_ports
        cleanup_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|health|cleanup|full-cleanup}"
        echo ""
        echo "Commands:"
        echo "  start        - Start the application"
        echo "  stop         - Safely stop the application"
        echo "  restart      - Restart the application"
        echo "  status       - Show application and port status"
        echo "  health       - Perform health check"
        echo "  cleanup      - Clean up ports and logs"
        echo "  full-cleanup - Stop app, clean ports and logs"
        exit 1
        ;;
esac

exit 0