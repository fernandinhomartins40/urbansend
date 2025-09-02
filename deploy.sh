#!/bin/bash

# 🚀 ULTRAZEND - Deploy Production Script
# Native PM2 + Nginx deployment (No Docker!)
# Version: 4.0.0 - NATIVE ONLY

set -euo pipefail

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
DEPLOY_PATH="/var/www/ultrazend"
APP_PORT="3001"
DOMAIN="www.ultrazend.com.br"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }

# Show usage
show_usage() {
    echo "🚀 ULTRAZEND Deploy - Native PM2 + Nginx"
    echo "======================================="
    echo "Usage: ./deploy.sh [OPTIONS]"
    echo ""
    echo "OPTIONS:"
    echo "  --setup    - Fresh server setup + deploy"
    echo "  --quick    - Skip confirmations" 
    echo "  --restart  - Just restart services"
    echo "  --help     - Show this help"
    echo ""
    echo "EXAMPLES:"
    echo "  ./deploy.sh           # Standard native deploy"
    echo "  ./deploy.sh --quick   # Deploy without confirmation"
    echo "  ./deploy.sh --setup   # Setup clean server + deploy"
    echo "  ./deploy.sh --restart # Just restart PM2 services"
    echo ""
    echo "🚀 Uses PM2 + Nginx (Native deployment - No Docker!)"
    echo ""
}

# Test SSH connection
test_ssh() {
    log "Testing SSH connection to $SERVER_HOST..."
    if ssh -o ConnectTimeout=10 -o BatchMode=yes $SERVER_USER@$SERVER_HOST "echo 'SSH OK'" >/dev/null 2>&1; then
        success "SSH connection established"
    else
        error "SSH connection failed. Check your SSH key or use password authentication."
    fi
}

# Setup server dependencies
setup_server() {
    log "Setting up server dependencies..."
    
    ssh $SERVER_USER@$SERVER_HOST "
    # Update system
    apt-get update -y >/dev/null
    
    # Install Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y nodejs >/dev/null
    
    # Install PM2 globally
    npm install -g pm2 >/dev/null
    
    # Install Nginx and utilities
    apt-get install -y nginx certbot python3-certbot-nginx jq >/dev/null
    
    # Configure firewall
    ufw --force enable >/dev/null
    ufw allow ssh >/dev/null
    ufw allow http >/dev/null
    ufw allow https >/dev/null
    
    echo 'Server setup completed!'
    echo 'Versions installed:'
    node --version
    npm --version
    pm2 --version
    nginx -v
    "
    
    success "Server dependencies installed"
}

# Build frontend locally
build_frontend() {
    log "Building React frontend locally..."
    
    if [ ! -d "frontend" ]; then
        error "Frontend directory not found"
    fi
    
    cd frontend
    
    if [ -f "package-lock.json" ]; then
        npm ci --silent
    else
        npm install --silent
    fi
    
    npm run build
    
    if [ ! -d "dist" ]; then
        error "Frontend build failed - dist directory not created"
    fi
    
    cd ..
    
    success "Frontend built successfully ($(du -sh frontend/dist | cut -f1))"
}

