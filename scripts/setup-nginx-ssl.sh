#!/bin/bash
#
# UltraZend - Nginx SSL Setup Script
# Configura automaticamente SSL para o deploy
#

set -e

DOMAIN="www.velomail.com.br"
EMAIL="admin@velomail.com.br"
APP_DIR="/var/www/ultrazend"
NGINX_CONFIG_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"

echo "🔒 Setting up Nginx with SSL for UltraZend..."

# Função para log com timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Verificar se certificado SSL existe
check_ssl_cert() {
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        log "✅ SSL certificate found for $DOMAIN"
        return 0
    else
        log "⚠️ SSL certificate not found for $DOMAIN"
        return 1
    fi
}

# Configurar Nginx com SSL
setup_nginx_ssl() {
    log "📋 Configuring Nginx with SSL..."
    
    # Usar configuração SSL se certificado existir, senão usar HTTP temporariamente
    if check_ssl_cert; then
        log "🔒 Using SSL configuration"
        cp "$APP_DIR/configs/nginx-ssl.conf" "$NGINX_CONFIG_DIR/ultrazend"
    else
        log "⚠️ Using HTTP configuration (SSL cert not found)"
        cp "$APP_DIR/configs/nginx-http.conf" "$NGINX_CONFIG_DIR/ultrazend"
        # Atualizar caminho do frontend na configuração HTTP
        sed -i 's|/var/www/ultrazend/frontend/dist|/var/www/ultrazend-static|g' "$NGINX_CONFIG_DIR/ultrazend"
    fi
    
    # Ativar site
    ln -sf "$NGINX_CONFIG_DIR/ultrazend" "$NGINX_ENABLED_DIR/"
    rm -f "$NGINX_ENABLED_DIR/default"
    
    # Testar configuração
    log "🧪 Testing Nginx configuration..."
    if nginx -t; then
        log "✅ Nginx configuration is valid"
        systemctl reload nginx
        log "✅ Nginx reloaded successfully"
    else
        log "❌ Nginx configuration failed!"
        exit 1
    fi
}

# Obter/renovar certificado SSL
setup_ssl_cert() {
    log "🔒 Setting up SSL certificate..."
    
    # Instalar certbot se não existir
    if ! command -v certbot &> /dev/null; then
        log "📦 Installing certbot..."
        apt-get update -qq
        apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Tentar obter/renovar certificado
    log "🔑 Obtaining/renewing SSL certificate for $DOMAIN..."
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect; then
        log "✅ SSL certificate obtained/renewed successfully"
        return 0
    else
        log "⚠️ Failed to obtain SSL certificate, will continue with HTTP"
        return 1
    fi
}

# Verificar se Nginx está funcionando
verify_nginx() {
    log "🏥 Verifying Nginx status..."
    
    if systemctl is-active --quiet nginx; then
        log "✅ Nginx is active"
    else
        log "❌ Nginx is not active, starting..."
        systemctl start nginx
    fi
    
    # Test HTTP response
    if curl -f --connect-timeout 5 "http://localhost/" > /dev/null 2>&1; then
        log "✅ HTTP response OK"
    else
        log "⚠️ HTTP response failed"
    fi
    
    # Test HTTPS if certificate exists
    if check_ssl_cert; then
        if curl -f --connect-timeout 5 "https://localhost/" > /dev/null 2>&1; then
            log "✅ HTTPS response OK"
        else
            log "⚠️ HTTPS response failed"
        fi
    fi
}

# Função principal
main() {
    log "🚀 Starting Nginx SSL setup for UltraZend..."
    
    # 1. Configurar Nginx inicialmente (HTTP ou SSL dependendo do certificado)
    setup_nginx_ssl
    
    # 2. Se não tiver certificado SSL, tentar obter
    if ! check_ssl_cert; then
        log "🔑 Attempting to obtain SSL certificate..."
        if setup_ssl_cert; then
            # Se conseguiu SSL, reconfigurar Nginx com SSL
            log "🔄 Reconfiguring Nginx with SSL..."
            setup_nginx_ssl
        fi
    fi
    
    # 3. Verificar tudo está funcionando
    verify_nginx
    
    log "✅ Nginx SSL setup completed!"
    log "🌐 Website should be accessible at: https://$DOMAIN"
}

# Executar se chamado diretamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi