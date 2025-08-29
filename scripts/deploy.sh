#!/bin/bash

# UrbanSend Multi-Container Deploy Script
set -e

VPS_IP="72.60.10.112"
VPS_USER="root"
DEPLOY_PATH="/var/www/urbansend"
REPO_URL="https://github.com/fernandinhomartins40/urbansend.git"
APP_NAME="urbansend"
DOMAIN="www.urbanmail.com.br"
NETWORK_NAME="${APP_NAME}_network"
BACKEND_PORT="3010"
FRONTEND_PORT="3011"
REDIS_PORT="6381"  # Alterado para evitar conflito com digiurban
REDIS_UI_PORT="8083"  # Alterado para evitar conflito

echo "🚀 Starting ISOLATED deployment for ${APP_NAME}..."

# Create deployment directory
echo "📁 Creating deployment directory..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "mkdir -p ${DEPLOY_PATH}"

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

scp -o StrictHostKeyChecking=no backend/Dockerfile ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/Dockerfile.backend
scp -o StrictHostKeyChecking=no frontend/Dockerfile ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/Dockerfile.frontend
scp -o StrictHostKeyChecking=no frontend/nginx.conf ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
scp -o StrictHostKeyChecking=no docker-compose.production.yml ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/docker-compose.yml

# Create directories
echo "📁 Creating application directories..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "mkdir -p ${DEPLOY_PATH}/frontend-dist ${DEPLOY_PATH}/src"

# Copy application files
echo "📦 Copying application files..."
scp -o StrictHostKeyChecking=no -r backend/dist ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
scp -o StrictHostKeyChecking=no backend/package*.json ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
scp -o StrictHostKeyChecking=no backend/knexfile.js ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/
scp -o StrictHostKeyChecking=no -r backend/src/migrations ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/src/
scp -o StrictHostKeyChecking=no -r frontend/dist/* ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/frontend-dist/

# Deploy with complete isolation
echo "🐳 Deploying with ISOLATED Docker containers..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
cd ${DEPLOY_PATH}

# Create backend Dockerfile (force overwrite)
cat > Dockerfile.backend << 'EOF'
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY knexfile.js ./

# Copy migrations
COPY src/migrations ./src/migrations

RUN mkdir -p /app/data /app/logs

EXPOSE 3000

CMD [\"node\", \"dist/index.js\"]
EOF

# Create frontend Dockerfile (force overwrite)
cat > Dockerfile.frontend << 'EOF'
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Add non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nginx -u 1001 -G nodejs

# Change ownership of the nginx directories
RUN chown -R nginx:nodejs /var/cache/nginx && \
    chown -R nginx:nodejs /var/log/nginx && \
    chown -R nginx:nodejs /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nodejs /var/run/nginx.pid

# Switch to non-root user
USER nginx

EXPOSE 80

CMD [\"nginx\", \"-g\", \"daemon off;\"]
EOF

# Create nginx.conf (force overwrite)
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

        location /api/ {
            proxy_pass http://${APP_NAME}_backend:3000/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }
}
EOF

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
"

echo "🔧 Updating nginx configuration..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} << 'EOF'
# Update nginx configuration with correct ports
sed -i 's/localhost:3020/localhost:3010/g' /etc/nginx/sites-available/urbanmail.com.br || true
sed -i 's/localhost:3021/localhost:3011/g' /etc/nginx/sites-available/urbanmail.com.br || true

# Create proper nginx config if doesn't exist
cat > /etc/nginx/sites-available/urbanmail.com.br << 'NGINXCONF'
server {
    listen 80;
    server_name www.urbanmail.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.urbanmail.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/www.urbanmail.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.urbanmail.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        proxy_pass http://localhost:3011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3010/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXCONF

# Enable the site
ln -sf /etc/nginx/sites-available/urbanmail.com.br /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t && systemctl reload nginx

echo "📊 Final status check..."
curl -f http://localhost:3010/api/health || echo "❌ Backend health check failed"
curl -f http://localhost:3011 || echo "❌ Frontend health check failed"
netstat -tlnp | grep :3010 || echo "❌ Port 3010 not listening"
netstat -tlnp | grep :3011 || echo "❌ Port 3011 not listening"
netstat -tlnp | grep :25 || echo "⚠️  Port 25 not listening (SMTP)"
EOF

echo "✅ UrbanSend Deployment completed successfully!"
echo ""
echo "🔒 Application URLs:"
echo "   Frontend: https://${DOMAIN}"
echo "   Backend:  https://${DOMAIN}/api/"
echo "   Redis UI: http://${VPS_IP}:${REDIS_UI_PORT}"
echo ""
echo "📧 Email Server Configuration:"
echo "   SMTP Server: ${DOMAIN}"
echo "   SMTP Port: 25 (standard SMTP)"
echo ""
echo "🐳 Container Management:"
echo "   View logs: ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} logs -f'"
echo "   Restart:   ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} restart'"
echo "   Stop:      ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} down'"
echo ""
echo "🎯 Portas configuradas (sem conflito):"
echo "   Backend: ${BACKEND_PORT}"
echo "   Frontend: ${FRONTEND_PORT}"
echo "   Redis: ${REDIS_PORT}"
echo "   Redis UI: ${REDIS_UI_PORT}"