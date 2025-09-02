#!/bin/bash

# 🏗️ ULTRAZEND - Server Setup Script  
# Native PM2 + Nginx setup (No Docker!)

set -euo pipefail

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
DOMAIN="ultrazend.com.br"
SUBDOMAIN="www.ultrazend.com.br"
ADMIN_EMAIL="admin@ultrazend.com.br"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo "🏗️ ULTRAZEND - Native Server Setup"
echo "=================================="
log "Server: $SERVER_HOST"
log "Domain: $SUBDOMAIN"
log "Mode: PM2 + Nginx (Native - No Docker!)"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

# Update system
log "Updating system packages..."
apt-get update -y
apt-get upgrade -y

# Install essential packages
log "Installing essential packages..."
apt-get install -y curl wget gnupg2 software-properties-common apt-transport-https ca-certificates lsb-release

# Install Node.js 20.x LTS
log "Installing Node.js 20.x LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 globally
log "Installing PM2 process manager..."
npm install -g pm2

# Install Nginx
log "Installing Nginx..."
apt-get install -y nginx

# Install SSL tools
log "Installing SSL certificate tools..."
apt-get install -y certbot python3-certbot-nginx

# Install Redis for caching/sessions
log "Installing Redis..."
apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Install additional utilities
log "Installing additional utilities..."
apt-get install -y htop iotop nethogs git rsync jq unzip

# Configure firewall
log "Configuring UFW firewall..."
ufw --force enable
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 25/tcp   # SMTP
ufw allow 587/tcp  # SMTP submission

# Create application directories
log "Creating application directories..."
mkdir -p /var/www/ultrazend/{backend,frontend,data,logs,configs}
mkdir -p /var/www/ultrazend-static
mkdir -p /var/backups/ultrazend

# Set up log rotation
log "Setting up log rotation..."
cat > /etc/logrotate.d/ultrazend << EOF
/var/www/ultrazend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        pm2 reload ultrazend-backend || true
    endscript
}
EOF

# Configure Nginx basic setup
log "Creating basic Nginx configuration..."
cat > /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
    
    server_name _;
    
    location / {
        return 200 "UltraZend server is ready for deployment!";
        add_header Content-Type text/plain;
    }
    
    location /health {
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable and start services
log "Enabling and starting services..."
systemctl enable nginx
systemctl start nginx
systemctl enable redis-server

# Set up PM2 startup script
log "Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root

# Configure system limits for Node.js
log "Configuring system limits..."
cat >> /etc/security/limits.conf << EOF
# UltraZend limits
root soft nofile 65536
root hard nofile 65536
* soft nofile 65536  
* hard nofile 65536
EOF

# Optimize system for Node.js applications
log "Optimizing system for Node.js..."
cat >> /etc/sysctl.conf << EOF
# UltraZend optimizations
net.core.somaxconn = 65536
net.ipv4.tcp_max_syn_backlog = 65536
fs.file-max = 2097152
vm.swappiness = 1
EOF

# Apply sysctl changes
sysctl -p

# Set directory permissions
log "Setting directory permissions..."
chown -R www-data:www-data /var/www/
chmod -R 755 /var/www/

# Clean up
log "Cleaning up packages..."
apt-get autoremove -y
apt-get autoclean

# Install security updates
log "Installing security updates..."
unattended-upgrades

# Display installed versions
echo ""
success "Server setup completed successfully!"
echo "======================================"
echo "📊 Installed software versions:"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)" 
echo "PM2: $(pm2 --version)"
echo "Nginx: $(nginx -v 2>&1 | cut -d/ -f2)"
echo "Redis: $(redis-server --version | cut -d' ' -f3)"
echo "Certbot: $(certbot --version | cut -d' ' -f2)"
echo ""

echo "🎯 Next steps:"
echo "=============="
echo "  1. Run deployment: ./deploy.sh"
echo "  2. The deploy script will handle SSL certificates automatically"
echo "  3. Monitor with: pm2 status && systemctl status nginx"
echo ""

echo "🌐 Services status:"
echo "=================="
echo "  ✅ Nginx: $(systemctl is-active nginx)"
echo "  ✅ Redis: $(systemctl is-active redis-server)"
echo "  ✅ PM2: Ready for deployment"
echo "  ✅ Firewall: $(ufw status | head -1)"
echo ""

echo "📋 Manual SSL setup (if needed):"
echo "================================"
echo "  certbot --nginx -d $DOMAIN -d $SUBDOMAIN \\"
echo "    --email $ADMIN_EMAIL --agree-tos --non-interactive"
echo ""

success "🎉 UltraZend server is ready for native PM2 + Nginx deployment!"