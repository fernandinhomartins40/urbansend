#!/bin/bash

# CI/CD Deploy script for UrbanSend container
# This version is optimized for GitHub Actions and CI environments
set -e

echo "🚀 Starting UrbanSend CI/CD deployment..."

# Configuration
REMOTE_USER="${DEPLOY_USER:-root}"
REMOTE_IP="${DEPLOY_HOST:-72.60.10.112}"
REMOTE_HOST="${REMOTE_USER}@${REMOTE_IP}"
REMOTE_DIR="/root/urbansend"
CONTAINER_NAME="urbansend_app"
COMPOSE_FILE="docker-compose.production.yml"

# SSH options for CI/CD
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30"

echo "📦 Building frontend..."
cd frontend
npm run build
cd ..

echo "📦 Building backend..."
cd backend
npm run build
cd ..

echo "📤 Deploying to VPS via SSH..."

# Create a deployment package
echo "📦 Creating deployment package..."
mkdir -p deploy-temp
cp -r frontend/dist deploy-temp/frontend-dist
cp -r backend/dist deploy-temp/backend-dist
cp -r backend/src/migrations deploy-temp/backend-migrations
cp backend/package*.json deploy-temp/
cp backend/knexfile.js deploy-temp/backend-knexfile.js
cp Dockerfile deploy-temp/
cp nginx.conf deploy-temp/
cp $COMPOSE_FILE deploy-temp/docker-compose.yml

# Create deployment script to run on server
cat > deploy-temp/server-deploy.sh << 'SERVEREOF'
#!/bin/bash
set -e

cd /root/urbansend

echo "🐳 Stopping existing containers..."
docker-compose down --remove-orphans || true
docker container rm -f urbansend_app || true
docker image rm -f urbansend_urbansend_app || true

echo "🔨 Building and starting containers..."
docker-compose up --build -d

echo "⏳ Waiting for containers to be healthy..."
sleep 30

echo "📊 Container status:"
docker-compose ps

echo "📝 Recent logs:"
docker-compose logs urbansend_app --tail 20

echo "🔧 Updating nginx configuration..."
sed -i 's/localhost:3020/localhost:3010/g' /etc/nginx/sites-available/ultrazend.com.br || true
sed -i 's/localhost:3011/localhost:3010/g' /etc/nginx/sites-available/ultrazend.com.br || true

echo "🔄 Reloading nginx..."
nginx -t && systemctl reload nginx || true

echo "📊 Final status check..."
curl -f http://localhost:3010/health || echo "❌ Health check failed"
netstat -tlnp | grep :3010 || echo "❌ Port 3010 not listening"
netstat -tlnp | grep :25 || echo "⚠️  Port 25 not listening (SMTP)"

echo "✅ Deployment completed!"
SERVEREOF

chmod +x deploy-temp/server-deploy.sh

# Execute deployment
echo "🚀 Executing deployment on server..."

# Method 1: Try with tar and pipe (most reliable for CI/CD)
if command -v tar >/dev/null 2>&1; then
    echo "📦 Using tar method for deployment..."
    tar -czf - -C deploy-temp . | ssh $SSH_OPTS $REMOTE_HOST "
        mkdir -p $REMOTE_DIR
        cd $REMOTE_DIR
        tar -xzf -
        chmod +x server-deploy.sh
        ./server-deploy.sh
    "
else
    echo "📦 Using direct SSH method..."
    # Method 2: Direct commands via SSH
    ssh $SSH_OPTS $REMOTE_HOST "mkdir -p $REMOTE_DIR"
    
    # Copy files using a loop to handle potential issues
    for file in deploy-temp/*; do
        if [ -f "$file" ]; then
            echo "Copying $(basename "$file")..."
            cat "$file" | ssh $SSH_OPTS $REMOTE_HOST "cat > $REMOTE_DIR/$(basename "$file")"
        elif [ -d "$file" ]; then
            echo "Copying directory $(basename "$file")..."
            tar -czf - -C "$(dirname "$file")" "$(basename "$file")" | ssh $SSH_OPTS $REMOTE_HOST "cd $REMOTE_DIR && tar -xzf -"
        fi
    done
    
    # Execute deployment script
    ssh $SSH_OPTS $REMOTE_HOST "cd $REMOTE_DIR && chmod +x server-deploy.sh && ./server-deploy.sh"
fi

# Cleanup
rm -rf deploy-temp

echo "✅ CI/CD Deployment completed!"
echo "🌐 Application should be available at https://ultrazend.com.br"
echo "📧 SMTP server should be listening on port 25"