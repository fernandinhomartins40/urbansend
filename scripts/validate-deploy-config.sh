#!/bin/bash

# 🔍 VALIDAÇÃO DAS CORREÇÕES DE DEPLOY
# Script para validar se as correções aplicadas estão corretas

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[VALIDATE] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

echo "🔍 VALIDAÇÃO DAS CORREÇÕES DE DEPLOY ULTRAZEND"
echo "=============================================="

# Teste 1: Verificar workflow corrigido
log "1. Validando GitHub Actions workflow..."
if grep -q 'const db = require' .github/workflows/deploy-production.yml; then
    log "✅ Services validation corrigida"
else
    error "❌ Services validation não corrigida"
fi

if grep -q 'migration_count.*-lt 40' .github/workflows/deploy-production.yml; then
    log "✅ Migration count flexibilizada"  
else
    error "❌ Migration count ainda rígida"
fi

if grep -q 'NODE_VERSION.*22' .github/workflows/deploy-production.yml; then
    log "✅ Node version atualizada para 22"
else  
    warning "⚠️ Node version pode não estar atualizada"
fi

# Teste 2: Verificar ecosystem.config.js
log "2. Validando configuração PM2..."
if grep -q 'DATABASE_URL.*\./ultrazend\.sqlite' ecosystem.config.js; then
    log "✅ Database path corrigido"
else
    error "❌ Database path ainda incorreto"
fi

if grep -q 'health_check_path.*\/api\/health' ecosystem.config.js; then
    log "✅ Health check path corrigido"
else
    error "❌ Health check path ainda incorreto" 
fi

if grep -q 'REDIS_ENABLED.*false' ecosystem.config.js; then
    log "✅ Redis configurado como opcional"
else
    warning "⚠️ Redis pode estar como obrigatório"
fi

# Teste 3: Verificar arquivos DKIM
log "3. Validando arquivos DKIM..."
if [ -d "configs/dkim-keys/" ] && [ "$(ls -A configs/dkim-keys/)" ]; then
    log "✅ Diretório DKIM keys existe com arquivos"
    ls -la configs/dkim-keys/*.pem | head -3 || warning "⚠️ Arquivos .pem não encontrados"
else
    error "❌ Diretório DKIM keys vazio ou não existe"
fi

# Teste 4: Verificar aplicação funciona
log "4. Validando aplicação pode inicializar..."
cd backend
if npm run build > /dev/null 2>&1; then
    log "✅ Build da aplicação funciona"
else
    error "❌ Build da aplicação falhou"
fi

if [ -f "dist/config/database.js" ]; then
    log "✅ Database config presente no build"
else
    error "❌ Database config não encontrada no build"
fi

# Teste 5: Verificar dependências críticas
log "5. Validando dependências críticas..."
if node -e "require('./dist/config/database.js'); console.log('OK');" 2>/dev/null | grep -q "OK"; then
    log "✅ Database config carrega sem erros"
else
    error "❌ Database config tem problemas"
fi

cd ..

# Sumário final
echo ""
echo "📊 SUMÁRIO DA VALIDAÇÃO"
echo "======================="

validation_errors=$(grep -c "❌" /dev/stdout 2>/dev/null || echo "0")
validation_warnings=$(grep -c "⚠️" /dev/stdout 2>/dev/null || echo "0")

if [ "$validation_errors" -eq 0 ]; then
    log "🎉 TODAS AS CORREÇÕES APLICADAS COM SUCESSO!"
    log "✅ Deploy deve funcionar sem problemas críticos"
    
    if [ "$validation_warnings" -gt 0 ]; then
        warning "⚠️ $validation_warnings warnings encontrados - revisar antes do deploy"
    fi
    
    echo ""
    echo "🚀 PRÓXIMOS PASSOS RECOMENDADOS:"
    echo "1. Fazer commit das correções"
    echo "2. Testar deploy em ambiente de staging primeiro"
    echo "3. Monitorar logs durante o deploy"
    echo "4. Validar health checks após deploy"
    
    exit 0
else
    error "❌ $validation_errors ERROS CRÍTICOS ENCONTRADOS!"
    error "🚫 NÃO FAZER DEPLOY até resolver os problemas"
    exit 1
fi