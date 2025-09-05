#!/bin/bash

# 🚀 ULTRAZEND LOCAL DEPLOY VIA SSH
# Execute este script localmente para fazer deploy no servidor

set -e

# Configuration
SERVER="root@ultrazend.com.br"
APP_DIR="/var/www/ultrazend"
STATIC_DIR="/var/www/ultrazend-static"
DOMAIN="www.ultrazend.com.br"

echo "🚀 ULTRAZEND DEPLOY VIA SSH - INICIANDO..."
echo "=========================================="

# Function to run SSH command with error handling
run_ssh() {
    echo "🔧 Executando: $1"
    if ssh $SERVER "$1"; then
        echo "✅ Sucesso: $1"
    else
        echo "❌ Erro: $1"
        exit 1
    fi
}

# 1. STOP EXISTING SERVICES
echo "🛑 Parando serviços existentes..."
ssh $SERVER "pm2 stop all 2>/dev/null || true; pm2 delete all 2>/dev/null || true"

# 2. SETUP DIRECTORIES AND CLONE
echo "📁 Configurando diretórios..."
ssh $SERVER "
    mkdir -p $APP_DIR $STATIC_DIR $APP_DIR/logs/{application,errors,security,performance,business}
    rm -rf $APP_DIR
    git clone https://github.com/fernandinhomartins40/urbansend.git $APP_DIR
    cd $APP_DIR
    echo '✅ Repositório clonado'
"

# 3. BUILD FRONTEND
echo "🏗️ Compilando frontend..."
ssh $SERVER "
    cd $APP_DIR/frontend
    npm ci --silent --no-progress
    npm run build
    
    # Copy to static directory
    rm -rf $STATIC_DIR/*
    cp -r dist/* $STATIC_DIR/
    chown -R www-data:www-data $STATIC_DIR
    echo '✅ Frontend compilado e copiado'
"

# 4. BUILD BACKEND
echo "🔨 Compilando backend..."
ssh $SERVER "
    cd $APP_DIR/backend
    npm ci --silent --no-progress
    npm run build
    
    # Validate database config
    if [ ! -f './dist/config/database.js' ]; then
        echo '❌ Database config não encontrado após build'
        ls -la ./dist/config/ || echo 'dist/config não existe'
        exit 1
    fi
    echo '✅ Backend compilado com sucesso'
"

# 5. SETUP ENVIRONMENT
echo "⚙️ Configurando environment..."
ssh $SERVER "
    cd $APP_DIR/backend
    cat > .env << 'ENV_EOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=$APP_DIR/backend/ultrazend.sqlite
LOG_FILE_PATH=$APP_DIR/logs
SMTP_HOST=localhost
SMTP_PORT=25
ULTRAZEND_DIRECT_DELIVERY=true
ENABLE_DKIM=true
DKIM_KEY_PATH=$APP_DIR/configs/dkim-keys/
QUEUE_ENABLED=true
ENV_EOF
    chmod 600 .env
    echo '✅ Environment configurado'
"

# 6. RUN MIGRATIONS
echo "📊 Executando migrations..."
ssh $SERVER "
    cd $APP_DIR/backend
    export NODE_ENV=production
    npm run migrate:latest
    
    migration_count=\$(NODE_ENV=production npx knex migrate:list 2>/dev/null | grep -c 'Batch\\|COMPLETED\\|✔' || echo '0')
    echo \"Migrations aplicadas: \$migration_count\"
    if [ \"\$migration_count\" -lt 5 ]; then
        echo '❌ CRÍTICO: Poucas migrations aplicadas - Deploy CANCELADO'
        exit 1
    fi
    echo '✅ Migrations executadas com sucesso'
"

# 7. CONFIGURE NGINX
echo "🌐 Configurando Nginx..."
ssh $SERVER "
    cat > /etc/nginx/sites-available/ultrazend << 'NGINX_EOF'
server {
    listen 80;
    server_name $DOMAIN;
    
    # Frontend static files
    location / {
        root $STATIC_DIR;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)\$ {
            expires 1y;
            add_header Cache-Control \"public, immutable\";
        }
    }
    
    # API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINX_EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && echo '✅ Nginx configurado com sucesso'
"

# 8. SETUP PM2 ECOSYSTEM
echo "🚀 Configurando PM2..."
ssh $SERVER "
    cd $APP_DIR/backend
    cat > ecosystem.config.js << 'PM2_EOF'
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
    log_file: '$APP_DIR/logs/application/combined.log',
    out_file: '$APP_DIR/logs/application/out.log',
    error_file: '$APP_DIR/logs/errors/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '512M'
  }]
};
PM2_EOF
    echo '✅ PM2 ecosystem configurado'
"

# 9. START SERVICES
echo "🚀 Iniciando serviços..."
ssh $SERVER "
    # Install PM2 globally if not exists
    npm list -g pm2 >/dev/null 2>&1 || npm install -g pm2
    
    cd $APP_DIR/backend
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    # Reload nginx
    systemctl reload nginx
    echo '✅ Serviços iniciados'
"

# 10. SETUP SSL (if not exists)
echo "🔒 Configurando SSL..."
ssh $SERVER "
    if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
        echo 'Obtendo certificado SSL...'
        certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@ultrazend.com.br || echo 'SSL setup completed with warnings'
        systemctl reload nginx
    else
        echo 'SSL já configurado'
    fi
"

# 11. VALIDATE DEPLOYMENT
echo "🔍 Validando deployment..."
ssh $SERVER "
    sleep 5
    
    # Check PM2
    if pm2 show ultrazend-api >/dev/null 2>&1; then
        echo '✅ PM2: ultrazend-api rodando'
    else
        echo '❌ PM2: ultrazend-api falhou'
        pm2 logs ultrazend-api --lines 10 || true
    fi
    
    # Check Nginx
    if nginx -t >/dev/null 2>&1; then
        echo '✅ Nginx: configuração OK'
    else
        echo '❌ Nginx: erro na configuração'
    fi
    
    # Test database
    cd $APP_DIR/backend
    export NODE_ENV=production
    echo 'const db = require(\"./dist/config/database.js\"); db.raw(\"SELECT 1\").then(() => { console.log(\"DB_OK\"); process.exit(0); }).catch(err => { console.error(\"DB_ERROR:\", err.message); process.exit(1); });' > /tmp/db_test.js
    if timeout 10s NODE_ENV=production node /tmp/db_test.js 2>/dev/null | grep -q 'DB_OK'; then
        echo '✅ Database: conectividade OK'
    else
        echo '❌ CRÍTICO: Database erro de conectividade - DEPLOY FALHOU'
        NODE_ENV=production node /tmp/db_test.js || true
        rm -f /tmp/db_test.js
        exit 1
    fi
    rm -f /tmp/db_test.js
    
    # Final status
    echo ''
    echo '🎉 DEPLOY CONCLUÍDO!'
    echo '==================='
    echo 'Frontend: $STATIC_DIR'
    echo 'Backend: $APP_DIR/backend'
    echo 'API URL: http://$DOMAIN/api/'
    echo 'Frontend URL: http://$DOMAIN/'
    
    pm2_status=\$(pm2 list | grep ultrazend-api | awk '{print \$10}' || echo 'not found')
    echo \"PM2 Status: \$pm2_status\"
"

echo ""
echo "✅ DEPLOY LOCAL CONCLUÍDO!"
echo "========================="
echo "🌐 Site: http://$DOMAIN"
echo "📊 Monitorar: ssh $SERVER 'pm2 list'"
echo "🔄 Redeploy: bash local-deploy.sh"