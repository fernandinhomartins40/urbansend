#!/bin/bash

# Deploy script for UrbanSend container
set -e

echo "🚀 Starting UrbanSend deployment..."

# Configuration
REMOTE_HOST="root@72.60.10.112"
REMOTE_DIR="/root/urbansend"
CONTAINER_NAME="urbansend_app"
COMPOSE_FILE="docker-compose.production.yml"

echo "📦 Building frontend..."
cd frontend
npm run build
cd ..

echo "📦 Building backend..."
cd backend
npm run build
cd ..

echo "📤 Copying files to VPS..."
# Create remote directory
ssh $REMOTE_HOST "mkdir -p $REMOTE_DIR"

# Copy necessary files
scp -r frontend/dist $REMOTE_HOST:$REMOTE_DIR/frontend-dist
scp -r backend/dist $REMOTE_HOST:$REMOTE_DIR/backend-dist
scp -r backend/src/migrations $REMOTE_HOST:$REMOTE_DIR/backend-migrations
scp backend/package*.json $REMOTE_HOST:$REMOTE_DIR/backend-
scp backend/knexfile.js $REMOTE_HOST:$REMOTE_DIR/backend-knexfile.js
scp Dockerfile $REMOTE_HOST:$REMOTE_DIR/Dockerfile
scp nginx.conf $REMOTE_HOST:$REMOTE_DIR/nginx.conf
scp $COMPOSE_FILE $REMOTE_HOST:$REMOTE_DIR/docker-compose.yml

echo "🐳 Building and starting containers..."
ssh $REMOTE_HOST << 'EOF'
cd /root/urbansend

# Stop existing containers if they exist
docker-compose down --remove-orphans || true

# Remove old containers and images
docker container rm -f urbansend_app || true
docker image rm -f urbansend_urbansend_app || true

# Build and start
docker-compose up --build -d

# Wait for containers to be healthy
echo "⏳ Waiting for containers to be healthy..."
sleep 30

# Check container status
docker-compose ps
docker-compose logs urbansend_app --tail 50
EOF

echo "🔧 Updating nginx configuration..."
ssh $REMOTE_HOST << 'EOF'
# Update nginx configuration for port 3010
sed -i 's/localhost:3020/localhost:3010/g' /etc/nginx/sites-available/urbanmail.com.br
sed -i 's/localhost:3011/localhost:3010/g' /etc/nginx/sites-available/urbanmail.com.br

# Test and reload nginx
nginx -t && systemctl reload nginx

echo "📊 Final status check..."
curl -f http://localhost:3010/health || echo "❌ Health check failed"
netstat -tlnp | grep :3010 || echo "❌ Port 3010 not listening"
netstat -tlnp | grep :25 || echo "⚠️  Port 25 not listening (SMTP)"
EOF

echo "✅ Deployment completed!"
echo "🌐 Application should be available at https://urbanmail.com.br"
echo "📧 SMTP server should be listening on port 25"
echo "🔍 Check logs with: ssh $REMOTE_HOST 'cd $REMOTE_DIR && docker-compose logs -f'"