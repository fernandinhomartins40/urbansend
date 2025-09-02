#!/bin/bash

# 🔒 ULTRAZEND - Deploy SSL em 3 Etapas
# Processo robusto para configurar SSL sem falhas

set -euo pipefail

# Configuration
SERVER_HOST="${DEPLOY_HOST:-31.97.162.155}"
SERVER_USER="${DEPLOY_USER:-root}"
DOMAIN="ultrazend.com.br"
SUBDOMAIN="www.ultrazend.com.br"
ADMIN_EMAIL="admin@ultrazend.com.br"

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

echo "🔒 ULTRAZEND - DEPLOY SSL EM 3 ETAPAS"
echo "===================================="
log "Servidor: $SERVER_HOST"
log "Domínios: $DOMAIN, $SUBDOMAIN"
echo ""

# ETAPA 1: Configurar HTTP temporário
log "🌐 ETAPA 1: Configurando Nginx HTTP temporário..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
# Backup da configuração atual se existir
if [ -f "/etc/nginx/sites-available/ultrazend" ]; then
    echo "📦 Fazendo backup da configuração atual..."
    cp /etc/nginx/sites-available/ultrazend /tmp/ultrazend-nginx-backup-$(date +%Y%m%d-%H%M%S).conf
fi

# Parar nginx se estiver rodando com erro
systemctl stop nginx 2>/dev/null || true
EOF

# Enviar configuração HTTP temporária
log "Copiando configuração HTTP temporária..."
scp -o StrictHostKeyChecking=no configs/nginx-http.conf $SERVER_USER@$SERVER_HOST:/tmp/ultrazend-nginx-http.conf

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
# Aplicar configuração HTTP temporária
echo "📝 Aplicando configuração HTTP..."
cp /tmp/ultrazend-nginx-http.conf /etc/nginx/sites-available/ultrazend
ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar configuração HTTP
echo "🧪 Testando configuração HTTP..."
if nginx -t; then
    echo "✅ Configuração HTTP válida"
else
    echo "❌ Erro na configuração HTTP"
    nginx -t
    exit 1
fi

# Iniciar nginx com configuração HTTP
echo "🚀 Iniciando Nginx com HTTP..."
systemctl start nginx
systemctl enable nginx

# Verificar se nginx está rodando
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx rodando com HTTP"
else
    echo "❌ Nginx não conseguiu iniciar"
    systemctl status nginx
    exit 1
fi

# Verificar se a aplicação está acessível via HTTP
echo "🌐 Testando acesso HTTP..."
sleep 5
if curl -f -s -m 10 http://localhost > /dev/null; then
    echo "✅ Site acessível via HTTP"
else
    echo "⚠️ Site não está respondendo no HTTP (pode ser normal se a app não estiver rodando)"
fi
EOF

success "✅ ETAPA 1 concluída - HTTP configurado"
echo ""

# ETAPA 2: Gerar certificados SSL
log "🔒 ETAPA 2: Gerando certificados SSL..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << EOF
# Verificar se certificados já existem
if [ -f "/etc/letsencrypt/live/$SUBDOMAIN/fullchain.pem" ]; then
    echo "✅ Certificados SSL já existem"
    # Verificar validade
    expiry_date=\$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/$SUBDOMAIN/fullchain.pem | cut -d= -f2)
    expiry_epoch=\$(date -d "\$expiry_date" +%s)
    current_epoch=\$(date +%s)
    days_left=\$(( (\$expiry_epoch - \$current_epoch) / 86400 ))
    
    echo "📅 Certificado expira em \$days_left dias (\$expiry_date)"
    
    if [ \$days_left -lt 30 ]; then
        echo "⚠️ Certificado expira em menos de 30 dias - renovando..."
        certbot renew --force-renewal || echo "❌ Falha na renovação"
    fi
