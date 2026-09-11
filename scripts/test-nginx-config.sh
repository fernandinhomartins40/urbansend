#!/bin/bash

# 🧪 ULTRAZEND - Test Nginx Configuration
# Testa rapidamente se as configurações nginx estão corretas

set -euo pipefail

# Configuration
SERVER_HOST="${DEPLOY_HOST:-31.97.162.155}"
SERVER_USER="${DEPLOY_USER:-root}"

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

echo "🧪 ULTRAZEND - TESTE DE CONFIGURAÇÃO NGINX"
echo "==========================================="
log "Servidor: $SERVER_HOST"
echo ""

# Test nginx configuration remotely
log "🔍 Testando configuração Nginx no servidor..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
echo "=== TESTE DE CONFIGURAÇÃO NGINX ==="

# 1. Check nginx status
echo "📊 Status do Nginx:"
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx: ATIVO"
    systemctl status nginx --no-pager -l | head -10
else
    echo "❌ Nginx: INATIVO"
    systemctl status nginx --no-pager -l | head -10
fi

echo ""

# 2. Test nginx configuration
echo "🧪 Teste de configuração:"
if nginx -t; then
    echo "✅ Configuração nginx: VÁLIDA"
else
    echo "❌ Configuração nginx: INVÁLIDA"
fi

echo ""

# 3. Check sites configuration
echo "📋 Configurações de sites:"
echo "Sites habilitados:"
ls -la /etc/nginx/sites-enabled/ || echo "Nenhum site habilitado"

echo ""
echo "Sites disponíveis:"
ls -la /etc/nginx/sites-available/ || echo "Nenhum site disponível"

echo ""

# 4. Check for SSL references in HTTP config
echo "🔍 Verificando referências SSL na configuração HTTP:"
if [ -f "/etc/nginx/sites-available/ultrazend" ]; then
    if grep -q "ssl_certificate" /etc/nginx/sites-available/ultrazend; then
        echo "❌ PROBLEMA: Configuração contém referências SSL:"
        grep -n "ssl" /etc/nginx/sites-available/ultrazend
    else
        echo "✅ Configuração limpa (sem SSL)"
    fi
    
    echo ""
    echo "📄 Primeiras 10 linhas da configuração:"
    head -10 /etc/nginx/sites-available/ultrazend
else
    echo "❌ Arquivo de configuração não encontrado"
fi

echo ""

# 5. Check ports
echo "📡 Portas em uso pelo Nginx:"
netstat -tlnp | grep nginx || echo "Nginx não está escutando em nenhuma porta"

echo ""

# 6. Test HTTP access
echo "🌐 Teste de acesso HTTP local:"
if curl -f -s -m 5 http://localhost > /dev/null 2>&1; then
    echo "✅ HTTP local: FUNCIONANDO"
    echo "Response: $(curl -s -m 5 http://localhost | head -1)"
else
    echo "❌ HTTP local: NÃO RESPONDE"
    curl -s -m 5 http://localhost || echo "Curl falhou"
fi

echo ""

# 7. Check SSL certificates
echo "🔒 Status dos certificados SSL:"
if [ -d "/etc/letsencrypt/live/" ]; then
    echo "Certificados disponíveis:"
    ls -la /etc/letsencrypt/live/ || echo "Diretório vazio"
    
    if [ -f "/etc/letsencrypt/live/velomail.com.br/fullchain.pem" ]; then
        echo "✅ Certificado SSL encontrado"
        expiry=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/velomail.com.br/fullchain.pem | cut -d= -f2)
        echo "📅 Expira em: $expiry"
    else
        echo "⚠️ Certificado SSL não encontrado"
    fi
else
    echo "⚠️ Diretório Let's Encrypt não existe"
fi

echo ""

# 8. Recent nginx logs
echo "📋 Últimos logs do Nginx:"
if [ -f "/var/log/nginx/error.log" ]; then
    echo "Últimas 5 linhas do error.log:"
    tail -5 /var/log/nginx/error.log
else
    echo "Arquivo de log não encontrado"
fi

echo ""
echo "=== TESTE CONCLUÍDO ==="
EOF

echo ""
success "🧪 TESTE DE CONFIGURAÇÃO CONCLUÍDO!"
log "📋 Use as informações acima para diagnosticar problemas"