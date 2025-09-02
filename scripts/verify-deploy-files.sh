#!/bin/bash

# 🔍 ULTRAZEND - Verificação de Arquivos de Deploy
# Verifica se todos os arquivos essenciais estão presentes no servidor

set -euo pipefail

# Configuration
SERVER_HOST="${DEPLOY_HOST:-31.97.162.155}"
SERVER_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="/var/www/ultrazend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

echo "🔍 ULTRAZEND - VERIFICAÇÃO DE ARQUIVOS DE DEPLOY"
echo "==============================================="
log "Servidor: $SERVER_HOST"
log "Deploy Path: $DEPLOY_PATH"
echo ""

# Test SSH connection
log "🔐 Testando conexão SSH..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'echo "SSH OK"' > /dev/null 2>&1; then
    error "❌ Falha na conexão SSH com $SERVER_HOST"
fi
success "✅ Conexão SSH funcionando"

# Execute verification on server
log "🔍 Executando verificação completa no servidor..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << EOF
#!/bin/bash
set -euo pipefail

echo "🔍 VERIFICAÇÃO COMPLETA DE ARQUIVOS"
echo "=================================="

# Check deployment path
if [ ! -d "$DEPLOY_PATH" ]; then
    echo "❌ CRÍTICO: Diretório de deploy não existe: $DEPLOY_PATH"
    exit 1
fi
echo "✅ Diretório de deploy existe: $DEPLOY_PATH"

# Check backend directory
echo ""
echo "📁 VERIFICAÇÃO DO BACKEND:"
if [ ! -d "$DEPLOY_PATH/backend" ]; then
    echo "❌ Diretório backend não existe"
    exit 1
fi
echo "✅ Diretório backend existe"

cd $DEPLOY_PATH/backend

# Check .env file
echo ""
echo "🔧 VERIFICAÇÃO DO .ENV:"
if [ ! -f ".env" ]; then
    echo "❌ CRÍTICO: .env não encontrado em $DEPLOY_PATH/backend/"
    echo "📋 Arquivos no diretório backend:"
    ls -la | head -20
    echo ""
    echo "🔍 Procurando arquivos .env em todo o deploy:"
    find $DEPLOY_PATH -name ".env*" -type f 2>/dev/null || echo "Nenhum arquivo .env encontrado"
else
    echo "✅ Arquivo .env encontrado"
    echo "📊 Tamanho: \$(du -h .env | cut -f1)"
    echo "🔐 Permissões: \$(ls -la .env)"
    echo "📝 Primeiras 5 linhas (sem valores sensíveis):"
    head -5 .env | sed 's/=.*/=***HIDDEN***/'
fi

# Check dist directory
echo ""
echo "📦 VERIFICAÇÃO DO BUILD (DIST):"
if [ ! -d "dist" ]; then
    echo "❌ Diretório dist não existe"
else
    echo "✅ Diretório dist existe"
    echo "📋 Conteúdo do dist:"
    ls -la dist/
    
    if [ ! -f "dist/index.js" ]; then
        echo "❌ CRÍTICO: dist/index.js não encontrado"
    else
        echo "✅ dist/index.js encontrado"
        echo "📊 Tamanho: \$(du -h dist/index.js | cut -f1)"
    fi
fi

# Check node_modules
echo ""
echo "📚 VERIFICAÇÃO DAS DEPENDÊNCIAS:"
if [ ! -d "node_modules" ]; then
    echo "⚠️ node_modules não encontrado (será instalado no deploy)"
else
    echo "✅ node_modules existe"
    echo "📊 Tamanho: \$(du -sh node_modules | cut -f1)"
fi

# Check package.json
if [ ! -f "package.json" ]; then
    echo "❌ CRÍTICO: package.json não encontrado"
else
    echo "✅ package.json encontrado"
fi

# Check frontend
echo ""
echo "🌐 VERIFICAÇÃO DO FRONTEND:"
if [ ! -d "$DEPLOY_PATH/frontend" ]; then
    echo "❌ Diretório frontend não existe"
else
    echo "✅ Diretório frontend existe"
    cd $DEPLOY_PATH/frontend
    if [ ! -f "index.html" ]; then
        echo "❌ index.html não encontrado no frontend"
        echo "📋 Conteúdo do frontend:"
        ls -la | head -10
    else
        echo "✅ Frontend build encontrado"
        echo "📊 Arquivos: \$(ls -1 | wc -l) arquivos"
    fi
fi

# Check ecosystem config
echo ""
echo "⚙️ VERIFICAÇÃO DO ECOSYSTEM:"
cd $DEPLOY_PATH
if [ ! -f "ecosystem.config.js" ]; then
    echo "❌ CRÍTICO: ecosystem.config.js não encontrado"
    echo "📋 Conteúdo do diretório raiz:"
    ls -la | head -10
else
    echo "✅ ecosystem.config.js encontrado"
    echo "📊 Tamanho: \$(du -h ecosystem.config.js | cut -f1)"
    echo "📝 Configuração (primeiras 10 linhas):"
    head -10 ecosystem.config.js
fi

# Check data directories
echo ""
echo "💾 VERIFICAÇÃO DE DIRETÓRIOS DE DADOS:"
for dir in data logs uploads temp; do
    if [ ! -d "$DEPLOY_PATH/\$dir" ]; then
        echo "⚠️ Diretório \$dir não existe (será criado se necessário)"
        mkdir -p "$DEPLOY_PATH/\$dir"
        chown www-data:www-data "$DEPLOY_PATH/\$dir"
        echo "✅ Diretório \$dir criado"
    else
        echo "✅ Diretório \$dir existe"
    fi
done

# Check permissions
echo ""
echo "🔐 VERIFICAÇÃO DE PERMISSÕES:"
echo "📁 Propriedade do deploy path:"
ls -la /var/www/ | grep ultrazend || echo "Diretório não encontrado"

if [ -f "$DEPLOY_PATH/backend/.env" ]; then
    echo "🔐 Permissões do .env:"
    ls -la $DEPLOY_PATH/backend/.env
fi

# Final summary
echo ""
echo "📊 RESUMO DA VERIFICAÇÃO:"

# Count issues
issues=0

[ ! -f "$DEPLOY_PATH/backend/.env" ] && ((issues++)) && echo "❌ .env em falta"
[ ! -f "$DEPLOY_PATH/backend/dist/index.js" ] && ((issues++)) && echo "❌ build em falta"  
[ ! -f "$DEPLOY_PATH/ecosystem.config.js" ] && ((issues++)) && echo "❌ ecosystem config em falta"
[ ! -f "$DEPLOY_PATH/frontend/index.html" ] && ((issues++)) && echo "❌ frontend em falta"

if [ \$issues -eq 0 ]; then
    echo "🎉 TUDO OK - Nenhum problema crítico encontrado!"
    echo "✅ Pronto para iniciar a aplicação"
else
    echo "⚠️ PROBLEMAS ENCONTRADOS: \$issues issue(s) crítico(s)"
    echo "🔧 Execute o deploy novamente para corrigir"
fi

echo ""
echo "=== VERIFICAÇÃO CONCLUÍDA ==="
EOF

echo ""
success "🔍 VERIFICAÇÃO DE ARQUIVOS CONCLUÍDA!"
log "📋 Use as informações acima para diagnosticar problemas de deploy"