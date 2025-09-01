#!/bin/bash

# UltraZend Simple VPS Deploy Script (Node.js direto, sem Docker/Nginx)
set -euo pipefail

VPS_IP="31.97.162.155"
VPS_USER="root"
DEPLOY_PATH="/var/www/ultrazend"
APP_NAME="ultrazend"
DOMAIN="ultrazend.com.br"

echo "🚀 UltraZend VPS Deployment"
echo "==========================="

# Pre-deployment checks
echo "📋 Pre-deployment checks..."
if [ ! -d "backend/src" ]; then
    echo "❌ Error: Backend source not found!"
    exit 1
fi

echo "✅ Pre-deployment checks passed"

# Stop existing PM2 process
echo "🛑 Stopping existing application..."
ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP "
    cd $DEPLOY_PATH 2>/dev/null || true
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
" || echo "⚠️  No existing processes to stop"

# Update code from git
echo "📦 Updating application code..."
ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP "
    cd $DEPLOY_PATH
    git pull origin main
    
    echo '⚙️ Configurando ambiente de produção...'
    
    echo '🎨 Buildando frontend...'
    cd frontend
    npm ci --production=false
    npm run build
    cd ..
    
    echo '🔨 Buildando backend...'
    cd backend
    npm ci --production=false
    npm run build
    
    echo '🗄️ Executando migrations...'
    npm run migrate:latest
    
    echo '🔧 Configurando permissões...'
    chown -R www-data:www-data /var/www/ultrazend/data/ || true
    chmod 664 /var/www/ultrazend/data/database.sqlite || true
"

# Start application with PM2
echo "🚀 Starting application..."
ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP "
    cd $DEPLOY_PATH
    
    echo '▶️ Iniciando aplicação...'
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    echo '⏳ Aguardando inicialização...'
    sleep 10
    
    echo '📊 Status da aplicação:'
    pm2 status
    
    echo '🔍 Verificação de saúde:'
    curl -k -m 10 https://localhost:443/health || echo 'Health check failed'
    
    echo '🌐 Verificação de portas:'
    netstat -tlnp | grep -E ':(80|443|25)' || echo 'Algumas portas não estão escutando'
"

echo "✅ VPS deployment completed successfully!"
echo ""
echo "🔒 Application URLs:"
echo "   Frontend: https://$DOMAIN"
echo "   Backend:  https://$DOMAIN/api/"
echo ""
echo "🔧 Application Management:"
echo "   View logs: ssh $VPS_USER@$VPS_IP 'pm2 logs $APP_NAME'"
echo "   Restart:   ssh $VPS_USER@$VPS_IP 'pm2 restart $APP_NAME'"
echo "   Stop:      ssh $VPS_USER@$VPS_IP 'pm2 stop $APP_NAME'"
echo "   Status:    ssh $VPS_USER@$VPS_IP 'pm2 status'"
echo ""
echo "📧 SMTP Configuration:"
echo "   Server: $DOMAIN"
echo "   Port: 25 (SMTP)"
echo ""
echo "🎯 Deployment completed with simplified VPS architecture:"
echo "   ✅ Direct Node.js with native HTTPS"
echo "   ✅ PM2 process management (fork mode)"
echo "   ✅ No Docker containers"
echo "   ✅ No Nginx reverse proxy"
echo "   ✅ Direct SSL certificate binding"