# Deploy to server
deploy_to_server() {
    log "Deploying to server..."
    
    # Transfer files
    log "Transferring files..."
    rsync -avz --delete --progress \
        --exclude='.git/' \
        --exclude='node_modules/' \
        --exclude='frontend/node_modules/' \
        --exclude='backend/node_modules/' \
        --exclude='backend/dist/' \
        --exclude='.claude/' \
        --exclude='__tests__/' \
        --exclude='coverage/' \
        ./ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/
    
    # Configure on server
    log "Configuring application on server..."
    ssh $SERVER_USER@$SERVER_HOST "
    cd $DEPLOY_PATH
    
    # Stop existing services
    pm2 stop ultrazend-backend 2>/dev/null || true
    pm2 delete ultrazend-backend 2>/dev/null || true
    
    # Setup backend
    echo 'Setting up backend...'
    cd backend
    npm ci --only=production --silent
    npm run build
    
    # Copy .env if exists
    if [ -f ../configs/.env.production ]; then
        cp ../configs/.env.production .env
        chmod 600 .env
    fi
    
    # Run migrations
    npm run migrate:latest || echo 'Migration warning (continuing...)'
    
    cd ..
    
    # Setup frontend static files
    echo 'Setting up frontend static files...'
    mkdir -p /var/www/ultrazend-static
    cp -r frontend/dist/* /var/www/ultrazend-static/
    chown -R www-data:www-data /var/www/ultrazend-static
    chmod -R 755 /var/www/ultrazend-static
    
    # Configure nginx
    if [ -f configs/nginx-http.conf ]; then
        # Update nginx config to serve from correct location
        sed 's|/var/www/ultrazend/frontend/dist|/var/www/ultrazend-static|g' configs/nginx-http.conf > /etc/nginx/sites-available/ultrazend
        ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
        
        # Test and reload nginx
        nginx -t && systemctl reload nginx
        systemctl enable nginx
    fi
    
    # Start backend with PM2
    echo 'Starting backend with PM2...'
    cd backend
    pm2 start dist/index.js --name ultrazend-backend --env production
    pm2 save
    pm2 startup || true
    
    echo 'Deployment completed!'
    "
    
    success "Application deployed to server"
}

# Restart services only
restart_services() {
    log "Restarting services..."
    
    ssh $SERVER_USER@$SERVER_HOST "
    cd $DEPLOY_PATH
    
    # Restart PM2
    pm2 restart ultrazend-backend || pm2 start backend/dist/index.js --name ultrazend-backend --env production
    pm2 save
    
    # Restart Nginx
    systemctl restart nginx
    
    echo 'Services restarted!'
    pm2 status
    systemctl is-active nginx && echo 'Nginx: Active'
    "
    
    success "Services restarted"
}

# Health check
health_check() {
    log "Running health check..."
    
    sleep 5
    
    # Test backend
    for i in 1 2 3; do
        if curl -f --connect-timeout 5 "http://$SERVER_HOST:$APP_PORT/health" >/dev/null 2>&1; then
            success "Backend healthy!"
            break
        else
            warning "Backend health check attempt $i failed"
            [ $i -lt 3 ] && sleep 5
        fi
    done
    
    # Test frontend
    if curl -f --connect-timeout 5 "http://$SERVER_HOST/" >/dev/null 2>&1; then
        success "Frontend serving!"
    else
        warning "Frontend may not be ready"
    fi
}

# Main deployment process
main_deploy() {
    echo "🚀 ULTRAZEND NATIVE DEPLOYMENT"
    echo "=============================="
    echo "📍 Target: $SERVER_HOST"
    echo "🌐 Domain: $DOMAIN"
    echo "⏰ Start: $(date)"
    echo ""
    
    test_ssh
    build_frontend
    deploy_to_server
    health_check
    
    echo ""
    success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
    echo "🌐 Website: http://$DOMAIN"
    echo "🏥 Health: http://$DOMAIN/health"
    echo "🔌 API: http://$DOMAIN/api"
    echo "✨ Running natively with PM2 + Nginx (No Docker!)"
}

# Parse command line arguments
case "${1:-}" in
    --help|-h)
        show_usage
        exit 0
        ;;
    --setup)
        echo "🔧 SETTING UP SERVER + DEPLOYING"
        test_ssh
        setup_server
        main_deploy
        ;;
    --quick|-q)
        echo "⚡ QUICK DEPLOY (no confirmations)"
        main_deploy
        ;;
    --restart|-r)
        echo "🔄 RESTARTING SERVICES ONLY"
        test_ssh
        restart_services
        health_check
        ;;
    "")
        # Interactive confirmation
        echo "🚀 Ready to deploy UltraZend natively?"
        echo "Target: $SERVER_HOST"
        echo ""
        read -p "Continue? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            main_deploy
        else
            echo "Deployment cancelled."
            exit 0
        fi
        ;;
    *)
        error "Unknown option: $1. Use --help for usage information."
        ;;
esac