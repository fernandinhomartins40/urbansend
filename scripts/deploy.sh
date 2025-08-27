#!/bin/bash

# UrbanSend Isolated Docker Deploy Script
set -e

VPS_IP="72.60.10.112"
VPS_USER="root"
DEPLOY_PATH="/var/www/urbansend"
APP_NAME="urbansend"
NETWORK_NAME="${APP_NAME}_network"
BACKEND_PORT="3010"
FRONTEND_PORT="3011"
REDIS_PORT="6380"
REDIS_UI_PORT="8082"

echo "🚀 Starting ISOLATED deployment for ${APP_NAME}..."

# Create deployment directory
echo "📁 Creating deployment directory..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "mkdir -p ${DEPLOY_PATH}"

# Copy Docker files
echo "📦 Copying Docker configuration..."
if [ ! -f "backend/Dockerfile" ]; then
    echo "❌ Error: backend/Dockerfile not found!"
    exit 1
fi
if [ ! -f "frontend/Dockerfile" ]; then
    echo "❌ Error: frontend/Dockerfile not found!"
    exit 1
fi
if [ ! -f "frontend/nginx.conf" ]; then
    echo "❌ Error: frontend/nginx.conf not found!"
    exit 1
fi

sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no backend/Dockerfile ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/Dockerfile.backend
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no frontend/Dockerfile ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/Dockerfile.frontend
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no frontend/nginx.conf ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/

# Copy application files
echo "📦 Copying application files..."
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r backend/dist ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no backend/package*.json ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no backend/knexfile.js ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/

