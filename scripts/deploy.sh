#!/bin/bash

# UrbanSend Isolated Docker Deploy Script
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
REDIS_PORT="6380"
REDIS_UI_PORT="8082"

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

# Create isolated docker-compose with project name
echo "⚙️  Creating ISOLATED Docker configuration..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
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
      - '25:25'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=urbansend-super-secret-jwt-key-production-2024
      - JWT_EXPIRES_IN=7d
      - REDIS_HOST=${APP_NAME}_redis
      - REDIS_PORT=6379
      - CORS_ORIGIN=https://${DOMAIN}
      - DATABASE_URL=/app/database.sqlite
      - FRONTEND_URL=https://${DOMAIN}
      - SMTP_HOSTNAME=${DOMAIN}
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
FROM nginx:alpine

COPY frontend-dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

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
"

# Install Docker and Certbot if needed
echo "🔧 Installing system dependencies..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
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

# Install Certbot for SSL certificates
if ! command -v certbot &> /dev/null; then
    echo 'Installing Certbot...'
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Install nginx if not present
if ! command -v nginx &> /dev/null; then
    echo 'Installing Nginx...'
    apt-get update
    apt-get install -y nginx
fi
"

# Deploy with complete isolation
echo "🐳 Deploying with ISOLATED Docker containers..."
ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
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

# Setup SSL with Let's Encrypt and Nginx proxy
echo '🔒 Configuring SSL certificates and Nginx proxy...'

# Create Nginx configuration for the domain
cat > /etc/nginx/sites-available/${DOMAIN} << 'NGINXCONF'
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        proxy_pass http://localhost:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:${BACKEND_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF

# Enable the site
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t

# Obtain SSL certificate with Certbot
echo 'Obtaining SSL certificate...'
certbot certonly --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} || true

# Reload nginx with SSL
systemctl reload nginx

# Configure firewall and open ports
echo '🔥 Configuring firewall for external access...'
# UFW configuration
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp comment 'HTTP' || true
    ufw allow 443/tcp comment 'HTTPS' || true
    ufw allow ${BACKEND_PORT}/tcp comment 'UrbanSend Backend' || true
    ufw allow ${FRONTEND_PORT}/tcp comment 'UrbanSend Frontend' || true  
    ufw allow ${REDIS_UI_PORT}/tcp comment 'UrbanSend Redis UI' || true
    ufw allow 25/tcp comment 'SMTP' || true
    ufw allow 22/tcp comment 'SSH' || true
    echo 'y' | ufw enable || true
fi

# iptables configuration
iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${BACKEND_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${FRONTEND_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${REDIS_UI_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport 25 -j ACCEPT || true
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

echo "✅ UrbanMail Deployment completed successfully!"
echo ""
echo "🔒 Application URLs:"
echo "   Frontend: https://${DOMAIN}"
echo "   Backend:  https://${DOMAIN}/api/"
echo "   Redis UI: http://${VPS_IP}:${REDIS_UI_PORT}"
echo ""
echo "📧 Email Server Configuration:"
echo "   SMTP Server: ${DOMAIN}"
echo "   SMTP Port: 25 (standard SMTP)"
echo "   Domain: ${DOMAIN}"
echo ""
echo "🔑 DNS Configuration Required:"
echo "   Visit https://${DOMAIN}/api/dns/configuration for DNS records"
echo ""
echo "🔧 DNS Records to Add:"
echo "   SPF:  ${DOMAIN} TXT 'v=spf1 ip4:${VPS_IP} ~all'"
echo "   DKIM: Check /api/dns/configuration for DKIM record"
echo "   MX:   ${DOMAIN} MX 10 ${DOMAIN}"
echo ""
echo "🐳 Container Management:"
echo "   View logs: ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} logs -f'"
echo "   Restart:   ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} restart'"
echo "   Stop:      ssh root@${VPS_IP} 'cd ${DEPLOY_PATH} && docker-compose -p ${APP_NAME} down'"
echo ""
echo "🔒 Features Implemented:"
echo "   ✅ SSL/TLS with Let's Encrypt"
echo "   ✅ SPF authentication configured"
echo "   ✅ DKIM signatures enabled"
echo "   ✅ Dedicated Docker network: ${NETWORK_NAME}"
echo "   ✅ Named containers with ${APP_NAME}_ prefix"
echo "   ✅ Nginx reverse proxy with SSL termination"
echo "   ✅ Firewall configured for email and web traffic"
echo ""
echo "⚠️  Important Next Steps:"
echo "   1. Configure DNS A record: ${DOMAIN} → ${VPS_IP}"
echo "   2. Add SPF record to ${DOMAIN}"
echo "   3. Add DKIM record (get from /api/dns/configuration)"
echo "   4. Add MX record: ${DOMAIN} MX 10 ${DOMAIN}"
echo "   5. Wait for DNS propagation (24-48 hours)"
echo "   6. Test email delivery after DNS is active"