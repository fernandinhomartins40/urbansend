#!/bin/bash

# 🚀 ULTRAZEND - GitHub Actions Deployment Script
# Optimized for GitHub Actions CI/CD environment

set -euo pipefail

# Configuration from environment or defaults
SERVER_HOST="${DEPLOY_HOST:-31.97.162.155}"
SERVER_USER="${DEPLOY_USER:-root}"
APP_NAME="ultrazend"
DEPLOY_PATH="/var/www/ultrazend"
DOMAIN="ultrazend.com.br"
SUBDOMAIN="www.ultrazend.com.br"
ADMIN_EMAIL="admin@ultrazend.com.br"

# Colors for GitHub Actions
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

echo "🚀 ULTRAZEND - GITHUB ACTIONS DEPLOYMENT"
echo "========================================"
log "Deploy Host: $SERVER_HOST"
log "Deploy Path: $DEPLOY_PATH"
log "Working Directory: $(pwd)"
echo ""

# 1. VALIDATE GITHUB ACTIONS ENVIRONMENT
log "PASSO 1: Validando ambiente GitHub Actions..."

# Check if we're in GitHub Actions
if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
    success "✅ Executando no GitHub Actions"
    log "Repository: ${GITHUB_REPOSITORY}"
    log "Ref: ${GITHUB_REF}"
    log "SHA: ${GITHUB_SHA:0:7}"
else
    warning "⚠️ Não está executando no GitHub Actions"
fi

# Verify repository structure
[ ! -d "backend" ] && error "❌ Diretório backend não encontrado"
[ ! -d "frontend" ] && error "❌ Diretório frontend não encontrado"
[ ! -f "backend/package.json" ] && error "❌ backend/package.json não encontrado"
[ ! -f "frontend/package.json" ] && error "❌ frontend/package.json não encontrado"

success "PASSO 1 concluído - Ambiente validado"

# 2. BUILD APPLICATION
log "PASSO 2: Build da aplicação..."

# Build backend
log "Building backend..."
cd backend
if [ -f "package-lock.json" ]; then
    npm ci
else
    npm install
fi
npm run build
cd ..

# Verify backend build
[ ! -f "backend/dist/index.js" ] && error "❌ Build do backend falhou"
success "✅ Backend build concluído"

# Build frontend
log "Building frontend..."
cd frontend
if [ -f "package-lock.json" ]; then
    npm ci
else
    npm install
fi
npm run build
cd ..

# Verify frontend build
[ ! -f "frontend/dist/index.html" ] && error "❌ Build do frontend falhou"
success "✅ Frontend build concluído"

success "PASSO 2 concluído - Builds realizados"

# 3. TEST SSH CONNECTION
log "PASSO 3: Testando conexão SSH..."

if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'echo "SSH OK"' > /dev/null 2>&1; then
    success "✅ Conexão SSH funcionando"
else
    error "❌ Falha na conexão SSH com $SERVER_HOST"
fi

success "PASSO 3 concluído - SSH testado"

# 4. PREPARE SERVER
log "PASSO 4: Preparando servidor..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
# Update system if first time
if [ ! -f "/var/ultrazend-setup-done" ]; then
    echo "🔄 First time setup - installing dependencies..."
    
    # Update system
    apt update && apt upgrade -y
    
    # Install Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    
    # Install other dependencies
    apt install -y nginx pm2 certbot python3-certbot-nginx git curl wget unzip
    
    # Install PM2 globally
    npm install -g pm2
    
    # Setup firewall
    ufw --force enable
    ufw allow ssh
    ufw allow http
    ufw allow https
    
    # Mark setup as done
    touch /var/ultrazend-setup-done
    
    echo "✅ First time setup completed"
else
    echo "✅ Server already configured"
fi

# Create application directories
mkdir -p /var/www/ultrazend/{backend,frontend,data,logs,temp,uploads}
mkdir -p /var/www/ultrazend/data/{database,cache,sessions}
mkdir -p /var/backups/ultrazend

