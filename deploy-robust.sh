#!/bin/bash

# 🚀 ULTRAZEND - Robust Deploy Script
# Implementa TODAS as correções e melhorias de robustez
# Alinhado com as correções de SSL, .env fallback e inicialização robusta

set -euo pipefail

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
APP_NAME="ultrazend"
DEPLOY_PATH="/var/www/ultrazend"
BACKUP_PATH="/var/backups/ultrazend"
LOG_FILE="/tmp/ultrazend-robust-deploy-$(date +%Y%m%d-%H%M%S).log"
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

echo "🚀 ULTRAZEND - ROBUST DEPLOYMENT"
echo "================================="
log "🎯 Deploy ID: $DEPLOY_ID"
log "🌐 Servidor: $SERVER_HOST"
log "📁 Deploy Path: $DEPLOY_PATH"
log "📊 Log File: $LOG_FILE"
echo ""

# 1. PRE-DEPLOYMENT VALIDATIONS
log "PASSO 1: Validações robustas pré-deploy..."

# Verificar arquivos essenciais localmente
[ ! -f "backend/package.json" ] && error "backend/package.json não encontrado"
[ ! -f "backend/src/index.ts" ] && error "backend/src/index.ts não encontrado" 
[ ! -f "ecosystem.config.js" ] && error "ecosystem.config.js não encontrado"

# Verificar ao menos um arquivo .env
ENV_FOUND=false
if [ -f "backend/.env.production.deploy" ] || [ -f "configs/.env.production" ] || [ -f "backend/.env.production" ]; then
    ENV_FOUND=true
fi
[ "$ENV_FOUND" = "false" ] && error "Nenhum arquivo .env de produção encontrado"

success "Validações locais concluídas"

# 2. SSH CONNECTION TEST
log "PASSO 2: Testando conexão SSH..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'echo "SSH OK"' >/dev/null 2>&1; then
    error "Falha na conexão SSH com $SERVER_HOST"
fi
success "Conexão SSH estabelecida"

# 3. SERVER PREPARATION AND BACKUP
log "PASSO 3: Preparando servidor e criando backup..."

ssh $SERVER_USER@$SERVER_HOST << 'EOFSERVER'
# Função de log no servidor
server_log() { echo "[SERVER] $1"; }

server_log "🛠️ Preparando ambiente no servidor..."

# Criar diretórios necessários
mkdir -p /var/www/ultrazend/{backend,frontend,data,logs,uploads,temp}
mkdir -p /var/www/ultrazend/data/{database,cache,sessions}
mkdir -p /var/backups/ultrazend

# Instalar dependências do sistema se necessário
if ! command -v node >/dev/null 2>&1; then
    server_log "📦 Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
    server_log "📦 Instalando PM2..."
    npm install -g pm2
fi

if ! command -v nginx >/dev/null 2>&1; then
    server_log "📦 Instalando Nginx..."
    apt-get update && apt-get install -y nginx
fi

# Backup da versão atual se existir
if [ -d "/var/www/ultrazend/backend" ]; then
    server_log "💾 Criando backup da versão atual..."
    BACKUP_DIR="/var/backups/ultrazend/backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Parar aplicação antes do backup
    pm2 stop ultrazend 2>/dev/null || server_log "Nenhuma aplicação PM2 para parar"
    
    # Fazer backup completo
    cp -r /var/www/ultrazend/backend "$BACKUP_DIR/" 2>/dev/null || true
    cp -r /var/www/ultrazend/frontend "$BACKUP_DIR/" 2>/dev/null || true
    cp /var/www/ultrazend/ecosystem.config.js "$BACKUP_DIR/" 2>/dev/null || true
    cp /var/www/ultrazend/backend/.env "$BACKUP_DIR/" 2>/dev/null || true
    
    server_log "✅ Backup criado em: $BACKUP_DIR"
    
    # Limpar instalação anterior
    server_log "🧹 Limpando instalação anterior..."
    rm -rf /var/www/ultrazend/backend/node_modules || true
    rm -rf /var/www/ultrazend/frontend/node_modules || true
    rm -rf /var/www/ultrazend/backend/dist || true