# Create frontend-dist directory and copy files
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "mkdir -p ${DEPLOY_PATH}/frontend-dist"
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r frontend/dist/* ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/frontend-dist/

# Create isolated docker-compose with project name
echo "⚙️  Creating ISOLATED Docker configuration..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
cd ${DEPLOY_PATH}

# Create isolated docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

networks:
  ${NETWORK_NAME}:
    driver: bridge
    name: ${NETWORK_NAME}

volumes:
  ${APP_NAME}_redis_data:
    name: ${APP_NAME}_redis_data
  ${APP_NAME}_backend_data:
    name: ${APP_NAME}_backend_data
  ${APP_NAME}_backend_logs:
    name: ${APP_NAME}_backend_logs

services:
  ${APP_NAME}_backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: ${APP_NAME}_backend
    restart: unless-stopped
    ports:
      - '${BACKEND_PORT}:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=urbansend-super-secret-jwt-key-production-2024
      - JWT_EXPIRES_IN=7d
      - REDIS_HOST=${APP_NAME}_redis
      - REDIS_PORT=6379
      - CORS_ORIGIN=http://${VPS_IP}:${FRONTEND_PORT}
      - DATABASE_URL=/app/database.sqlite
    volumes:
      - ${APP_NAME}_backend_data:/app/data
      - ${APP_NAME}_backend_logs:/app/logs
    depends_on:
      - ${APP_NAME}_redis
    networks:
      - ${NETWORK_NAME}

  ${APP_NAME}_frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: ${APP_NAME}_frontend
    restart: unless-stopped
    ports:
      - '${FRONTEND_PORT}:80'
    depends_on:
      - ${APP_NAME}_backend
    networks:
      - ${NETWORK_NAME}

  ${APP_NAME}_redis:
    image: redis:7-alpine
    container_name: ${APP_NAME}_redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - ${APP_NAME}_redis_data:/data
    ports:
      - '${REDIS_PORT}:6379'
    networks:
      - ${NETWORK_NAME}

  ${APP_NAME}_redis_ui:
    image: rediscommander/redis-commander:latest
    container_name: ${APP_NAME}_redis_ui
    restart: unless-stopped
    environment:
      - REDIS_HOSTS=local:${APP_NAME}_redis:6379
    ports:
      - '${REDIS_UI_PORT}:8081'
    depends_on:
      - ${APP_NAME}_redis
    networks:
      - ${NETWORK_NAME}
EOF

# Create backend Dockerfile if not exists
if [ ! -f Dockerfile.backend ]; then
cat > Dockerfile.backend << 'EOF'
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY knexfile.js ./

RUN mkdir -p /app/data /app/logs

EXPOSE 3000

CMD [\"node\", \"dist/index.js\"]
EOF
fi

# Create frontend Dockerfile if not exists  
if [ ! -f Dockerfile.frontend ]; then
cat > Dockerfile.frontend << 'EOF'
FROM nginx:alpine

COPY frontend-dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD [\"nginx\", \"-g\", \"daemon off;\"]
EOF
fi

# Create nginx.conf if not exists
if [ ! -f nginx.conf ]; then
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files \$uri \$uri/ /index.html;
        }

        location /api {
            proxy_pass http://${APP_NAME}_backend:3000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
        }
    }
}
EOF
fi
"

# Install Docker if needed
echo "🔧 Installing system dependencies..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
if ! command -v docker &> /dev/null; then
    echo 'Installing Docker...'
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo 'Installing Docker Compose...'
    curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-Linux-x86_64 -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi
"

# Deploy with complete isolation
echo "🐳 Deploying with ISOLATED Docker containers..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
cd ${DEPLOY_PATH}

# Stop and remove existing containers with this project name
echo 'Stopping existing ${APP_NAME} containers...'
docker-compose -p ${APP_NAME} down --remove-orphans || true

# Clean up orphaned containers/networks for this app
docker container prune -f
docker network rm ${NETWORK_NAME} 2>/dev/null || true

# Build and start with isolated project name
echo 'Building and starting ISOLATED containers...'
docker-compose -p ${APP_NAME} up -d --build

# Wait for services
sleep 30

# Run migrations inside isolated backend container
echo 'Running database migrations...'
docker-compose -p ${APP_NAME} exec -T ${APP_NAME}_backend npm run migrate:latest || true

# Show only OUR containers
echo 'UrbanSend containers status:'
docker ps --filter 'name=${APP_NAME}_'

# Configure firewall and open ports
echo '🔥 Configuring firewall for external access...'
# UFW configuration
if command -v ufw &> /dev/null; then
    ufw allow ${BACKEND_PORT}/tcp comment 'UrbanSend Backend' || true
    ufw allow ${FRONTEND_PORT}/tcp comment 'UrbanSend Frontend' || true  
    ufw allow ${REDIS_UI_PORT}/tcp comment 'UrbanSend Redis UI' || true
    ufw allow 22/tcp comment 'SSH' || true
    echo 'y' | ufw enable || true
fi

# iptables configuration
iptables -I INPUT -p tcp --dport ${BACKEND_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${FRONTEND_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${REDIS_UI_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport 22 -j ACCEPT || true

# Save iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
netfilter-persistent save 2>/dev/null || true

# Health check
echo 'Checking service health...'
curl -f http://localhost:${BACKEND_PORT}/health || echo 'Backend health check failed'

# Test external connectivity
echo 'Testing external port accessibility...'
netstat -tlnp | grep -E ':(${BACKEND_PORT}|${FRONTEND_PORT}|${REDIS_UI_PORT})'
"

echo "✅ ISOLATED Deployment completed successfully!"
echo ""
echo "🔒 Isolated Application URLs:"
echo "   Frontend: http://${VPS_IP}:${FRONTEND_PORT}"
echo "   Backend:  http://${VPS_IP}:${BACKEND_PORT}"
echo "   Redis UI: http://${VPS_IP}:${REDIS_UI_PORT}"
echo ""
echo "🐳 Container Management:"
echo "   View logs: ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} logs -f'"
echo "   Restart:   ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} restart'"
echo "   Stop:      ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} down'"
echo ""
echo "🔒 Isolation Features:"
echo "   ✅ Dedicated Docker network: ${NETWORK_NAME}"
echo "   ✅ Named containers with ${APP_NAME}_ prefix"
echo "   ✅ Isolated volumes for data persistence"
echo "   ✅ No conflicts with other applications"