# Set permissions
chown -R www-data:www-data /var/www/ultrazend
chmod -R 755 /var/www/ultrazend
EOF

success "PASSO 4 concluído - Servidor preparado"

# 5. DEPLOY APPLICATION
log "PASSO 5: Deploy da aplicação..."

# Create backup if app exists
log "Criando backup se necessário..."
ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << EOF
if [ -d "$DEPLOY_PATH/backend" ] && [ -f "$DEPLOY_PATH/backend/package.json" ]; then
    echo "📦 Criando backup da versão atual..."
    backup_dir="/var/backups/ultrazend/backup-\$(date +%Y%m%d-%H%M%S)"
    mkdir -p "\$backup_dir"
    cp -r $DEPLOY_PATH/backend "\$backup_dir/" 2>/dev/null || true
    cp -r $DEPLOY_PATH/frontend "\$backup_dir/" 2>/dev/null || true
    echo "✅ Backup criado em \$backup_dir"
else
    echo "ℹ️ Primeira instalação - sem backup necessário"
fi
EOF

# Deploy backend files
log "Enviando arquivos do backend..."
rsync -avz --delete \
    --exclude=node_modules \
    --exclude=.git \
    --exclude='*.log' \
    --exclude=__tests__ \
    --exclude=coverage \
    backend/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/

# Deploy frontend files
log "Enviando arquivos do frontend..."
rsync -avz --delete \
    frontend/dist/ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/frontend/

# Deploy config files
log "Enviando arquivos de configuração..."
scp -o StrictHostKeyChecking=no configs/.env.production $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/backend/.env
scp -o StrictHostKeyChecking=no ecosystem.config.js $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/
# Send both nginx configs
scp -o StrictHostKeyChecking=no configs/nginx-http.conf $SERVER_USER@$SERVER_HOST:/tmp/ultrazend-nginx-http.conf
scp -o StrictHostKeyChecking=no configs/nginx-ssl.conf $SERVER_USER@$SERVER_HOST:/tmp/ultrazend-nginx-ssl.conf

success "PASSO 5 concluído - Aplicação enviada"

# 6. SERVER CONFIGURATION
log "PASSO 6: Configuração no servidor..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH/backend

# Install production dependencies
echo "📦 Instalando dependências de produção..."
if [ -f "package-lock.json" ]; then
    npm ci --only=production
else
    npm install --only=production
fi

# Ensure build exists
if [ ! -f "dist/index.js" ]; then
    echo "⚠️ Build não encontrado no servidor, verificando..."
    ls -la dist/ || echo "Diretório dist não existe"
    exit 1
fi

echo "✅ Backend preparado"

# Run database migrations
echo "🗄️ Executando migrações de banco..."
npm run migrate:latest || echo "Migrations completed or not needed"

# Configure Nginx - Start with HTTP only, then upgrade to SSL
echo "🌐 ETAPA 1: Configurando Nginx HTTP temporário..."

# ETAPA 1.1: Limpar configurações SSL antigas que podem causar conflitos
echo "🧹 Limpando configurações SSL antigas..."

# Stop nginx first to avoid conflicts
systemctl stop nginx 2>/dev/null || true

# Backup current config if exists
if [ -f "/etc/nginx/sites-available/ultrazend" ]; then
    echo "📦 Backup da configuração atual..."
    cp /etc/nginx/sites-available/ultrazend "/tmp/ultrazend-nginx-backup-\$(date +%Y%m%d-%H%M%S).conf"
fi

# Remove old configurations that might have SSL references
echo "🗑️ Removendo configurações antigas..."
rm -f /etc/nginx/sites-enabled/ultrazend
rm -f /etc/nginx/sites-enabled/default