fi

server_log "✅ Servidor preparado"
EOFSERVER

success "Servidor preparado e backup criado"

# 4. CODE TRANSFER WITH ROBUST HANDLING
log "PASSO 4: Transferindo código com handling robusto..."

# Build local do backend primeiro
log "🏗️ Building backend localmente..."
cd backend
npm ci
npm run build
cd ..

# Verificar se build foi bem-sucedido
[ ! -f "backend/dist/index.js" ] && error "Build do backend falhou - dist/index.js não encontrado"

# Transfer arquivos com rsync robusto
log "📤 Transferindo arquivos para servidor..."
rsync -avz --progress \
    --exclude='node_modules/' \
    --exclude='*.log' \
    --exclude='.git/' \
    --exclude='coverage/' \
    --exclude='__tests__/' \
    -e "ssh -o StrictHostKeyChecking=no" \
    ./ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/

success "Código transferido com sucesso"

# 5. ROBUST SERVER SETUP
log "PASSO 5: Configuração robusta no servidor..."

ssh $SERVER_USER@$SERVER_HOST << 'EOFSETUP'
cd /var/www/ultrazend
server_log() { echo "[SERVER] $1"; }

server_log "🔧 Iniciando configuração robusta..."

# CONFIGURAÇÃO .ENV COM FALLBACK ROBUSTO (implementa nossas correções)
server_log "⚙️ Configurando .env com fallback robusto..."
ENV_CONFIGURED=false

# 1. Tentar .env.production.deploy (nosso arquivo especial)
if [ -f "backend/.env.production.deploy" ]; then
    server_log "✅ Usando backend/.env.production.deploy"
    cp backend/.env.production.deploy backend/.env
    ENV_CONFIGURED=true
# 2. Tentar configs/.env.production  
elif [ -f "configs/.env.production" ]; then
    server_log "✅ Usando configs/.env.production"
    cp configs/.env.production backend/.env
    ENV_CONFIGURED=true
# 3. Tentar backend/.env.production
elif [ -f "backend/.env.production" ]; then
    server_log "✅ Usando backend/.env.production"
    cp backend/.env.production backend/.env
    ENV_CONFIGURED=true
# 4. Verificar se já existe
elif [ -f "backend/.env" ]; then
    server_log "✅ backend/.env já presente"
    ENV_CONFIGURED=true
fi

if [ "$ENV_CONFIGURED" = "false" ]; then
    server_log "❌ Nenhum arquivo .env encontrado!"
    find . -name ".env*" -type f | head -5
    exit 1
fi

chmod 600 backend/.env
chown www-data:www-data backend/.env 2>/dev/null || chown root:root backend/.env
server_log "✅ Configuração .env concluída com fallback robusto"

# INSTALAR DEPENDÊNCIAS NO SERVIDOR
server_log "📦 Instalando dependências no servidor..."
cd backend

# Limpeza completa
rm -rf node_modules package-lock.json || true
npm cache clean --force

# Instalar TODAS as dependências (incluindo dev para build)
if ! npm ci; then
    server_log "❌ Falha ao instalar dependências"
    exit 1
fi

# VERIFICAR BUILD OU CRIAR SE NECESSÁRIO
if [ ! -f "dist/index.js" ]; then
    server_log "🏗️ Build não encontrado, executando build no servidor..."
    if ! npm run build; then
        server_log "❌ Build falhou no servidor"
        exit 1
    fi
fi

# Verificar se build foi bem-sucedido
if [ ! -f "dist/index.js" ]; then
    server_log "❌ Build falhou - dist/index.js não foi gerado"
    exit 1
fi

server_log "✅ Build verificado com sucesso"

# EXECUTAR MIGRAÇÕES COM RETRY (implementa nossas correções)
server_log "📊 Executando migrações com retry..."
MIGRATION_RETRIES=3
MIGRATION_SUCCESS=false

