#!/bin/bash

# 🚨 ULTRAZEND - RESET COMPLETO DO NGINX
# Remove TODAS as configurações SSL e força HTTP puro

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

echo "🚨 ULTRAZEND - RESET COMPLETO DO NGINX"
echo "======================================"
log "⚠️ ATENÇÃO: Este script fará reset TOTAL das configurações Nginx"
log "Servidor: $SERVER_HOST"
echo ""

# Execute emergency reset on server
log "🚨 Executando reset de emergência do Nginx..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
echo "🚨 INICIANDO RESET COMPLETO DO NGINX"
echo "====================================="

# 1. STOP NGINX COMPLETAMENTE
echo "⏹️ Parando Nginx completamente..."
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
pkill -f nginx 2>/dev/null || true
sleep 2

# 2. BACKUP COMPLETO DE TODAS AS CONFIGURAÇÕES
echo "📦 Fazendo backup completo..."
backup_dir="/var/backups/nginx-emergency-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp -r /etc/nginx "$backup_dir/" 2>/dev/null || true
echo "✅ Backup salvo em: $backup_dir"

# 3. REMOVER TODAS AS CONFIGURAÇÕES SSL
echo "🗑️ Removendo TODAS as configurações SSL..."

# Remove all sites configurations
rm -rf /etc/nginx/sites-enabled/*
rm -rf /etc/nginx/sites-available/*

# Remove any SSL includes in main nginx.conf
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup

# Create clean nginx.conf without any SSL
cat > /etc/nginx/nginx.conf << 'NGINX_CONF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 768;
    # multi_accept on;
}

http {
    ##
    # Basic Settings
    ##
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    # server_tokens off;

    # server_names_hash_bucket_size 64;
    # server_name_in_redirect off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ##
    # Logging Settings
    ##
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    ##
    # Gzip Settings
    ##
    gzip on;

    ##
    # Virtual Host Configs
    ##
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
NGINX_CONF

echo "✅ nginx.conf limpo criado (SEM SSL)"

# 4. REMOVER QUAISQUER CONFIGURAÇÕES SSL ÓRFÃS
echo "🧹 Removendo configurações SSL órfãs..."
find /etc/nginx -name "*.conf" -exec grep -l "ssl_certificate" {} \; | while read file; do
    echo "🗑️ Removendo SSL de: $file"
    cp "$file" "$file.ssl-backup"
    sed '/ssl_certificate/d' "$file.ssl-backup" > "$file"
done

# Remove any SSL configurations in conf.d
rm -f /etc/nginx/conf.d/*ssl* 2>/dev/null || true
rm -f /etc/nginx/conf.d/*443* 2>/dev/null || true

# 5. TESTAR CONFIGURAÇÃO BÁSICA
echo "🧪 Testando configuração básica do nginx..."
if nginx -t; then
    echo "✅ Configuração básica válida"
else
    echo "❌ Configuração básica inválida - restaurando padrão Ubuntu"
    # Restore default Ubuntu nginx.conf
    apt install --reinstall nginx-core -y
    systemctl stop nginx
fi

# 6. CRIAR SITE HTTP MÍNIMO
echo "📝 Criando site HTTP mínimo..."
cat > /etc/nginx/sites-available/ultrazend << 'SITE_CONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name www.velomail.com.br velomail.com.br _;
    
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
    
    # Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }
    
    # Health check
    location /health {
        add_header Content-Type text/plain;
        return 200 "OK";
    }
    
    # Basic frontend serving
    location / {
        try_files $uri $uri/ =404;
    }
    
    # API proxy if backend is running
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
SITE_CONF

ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/

# 7. CRIAR WEBROOT E PÁGINA BÁSICA
echo "📁 Criando webroot básico..."
mkdir -p /var/www/html
chown -R www-data:www-data /var/www/html
cat > /var/www/html/index.html << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>UltraZend - Server Running</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .status { color: green; font-size: 24px; }
    </style>
</head>
<body>
    <h1>🚀 UltraZend Server</h1>
    <p class="status">✅ HTTP Server Running</p>
    <p>SSL will be configured after deployment completes.</p>
</body>
</html>
HTML

# 8. TESTAR CONFIGURAÇÃO FINAL
echo "🧪 Testando configuração final..."
if nginx -t; then
    echo "✅ Configuração final válida"
else
    echo "❌ Configuração final inválida"
    nginx -t
    exit 1
fi

# 9. INICIAR NGINX
echo "🚀 Iniciando Nginx limpo..."
systemctl enable nginx
systemctl start nginx

# Verificar se está rodando
sleep 3
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx iniciado com sucesso"
    
    # Test HTTP
    if curl -f -s -m 5 http://localhost/health > /dev/null; then
        echo "✅ HTTP funcionando localmente"
    else
        echo "⚠️ HTTP não está respondendo"
    fi
    
    # Show listening ports
    echo "📡 Portas em uso:"
    netstat -tlnp | grep nginx
    
else
    echo "❌ Nginx falhou ao iniciar"
    systemctl status nginx --no-pager
    exit 1
fi

echo ""
echo "🎉 RESET COMPLETO DO NGINX CONCLUÍDO!"
echo "====================================="
echo "✅ Todas as configurações SSL removidas"
echo "✅ Nginx rodando apenas com HTTP"
echo "✅ Site básico funcionando"
echo "✅ Pronto para deploy completo"
EOF

echo ""
success "🚨 RESET DE EMERGÊNCIA CONCLUÍDO!"
echo "================================="
success "✅ Nginx completamente limpo"
success "✅ Apenas HTTP ativo"
success "✅ Pronto para novo deploy"
echo ""
warning "⚠️ Execute o deploy principal agora que o nginx está limpo"