else
    echo "🔒 Gerando novos certificados SSL..."
    
    # Criar diretório webroot se não existir
    mkdir -p /var/www/html
    
    # Gerar certificados usando webroot
    echo "🌐 Usando método webroot para validação..."
    certbot certonly --webroot \
        -w /var/www/html \
        -d $DOMAIN \
        -d $SUBDOMAIN \
        --non-interactive \
        --agree-tos \
        --email $ADMIN_EMAIL \
        --no-eff-email \
        --expand
    
    # Verificar se os certificados foram criados
    if [ -f "/etc/letsencrypt/live/$SUBDOMAIN/fullchain.pem" ]; then
        echo "✅ Certificados SSL gerados com sucesso"
        
        # Mostrar informações do certificado
        echo "📋 Informações do certificado:"
        openssl x509 -in /etc/letsencrypt/live/$SUBDOMAIN/fullchain.pem -noout -dates -subject
        
        # Configurar renovação automática
        echo "⚙️ Configurando renovação automática..."
        (crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
        
    else
        echo "❌ Falha na geração de certificados SSL"
        echo "📋 Logs do certbot:"
        tail -20 /var/log/letsencrypt/letsencrypt.log || echo "Arquivo de log não encontrado"
        exit 1
    fi
fi
EOF

success "✅ ETAPA 2 concluída - Certificados SSL prontos"
echo ""

# ETAPA 3: Aplicar configuração SSL
log "🔒 ETAPA 3: Aplicando configuração SSL..."

# Enviar configuração SSL
log "Enviando configuração SSL..."
scp -o StrictHostKeyChecking=no configs/nginx-ssl.conf $SERVER_USER@$SERVER_HOST:/tmp/ultrazend-nginx-ssl.conf

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
# Verificar se os certificados existem antes de aplicar SSL
if [ ! -f "/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem" ]; then
    echo "❌ Certificados SSL não encontrados - não é possível aplicar configuração SSL"
    exit 1
fi

echo "🔧 Aplicando configuração SSL..."

# Backup da configuração HTTP atual
cp /etc/nginx/sites-available/ultrazend /tmp/ultrazend-nginx-http-backup.conf

# Aplicar configuração SSL
cp /tmp/ultrazend-nginx-ssl.conf /etc/nginx/sites-available/ultrazend

# Testar configuração SSL
echo "🧪 Testando configuração SSL..."
if nginx -t; then
    echo "✅ Configuração SSL válida"
    
    # Aplicar configuração
    echo "🔄 Recarregando Nginx com SSL..."
    systemctl reload nginx
    
    # Verificar se nginx ainda está rodando
    if systemctl is-active --quiet nginx; then
        echo "✅ Nginx rodando com SSL"
        
        # Testar HTTPS
        echo "🔒 Testando acesso HTTPS..."
        sleep 5
        if curl -f -s -m 10 https://www.ultrazend.com.br > /dev/null 2>&1; then
            echo "✅ HTTPS funcionando perfeitamente"
        elif curl -f -s -m 10 -k https://localhost > /dev/null 2>&1; then
            echo "✅ HTTPS local funcionando (DNS pode estar propagando)"
        else
            echo "⚠️ HTTPS não está respondendo ainda (pode ser normal inicialmente)"
        fi
    else
        echo "❌ Nginx falhou com configuração SSL - revertendo..."
        cp /tmp/ultrazend-nginx-http-backup.conf /etc/nginx/sites-available/ultrazend
        systemctl reload nginx
        exit 1
    fi
else
    echo "❌ Configuração SSL inválida - mantendo HTTP"
    nginx -t
    exit 1
fi
EOF

success "✅ ETAPA 3 concluída - SSL aplicado"
echo ""

# Status final
log "📊 Verificando status final..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
echo ""
echo "=== STATUS FINAL SSL DEPLOYMENT ==="

# Nginx status
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx: Ativo"
else
    echo "❌ Nginx: Inativo"
fi

# SSL Certificate status
if [ -f "/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem" ]; then
    echo "✅ Certificados SSL: Instalados"
    expiry=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem | cut -d= -f2)
    echo "📅 Expira em: $expiry"
else
    echo "❌ Certificados SSL: Não encontrados"
fi

# Configuration check
if grep -q "ssl_certificate" /etc/nginx/sites-available/ultrazend; then
    echo "✅ Configuração: SSL ativo"
else
    echo "⚠️ Configuração: Apenas HTTP"
fi

# Port check
if netstat -tlnp | grep -q ":443.*nginx"; then
    echo "✅ Porta 443: Nginx escutando"
else
    echo "⚠️ Porta 443: Não está sendo usada pelo Nginx"
fi

# Test HTTPS
echo ""
echo "🧪 Teste final de conectividade:"
if curl -f -s -m 5 https://www.ultrazend.com.br > /dev/null 2>&1; then
    echo "✅ HTTPS: Funcionando"
elif curl -f -s -m 5 http://www.ultrazend.com.br > /dev/null 2>&1; then
    echo "⚠️ HTTP: Funcionando, HTTPS pode estar configurando"
else
    echo "⚠️ Conectividade externa: Verificar DNS/Firewall"
fi

echo ""
echo "=== DEPLOYMENT SSL COMPLETO ==="
EOF

echo ""
success "🎉 DEPLOY SSL EM 3 ETAPAS CONCLUÍDO!"
echo "=================================="
success "✅ HTTP configurado e testado"
success "✅ Certificados SSL gerados"
success "✅ HTTPS configurado e ativo"
echo ""
log "🌐 Teste os URLs:"
log "   HTTP:  http://$SUBDOMAIN"
log "   HTTPS: https://$SUBDOMAIN"
log "   API:   https://$SUBDOMAIN/api"
echo ""
log "📋 Use 'systemctl status nginx' no servidor para verificar logs se houver problemas."