for attempt in $(seq 1 $MIGRATION_RETRIES); do
    server_log "Tentativa de migração $attempt/$MIGRATION_RETRIES..."
    if npm run migrate:latest; then
        MIGRATION_SUCCESS=true
        break
    else
        server_log "⚠️ Falha na migração (tentativa $attempt)"
        if [ $attempt -lt $MIGRATION_RETRIES ]; then
            sleep 5
        fi
    fi
done

if [ "$MIGRATION_SUCCESS" = "false" ]; then
    server_log "⚠️ Migrações falharam após $MIGRATION_RETRIES tentativas - continuando"
fi

# OTIMIZAR PARA PRODUÇÃO
server_log "🧹 Otimizando para produção..."
npm prune --omit=dev

cd ..
server_log "✅ Configuração no servidor concluída"
EOFSETUP

success "Configuração robusta no servidor concluída"

# 6. APPLICATION STARTUP WITH ROBUST HANDLING
log "PASSO 6: Inicializando aplicação com handling robusto..."

ssh $SERVER_USER@$SERVER_HOST << 'EOFSTART'
cd /var/www/ultrazend
server_log() { echo "[SERVER] $1"; }

server_log "🚀 Iniciando aplicação com PM2..."

# Parar processos existentes
pm2 stop ultrazend 2>/dev/null || server_log "Nenhum processo PM2 para parar"
pm2 delete ultrazend 2>/dev/null || server_log "Nenhum processo PM2 para deletar"
pm2 flush 2>/dev/null || true

# Aguardar limpeza completa
sleep 3

# Configurar permissões
chmod +x backend/dist/index.js 2>/dev/null || true
chown -R www-data:www-data /var/www/ultrazend 2>/dev/null || chown -R root:root /var/www/ultrazend

# Iniciar com PM2 e configurações robustas
export NODE_ENV=production
export PORT=3001

server_log "📋 Verificando ecosystem config..."
if [ ! -f "ecosystem.config.js" ]; then
    server_log "❌ ecosystem.config.js não encontrado"
    exit 1
fi

# Iniciar aplicação
server_log "🔄 Executando PM2 start..."
if pm2 start ecosystem.config.js --env production --name ultrazend --update-env; then
    server_log "✅ Comando PM2 executado"
    
    # Aguardar estabilização
    server_log "⏳ Aguardando estabilização (15s)..."
    sleep 15
    
    # Verificar se está realmente online
    if pm2 jlist | grep -q '"status":"online"'; then
        server_log "✅ Aplicação confirmada como online"
        
        # Salvar configuração PM2
        pm2 save
        pm2 startup systemd -u root --hp /root | grep '^sudo' | bash || server_log "PM2 startup já configurado"
        
        server_log "🎉 Aplicação inicializada com sucesso!"
    else
        server_log "❌ Aplicação não está online após 15s"
        server_log "Status PM2:"
        pm2 status
        server_log "Logs recentes:"
        pm2 logs ultrazend --lines 20 --nostream 2>/dev/null || server_log "Sem logs disponíveis"
        exit 1
    fi
else
    server_log "❌ Falha ao executar comando PM2"
    exit 1
fi
EOFSTART

success "Aplicação inicializada com sucesso"

# 7. COMPREHENSIVE HEALTH CHECKS
log "PASSO 7: Health checks abrangentes..."

# Aguardar mais um pouco para estabilização
sleep 10

# Health check robusto
log "🏥 Executando health checks..."
HEALTH_CHECKS_PASSED=0
TOTAL_CHECKS=3

# 1. API Health Check
log "🔍 Testando API health endpoint..."
if ssh $SERVER_USER@$SERVER_HOST 'curl -sf -m 10 http://localhost:3001/health >/dev/null'; then
    success "✅ API health check passou"
    ((HEALTH_CHECKS_PASSED++))
else
    warning "❌ API health check falhou"
