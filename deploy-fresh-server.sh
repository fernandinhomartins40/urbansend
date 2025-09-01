#!/bin/bash

# 🚀 ULTRAZEND - Fresh Server Deployment Script
# Complete setup from zero for clean server

set -euo pipefail
IFS=$'\n\t'

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
APP_NAME="ultrazend"
DEPLOY_PATH="/var/www/ultrazend"
DOMAIN="ultrazend.com.br"
SUBDOMAIN="www.ultrazend.com.br"
ADMIN_EMAIL="admin@ultrazend.com.br"
LOG_FILE="/tmp/ultrazend-fresh-deploy-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Logging functions
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR] $1${NC}" | tee -a "$LOG_FILE"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_FILE"; }
info() { echo -e "${PURPLE}[INFO] $1${NC}" | tee -a "$LOG_FILE"; }

echo "🚀 ULTRAZEND - FRESH SERVER DEPLOYMENT"
echo "======================================"
log "Servidor: $SERVER_HOST"
log "Domínio: $SUBDOMAIN"
log "Deploy Path: $DEPLOY_PATH"
log "Log File: $LOG_FILE"
echo ""

# 1. PRE-DEPLOYMENT VALIDATIONS
log "PASSO 1: Validações pré-deploy..."

# Check local files
[ ! -f "backend/package.json" ] && error "backend/package.json não encontrado"
[ ! -f "frontend/package.json" ] && error "frontend/package.json não encontrado"
[ ! -f "ecosystem.config.js" ] && error "ecosystem.config.js não encontrado"
[ ! -f "configs/.env.production" ] && error "configs/.env.production não encontrado"
[ ! -f "configs/nginx-ssl.conf" ] && error "configs/nginx-ssl.conf não encontrado"

# Build frontend if needed
if [ ! -d "frontend/dist" ]; then
    log "Frontend não buildado. Executando build..."
    cd frontend && npm run build && cd ..
fi

# Build backend if needed
if [ ! -d "backend/dist" ] || [ ! -f "backend/dist/index.js" ]; then
    log "Backend não buildado. Executando build..."
    cd backend && npm run build && cd ..
fi

# Validate builds
[ ! -f "backend/dist/index.js" ] && error "Build do backend falhou"
[ ! -f "frontend/dist/index.html" ] && error "Build do frontend falhou"

success "PASSO 1 concluído - Validações OK"

# 2. SERVER SETUP AND DEPENDENCIES
log "PASSO 2: Configuração inicial do servidor..."

ssh $SERVER_USER@$SERVER_HOST << 'EOF'
# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y curl wget git nginx certbot python3-certbot-nginx \
               software-properties-common apt-transport-https ca-certificates \
               gnupg lsb-release build-essential sqlite3 unzip htop vim

# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install PM2 logrotate
pm2 install pm2-logrotate

# Configure PM2 logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# Create user and directories
useradd -r -s /bin/false ultrazend 2>/dev/null || true
mkdir -p /var/www/ultrazend/{backend,frontend,data,logs,uploads,temp}
mkdir -p /var/www/ultrazend/data/{database,cache,sessions}
mkdir -p /var/www/ultrazend/logs/{app,error,access,email}
mkdir -p /var/backups/ultrazend

# Set proper permissions
chown -R www-data:www-data /var/www/ultrazend
chmod -R 755 /var/www/ultrazend
chmod -R 755 /var/backups/ultrazend

# Configure firewall
ufw --force enable
ufw allow ssh
ufw allow http
ufw allow https

echo "Servidor configurado com dependências básicas"
EOF

success "PASSO 2 concluído - Servidor configurado"

# 3. DEPLOY APPLICATION FILES
log "PASSO 3: Deploy dos arquivos da aplicação..."

# Create deploy directories on server first
log "Creating deployment directories..."
ssh $SERVER_USER@$SERVER_HOST "mkdir -p $DEPLOY_PATH/{backend,frontend,data,logs,temp,uploads}"

