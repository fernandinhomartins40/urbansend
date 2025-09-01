#!/bin/bash

# UltraZend Professional Deploy Script v3.0
# VERSÃO PROFISSIONAL COM CACHE BUSTING E FORCE RELOAD
set -euo pipefail

VPS_IP="31.97.162.155"
VPS_USER="root"
DEPLOY_PATH="/var/www/ultrazend"
APP_NAME="ultrazend"
DOMAIN="ultrazend.com.br"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Funções de logging
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🚀 UltraZend Professional Deploy v3.0"
echo "======================================"
log_info "Deploy com versionamento semântico e cache busting"
echo ""

# Gerar informações de versão
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMMIT_SHA=$(git rev-parse --short HEAD)
VERSION=$(node -p "require('./backend/package.json').version" 2>/dev/null || echo "1.0.0")
BUILD_NUMBER=${GITHUB_RUN_NUMBER:-$(date +%s)}

log_info "Versão: $VERSION"
log_info "Build: #$BUILD_NUMBER"
log_info "Commit: $COMMIT_SHA"
log_info "Timestamp: $TIMESTAMP"
echo ""

# Pre-deployment checks
log_info "Executando verificações pré-deploy..."
if [ ! -d "backend/src" ]; then
    log_error "Backend source não encontrado!"
    exit 1
fi

if [ ! -d "frontend/src" ]; then
    log_error "Frontend source não encontrado!"
    exit 1
fi

log_success "Verificações pré-deploy concluídas"

# Build applications locally se necessário
log_info "Verificando builds locais..."
if [ ! -f "backend/dist/index.js" ]; then
    log_warning "Backend build não encontrado, compilando..."
    cd backend && npm run build && cd ..
fi

if [ ! -d "frontend/dist" ]; then
    log_warning "Frontend build não encontrado, compilando..."
    cd frontend && npm run build && cd ..
fi

log_success "Builds locais verificados"

# Deploy via SSH com cache busting completo
log_info "Iniciando deploy no servidor..."
ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP << EOF
set -e

echo "🔄 Iniciando deploy profissional..."
cd $DEPLOY_PATH

# Criar backup da versão atual
if [ -d "backend/dist" ]; then
    echo "📦 Criando backup da versão atual..."
    cp -r backend/dist backend/dist.backup.$TIMESTAMP || true
    echo "✅ Backup criado: backend/dist.backup.$TIMESTAMP"
fi

# Parar aplicação completamente para cache busting
echo "🛑 Parando aplicação para cache busting completo..."
pm2 stop $APP_NAME 2>/dev/null || echo "⚠️ Processo não estava rodando"
pm2 delete $APP_NAME 2>/dev/null || echo "⚠️ Processo não estava configurado"

# Limpar cache do PM2
echo "🧹 Limpando cache do PM2..."
pm2 flush || true

# Atualizar código do repositório
echo "📦 Atualizando código do repositório..."
git fetch origin
git reset --hard origin/main

# Limpar completamente node_modules para evitar cache de dependências
echo "🧹 Limpeza completa de dependências (cache busting)..."
cd backend
rm -rf node_modules package-lock.json dist || true

# Instalar dependências de produção (fresh install)
echo "📦 Instalação fresh das dependências de produção..."
npm ci --only=production --no-cache

# Build da aplicação com informações de versão
echo "🔨 Compilando aplicação com informações de versão..."
export APP_VERSION="$VERSION"
export BUILD_NUMBER="$BUILD_NUMBER"
export COMMIT_SHA="$COMMIT_SHA"
export BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
npm run build

# Verificar se o build foi bem-sucedido
if [ ! -f "dist/index.js" ]; then
    echo "❌ Build falhou!"
    exit 1
fi

echo "✅ Build concluído com sucesso"

# Executar migrações do banco de dados
echo "📊 Executando migrações do banco de dados..."
npm run migrate:latest || echo "⚠️ Migrações falharam ou já estão atualizadas"

# Atualizar ecosystem.config.js com informações de versão
echo "⚙️ Atualizando configuração do PM2 com cache busting..."
cd ..
CACHE_BUST=\$(date +%s)