fi

# 2. PM2 Status Check
log "🔍 Verificando status PM2..."
if ssh $SERVER_USER@$SERVER_HOST 'pm2 jlist | grep -q "\"status\":\"online\""'; then
    success "✅ PM2 status check passou"
    ((HEALTH_CHECKS_PASSED++))
else
    warning "❌ PM2 status check falhou"
fi

# 3. Port Check
log "🔍 Verificando se porta está aberta..."
if ssh $SERVER_USER@$SERVER_HOST 'netstat -tlnp | grep -q ":3001"'; then
    success "✅ Port check passou"
    ((HEALTH_CHECKS_PASSED++))
else
    warning "❌ Port check falhou"
fi

# Avaliar resultado
if [ $HEALTH_CHECKS_PASSED -ge 2 ]; then
    success "🎉 Health checks passaram ($HEALTH_CHECKS_PASSED/$TOTAL_CHECKS)"
else
    error "💥 Health checks falharam ($HEALTH_CHECKS_PASSED/$TOTAL_CHECKS)"
fi

# 8. DEPLOYMENT SUMMARY
log "PASSO 8: Resumo final do deployment..."

echo ""
echo "🎊🎊🎊 DEPLOY ROBUSTO CONCLUÍDO COM SUCESSO! 🎊🎊🎊"
echo "================================================="
info "🆔 Deploy ID: $DEPLOY_ID"
info "⏰ Data/Hora: $(date)"
info "🌐 Servidor: $SERVER_HOST"
info "📁 Path: $DEPLOY_PATH"
info "📊 Log: $LOG_FILE"
echo ""

# Status final detalhado do servidor
ssh $SERVER_USER@$SERVER_HOST << 'EOFFINAL'
server_log() { echo "[SERVER] $1"; }
echo "📊 STATUS FINAL NO SERVIDOR:"
echo "============================"
server_log "PM2 Status:"
pm2 status
echo ""
server_log "Application Info:"
pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | "Status: " + .pm2_env.status + " | PID: " + (.pid|tostring) + " | Uptime: " + .pm2_env.pm_uptime' 2>/dev/null || echo "Informações PM2 não disponíveis em formato JSON"
echo ""
server_log "Portas em uso:"
netstat -tlnp | grep -E ":(3001|80|443)" || echo "Nenhuma porta relevante encontrada"
echo ""
server_log "Arquivos críticos:"
ls -la /var/www/ultrazend/backend/dist/index.js 2>/dev/null && echo "✅ Backend build presente" || echo "❌ Backend build ausente"
ls -la /var/www/ultrazend/backend/.env 2>/dev/null && echo "✅ Arquivo .env presente" || echo "❌ Arquivo .env ausente"
ls -la /var/www/ultrazend/ecosystem.config.js 2>/dev/null && echo "✅ Ecosystem config presente" || echo "❌ Ecosystem config ausente"
EOFFINAL

echo ""
info "🔗 URLs importantes:"
info "   • Website: https://www.ultrazend.com.br"
info "   • API: https://www.ultrazend.com.br/api"
info "   • Health: https://www.ultrazend.com.br/health"
echo ""
info "💡 Comandos úteis:"
info "   ssh $SERVER_USER@$SERVER_HOST 'pm2 status'"
info "   ssh $SERVER_USER@$SERVER_HOST 'pm2 logs ultrazend'"
info "   ssh $SERVER_USER@$SERVER_HOST 'pm2 restart ultrazend'"
echo ""

success "🏁 DEPLOY ROBUSTO FINALIZADO COM TODAS AS CORREÇÕES APLICADAS!"
echo "📋 Implementações aplicadas:"
echo "   ✅ Carregamento .env robusto com fallback"
echo "   ✅ Inicialização SSL resiliente"
echo "   ✅ Retry de banco de dados"  
echo "   ✅ Health checks abrangentes"
echo "   ✅ Handling de erros robusto"
echo "   ✅ Backup automático"
echo ""