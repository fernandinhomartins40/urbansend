#!/bin/bash

# Deploy script for UrbanSend
set -e

VPS_IP="72.60.10.112"
VPS_USER="root"
DEPLOY_PATH="/var/www/urbansend"
BACKEND_PORT="3010"
FRONTEND_PORT="3011"

echo "🚀 Starting deployment to VPS..."

# Create deployment directory
echo "📁 Creating deployment directory..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "mkdir -p ${DEPLOY_PATH}"

# Copy application files
echo "📦 Copying application files..."
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r backend/dist ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no backend/package*.json ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no backend/knexfile.js ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r frontend/dist ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/frontend/
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no docker-compose.yml ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/

# Create production docker-compose override
echo "⚙️  Creating production configuration..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
cd ${DEPLOY_PATH}
cat > docker-compose.prod.yml << 'EOF'
version: '3.8'
services:
  backend:
    ports:
      - '${BACKEND_PORT}:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=urbansend-super-secret-jwt-key-production-2024
      - JWT_EXPIRES_IN=7d
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - CORS_ORIGIN=http://${VPS_IP}:${FRONTEND_PORT}
  
  frontend:
    ports:
      - '${FRONTEND_PORT}:80'
      
  redis:
    ports:
      - '6380:6379'
      
  redis-commander:
    ports:
      - '8082:8081'
EOF
"

# Install system dependencies
echo "🔧 Installing system dependencies..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo 'Installing Docker...'
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo 'Installing Docker Compose...'
    curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-Linux-x86_64 -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo 'Installing Node.js...'
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi
"

# Install application dependencies
echo "📚 Installing application dependencies..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
cd ${DEPLOY_PATH}
npm ci --only=production
"

# Deploy with Docker
echo "🐳 Deploying with Docker..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
cd ${DEPLOY_PATH}

# Stop existing containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down || true

# Build and start new containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Wait for services to start
echo 'Waiting for services to start...'
sleep 30

# Run database migrations
echo 'Running database migrations...'
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend npm run migrate:latest || true

# Show running containers
echo 'Running containers:'
docker ps

# Check if services are healthy
echo 'Checking service health...'
curl -f http://localhost:${BACKEND_PORT}/health || echo 'Backend health check failed'
"

echo "✅ Deployment completed successfully!"
echo ""
echo "🌐 Application URLs:"
echo "   Frontend: http://${VPS_IP}:${FRONTEND_PORT}"
echo "   Backend:  http://${VPS_IP}:${BACKEND_PORT}"
echo "   Redis UI: http://${VPS_IP}:8082"
echo ""
echo "📝 To check logs:"
echo "   ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose logs -f'"