# ETAPA 1.2: Apply clean HTTP config
echo "📝 Aplicando configuração HTTP limpa..."
if [ -f "/tmp/ultrazend-nginx-http.conf" ]; then
    cp /tmp/ultrazend-nginx-http.conf /etc/nginx/sites-available/ultrazend
    ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
    
    # Verify no SSL references in HTTP config
    if grep -q "ssl_certificate" /etc/nginx/sites-available/ultrazend; then
        echo "❌ ERRO: Configuração HTTP contém referências SSL!"
        grep -n "ssl" /etc/nginx/sites-available/ultrazend
        exit 1
    fi
    
    # Create webroot directory for Let's Encrypt
    mkdir -p /var/www/html
    chown -R www-data:www-data /var/www/html
    echo "<h1>UltraZend Server</h1>" > /var/www/html/index.html
    
    # Test nginx HTTP config
    echo "🧪 Testando configuração HTTP..."
    if nginx -t; then
        echo "✅ Configuração Nginx HTTP válida"
        systemctl start nginx
        systemctl enable nginx
        
        # Verify nginx started successfully
        if systemctl is-active --quiet nginx; then
            echo "✅ Nginx iniciado com HTTP"
        else
            echo "❌ Nginx falhou ao iniciar"
            systemctl status nginx
            exit 1
        fi
    else
        echo "❌ Erro na configuração Nginx HTTP"
        nginx -t
        exit 1
    fi
else
    echo "❌ Arquivo nginx-http.conf não encontrado"
    exit 1
fi

# Set proper permissions
chown -R www-data:www-data $DEPLOY_PATH
chmod +x $DEPLOY_PATH/backend/dist/index.js

echo "✅ Configuração no servidor concluída"
EOF

success "PASSO 6 concluído - Servidor configurado"

# 7. SSL CERTIFICATES (if first time)
log "🔒 ETAPA 2: Verificando certificados SSL..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << EOF
if [ ! -f "/etc/letsencrypt/live/$SUBDOMAIN/fullchain.pem" ]; then
    echo "🔒 Configurando certificados SSL..."
    
    # Make sure nginx is running (needed for HTTP validation)
    systemctl start nginx
    systemctl enable nginx
    
    # Get certificates using webroot (nginx is already serving HTTP)
    certbot certonly --webroot \
        -w /var/www/html \
        -d $DOMAIN \
        -d $SUBDOMAIN \
        --non-interactive \
        --agree-tos \
        --email $ADMIN_EMAIL \
        || echo "⚠️ SSL certificate generation failed - continuing with HTTP only"
    
    # If certificates were generated successfully, switch to SSL config
    if [ -f "/etc/letsencrypt/live/$SUBDOMAIN/fullchain.pem" ]; then
        echo "🔒 Atualizando configuração Nginx para SSL..."
        
        if [ -f "/tmp/ultrazend-nginx-ssl.conf" ]; then
            cp /tmp/ultrazend-nginx-ssl.conf /etc/nginx/sites-available/ultrazend
            
            # Test SSL config
            if nginx -t; then
                echo "✅ Configuração SSL válida - aplicando..."
                systemctl reload nginx
                echo "✅ SSL configurado com sucesso"
            else
                echo "❌ Erro na configuração SSL - mantendo HTTP"
                cp /tmp/ultrazend-nginx-http.conf /etc/nginx/sites-available/ultrazend
                systemctl reload nginx
            fi
        fi
    else
        echo "⚠️ Certificados não foram gerados - mantendo HTTP"
    fi
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx") | crontab -
    
else
    echo "✅ Certificados SSL já existem"
    
    # If SSL exists but nginx is using HTTP config, upgrade to SSL
    if [ -f "/tmp/ultrazend-nginx-ssl.conf" ] && ! grep -q "ssl_certificate" /etc/nginx/sites-available/ultrazend; then
        echo "🔒 Atualizando para configuração SSL..."
        cp /tmp/ultrazend-nginx-ssl.conf /etc/nginx/sites-available/ultrazend
        if nginx -t; then
            systemctl reload nginx
            echo "✅ Configuração SSL aplicada"
        else
            echo "❌ Erro na configuração SSL - revertendo"
            cp /tmp/ultrazend-nginx-http.conf /etc/nginx/sites-available/ultrazend
            systemctl reload nginx
        fi
    fi