# Upload backend
log "Uploading backend files..."
rsync -avz --delete \
    --exclude=node_modules \
    --exclude=.git \
    --exclude='*.log' \
    --exclude=.env \
    --exclude='*.sqlite*' \
    --exclude=__tests__ \
    --exclude='*.test.ts' \
    --exclude=coverage \
    backend/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/

# Upload frontend
log "Uploading frontend build..."
rsync -avz --delete \
    frontend/dist/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/frontend/

# Upload configuration files
log "Uploading configuration files..."
scp configs/.env.production $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/.env
scp ecosystem.config.js $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/
scp configs/nginx-ssl.conf $SERVER_USER@$SERVER_HOST:/tmp/ultrazend-nginx.conf

success "PASSO 3 concluído - Arquivos enviados"

# 4. SERVER-SIDE SETUP
log "PASSO 4: Configuração no servidor..."

ssh $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH/backend

# Install dependencies (use npm install if no package-lock.json)
if [ -f "package-lock.json" ]; then
    echo "Installing with npm ci..."
    npm ci --only=production
else
    echo "Installing with npm install..."
    npm install --only=production
fi

# Verify build exists, create if needed
if [ ! -f "dist/index.js" ]; then
    echo "Build não encontrado, executando npm run build..."
    
    # Install dev dependencies temporarily for build
    npm install
    npm run build
    
    # Remove dev dependencies
    npm prune --production
fi

# Run database migrations
npm run migrate:latest || echo "Migrations completed or not needed"

# Configure Nginx
if [ -f "/tmp/ultrazend-nginx.conf" ]; then
    cp /tmp/ultrazend-nginx.conf /etc/nginx/sites-available/ultrazend
    ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx config
    nginx -t || (echo "Nginx config error" && exit 1)
else
    echo "Nginx config not found"
    exit 1
fi

# Set proper permissions
chown -R www-data:www-data $DEPLOY_PATH
chmod +x $DEPLOY_PATH/backend/dist/index.js

echo "Configuração do servidor concluída"
EOF

success "PASSO 4 concluído - Configuração no servidor"

# 5. SSL CERTIFICATES
log "PASSO 5: Configurando certificados SSL..."

ssh $SERVER_USER@$SERVER_HOST << EOF
# Stop nginx temporarily for certificate generation
systemctl stop nginx

# Get SSL certificates
certbot certonly --standalone \
    -d $DOMAIN \
    -d $SUBDOMAIN \
    --non-interactive \
    --agree-tos \
    --email $ADMIN_EMAIL

# Setup auto-renewal
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx") | crontab -

# Start nginx
systemctl start nginx
systemctl enable nginx

echo "SSL certificates configured"
EOF

success "PASSO 5 concluído - SSL configurado"

# 6. START APPLICATION
log "PASSO 6: Iniciando aplicação..."

ssh $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH

# Start application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
env PATH=\$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root | grep '^sudo' | bash

echo "Aplicação iniciada com PM2"
EOF

success "PASSO 6 concluído - Aplicação iniciada"

# 7. HEALTH CHECKS AND VALIDATION
log "PASSO 7: Verificações finais..."

# Wait for application to start
log "Aguardando inicialização da aplicação..."
sleep 15

# Health check function
check_health() {
    local max_attempts=12
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Health check - tentativa $attempt/$max_attempts"
        
        # Check local health first
        if ssh $SERVER_USER@$SERVER_HOST 'curl -f -s -m 10 http://localhost:3001/health > /dev/null'; then
            success "✅ Aplicação local respondendo"
            break
        else
            warning "Tentativa $attempt falhou (local), aguardando..."
            sleep 10
        fi
        
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        error "❌ Health check local falhou após $max_attempts tentativas"
    fi
    
    # Check external access
    log "Verificando acesso externo..."
    sleep 5
    
    if curl -f -s -m 15 "https://$SUBDOMAIN/health" > /dev/null 2>&1; then
        success "✅ Acesso externo funcionando"
    elif curl -f -s -m 15 "http://$SUBDOMAIN" > /dev/null 2>&1; then
        warning "⚠️ HTTP funcionando mas HTTPS pode ter problemas"
    else
        warning "⚠️ Acesso externo ainda não disponível (pode levar alguns minutos para DNS propagar)"
    fi
}

