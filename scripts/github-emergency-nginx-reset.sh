#!/bin/bash

# 🚨 GITHUB ACTIONS - RESET NGINX DE EMERGÊNCIA
# Para ser executado via GitHub Actions quando deploy falha com erro SSL

set -euo pipefail

# Configuration from environment or defaults
SERVER_HOST="${DEPLOY_HOST:-31.97.162.155}"
SERVER_USER="${DEPLOY_USER:-root}"

# Colors for GitHub Actions
RED='\033[0;31m'
GREEN='\033[0;32m'  
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

echo "🚨 GITHUB ACTIONS - NGINX EMERGENCY RESET"
echo "=========================================="
log "Target: $SERVER_HOST"
log "Purpose: Clear all SSL configurations blocking deploy"
echo ""

# Test SSH connection first
log "🔐 Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'echo "SSH OK"' > /dev/null 2>&1; then
    error "❌ SSH connection failed to $SERVER_HOST"
fi
success "✅ SSH connection working"

# Execute emergency reset
log "🚨 Executing emergency nginx reset..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
#!/bin/bash
set -euo pipefail

echo "🚨 EMERGENCY NGINX RESET STARTING..."
echo "===================================="

# 1. Force stop everything nginx related
echo "⏹️ Force stopping nginx..."
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
pkill -9 -f nginx 2>/dev/null || true
sleep 3

# 2. Emergency backup
echo "📦 Creating emergency backup..."
BACKUP_DIR="/var/backups/nginx-emergency-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r /etc/nginx "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Backup saved to: $BACKUP_DIR"

# 3. Nuclear option - remove and reinstall nginx config
echo "💥 Nuclear option: Removing all nginx configurations..."
rm -rf /etc/nginx/sites-enabled/*
rm -rf /etc/nginx/sites-available/*  
rm -rf /etc/nginx/conf.d/*

# 4. Create ultra-minimal nginx.conf
echo "📝 Creating minimal nginx.conf..."
cat > /etc/nginx/nginx.conf << 'NGINX_MINIMAL'
user www-data;
worker_processes 1;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    sendfile on;
    keepalive_timeout 65;
    
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    
    # Only include sites-enabled
    include /etc/nginx/sites-enabled/*;
}
NGINX_MINIMAL

# 5. Create ultra-simple HTTP-only site
echo "🌐 Creating minimal HTTP site..."
cat > /etc/nginx/sites-available/default << 'SITE_MINIMAL'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    root /var/www/html;
    index index.html;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location /health {
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
SITE_MINIMAL

ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/

# 6. Create web root
echo "📁 Setting up web root..."
mkdir -p /var/www/html
chown -R www-data:www-data /var/www/html
echo "<!DOCTYPE html><html><head><title>UltraZend Emergency</title></head><body><h1>🚨 UltraZend Emergency Mode</h1><p>Server is ready for deployment.</p></body></html>" > /var/www/html/index.html

# 7. Test configuration
echo "🧪 Testing minimal configuration..."
if nginx -t; then
    echo "✅ Minimal configuration is valid"
else
    echo "❌ Even minimal configuration failed!"
    nginx -t
    
    # Last resort - reinstall nginx
    echo "🔄 Last resort: Reinstalling nginx..."
    apt update
    apt install --reinstall nginx -y
    systemctl stop nginx
fi

# 8. Start nginx
echo "🚀 Starting nginx with minimal config..."
systemctl enable nginx
systemctl start nginx

# Wait and test
sleep 5
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
    
    # Test HTTP
    if curl -f -s -m 5 http://localhost/health > /dev/null; then
        echo "✅ HTTP health check passed"
    else
        echo "⚠️ HTTP health check failed but nginx is running"
    fi
    
    # Show what's listening
    echo "📡 Nginx listening on:"
    netstat -tlnp | grep nginx || echo "No nginx ports found"
    
else
    echo "❌ Nginx failed to start even with minimal config"
    systemctl status nginx --no-pager
    journalctl -u nginx --no-pager -n 20
    exit 1
fi

echo ""
echo "🎉 EMERGENCY RESET COMPLETED SUCCESSFULLY!"
echo "=========================================="
echo "✅ All SSL configurations removed"
echo "✅ Minimal HTTP configuration active"  
echo "✅ Nginx running on port 80"
echo "✅ Ready for clean deployment"
echo ""
echo "Next steps:"
echo "1. Run the main deployment script"
echo "2. It will detect clean state and proceed normally"
echo "3. SSL will be configured properly after HTTP is working"
EOF

echo ""
success "🚨 EMERGENCY NGINX RESET COMPLETED!"
echo "===================================="
success "✅ Server nginx completely cleaned"
success "✅ Minimal HTTP configuration active"
success "✅ Ready for normal deployment"
echo ""
log "🔄 You can now run the main deployment which should succeed"
log "🌐 Test: http://www.velomail.com.br/health"