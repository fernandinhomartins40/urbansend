#!/usr/bin/env bash
set -e

echo "ULTRAZEND DEPLOY VIA GITHUB ACTIONS - INICIANDO..."
echo "=================================================="

APP_DIR="/var/www/ultrazend"
STATIC_DIR="/var/www/ultrazend-static"
DOMAIN="www.ultrazend.com.br"

echo "Parando servicos existentes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

echo "Configurando diretorios..."
mkdir -p "$APP_DIR" "$STATIC_DIR" "$APP_DIR/logs"/{application,errors,security,performance,business}
rm -rf "$APP_DIR"
git clone https://github.com/fernandinhomartins40/urbansend.git "$APP_DIR"
cd "$APP_DIR"
echo "Repositorio clonado"

echo "Compilando frontend..."
cd "$APP_DIR/frontend"
npm ci --silent --no-progress
npm run build

rm -rf "$STATIC_DIR"/*
cp -r dist/* "$STATIC_DIR/"
chown -R www-data:www-data "$STATIC_DIR"
echo "Frontend compilado e copiado"

echo "Compilando backend..."
cd "$APP_DIR/backend"
npm ci --silent --no-progress
npm run build

if [ ! -f './dist/config/database.js' ]; then
  echo "ERRO: Database config nao encontrado apos build"
  ls -la ./dist/config/ || echo "dist/config nao existe"
  exit 1
fi
echo "Backend compilado com sucesso"

echo "Configurando environment..."
cd "$APP_DIR/backend"
cat > .env << 'ENV_EOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=/var/www/ultrazend/backend/ultrazend.sqlite
LOG_FILE_PATH=/var/www/ultrazend/logs
SMTP_HOST=localhost
SMTP_PORT=25
ULTRAZEND_DIRECT_DELIVERY=true
ENABLE_DKIM=true
DKIM_PRIVATE_KEY_PATH=/var/www/ultrazend/configs/dkim-keys/ultrazend.com.br-default-private.pem
DKIM_SELECTOR=default
DKIM_DOMAIN=ultrazend.com.br
QUEUE_ENABLED=true
ENV_EOF
chmod 600 .env
echo "Environment configurado"

echo "Corrigindo permissoes DKIM..."
chown -R root:root /var/www/ultrazend/configs/dkim-keys/ || true
chmod -R 644 /var/www/ultrazend/configs/dkim-keys/ || true

if [ -f '/var/www/ultrazend/configs/dkim-keys/ultrazend.com.br-default-private.pem' ]; then
  echo "DKIM private key found"
else
  echo "CRITICO: DKIM private key not found - Deploy may fail"
  ls -la /var/www/ultrazend/configs/dkim-keys/ || echo "DKIM directory not found"
fi

echo "Executando migrations..."
cd "$APP_DIR/backend"
export NODE_ENV=production
npm run migrate:latest

migration_files_count=$(find "$APP_DIR/backend/src/migrations" -maxdepth 1 -type f -name '*.js' | wc -l | tr -d ' ')
if ! applied_migrations_raw=$(NODE_ENV=production DOTENV_CONFIG_QUIET=true node <<'NODE'
const path = require("path");
const dotenv = require("dotenv");
const knex = require("knex");

dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });
const config = require("./knexfile").production;
const db = knex(config);

(async () => {
  try {
    const row = await db("knex_migrations").count({ count: "*" }).first();
    const raw = row?.count ?? row?.["count(*)"] ?? Object.values(row || {})[0] ?? 0;
    const count = Number(raw);
    if (!Number.isFinite(count)) throw new Error(`Invalid migrations count: ${raw}`);
    console.log(String(count));
  } catch (err) {
    console.error(`Failed to read migrations count: ${err.message}`);
    process.exit(1);
  } finally {
    await db.destroy();
  }
})();
NODE
); then
  echo "CRITICO: Nao foi possivel validar migracoes aplicadas - Deploy CANCELADO"
  exit 1
fi

applied_migrations=$(printf '%s\n' "$applied_migrations_raw" | tr -d '\r' | awk '/^[0-9]+$/ {value=$0} END {print value}')
if ! [[ "$applied_migrations" =~ ^[0-9]+$ ]]; then
  echo "CRITICO: Contagem de migracoes invalida ('$applied_migrations_raw') - Deploy CANCELADO"
  exit 1
fi

echo "Migrations aplicadas: $applied_migrations de $migration_files_count"
if [ "$applied_migrations" -lt "$migration_files_count" ]; then
  echo "CRITICO: Existem migracoes pendentes - Deploy CANCELADO"
  NODE_ENV=production npx knex migrate:list || true
  exit 1
fi
echo "Migrations executadas com sucesso"

echo "Configurando Nginx..."
cat > /etc/nginx/sites-available/ultrazend << 'NGINX_EOF'
server {
    listen 80;
    server_name www.ultrazend.com.br;

    location / {
        root /var/www/ultrazend-static;
        try_files $uri $uri/ /index.html;

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

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
NGINX_EOF

ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && echo "Nginx configurado com sucesso"

echo "Configurando PM2..."
cd "$APP_DIR/backend"
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
PM2_EOF
echo "PM2 ecosystem configurado"

echo "Iniciando servicos..."
npm list -g pm2 >/dev/null 2>&1 || npm install -g pm2

cd "$APP_DIR/backend"
pm2 start ecosystem.config.js --env production
pm2 save

systemctl reload nginx
echo "Servicos iniciados"

echo "Configurando SSL..."
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  echo "Obtendo certificado SSL..."
  certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@ultrazend.com.br || echo "SSL setup completed with warnings"
  systemctl reload nginx
else
  echo "SSL ja configurado"
fi

echo "Validando deployment..."
sleep 5

if pm2 show ultrazend-api >/dev/null 2>&1; then
  echo "PM2: ultrazend-api rodando"
else
  echo "PM2: ultrazend-api falhou"
  pm2 logs ultrazend-api --lines 10 || true
fi

if nginx -t >/dev/null 2>&1; then
  echo "Nginx: configuracao OK"
else
  echo "Nginx: erro na configuracao"
fi

cd "$APP_DIR/backend"
export NODE_ENV=production
DB_MODULE="$APP_DIR/backend/dist/config/database.js"
if [ ! -f "$DB_MODULE" ]; then
  echo "CRITICO: Modulo de database nao encontrado em $DB_MODULE - DEPLOY FALHOU"
  ls -la "$APP_DIR/backend/dist/config" || echo "Diretorio dist/config nao existe"
  exit 1
fi

DB_TEST_SCRIPT='const db = require(process.env.DB_MODULE).default; db.raw("SELECT 1").then(() => { console.log("DB_OK"); process.exit(0); }).catch(err => { console.error("DB_ERROR:", err.message); process.exit(1); });'
if timeout 10s env NODE_ENV=production DB_MODULE="$DB_MODULE" node -e "$DB_TEST_SCRIPT" 2>/dev/null | grep -q 'DB_OK'; then
  echo "Database: conectividade OK"
else
  echo "CRITICO: Database erro de conectividade - DEPLOY FALHOU"
  echo "Debug output:"
  env NODE_ENV=production DB_MODULE="$DB_MODULE" node -e "$DB_TEST_SCRIPT" || true
  exit 1
fi

echo ""
echo "DEPLOY CONCLUIDO!"
echo "================="
echo "Frontend: $STATIC_DIR"
echo "Backend: $APP_DIR/backend"
echo "API URL: http://$DOMAIN/api/"
echo "Frontend URL: http://$DOMAIN/"

pm2_status=$(pm2 list | grep ultrazend-api | awk '{print $10}' || echo 'not found')
echo "PM2 Status: $pm2_status"
