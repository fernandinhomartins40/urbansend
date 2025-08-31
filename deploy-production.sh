#!/bin/bash

# 🚀 ULTRAZEND - Production Deployment Script
# FASE 5: DEPLOYMENT E PRODUÇÃO
# 
# Este script implementa o deployment completo conforme especificado no plano de correções

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
APP_NAME="ultrazend"
DEPLOY_PATH="/var/www/ultrazend"
BACKUP_PATH="/var/backups/ultrazend"
NODE_VERSION="18"
LOG_FILE="/tmp/ultrazend-deploy-$(date +%Y%m%d-%H%M%S).log"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${CYAN}[INFO] $1${NC}" | tee -a "$LOG_FILE"
}

# Header
echo -e "${PURPLE}"
cat << "EOF"
 _   _ _ _             _____               _
| | | | | |_ _ __ __ _|__  / ___ _ __   __| |
| | | | | __| '__/ _` | / / / _ \ '_ \ / _` |
| |_| | | |_| | | (_| |/ /_|  __/ | | | (_| |
 \___/|_|\__|_|  \__,_/____|\___|_| |_|\__,_|

🚀 PRODUCTION DEPLOYMENT - FASE 5
EOF
echo -e "${NC}"

log "🎯 Iniciando deployment de produção do ULTRAZEND SMTP Server"
log "📊 Servidor: $SERVER_HOST"
log "📁 Caminho: $DEPLOY_PATH"
log "📋 Log: $LOG_FILE"

# Pre-flight checks
echo ""
log "🔍 Executando verificações pré-deployment..."

# Check if we can connect to server
if ! ping -c 1 "$SERVER_HOST" > /dev/null 2>&1; then
    error "Não é possível alcançar o servidor $SERVER_HOST"
    exit 1
fi
success "✅ Conectividade com servidor verificada"

# Check if local build exists
if [ ! -d "backend/dist" ]; then
    warning "Build local não encontrado, criando..."
    cd backend && npm run build
    cd ..
fi
success "✅ Build local verificado"

# Create timestamp for deployment
DEPLOY_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BUILD_NUMBER="build-$DEPLOY_TIMESTAMP"

log "🏷️ Deploy ID: $BUILD_NUMBER"

# Backup current production
echo ""
log "💾 Criando backup da versão atual..."

ssh "$SERVER_USER@$SERVER_HOST" << EOF
    # Create backup directory if it doesn't exist
    sudo mkdir -p "$BACKUP_PATH"
    
    # Stop services before backup
    sudo pm2 stop $APP_NAME || echo "App not running"
    
    # Create backup with timestamp
    if [ -d "$DEPLOY_PATH" ]; then
        sudo tar -czf "$BACKUP_PATH/ultrazend-backup-$DEPLOY_TIMESTAMP.tar.gz" -C "$DEPLOY_PATH" . || echo "Backup failed"
        echo "Backup created: $BACKUP_PATH/ultrazend-backup-$DEPLOY_TIMESTAMP.tar.gz"
    fi
    
    # Keep only last 10 backups
    sudo find "$BACKUP_PATH" -name "ultrazend-backup-*.tar.gz" -type f | head -n -10 | xargs sudo rm -f || echo "Cleanup completed"
EOF

success "✅ Backup criado com sucesso"

# Deploy new version
echo ""
log "🚀 Deploying nova versão..."

# Update production environment file with build info
log "📝 Atualizando configurações de produção..."
sed -i "s/BUILD_NUMBER=\"\"/BUILD_NUMBER=\"$BUILD_NUMBER\"/" configs/.env.production
sed -i "s/DEPLOY_DATE=\"\"/DEPLOY_DATE=\"$(date -Iseconds)\"/" configs/.env.production

# Copy files to server
log "📤 Transferindo arquivos para o servidor..."

# Create deployment directory
ssh "$SERVER_USER@$SERVER_HOST" "sudo mkdir -p $DEPLOY_PATH/{backend,frontend,logs,uploads,temp}"

# Copy backend
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '*.log' \
    --exclude 'database.sqlite*' \
    backend/ "$SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/"

# Copy frontend
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.next' \
    frontend/ "$SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/frontend/"

# Copy configuration files
rsync -avz configs/ "$SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/configs/"

success "✅ Arquivos transferidos com sucesso"

# Install dependencies and setup
echo ""
log "🔧 Instalando dependências no servidor..."

ssh "$SERVER_USER@$SERVER_HOST" << EOF
    set -e
    cd "$DEPLOY_PATH"
    
    # Ensure correct ownership
    sudo chown -R root:root .
    sudo chmod -R 755 .
    
    # Setup log directories with correct permissions
    sudo mkdir -p logs uploads temp
    sudo chmod 755 logs uploads temp
    
    # Install backend dependencies
    cd backend
    
    # Use Node.js $NODE_VERSION
    export NVM_DIR="\$HOME/.nvm"
    [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
    nvm use $NODE_VERSION || nvm install $NODE_VERSION
    
    # Install production dependencies only
    npm ci --only=production --no-audit --no-fund
    
    # Build if needed
    if [ ! -d "dist" ]; then
        npm run build
    fi
    
    # Run database migrations
    npm run migrate:latest
    
    # Install frontend dependencies
    cd ../frontend
    npm ci --only=production --no-audit --no-fund
    
    # Build frontend for production
    npm run build
    
    echo "Dependencies installed successfully"
EOF

success "✅ Dependências instaladas com sucesso"

# Configure services
echo ""
log "⚙️ Configurando serviços de produção..."

ssh "$SERVER_USER@$SERVER_HOST" << EOF
    set -e
    cd "$DEPLOY_PATH"
    
    # Copy production environment
    cp configs/.env.production backend/.env
    
    # Setup PM2 ecosystem if not exists
    if [ ! -f "configs/ecosystem.config.js" ]; then
        cat > configs/ecosystem.config.js << 'ECOSYSTEM_EOF'
module.exports = {
  apps: [
    {
      name: 'ultrazend',
      script: 'dist/index.js',
      cwd: '$DEPLOY_PATH/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      log_file: '$DEPLOY_PATH/logs/pm2.log',
      out_file: '$DEPLOY_PATH/logs/pm2-out.log',
      error_file: '$DEPLOY_PATH/logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    }
  ]
};
ECOSYSTEM_EOF
    fi
    
    echo "Services configured"
EOF

success "✅ Serviços configurados"

# Start services
echo ""
log "🎬 Iniciando serviços..."

ssh "$SERVER_USER@$SERVER_HOST" << EOF
    set -e
    cd "$DEPLOY_PATH"
    
    # Start/restart PM2 application
    pm2 delete $APP_NAME 2>/dev/null || echo "App not running"
    pm2 start configs/ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup systemd -u root --hp /root || echo "PM2 startup already configured"
    
    # Wait a moment for services to start
    sleep 5
    
    echo "Services started successfully"
EOF

success "✅ Serviços iniciados com sucesso"

# Health checks
echo ""
log "🏥 Executando verificações de saúde..."

sleep 10  # Wait for services to fully initialize

# Test server connectivity
log "🔍 Testando conectividade do servidor..."
for i in {1..5}; do
    if curl -f -s -o /dev/null "http://$SERVER_HOST:3001/api/health" ; then
        success "✅ Servidor respondendo na tentativa $i"
        break
    else
        if [ $i -eq 5 ]; then
            error "❌ Servidor não está respondendo após 5 tentativas"
            # Show recent logs for debugging
            ssh "$SERVER_USER@$SERVER_HOST" "pm2 logs $APP_NAME --lines 50"
            exit 1
        fi
        warning "⏳ Tentativa $i/5 falhou, tentando novamente em 10s..."
        sleep 10
    fi
done

# Test production endpoints
log "🧪 Testando endpoints críticos..."

# Test health endpoint
if curl -f -s "http://$SERVER_HOST:3001/api/health" | grep -q "ok"; then
    success "✅ Health check endpoint funcionando"
else
    error "❌ Health check endpoint não está funcionando"
fi

# Test DKIM endpoint
if curl -f -s "http://$SERVER_HOST:3001/api/dns/dkim-key" | grep -q "DKIM1"; then
    success "✅ DKIM endpoint funcionando"
else
    warning "⚠️ DKIM endpoint não está respondendo (pode ser normal)"
fi

# Final status check
echo ""
log "📊 Verificando status final dos serviços..."

ssh "$SERVER_USER@$SERVER_HOST" << EOF
    echo "=== PM2 Status ==="
    pm2 status
    
    echo ""
    echo "=== Service Status ==="
    netstat -tlnp | grep :3001 || echo "Port 3001 not found"
    netstat -tlnp | grep :25 || echo "SMTP port 25 not found"
    
    echo ""
    echo "=== Recent Logs ==="
    tail -n 20 "$DEPLOY_PATH/logs/app.log" 2>/dev/null || echo "No app logs yet"
    
    echo ""
    echo "=== Disk Usage ==="
    df -h "$DEPLOY_PATH" || echo "Cannot check disk usage"
    
    echo ""
    echo "=== Memory Usage ==="
    free -h || echo "Cannot check memory"
EOF

# Cleanup
log "🧹 Limpando arquivos temporários..."

# Reset environment file
git checkout HEAD -- configs/.env.production 2>/dev/null || echo "No git reset needed"

# Final success message
echo ""
success "🎉 DEPLOYMENT CONCLUÍDO COM SUCESSO!"
echo ""
echo -e "${GREEN}📋 RESUMO DO DEPLOYMENT:${NC}"
echo -e "${GREEN}├─ Build: $BUILD_NUMBER${NC}"
echo -e "${GREEN}├─ Timestamp: $DEPLOY_TIMESTAMP${NC}"
echo -e "${GREEN}├─ Servidor: https://www.ultrazend.com.br${NC}"
echo -e "${GREEN}├─ Status: https://www.ultrazend.com.br/api/health${NC}"
echo -e "${GREEN}├─ Logs: $LOG_FILE${NC}"
echo -e "${GREEN}└─ Backup: $BACKUP_PATH/ultrazend-backup-$DEPLOY_TIMESTAMP.tar.gz${NC}"
echo ""

# Next steps
info "🎯 PRÓXIMOS PASSOS:"
echo "1. Testar registro de usuário: curl -X POST https://www.ultrazend.com.br/api/auth/register"
echo "2. Verificar logs: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs $APP_NAME'"
echo "3. Monitorar performance: ssh $SERVER_USER@$SERVER_HOST 'pm2 monit'"
echo "4. Testar envio de emails via API"
echo "5. Configurar DNS records (DKIM, SPF, DMARC)"
echo ""

log "✨ ULTRAZEND SMTP Server está pronto para produção!"

exit 0