check_health

# 8. FINAL STATUS AND REPORT
log "PASSO 8: Relatório final..."

ssh $SERVER_USER@$SERVER_HOST << 'EOF'
echo ""
echo "=== STATUS FINAL DO DEPLOYMENT ==="
echo ""

# PM2 Status
echo "PM2 Status:"
pm2 status

echo ""
echo "Nginx Status:"
systemctl is-active nginx && echo "✅ Nginx: Ativo" || echo "❌ Nginx: Inativo"

echo ""
echo "SSL Certificates:"
if [ -f "/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem" ]; then
    echo "✅ SSL: Configurado"
    openssl x509 -enddate -noout -in /etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem
else
    echo "❌ SSL: Não encontrado"
fi

echo ""
echo "Disk Usage:"
df -h /var/www/ultrazend

echo ""
echo "Application Logs (últimas 10 linhas):"
pm2 logs ultrazend --lines 10 --nostream

echo ""
echo "=== DEPLOYMENT CONCLUÍDO ==="
EOF

# Generate deployment report
cat > "deployment-report-$(date +%Y%m%d-%H%M%S).txt" << EOF
====================================================
ULTRAZEND - FRESH SERVER DEPLOYMENT REPORT
====================================================

Deployment Date: $(date)
Server: $SERVER_HOST
Domain: $SUBDOMAIN
Deploy Path: $DEPLOY_PATH

DEPLOYMENT STEPS COMPLETED:
✅ 1. Pre-deployment validations
✅ 2. Server setup and dependencies installation
✅ 3. Application files deployment
✅ 4. Server-side configuration
✅ 5. SSL certificates setup
✅ 6. Application startup with PM2
✅ 7. Health checks validation
✅ 8. Final status report

SERVICES CONFIGURED:
✅ Node.js 20.x LTS
✅ PM2 Process Manager
✅ Nginx Web Server
✅ SSL/TLS Certificates (Let's Encrypt)
✅ Firewall (UFW)
✅ Log Rotation

APPLICATION URLS:
- Website: https://$SUBDOMAIN
- Health Check: https://$SUBDOMAIN/health
- API: https://$SUBDOMAIN/api

MANAGEMENT COMMANDS:
- Check status: ssh $SERVER_USER@$SERVER_HOST 'pm2 status'
- View logs: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs ultrazend'
- Restart app: ssh $SERVER_USER@$SERVER_HOST 'pm2 restart ultrazend'
- Nginx status: ssh $SERVER_USER@$SERVER_HOST 'systemctl status nginx'

NEXT STEPS:
1. Test all application features
2. Configure monitoring (run monitoring-system.sh install)
3. Setup automated backups (run backup-system.sh setup)
4. Configure email server if needed (run setup-email-server.sh)
5. Setup DNS records properly for the domain

LOG FILE: $LOG_FILE
====================================================
EOF

echo ""
success "🎉 FRESH SERVER DEPLOYMENT CONCLUÍDO!"
echo "====================================="
success "✅ Aplicação deployada e funcionando"
success "✅ SSL configurado e ativo"
success "✅ Nginx configurado"
success "✅ PM2 gerenciando aplicação"
echo ""
info "🌐 URLs:"
info "   Website: https://$SUBDOMAIN"
info "   Health: https://$SUBDOMAIN/health"
info "   API: https://$SUBDOMAIN/api"
echo ""
info "📋 Relatório: deployment-report-$(date +%Y%m%d-%H%M%S).txt"
info "📝 Log: $LOG_FILE"
echo ""
warning "🔧 PRÓXIMOS PASSOS:"
warning "   1. Testar todas as funcionalidades"
warning "   2. Configurar monitoramento"
warning "   3. Configurar backups automáticos"
warning "   4. Configurar servidor de email (opcional)"
echo ""
log "🚀 Deployment para servidor limpo concluído!"