#!/bin/bash

# Deploy script for UrbanSend container
set -e

echo "🚀 Starting UrbanSend deployment..."

# Configuration
REMOTE_USER="root"
REMOTE_IP="72.60.10.112"
REMOTE_HOST="${REMOTE_USER}@${REMOTE_IP}"
REMOTE_DIR="/root/urbansend"
CONTAINER_NAME="urbansend_app"
COMPOSE_FILE="docker-compose.production.yml"

# SSH options for automation
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=60"

echo "🔑 Testing SSH connection..."
if ! ssh $SSH_OPTS $REMOTE_HOST "echo 'SSH connection successful'" 2>/dev/null; then
    echo "❌ SSH connection failed!"
    echo "Please ensure you have:"
    echo "1. SSH keys configured (ssh-keygen + ssh-copy-id $REMOTE_HOST)"
    echo "2. Or password authentication enabled"
    echo "3. Or run this script in an environment with SSH access configured"
    exit 1
fi

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
ssh $SSH_OPTS $REMOTE_HOST "mkdir -p $REMOTE_DIR"

# Copy necessary files
scp $SSH_OPTS -r frontend/dist $REMOTE_HOST:$REMOTE_DIR/frontend-dist
scp $SSH_OPTS -r backend/dist $REMOTE_HOST:$REMOTE_DIR/backend-dist
scp $SSH_OPTS -r backend/src/migrations $REMOTE_HOST:$REMOTE_DIR/backend-migrations
scp $SSH_OPTS backend/package*.json $REMOTE_HOST:$REMOTE_DIR/backend-
scp $SSH_OPTS backend/knexfile.js $REMOTE_HOST:$REMOTE_DIR/backend-knexfile.js
scp $SSH_OPTS Dockerfile $REMOTE_HOST:$REMOTE_DIR/Dockerfile
scp $SSH_OPTS nginx.conf $REMOTE_HOST:$REMOTE_DIR/nginx.conf
scp $SSH_OPTS $COMPOSE_FILE $REMOTE_HOST:$REMOTE_DIR/docker-compose.yml

echo "🐳 Building and starting containers..."
ssh $SSH_OPTS $REMOTE_HOST << 'EOF'
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
ssh $SSH_OPTS $REMOTE_HOST << 'EOF'
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