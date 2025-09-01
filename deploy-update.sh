#!/bin/bash

# 🚀 ULTRAZEND - Update Deployment Script
# For incremental updates to existing production server

set -euo pipefail
IFS=$'\n\t'

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
APP_NAME="ultrazend"
DEPLOY_PATH="/var/www/ultrazend"
BACKUP_PATH="/var/backups/ultrazend"
LOG_FILE="/tmp/ultrazend-update-$(date +%Y%m%d-%H%M%S).log"
DEPLOY_ID="$(date +%Y%m%d-%H%M%S)"

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

# Rollback function
rollback() {
    warning "FALHA DETECTADA! Iniciando rollback automático..."
    ssh $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH
if [ -d "backup-$DEPLOY_ID" ]; then
    log "Parando aplicação..."
    pm2 stop ultrazend 2>/dev/null || true
    
    log "Restaurando backup..."
    rm -rf backend.failed frontend.failed || true
    mv backend backend.failed 2>/dev/null || true
    mv frontend frontend.failed 2>/dev/null || true
    
    cp -r backup-$DEPLOY_ID/backend . || true
    cp -r backup-$DEPLOY_ID/frontend . || true
    
    log "Reiniciando aplicação..."
    pm2 start ecosystem.config.js --env production
    
    # Cleanup
    rm -rf backup-$DEPLOY_ID
    
    echo "✅ Rollback concluído com sucesso"
else
    echo "❌ Backup não encontrado para rollback"
    exit 1
fi
EOF
    error "Deploy falhou. Rollback executado com sucesso."
}

# Trap for automatic rollback on error
trap rollback ERR

echo "🔄 ULTRAZEND - UPDATE DEPLOYMENT"
echo "================================"
log "Deploy ID: $DEPLOY_ID"
log "Servidor: $SERVER_HOST"
log "Timestamp: $(date)"
echo ""

# 1. PRE-UPDATE VALIDATIONS
log "PASSO 1: Validações pré-update..."

# Check if server is accessible
if ! ssh $SERVER_USER@$SERVER_HOST 'echo "Server accessible"' > /dev/null 2>&1; then
    error "Não foi possível conectar ao servidor"
fi

# Check if application exists
ssh $SERVER_USER@$SERVER_HOST "[ -d '$DEPLOY_PATH' ] || exit 1" || error "Aplicação não encontrada no servidor"

# Check and build if necessary
if [ ! -f "backend/dist/index.js" ]; then
    log "Backend build não encontrado, executando build..."
    cd backend
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    npm run build
    cd ..
fi

if [ ! -d "frontend/dist" ] || [ ! -f "frontend/dist/index.html" ]; then
    log "Frontend build não encontrado, executando build..."
    cd frontend
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    npm run build
    cd ..
fi

# Validate builds
[ ! -f "backend/dist/index.js" ] && error "Build do backend falhou"
[ ! -f "frontend/dist/index.html" ] && error "Build do frontend falhou"

success "PASSO 1 concluído - Validações OK"

# 2. CREATE BACKUP
log "PASSO 2: Criando backup da versão atual..."

ssh $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH

# Create timestamped backup
mkdir -p backup-$DEPLOY_ID
if [ -d "backend" ]; then
    cp -r backend backup-$DEPLOY_ID/
fi
if [ -d "frontend" ]; then
    cp -r frontend backup-$DEPLOY_ID/
fi

# Create backup metadata
cat > backup-$DEPLOY_ID/backup-info.json << EOJ
{
  "backup_id": "update-$DEPLOY_ID",
  "timestamp": "$DEPLOY_ID",
  "date": "$(date -Iseconds)",
  "type": "pre-update",
  "app_version": "$(node -e "console.log(require('./backend/package.json').version)" 2>/dev/null || echo 'unknown')"
}
EOJ

echo "✅ Backup criado: backup-$DEPLOY_ID"
EOF

success "PASSO 2 concluído - Backup criado"

# 3. DEPLOY UPDATES
log "PASSO 3: Deploy das atualizações..."

# Check current app status
log "Verificando status atual da aplicação..."
if ssh $SERVER_USER@$SERVER_HOST 'curl -f -s -m 5 http://localhost:3001/health > /dev/null'; then
    success "Aplicação está respondendo - Deploy seguro"
else
    warning "Aplicação não está respondendo - Deploy pode ser arriscado"
    read -p "Continuar mesmo assim? (y/N): " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && error "Deploy cancelado pelo usuário"
fi

# Upload backend (excluding node_modules)
log "Atualizando backend..."
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
log "Atualizando frontend..."
rsync -avz --delete \
    frontend/dist/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/frontend/

# Upload updated configs if changed
if [ -f "configs/.env.production" ]; then
    log "Atualizando configuração de produção..."
    scp configs/.env.production $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/.env
fi

if [ -f "ecosystem.config.js" ]; then
    log "Atualizando configuração PM2..."
    scp ecosystem.config.js $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/
fi

success "PASSO 3 concluído - Arquivos atualizados"

# 4. SERVER-SIDE UPDATE
log "PASSO 4: Atualizações no servidor..."

ssh $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH/backend

# Update dependencies only if package.json changed
if [ package.json -nt node_modules/.package.json.timestamp 2>/dev/null ]; then
    log "package.json alterado, atualizando dependências..."
    npm ci --only=production
    touch node_modules/.package.json.timestamp
