#!/bin/bash

# 🚀 UrbanSend Direct VPS Deployment Script
# Deploy Node.js application directly on VPS (no Docker)

set -e

VPS_HOST="${VPS_HOST:-31.97.162.155}"
VPS_USER="${VPS_USER:-root}"
DEPLOY_PATH="/var/www/urbansend"
APP_DOMAIN="${APP_DOMAIN:-www.ultrazend.com.br}"

echo "🚀 Starting UrbanSend deployment to $VPS_HOST"
echo "=========================================="

# 1. Create deployment directory structure on VPS
echo "📁 Creating directory structure..."
ssh $VPS_USER@$VPS_HOST << 'EOF'
mkdir -p /var/www/urbansend/{backend,frontend,data,logs,backup}
chown -R www-data:www-data /var/www/urbansend
chmod 755 /var/www/urbansend
EOF

# 2. Upload backend files
echo "📤 Uploading backend..."
rsync -avz --delete --exclude=node_modules --exclude=dist backend/ $VPS_USER@$VPS_HOST:$DEPLOY_PATH/backend/

# 3. Upload frontend build
echo "📤 Uploading frontend build..."
rsync -avz --delete frontend/dist/ $VPS_USER@$VPS_HOST:$DEPLOY_PATH/frontend/

# 4. Upload configuration files
echo "📤 Uploading configuration..."
scp configs/nginx.conf $VPS_USER@$VPS_HOST:/tmp/urbansend-nginx.conf
scp configs/ecosystem.config.js $VPS_USER@$VPS_HOST:$DEPLOY_PATH/
scp configs/.env.production $VPS_USER@$VPS_HOST:$DEPLOY_PATH/backend/.env

# 5. Install dependencies and setup
echo "🔧 Installing dependencies and setting up services..."
ssh $VPS_USER@$VPS_HOST << EOF
cd $DEPLOY_PATH/backend

# Install Node.js dependencies
npm ci --only=production

# Build backend if needed
npm run build || echo "Build failed, using existing dist"

# Install PM2 globally if not exists
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# Setup nginx configuration
cp /tmp/urbansend-nginx.conf /etc/nginx/sites-available/urbansend
ln -sf /etc/nginx/sites-available/urbansend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Run database migrations
npm run migrate:latest

# Start/restart application with PM2
pm2 delete urbansend 2>/dev/null || true
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup | bash

echo "✅ Deployment completed!"
echo "🌐 Application should be available at: http://$APP_DOMAIN"
EOF

echo ""
echo "🎉 Deployment completed successfully!"
echo "🔒 Don't forget to run: certbot --nginx -d $APP_DOMAIN"