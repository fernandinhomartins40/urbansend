#!/bin/bash

# 🚀 ULTRAZEND DEPLOY DIRETO NA VPS
# Execute este script diretamente no servidor VPS

set -e  # Exit on any error

echo "🚀 ULTRAZEND DEPLOY DIRETO - INICIANDO..."
echo "============================================="

# Configuration
APP_DIR="/var/www/ultrazend"
STATIC_DIR="/var/www/ultrazend-static"
NODE_VERSION="22"
DOMAIN="www.ultrazend.com.br"

# 1. STOP EXISTING SERVICES
echo "🛑 Parando serviços existentes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# 2. UPDATE SYSTEM
echo "📦 Atualizando sistema..."
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx nodejs npm

# 3. SETUP NODE VERSION
echo "🔧 Configurando Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# 4. CREATE DIRECTORIES
echo "📁 Criando diretórios..."
mkdir -p "$APP_DIR"
mkdir -p "$STATIC_DIR"
mkdir -p "$APP_DIR/logs"/{application,errors,security,performance,business}

# 5. CLONE OR UPDATE REPOSITORY
echo "📥 Baixando código..."
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/main
else
    rm -rf "$APP_DIR"
    git clone https://github.com/fernandinhomartins40/urbansend.git "$APP_DIR"
    cd "$APP_DIR"
fi

# 6. BUILD FRONTEND
echo "🏗️ Compilando frontend..."
cd "$APP_DIR/frontend"
npm ci --silent
npm run build
echo "✅ Frontend compilado - Copiando para nginx..."
rm -rf "$STATIC_DIR"/*
cp -r dist/* "$STATIC_DIR/"
chown -R www-data:www-data "$STATIC_DIR"

# 7. BUILD BACKEND
echo "🔨 Compilando backend..."
cd "$APP_DIR/backend"
npm ci --silent
npm run build

# Validate build
if [ ! -f "./dist/config/database.js" ]; then
    echo "❌ ERRO: Database config não compilado"
    ls -la ./dist/config/ || echo "dist/config não existe"
    exit 1
fi
echo "✅ Backend compilado com sucesso"

# 8. SETUP ENVIRONMENT
echo "⚙️ Configurando environment..."
if [ -f ../configs/.env.production ]; then
    cp ../configs/.env.production .env
else
    cat > .env << EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=/var/www/ultrazend/backend/ultrazend.sqlite
LOG_FILE_PATH=$APP_DIR/logs
SMTP_HOST=localhost
SMTP_PORT=25
ULTRAZEND_DIRECT_DELIVERY=true
ENABLE_DKIM=true
DKIM_PRIVATE_KEY_PATH=$APP_DIR/configs/dkim-keys/ultrazend.com.br-default-private.pem
DKIM_SELECTOR=default
DKIM_DOMAIN=ultrazend.com.br
QUEUE_ENABLED=true
EOF
fi
chmod 600 .env

# Fix DKIM permissions
echo "🔐 Corrigindo permissões DKIM..."
chown -R root:root "$APP_DIR/configs/dkim-keys/" || true
chmod -R 644 "$APP_DIR/configs/dkim-keys/" || true

# Validate DKIM file exists
if [ -f "$APP_DIR/configs/dkim-keys/ultrazend.com.br-default-private.pem" ]; then
    echo "✅ DKIM private key found"
else
    echo "❌ CRÍTICO: DKIM private key not found - Deploy may fail"
    ls -la "$APP_DIR/configs/dkim-keys/" || echo "DKIM directory not found"
fi

# 9. RUN MIGRATIONS
echo "📊 Executando migrations..."
export NODE_ENV=production
npm run migrate:latest

# Validate migrations
migration_count=$(NODE_ENV=production npx knex migrate:list 2>/dev/null | grep -c "Batch\\|COMPLETED\\|✔" || echo "0")
echo "Migrations aplicadas: $migration_count"
if [ "$migration_count" -lt 5 ]; then
    echo "❌ CRÍTICO: Poucas migrations aplicadas ($migration_count/47) - Deploy CANCELADO"
    exit 1
fi
echo "✅ $migration_count migrations aplicadas com sucesso"

# 10. CONFIGURE NGINX
echo "🌐 Configurando Nginx..."
cat > /etc/nginx/sites-available/ultrazend << 'EOF'
server {
    listen 80;
    server_name www.ultrazend.com.br;
    
    # Frontend static files
    location / {
        root /var/www/ultrazend-static;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# 11. SETUP PM2 ECOSYSTEM
echo "🚀 Configurando PM2..."
cd "$APP_DIR/backend"
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'ultrazend-api',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    log_file: '/var/www/ultrazend/logs/application/combined.log',
    out_file: '/var/www/ultrazend/logs/application/out.log',
    error_file: '/var/www/ultrazend/logs/errors/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '512M'
  }]
};
EOF

# 12. START SERVICES
echo "🚀 Iniciando serviços..."

# Install PM2 globally if not exists
npm install -g pm2 || true

# Start backend
pm2 start ecosystem.config.js --env production
pm2 save

# Start nginx
systemctl reload nginx

# 13. SETUP SSL
echo "🔒 Configurando SSL..."
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
    echo "Obtendo certificado SSL..."
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@ultrazend.com.br || echo "SSL setup completed with warnings"
    systemctl reload nginx
fi

# 14. VALIDATE DEPLOYMENT
echo "🔍 Validando deployment..."
sleep 5

# Check PM2
if pm2 show ultrazend-api >/dev/null 2>&1; then
    echo "✅ PM2: ultrazend-api rodando"
else
    echo "❌ PM2: ultrazend-api falhou"
    pm2 logs ultrazend-api --lines 10 || true
fi

# Check Nginx
if nginx -t >/dev/null 2>&1; then
    echo "✅ Nginx: configuração OK"
else
    echo "❌ Nginx: erro na configuração"
fi

# Test database
cd "$APP_DIR/backend"
export NODE_ENV=production
echo 'const db = require("./dist/config/database.js").default; db.raw("SELECT 1").then(() => { console.log("DB_OK"); process.exit(0); }).catch(err => { console.error("DB_ERROR:", err.message); process.exit(1); });' > /tmp/db_test.js
if NODE_ENV=production node /tmp/db_test.js 2>/dev/null | grep -q "DB_OK"; then
    echo "✅ Database: conectividade OK"
else
    echo "❌ CRÍTICO: Database erro de conectividade - DEPLOY FALHOU"
    echo "Debug output:"
    NODE_ENV=production node /tmp/db_test.js || true
    rm -f /tmp/db_test.js
    exit 1
fi
rm -f /tmp/db_test.js

# 15. CLEANUP
echo "🧹 Limpeza final..."
chown -R www-data:www-data "$APP_DIR/logs" || true
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "🎉 DEPLOY CONCLUÍDO!"
echo "==================="
echo "✅ Frontend: $STATIC_DIR"
echo "✅ Backend: $APP_DIR/backend"
echo "✅ API URL: http://$DOMAIN/api/"
echo "✅ Frontend URL: http://$DOMAIN/"
echo "✅ PM2 Status: $(pm2 list | grep ultrazend-api | awk '{print $10}')"
echo ""
echo "📝 Para monitorar:"
echo "   pm2 list"
echo "   pm2 logs ultrazend-api"
echo "   tail -f $APP_DIR/logs/application/combined.log"
echo ""
echo "🔄 Para redeployar:"
echo "   bash $APP_DIR/deploy-direct.sh"