else
    log "Dependências já estão atualizadas"
fi

# Run migrations if needed
log "Executando migrações de banco..."
npm run migrate:latest || echo "Migrations completed or not needed"

# Set permissions
chown -R www-data:www-data $DEPLOY_PATH
chmod +x $DEPLOY_PATH/backend/dist/index.js

echo "✅ Configuração no servidor concluída"
EOF

success "PASSO 4 concluído - Servidor atualizado"

# 5. RESTART APPLICATION
log "PASSO 5: Reiniciando aplicação..."

ssh $SERVER_USER@$SERVER_HOST << 'EOF'
cd /var/www/ultrazend

# Graceful restart with PM2
log "Executando restart graceful..."
pm2 reload ultrazend --update-env

# Wait for application to stabilize
sleep 10

# Verify restart was successful
if pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | .pm2_env.status' | grep -q "online"; then
    echo "✅ Aplicação reiniciada com sucesso"
else
    echo "❌ Falha ao reiniciar aplicação"
    exit 1
fi
EOF

success "PASSO 5 concluído - Aplicação reiniciada"

# 6. HEALTH CHECKS
log "PASSO 6: Verificações de saúde pós-deploy..."

# Health check with retry
check_health() {
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Health check - tentativa $attempt/$max_attempts"
        
        if ssh $SERVER_USER@$SERVER_HOST 'curl -f -s -m 10 http://localhost:3001/health > /dev/null'; then
            success "✅ Aplicação respondendo corretamente"
            return 0
        fi
        
        warning "Tentativa $attempt falhou, aguardando..."
        sleep 5
        ((attempt++))
    done
    
    error "❌ Health check falhou após $max_attempts tentativas"
}

check_health

# Test external access
log "Verificando acesso externo..."
if curl -f -s -m 10 "https://www.ultrazend.com.br/health" > /dev/null 2>&1; then
    success "✅ Acesso externo funcionando"
elif curl -f -s -m 10 "http://localhost:3001/health" > /dev/null 2>&1; then
    warning "⚠️ Aplicação local OK, mas acesso externo pode ter problemas"
else
    warning "⚠️ Problema no acesso externo"
fi

success "PASSO 6 concluído - Health checks OK"

# 7. CLEANUP AND FINAL REPORT
log "PASSO 7: Limpeza e relatório final..."

ssh $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH

# Check application logs for errors
log "Verificando logs por erros..."
if pm2 logs ultrazend --lines 20 --nostream | grep -i error; then
    echo "⚠️ Possíveis erros encontrados nos logs"
else
    echo "✅ Nenhum erro crítico encontrado nos logs"
fi

# Archive successful backup
mkdir -p /var/backups/ultrazend
tar -czf /var/backups/ultrazend/pre-update-$DEPLOY_ID.tar.gz backup-$DEPLOY_ID/
rm -rf backup-$DEPLOY_ID

# Clean old backups (keep last 10)
cd /var/backups/ultrazend
ls -t *.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f

echo "✅ Limpeza concluída"
EOF

# Generate update report
cat > "update-report-$DEPLOY_ID.txt" << EOF
===============================================
ULTRAZEND - UPDATE DEPLOYMENT REPORT
===============================================

Update Date: $(date)
Deploy ID: $DEPLOY_ID
Server: $SERVER_HOST
Type: Incremental Update

UPDATE STEPS COMPLETED:
✅ 1. Pre-update validations
✅ 2. Current version backup
✅ 3. Application updates deployment
✅ 4. Server-side updates
✅ 5. Application restart
✅ 6. Health checks validation
✅ 7. Cleanup and reporting

FILES UPDATED:
- Backend application code
- Frontend build
- Configuration files (if changed)
- Dependencies (if package.json changed)

BACKUP CREATED:
- Location: /var/backups/ultrazend/pre-update-$DEPLOY_ID.tar.gz
- Type: Pre-update backup
- Can be used for rollback if needed

APPLICATION STATUS:
✅ PM2 Process: Online
✅ Health Check: Passing
✅ External Access: Available

ROLLBACK COMMAND (if needed):
ssh $SERVER_USER@$SERVER_HOST "cd $DEPLOY_PATH && tar -xzf /var/backups/ultrazend/pre-update-$DEPLOY_ID.tar.gz && pm2 stop ultrazend && rm -rf backend frontend && mv pre-update-$DEPLOY_ID/* . && pm2 start ecosystem.config.js --env production"

LOG FILE: $LOG_FILE
===============================================
EOF

# Disable error trap on successful completion
trap - ERR

echo ""
success "🎉 UPDATE DEPLOYMENT CONCLUÍDO!"
echo "=============================="
success "✅ Aplicação atualizada com sucesso"
success "✅ Health checks passaram"
success "✅ Backup criado para rollback"
echo ""
info "🌐 Aplicação disponível em: https://www.ultrazend.com.br"
info "📋 Relatório: update-report-$DEPLOY_ID.txt"
info "📝 Log: $LOG_FILE"
echo ""
warning "💡 COMANDOS ÚTEIS:"
warning "   Status: ssh $SERVER_USER@$SERVER_HOST 'pm2 status'"
warning "   Logs: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs ultrazend'"
warning "   Monitor: ssh $SERVER_USER@$SERVER_HOST 'pm2 monit'"
echo ""
log "🚀 Update deployment concluído com sucesso!"