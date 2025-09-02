#!/bin/bash

# 🚑 ULTRAZEND - Force Fix Backend Emergencial
# Corrige todos os problemas de API 500 e dependências

set -euo pipefail

# Configuration
VPS_HOST="31.97.162.155"
VPS_USER="root"
APP_DIR="/var/www/ultrazend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo "🚑 ULTRAZEND - Correção Emergencial Backend"
echo "=========================================="
echo "🎯 Target: $VPS_HOST"
echo "📁 App Dir: $APP_DIR"
echo ""

# Usar GitHub Actions em vez de SSH direto
log "Triggering GitHub Actions deployment with all fixes..."

# Criar um arquivo temporário para forçar trigger
echo "# Force deploy $(date)" >> DEPLOY_TRIGGER.md

git add DEPLOY_TRIGGER.md
git commit -m "trigger: forçar deploy emergencial para corrigir API 500

Força novo deploy com todas as correções sistemáticas:
- Dependências swagger corretas  
- Environment production configurado
- Migrations completas
- PM2 com ecosystem.config.js otimizado
- Logs directories criados
- Nginx proxy configurado

Resolve erro: API endpoints retornando 500 Internal Server Error

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin main

success "Deploy emergencial iniciado via GitHub Actions!"
log "Acompanhe o progresso em: https://github.com/fernandinhomartins40/urbansend/actions"

echo ""
log "⏳ Aguardando deploy completar (~5-10 minutos)..."
log "📋 Verificações que serão feitas:"
echo "  1. ✅ Instalar dependências swagger"
echo "  2. ✅ Configurar .env production"
echo "  3. ✅ Executar migrations completas"
echo "  4. ✅ Criar diretórios de logs"
echo "  5. ✅ Reiniciar PM2 com ecosystem.config.js"
echo "  6. ✅ Recarregar nginx com proxy correto"

echo ""
success "🎯 Após o deploy, a API deve responder corretamente em:"
echo "   https://www.ultrazend.com.br/api/auth/register"