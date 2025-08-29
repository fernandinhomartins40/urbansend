#!/bin/bash

# GitHub Actions Deploy script for UrbanSend
# This script assumes SSH keys are configured in GitHub Secrets
set -e

echo "🚀 Starting UrbanSend GitHub Actions deployment..."

# Build applications
echo "📦 Building applications..."
cd frontend && npm run build && cd ..
cd backend && npm run build && cd ..

# Deploy via SSH with heredoc (avoids file transfer issues)
echo "🚀 Deploying to VPS..."
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@72.60.10.112 << 'DEPLOY_EOF'
set -e

# Create deployment directory
mkdir -p /root/urbansend
cd /root/urbansend

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true
docker container rm -f urbansend_app 2>/dev/null || true
docker image rm -f urbansend_urbansend_app 2>/dev/null || true

# Clean up
rm -rf frontend-dist backend-dist backend-migrations *.js *.json Dockerfile nginx.conf docker-compose.yml 2>/dev/null || true

echo "✅ Ready for new deployment files..."
DEPLOY_EOF

# Now copy the built files using base64 encoding (works in any shell)
echo "📤 Copying frontend build..."
tar -czf - -C frontend dist | base64 | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d | tar -xzf - -C /root/urbansend && mv /root/urbansend/dist /root/urbansend/frontend-dist"

echo "📤 Copying backend build..."
tar -czf - -C backend dist | base64 | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d | tar -xzf - -C /root/urbansend && mv /root/urbansend/dist /root/urbansend/backend-dist"

echo "📤 Copying backend migrations..."
tar -czf - -C backend/src migrations | base64 | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d | tar -xzf - -C /root/urbansend && mv /root/urbansend/migrations /root/urbansend/backend-migrations"

echo "📤 Copying configuration files..."
# Copy individual files
base64 backend/package.json | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d > /root/urbansend/backend-package.json"
base64 backend/package-lock.json | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d > /root/urbansend/backend-package-lock.json" 2>/dev/null || true
base64 backend/knexfile.js | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d > /root/urbansend/backend-knexfile.js"
base64 Dockerfile | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d > /root/urbansend/Dockerfile"
base64 nginx.conf | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d > /root/urbansend/nginx.conf"
base64 docker-compose.production.yml | ssh -o StrictHostKeyChecking=no root@72.60.10.112 "base64 -d > /root/urbansend/docker-compose.yml"

# Final deployment and configuration
echo "🐳 Starting containers and configuring services..."
ssh -o StrictHostKeyChecking=no root@72.60.10.112 << 'FINAL_EOF'
set -e
cd /root/urbansend

echo "🔨 Building and starting containers..."
docker-compose up --build -d

echo "⏳ Waiting for services to start..."
sleep 45

echo "🔧 Updating nginx configuration..."
sed -i 's/localhost:3020/localhost:3010/g' /etc/nginx/sites-available/urbanmail.com.br 2>/dev/null || true
sed -i 's/localhost:3011/localhost:3010/g' /etc/nginx/sites-available/urbanmail.com.br 2>/dev/null || true

echo "🔄 Testing and reloading nginx..."
nginx -t && systemctl reload nginx || echo "⚠️ Nginx reload failed"

echo "📊 Final health checks..."
docker-compose ps
echo "Container logs:"
docker-compose logs urbansend_app --tail 10

echo "Health check:"
curl -f http://localhost:3010/health || echo "❌ Health check failed"

echo "Port checks:"
netstat -tlnp | grep :3010 || echo "❌ Port 3010 not listening"
netstat -tlnp | grep :25 || echo "⚠️ Port 25 not listening (SMTP)"

echo "✅ Deployment completed successfully!"
FINAL_EOF

echo "✅ GitHub Actions deployment completed!"
echo "🌐 Application: https://urbanmail.com.br"
echo "📧 SMTP Server: Port 25"