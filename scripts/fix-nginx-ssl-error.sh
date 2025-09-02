#!/bin/bash

# 🔧 ULTRAZEND - Fix Nginx SSL Error
# Remove configurações SSL antigas e força HTTP temporário

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
error() { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

echo "🔧 ULTRAZEND - CORREÇÃO DO ERRO SSL DO NGINX"
echo "============================================="
log "Servidor: $SERVER_HOST"
echo ""

# 1. Parar Nginx e limpar configurações SSL problemáticas
log "🛑 Parando Nginx e limpando configurações SSL antigas..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
# Parar nginx
echo "⏹️ Parando Nginx..."
systemctl stop nginx 2>/dev/null || true

# Backup de todas as configurações atuais
echo "📦 Fazendo backup das configurações atuais..."
backup_dir="/var/backups/nginx-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp -r /etc/nginx/sites-available "$backup_dir/" 2>/dev/null || true
cp -r /etc/nginx/sites-enabled "$backup_dir/" 2>/dev/null || true
cp /etc/nginx/nginx.conf "$backup_dir/" 2>/dev/null || true

echo "✅ Backup criado em: $backup_dir"

# Remover todas as configurações do site
echo "🗑️ Removendo configurações antigas..."
rm -f /etc/nginx/sites-enabled/ultrazend
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/ultrazend

# Verificar se há outras configurações SSL problemáticas
echo "🔍 Verificando configurações restantes..."
find /etc/nginx/sites-enabled/ -name "*.conf" -exec ls -la {} \; || echo "Nenhuma configuração encontrada"
find /etc/nginx/sites-available/ -name "*" -type f -exec ls -la {} \; || echo "Nenhuma configuração encontrada"

# Testar configuração básica do nginx
echo "🧪 Testando configuração básica do nginx..."
nginx -t || echo "❌ Configuração nginx com problemas - continuando para fix"
EOF

success "✅ Configurações SSL antigas removidas"

# 2. Aplicar configuração HTTP limpa
log "📝 Aplicando configuração HTTP limpa..."

# Enviar configuração HTTP limpa
scp -o StrictHostKeyChecking=no configs/nginx-http.conf $SERVER_USER@$SERVER_HOST:/tmp/ultrazend-nginx-http-clean.conf

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
# Aplicar configuração HTTP limpa
echo "📋 Aplicando nova configuração HTTP..."
cp /tmp/ultrazend-nginx-http-clean.conf /etc/nginx/sites-available/ultrazend
ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/

# Verificar se não há referências SSL na nova configuração
if grep -q "ssl_certificate" /etc/nginx/sites-available/ultrazend; then
    echo "❌ ERRO: Nova configuração ainda contém referências SSL!"
    grep -n "ssl" /etc/nginx/sites-available/ultrazend
    exit 1
else
    echo "✅ Configuração HTTP limpa (sem SSL)"
fi

# Testar nova configuração
echo "🧪 Testando nova configuração HTTP..."
if nginx -t; then
    echo "✅ Configuração HTTP válida"
else
    echo "❌ Configuração HTTP inválida"
    nginx -t
    exit 1
fi

# Criar diretório webroot para Let's Encrypt se não existir
echo "📁 Criando diretório webroot..."
mkdir -p /var/www/html
chown -R www-data:www-data /var/www/html
echo "<h1>UltraZend - Server Running</h1>" > /var/www/html/index.html

# Iniciar nginx com configuração HTTP
echo "🚀 Iniciando Nginx com HTTP..."
systemctl start nginx
systemctl enable nginx

# Verificar se nginx está rodando
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx iniciado com sucesso"
    
    # Testar acesso local
    echo "🌐 Testando acesso local HTTP..."
    sleep 3
    if curl -f -s -m 5 http://localhost > /dev/null; then
        echo "✅ HTTP local funcionando"
    else
        echo "⚠️ HTTP local não está respondendo"
        curl -s -m 5 http://localhost || echo "Falha no curl"
    fi
    
    # Mostrar status das portas
    echo "📊 Status das portas:"
    netstat -tlnp | grep nginx || echo "Nginx não está escutando"
    
else
    echo "❌ Nginx falhou ao iniciar"
    systemctl status nginx
    journalctl -u nginx --no-pager -n 10
    exit 1
fi
EOF

success "✅ Configuração HTTP aplicada"

# 3. Verificar configuração final
log "🔍 Verificando configuração final..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
echo ""
echo "=== VERIFICAÇÃO FINAL ==="

# Status do Nginx
echo "📊 Status do Nginx:"
systemctl status nginx --no-pager -l

# Configuração ativa
echo ""
echo "📋 Configuração ativa:"
echo "Sites habilitados:"
ls -la /etc/nginx/sites-enabled/

echo ""
echo "Conteúdo da configuração:"
echo "--- /etc/nginx/sites-available/ultrazend ---"
head -20 /etc/nginx/sites-available/ultrazend

# Teste final
echo ""
echo "🧪 Teste final do Nginx:"
if nginx -t; then
    echo "✅ Configuração nginx válida"
else
    echo "❌ Configuração nginx inválida"
fi

# Portas em uso
echo ""
echo "📡 Portas em uso pelo Nginx:"
netstat -tlnp | grep nginx

# Logs recentes
echo ""
echo "📋 Últimos logs do Nginx:"
tail -5 /var/log/nginx/error.log 2>/dev/null || echo "Arquivo de log não encontrado"

echo ""
echo "=== CORREÇÃO CONCLUÍDA ==="
EOF

echo ""
success "🎉 CORREÇÃO DO NGINX CONCLUÍDA!"
echo "==============================="
success "✅ Configurações SSL antigas removidas"
success "✅ Configuração HTTP limpa aplicada"  
success "✅ Nginx rodando apenas com HTTP"
echo ""
warning "⚠️ IMPORTANTE: Execute novamente o deploy após esta correção"
log "🔄 O próximo deploy irá:"
log "   1. Usar a configuração HTTP limpa"
log "   2. Gerar certificados SSL corretamente"
log "   3. Aplicar SSL somente após certificados serem criados"
echo ""
log "🌐 Teste o acesso HTTP: http://www.ultrazend.com.br"