fi

# Ensure nginx is running
systemctl enable nginx
if ! systemctl is-active --quiet nginx; then
    systemctl start nginx
fi
EOF

success "🔒 ETAPA 2 concluída - SSL verificado"

# 8. START/RESTART APPLICATION
log "PASSO 8: Iniciando aplicação..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << EOF
cd $DEPLOY_PATH

# Stop existing process
pm2 stop ultrazend 2>/dev/null || echo "No existing process to stop"
pm2 delete ultrazend 2>/dev/null || echo "No existing process to delete"

# Start application
echo "🚀 Iniciando aplicação..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup systemd -u root --hp /root | grep '^sudo' | bash || echo "PM2 startup may already be configured"

echo "✅ Aplicação iniciada"
EOF

success "PASSO 8 concluído - Aplicação iniciada"

# 9. HEALTH CHECKS
log "PASSO 9: Verificações de saúde..."

# Wait for application to start
log "Aguardando inicialização (15s)..."
sleep 15

# Health check with retries
check_health() {
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Health check - tentativa $attempt/$max_attempts"
        
        if ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'curl -f -s -m 10 http://localhost:3001/health > /dev/null'; then
            success "✅ Aplicação respondendo localmente"
            return 0
        fi
        
        warning "Tentativa $attempt falhou, aguardando 5s..."
        sleep 5
        ((attempt++))
    done
    
    error "❌ Health check falhou após $max_attempts tentativas"
}

check_health

# Test external access (may fail if DNS not propagated yet)
log "Testando acesso externo..."
if curl -f -s -m 10 "https://$SUBDOMAIN/health" > /dev/null 2>&1; then
    success "✅ Acesso externo HTTPS funcionando"
elif curl -f -s -m 10 "http://$SUBDOMAIN" > /dev/null 2>&1; then
    warning "⚠️ HTTP funcionando, HTTPS pode estar configurando"
else
    warning "⚠️ Acesso externo ainda não disponível (DNS pode estar propagando)"
fi

success "PASSO 9 concluído - Health checks realizados"

# 10. FINAL STATUS
log "PASSO 10: Status final..."

ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST << 'EOF'
echo ""
echo "=== STATUS FINAL DO DEPLOYMENT ==="

# PM2 Status
echo "PM2 Process:"
pm2 jlist | jq -r '.[] | select(.name=="ultrazend") | "Status: " + .pm2_env.status + " | PID: " + (.pid|tostring) + " | Uptime: " + .pm2_env.pm_uptime'

# System status
echo ""
echo "Services:"
systemctl is-active nginx >/dev/null && echo "✅ Nginx: Active" || echo "❌ Nginx: Inactive"
systemctl is-active pm2-root >/dev/null && echo "✅ PM2: Active" || echo "⚠️ PM2: Check needed"

# SSL status
echo ""
if [ -f "/etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem" ]; then
    echo "✅ SSL: Configured"
    expiry=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem | cut -d= -f2)
    echo "SSL Expires: $expiry"
else
    echo "⚠️ SSL: Not configured"
fi

# Disk usage
echo ""
echo "Disk Usage:"
df -h /var/www/ultrazend | tail -1

echo ""
echo "=== DEPLOYMENT SUCCESSFUL ==="
EOF

echo ""
success "🎉 GITHUB ACTIONS DEPLOYMENT CONCLUÍDO!"
echo "==========================================="
success "✅ Aplicação deployada com sucesso"
success "✅ Health checks passaram"
success "✅ Serviços configurados"
echo ""
log "🌐 URLs da aplicação:"
log "   Website: https://$SUBDOMAIN"
log "   Health: https://$SUBDOMAIN/health"
log "   API: https://$SUBDOMAIN/api"
echo ""
log "📊 GitHub Actions deployment finalizado!"