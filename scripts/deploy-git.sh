#!/bin/bash

# UrbanSend Git-based Deploy Script
set -e

VPS_IP="72.60.10.112"
VPS_USER="root"
DEPLOY_PATH="/root/urbansend-sync"
PRODUCTION_PATH="/var/www/urbansend"
APP_NAME="urbansend"
DOMAIN="www.urbanmail.com.br"
NETWORK_NAME="${APP_NAME}_network"
BACKEND_PORT="3010"
FRONTEND_PORT="3011"
REDIS_PORT="6380"
REDIS_UI_PORT="8082"

echo "🚀 Starting Git-based deployment for ${APP_NAME}..."

# SSH into server and perform deploy
ssh -o ConnectTimeout=10 -o BatchMode=yes ${VPS_USER}@${VPS_IP} "
set -e

echo '📁 Setting up deployment directories...'
mkdir -p ${PRODUCTION_PATH}

echo '📦 Updating code from Git repository...'
if [ -d ${DEPLOY_PATH} ]; then
    cd ${DEPLOY_PATH}
    git pull origin main
else
    cd /root
    git clone https://github.com/fernandinhomartins40/urbansend.git urbansend-sync
    cd ${DEPLOY_PATH}
fi

echo '🔨 Building backend...'
cd ${DEPLOY_PATH}/backend
npm ci
npm run build

echo '🎨 Building frontend...'
cd ${DEPLOY_PATH}/frontend
npm ci
npm run build

echo '📦 Copying built files to production...'
# Copy backend files
cp -r ${DEPLOY_PATH}/backend/dist ${PRODUCTION_PATH}/
cp ${DEPLOY_PATH}/backend/package*.json ${PRODUCTION_PATH}/
cp ${DEPLOY_PATH}/backend/knexfile.js ${PRODUCTION_PATH}/
mkdir -p ${PRODUCTION_PATH}/src
cp -r ${DEPLOY_PATH}/backend/src/migrations ${PRODUCTION_PATH}/src/

# Copy frontend files
mkdir -p ${PRODUCTION_PATH}/frontend-dist
cp -r ${DEPLOY_PATH}/frontend/dist/* ${PRODUCTION_PATH}/frontend-dist/

# Copy Docker files
cp ${DEPLOY_PATH}/Dockerfile.backend ${PRODUCTION_PATH}/
cp ${DEPLOY_PATH}/Dockerfile.frontend ${PRODUCTION_PATH}/
cp ${DEPLOY_PATH}/nginx.conf ${PRODUCTION_PATH}/
cp ${DEPLOY_PATH}/docker-compose.production.yml ${PRODUCTION_PATH}/docker-compose.yml

echo '🐳 Starting Docker deployment...'
cd ${PRODUCTION_PATH}

# Stop existing containers
echo 'Stopping existing containers...'
docker-compose -p ${APP_NAME} down --remove-orphans || true

# Clean up
docker container prune -f
docker network rm ${NETWORK_NAME} 2>/dev/null || true

# Build and start
echo 'Building and starting containers...'
docker-compose -p ${APP_NAME} up -d --build

# Wait for services
sleep 30

# Run migrations
echo 'Running database migrations...'
docker-compose -p ${APP_NAME} exec -T ${APP_NAME}_backend npm run migrate:latest || true

# Show status
echo 'Container status:'
docker ps --filter 'name=${APP_NAME}_'

echo '✅ Deployment completed!'
"

echo "✅ Git-based deployment completed successfully!"
echo ""
echo "🔒 Application URLs:"
echo "   Frontend: https://${DOMAIN}"
echo "   Backend:  https://${DOMAIN}/api/"
echo "   Redis UI: http://${VPS_IP}:${REDIS_UI_PORT}"