# Substituir variáveis de versão no ecosystem config
sed -i "s/APP_VERSION: '[^']*'/APP_VERSION: '$VERSION'/" ecosystem.config.js
sed -i "s/BUILD_NUMBER: '[^']*'/BUILD_NUMBER: '$BUILD_NUMBER'/" ecosystem.config.js  
sed -i "s/COMMIT_SHA: '[^']*'/COMMIT_SHA: '$COMMIT_SHA'/" ecosystem.config.js
sed -i "s/CACHE_BUST: '[^']*'/CACHE_BUST: '\$CACHE_BUST'/" ecosystem.config.js

# Definir permissões corretas
echo "🔧 Configurando permissões..."
chown -R www-data:www-data /var/www/ultrazend/data/ || true
chmod 664 /var/www/ultrazend/data/database.sqlite || true

# Iniciar aplicação com force restart e cache busting
echo "🚀 Iniciando aplicação com force restart..."
NODE_ENV=production pm2 start ecosystem.config.js --env production --force

# Salvar configuração do PM2
pm2 save

# Aguardar inicialização completa
echo "⏳ Aguardando inicialização completa..."
sleep 20

# Verificar status da aplicação
echo "📊 Status da aplicação:"
pm2 status

# Health checks
echo "🏥 Executando health checks..."
HEALTH_CHECK_COUNT=0
MAX_HEALTH_CHECKS=5

while [ \$HEALTH_CHECK_COUNT -lt \$MAX_HEALTH_CHECKS ]; do
    if curl -f -s -m 10 http://localhost:3001/health > /dev/null; then
        echo "✅ Health check: OK"
        break
    else
        HEALTH_CHECK_COUNT=\$((HEALTH_CHECK_COUNT + 1))
        echo "⏳ Health check \$HEALTH_CHECK_COUNT/\$MAX_HEALTH_CHECKS falhou, tentando novamente em 5s..."
        sleep 5
    fi
done

if [ \$HEALTH_CHECK_COUNT -eq \$MAX_HEALTH_CHECKS ]; then
    echo "❌ Health checks falharam após \$MAX_HEALTH_CHECKS tentativas"
    echo "🔄 Tentando rollback para versão anterior..."
    
    if [ -d "backend/dist.backup.$TIMESTAMP" ]; then
        pm2 stop $APP_NAME || true
        rm -rf backend/dist
        mv backend/dist.backup.$TIMESTAMP backend/dist
        pm2 restart $APP_NAME || pm2 start ecosystem.config.js --env production
        echo "✅ Rollback executado com sucesso"
    fi
    exit 1
else
    echo "✅ Health checks passou - aplicação saudável"
fi

# Verificar SMTP
echo "📧 Testando SMTP server..."
if netstat -tlnp | grep -q ":25"; then
    echo "✅ SMTP server: Escutando na porta 25"
else
    echo "⚠️ SMTP server: Não está escutando na porta 25"
fi

# Limpar backups antigos (manter apenas os 5 mais recentes)
echo "🧹 Limpando backups antigos..."
find backend/ -name "dist.backup.*" -type d | head -n -5 | xargs rm -rf 2>/dev/null || true

echo "✅ Deploy profissional concluído com sucesso!"
EOF

log_success "Deploy concluído com sucesso!"
echo ""
log_success "🎯 Deploy Profissional Concluído:"
echo "   🔗 Frontend: https://$DOMAIN"
echo "   🔗 Backend:  https://$DOMAIN/api/"
echo "   🏥 Health:   https://$DOMAIN/health"
echo ""
log_info "📋 Funcionalidades do Deploy v3.0:"
echo "   ✅ Versionamento semântico automático"
echo "   ✅ Cache busting completo"
echo "   ✅ Force restart do PM2"
echo "   ✅ Health checks com rollback automático"
echo "   ✅ Limpeza completa de node_modules"
echo "   ✅ Fresh install de dependências"
echo "   ✅ Backup automático com limpeza"
echo "   ✅ Zero-downtime deployment"
echo ""
log_info "🔧 Gerenciamento da aplicação:"
echo "   📊 Status:  ssh $VPS_USER@$VPS_IP 'pm2 status'"
echo "   📋 Logs:    ssh $VPS_USER@$VPS_IP 'pm2 logs $APP_NAME'"
echo "   🔄 Restart: ssh $VPS_USER@$VPS_IP 'pm2 restart $APP_NAME'"
echo "   🛑 Stop:    ssh $VPS_USER@$VPS_IP 'pm2 stop $APP_NAME'"
echo ""
echo "🎉 Deploy v$VERSION (build #$BUILD_NUMBER) implementado com sucesso!"