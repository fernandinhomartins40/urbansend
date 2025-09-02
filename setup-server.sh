#!/bin/bash

# 🏗️ ULTRAZEND - Server Setup Script  
# Configuração completa de servidor limpo para produção

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

echo "🏗️ ULTRAZEND - Server Setup"
echo "============================"
log "Server: $SERVER_HOST"
log "Domain: $SUBDOMAIN"
echo ""

# Test SSH connection
log "Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'echo "SSH OK"' >/dev/null 2>&1; then
    error "SSH connection failed"
fi
success "SSH connection established"

# Server setup
log "🔧 Setting up server environment..."

ssh $SERVER_USER@$SERVER_HOST << 'EOFSETUP'
echo "🔄 Starting server setup..."

# Update system
echo "📦 Updating system packages..."
apt-get update && apt-get upgrade -y

# Install essential packages
echo "📦 Installing essential packages..."
apt-get install -y \
    curl wget git unzip \
    nginx sqlite3 \
    ufw htop tree jq \
    software-properties-common \
    apt-transport-https ca-certificates gnupg lsb-release

# Install Node.js 20
echo "🟢 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# Install Docker (optional)
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl start docker
systemctl enable docker
usermod -aG docker $USER

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Configure firewall
echo "🔒 Configuring firewall..."
ufw --force enable
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 25    # SMTP
ufw allow 587   # SMTP Submission
ufw allow 465   # SMTP SSL

# Create application directories
echo "📁 Creating application directories..."
mkdir -p /var/www/ultrazend/{backend,frontend,data,logs,uploads,certificates}
mkdir -p /var/www/ultrazend/data/{database,cache,sessions}
mkdir -p /var/backups/ultrazend

# Set permissions
chown -R www-data:www-data /var/www/ultrazend
chmod -R 755 /var/www/ultrazend

# Configure Nginx (basic config)
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/ultrazend << 'NGINXEOF'
# ULTRAZEND - Basic HTTP Configuration
server {
    listen 80;
    server_name ultrazend.com.br www.ultrazend.com.br;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
    }
    
    # Static files
    location / {
        root /var/www/ultrazend/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Security
    location ~ /\. {
        deny all;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
nginx -t && systemctl reload nginx && systemctl enable nginx

# Display system info
echo ""
echo "✅ SERVER SETUP COMPLETED!"
echo "=========================="
echo "System Info:"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "PM2: $(pm2 --version)"
echo "Docker: $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
echo "Docker Compose: $(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)"
echo ""
echo "🔒 Firewall status:"
ufw status numbered
echo ""
echo "📁 Application directory:"
ls -la /var/www/ultrazend/
echo ""

echo "🎉 Server is ready for deployment!"
echo "Next steps:"
echo "1. Run: ./deploy.sh [pm2|docker]"
echo "2. Setup SSL: certbot --nginx -d ultrazend.com.br -d www.ultrazend.com.br"
EOFSETUP

success "🎉 Server setup completed successfully!"
echo ""
echo "📋 What was installed:"
echo "  ✅ Node.js 20 + npm"
echo "  ✅ PM2 process manager"
echo "  ✅ Docker + Docker Compose"
echo "  ✅ Nginx web server"
echo "  ✅ Security firewall (ufw)"
echo "  ✅ Application directories"
echo "  ✅ Basic Nginx configuration"
echo ""
echo "🚀 Next steps:"
echo "  1. Run deployment: ./deploy.sh docker"
echo "  2. Setup SSL certificates (after deployment)"
echo "  3. Configure domain DNS to point to $SERVER_HOST"
echo ""