#!/bin/bash

# UltraZend Simple CI Deploy Script (Node.js direto, sem Docker/Nginx)
set -euo pipefail

VPS_IP="31.97.162.155"
VPS_USER="root"
DEPLOY_PATH="/var/www/ultrazend"
APP_NAME="ultrazend"
DOMAIN="ultrazend.com.br"

echo "🚀 UltraZend CI Deployment"
echo "=========================="

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
    cd backend
    
    echo '📦 Instalando dependências de produção...'
    npm install --only=production
    
    echo '🔨 Compilando TypeScript...'
    npm run build
"

# Start application with PM2
echo "🚀 Starting application..."
ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP "
    cd $DEPLOY_PATH
    
    echo '▶️ Iniciando aplicação...'
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    echo '📊 Status da aplicação:'
    pm2 status
"

echo "✅ CI deployment completed successfully!"