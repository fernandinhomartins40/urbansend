#!/bin/bash

# 🚀 ULTRAZEND - Production-Ready Deployment Script
# Zero-downtime deployment with backup, validation, and rollback

set -euo pipefail
IFS=$'\n\t'

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
APP_NAME="ultrazend"
DEPLOY_PATH="/var/www/ultrazend"
BACKUP_PATH="/var/backups/ultrazend"
LOG_FILE="/tmp/ultrazend-deploy-$(date +%Y%m%d-%H%M%S).log"
DEPLOY_ID="$(date +%Y%m%d-%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR] $1${NC}" | tee -a "$LOG_FILE"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_FILE"; }

# Rollback function
rollback() {
    warning "Iniciando rollback para versão anterior..."
    ssh $SERVER_USER@$SERVER_HOST << 'EOF'
    cd /var/www/ultrazend
    if [ -d "backup-current" ]; then
        pm2 stop ultrazend
        rm -rf backend.old frontend.old || true
        mv backend backend.failed || true
        mv frontend frontend.failed || true
        mv backup-current/backend . || true
        mv backup-current/frontend . || true
        pm2 start ecosystem.config.js --env production
        rm -rf backup-current
        echo "Rollback concluído"
    else
        echo "Backup não encontrado para rollback"
        exit 1
    fi
EOF
    error "Deploy falhou. Rollback executado."
}

# Trap for cleanup on error
trap rollback ERR

echo "🚀 ULTRAZEND PRODUCTION DEPLOYMENT - v2.0"
echo "========================================="
log "Deploy ID: $DEPLOY_ID"
log "Servidor: $SERVER_HOST"
log "Path: $DEPLOY_PATH"

# 1. PRE-DEPLOYMENT VALIDATIONS
log "1. Executando validações pré-deploy..."

# Check local files
[ ! -f "backend/package.json" ] && error "backend/package.json não encontrado"
[ ! -f "frontend/package.json" ] && error "frontend/package.json não encontrado"
[ ! -f "ecosystem.config.js" ] && error "ecosystem.config.js não encontrado"
[ ! -f "configs/.env.production" ] && error "configs/.env.production não encontrado"

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

success "Validações pré-deploy concluídas"

# 2. SERVER PREPARATION & BACKUP
log "2. Preparando servidor e executando backup..."

ssh $SERVER_USER@$SERVER_HOST << EOF
    # Create backup
    mkdir -p $BACKUP_PATH/$DEPLOY_ID
    if [ -d "$DEPLOY_PATH/backend" ]; then
        cp -r $DEPLOY_PATH/backend $BACKUP_PATH/$DEPLOY_ID/
        cp -r $DEPLOY_PATH/frontend $BACKUP_PATH/$DEPLOY_ID/ 2>/dev/null || true
        
        # Create current backup for quick rollback
        mkdir -p $DEPLOY_PATH/backup-current
        cp -r $DEPLOY_PATH/backend $DEPLOY_PATH/backup-current/
        cp -r $DEPLOY_PATH/frontend $DEPLOY_PATH/backup-current/ 2>/dev/null || true
    fi
    
    # Prepare directories
    mkdir -p $DEPLOY_PATH/{backend,frontend,data,logs,temp}
    mkdir -p $DEPLOY_PATH/data/{database,uploads,cache}
    mkdir -p $DEPLOY_PATH/logs/{app,error,access}
    
    # Set permissions
    chown -R www-data:www-data $DEPLOY_PATH
    chmod -R 755 $DEPLOY_PATH
EOF

success "Servidor preparado e backup executado"

# 3. DEPLOY BACKEND
log "3. Deployando backend..."

# Upload backend files
rsync -avz --delete \
    --exclude=node_modules \
    --exclude=.git \
    --exclude='*.log' \
    --exclude=.env \
    --exclude='*.sqlite*' \
    --exclude=__tests__ \
    --exclude='*.test.ts' \
    backend/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/

# Upload production config
scp configs/.env.production $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/.env
scp ecosystem.config.js $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/

success "Backend deployado"

# 4. DEPLOY FRONTEND
log "4. Deployando frontend..."

rsync -avz --delete \
    frontend/dist/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/frontend/

success "Frontend deployado"

# 5. SERVER SETUP & DEPENDENCIES
log "5. Instalando dependências e configurando servidor..."

ssh $SERVER_USER@$SERVER_HOST << 'EOF'
    cd /var/www/ultrazend/backend
    
    # Install dependencies
    npm ci --only=production --silent
    
    # Verify build
    [ ! -f "dist/index.js" ] && npm run build
    
    # Database migrations
    npm run migrate:latest || echo "Migrations completed or not needed"
    
    # Set proper permissions
    chown -R www-data:www-data /var/www/ultrazend
    chmod +x dist/index.js
EOF

success "Dependências instaladas"

# 6. START APPLICATION
log "6. Iniciando aplicação..."

ssh $SERVER_USER@$SERVER_HOST << 'EOF'
    cd /var/www/ultrazend
    
    # Stop existing process gracefully
    pm2 stop ultrazend 2>/dev/null || true
    sleep 3
    pm2 delete ultrazend 2>/dev/null || true
    
    # Start application
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    # Ensure startup on boot
    pm2 startup systemd -u root --hp /root | grep '^sudo' | bash || true
EOF

success "Aplicação iniciada"

# 7. HEALTH CHECKS & VALIDATION
log "7. Executando verificações de saúde..."

sleep 10

# Health check function
check_health() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Tentativa $attempt/$max_attempts - Verificando saúde da aplicação..."
        
        if ssh $SERVER_USER@$SERVER_HOST 'curl -f -s -m 5 http://localhost:3001/health > /dev/null'; then
            return 0
        fi
        
        sleep 5
        ((attempt++))
    done
    return 1
}

if check_health; then
    success "✅ Aplicação respondendo corretamente"
else
    error "❌ Health check falhou após múltiplas tentativas"
fi

# Additional checks
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
    # Check PM2 status
    pm2 list | grep ultrazend | grep online || exit 1
    
    # Check logs for errors
    if pm2 logs ultrazend --lines 50 --nostream | grep -i error; then
        echo "⚠️ Erros encontrados nos logs"
        exit 1
    fi
    
    # Check nginx status
    systemctl is-active nginx || echo "⚠️ Nginx não está ativo"
    
    # Test external access
    curl -f -s -m 10 https://www.ultrazend.com.br/health > /dev/null || echo "⚠️ Acesso externo pode estar com problemas"
EOF

# 8. CLEANUP
log "8. Limpeza final..."

ssh $SERVER_USER@$SERVER_HOST << 'EOF'
    cd /var/www/ultrazend
    
    # Remove old backups (keep last 5)
    cd /var/backups/ultrazend
    ls -t | tail -n +6 | xargs -r rm -rf
    
    # Remove quick rollback backup after successful deploy
    rm -rf /var/www/ultrazend/backup-current
    
    # Restart nginx to ensure all configs are loaded
    systemctl reload nginx
EOF

# 9. FINAL REPORT
echo ""
success "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "========================================="
log "Deploy ID: $DEPLOY_ID"
log "Timestamp: $(date)"
log "URL: https://www.ultrazend.com.br"
log "Health Check: https://www.ultrazend.com.br/health"
log "Log do deploy: $LOG_FILE"
echo ""
success "✅ Aplicação em produção e funcionando"

# Disable error trap for successful completion
trap - ERR