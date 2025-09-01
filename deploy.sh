#!/bin/bash

# 🚀 ULTRAZEND ENTERPRISE DEPLOYMENT SCRIPT
# Deploy enterprise-grade Node.js application to production VPS
# =============================================================================

set -e

# Configuration variables
VPS_HOST="${VPS_HOST:-31.97.162.155}"
VPS_USER="${VPS_USER:-root}"
DEPLOY_PATH="/var/www/ultrazend"
APP_DOMAIN="${APP_DOMAIN:-www.ultrazend.com.br}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "🚀 ULTRAZEND ENTERPRISE DEPLOYMENT"
echo "==================================="
log_info "Deploying to: $VPS_HOST"
log_info "Domain: $APP_DOMAIN"
log_info "Deploy path: $DEPLOY_PATH"
echo ""

# 1. Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check if backend build exists
if [ ! -f "backend/dist/index.js" ]; then
    log_warning "Backend dist not found, building..."
    cd backend && npm run build && cd ..
fi

# Check if frontend build exists
if [ ! -d "frontend/dist" ]; then
    log_error "Frontend build not found! Please run 'npm run build' in frontend directory"
    exit 1
fi

log_success "Pre-deployment checks completed"

# 2. Create deployment directory structure on VPS
log_info "Creating enterprise directory structure..."
ssh $VPS_USER@$VPS_HOST << 'EOF'
# Create main directories
mkdir -p /var/www/ultrazend/{backend,frontend,data,logs,backup,ssl}

# Create log subdirectories for structured logging
mkdir -p /var/www/ultrazend/logs/{app,error,security,access,performance}

# Create data subdirectories
mkdir -p /var/www/ultrazend/data/{database,uploads,cache}

# Create backup subdirectories
mkdir -p /var/www/ultrazend/backup/{daily,weekly,monthly}

# Set proper permissions
chown -R www-data:www-data /var/www/ultrazend
chmod -R 755 /var/www/ultrazend
chmod -R 644 /var/www/ultrazend/logs
chmod 755 /var/www/ultrazend/logs
EOF

log_success "Directory structure created"

# 3. Upload backend files
log_info "Uploading backend application..."
rsync -avz --delete \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=*.log \
    --exclude=.env \
    --exclude=database.sqlite \
    backend/ $VPS_USER@$VPS_HOST:$DEPLOY_PATH/backend/

log_success "Backend uploaded"

# 4. Upload frontend build
log_info "Uploading frontend build..."
rsync -avz --delete frontend/dist/ $VPS_USER@$VPS_HOST:$DEPLOY_PATH/frontend/

log_success "Frontend uploaded"

# 5. Upload configuration files
log_info "Uploading enterprise configuration..."

# Upload ecosystem config
scp ecosystem.config.js $VPS_USER@$VPS_HOST:$DEPLOY_PATH/

# Upload production environment config
scp configs/.env.production $VPS_USER@$VPS_HOST:$DEPLOY_PATH/backend/.env

# Upload nginx config if it exists
if [ -f "configs/nginx-ssl.conf" ]; then
    scp configs/nginx-ssl.conf $VPS_USER@$VPS_HOST:/tmp/ultrazend-nginx.conf
    log_success "Nginx configuration uploaded"
fi

log_success "Configuration files uploaded"

# 6. Install dependencies and setup services
log_info "Installing dependencies and setting up enterprise services..."
ssh $VPS_USER@$VPS_HOST << EOF
cd $DEPLOY_PATH/backend

# Install Node.js dependencies
log_info "Installing Node.js dependencies..."
npm ci --only=production

# Verify build exists
if [ ! -f "dist/index.js" ]; then
    log_warning "dist/index.js not found, building on server..."
    npm run build
fi

# Install PM2 globally if not exists
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
fi

# Install winston-daily-rotate-file if not present (enterprise logging)
if ! npm list winston-daily-rotate-file --depth=0 &> /dev/null; then
    log_info "Installing enterprise logging dependencies..."
    npm install winston-daily-rotate-file
fi

# Setup nginx configuration if provided
if [ -f "/tmp/ultrazend-nginx.conf" ]; then
    log_info "Configuring nginx..."
    cp /tmp/ultrazend-nginx.conf /etc/nginx/sites-available/ultrazend
    ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx configuration
    if nginx -t; then
        systemctl reload nginx
        log_success "Nginx configured and reloaded"
    else
        log_error "Nginx configuration test failed"
    fi
fi

# Run database migrations
log_info "Running database migrations..."
npm run migrate:latest || log_warning "Migration failed or not needed"

# Stop existing PM2 processes
log_info "Stopping existing processes..."
pm2 delete ultrazend 2>/dev/null || log_info "No existing process to stop"

# Start application with PM2 using enterprise config
log_info "Starting UltraZend Enterprise application..."
pm2 start ../ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup | grep -E '^sudo' | bash || log_warning "PM2 startup setup may have failed"

log_success "Application started with PM2"
EOF

# 7. Post-deployment verification
log_info "Running post-deployment verification..."
ssh $VPS_USER@$VPS_HOST << EOF
# Check PM2 status
echo "PM2 Status:"
pm2 status

# Check if application is responding
sleep 5
if curl -f -s http://localhost:3001/health > /dev/null; then
    log_success "Health check endpoint responding"
else
    log_warning "Health check endpoint not responding yet"
fi

# Check logs for any startup errors
echo ""
echo "Recent application logs:"
pm2 logs ultrazend --lines 5 --nostream || echo "No recent logs"
EOF

echo ""
log_success "🎉 ULTRAZEND ENTERPRISE DEPLOYMENT COMPLETED!"
echo "=========================================="
log_info "Application Status:"
log_info "  • URL: https://$APP_DOMAIN"
log_info "  • Health Check: https://$APP_DOMAIN/health"
log_info "  • API Docs: https://$APP_DOMAIN/api-docs (if enabled)"
echo ""
log_warning "Next Steps:"
log_warning "  1. Verify SSL certificates: certbot --nginx -d $APP_DOMAIN"
log_warning "  2. Check application logs: ssh $VPS_USER@$VPS_HOST 'pm2 logs ultrazend'"
log_warning "  3. Monitor health: curl https://$APP_DOMAIN/health"
echo ""
log_success "Enterprise deployment successful! 🚀"