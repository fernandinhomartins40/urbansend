#!/usr/bin/env bash
set -euo pipefail

echo "ULTRAZEND DEPLOY VIA GITHUB ACTIONS - INICIANDO..."
echo "=================================================="

REPO_URL="https://github.com/fernandinhomartins40/urbansend.git"
APP_DIR="/var/www/ultrazend"
STATIC_DIR="/var/www/ultrazend-static"
PERSIST_ROOT="/var/lib/ultrazend"
CONFIG_DIR="$PERSIST_ROOT/configs"
LOGS_DIR="$PERSIST_ROOT/logs"
STORAGE_VOLUME="ultrazend-storage-data"
POSTGRES_VOLUME="ultrazend-postgres-data"

BASE_DOMAIN="ultrazend.com.br"
WWW_DOMAIN="www.ultrazend.com.br"
DOMAIN="$WWW_DOMAIN"

remove_container_if_exists() {
  local container_name="$1"
  if docker ps -aq --filter "name=^/${container_name}$" | grep -q .; then
    echo "Removendo container antigo: ${container_name}"
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
  fi
}

echo "Limpando containers antigos da aplicacao (preservando banco/volumes)..."
labelled_app_containers="$(docker ps -aq --filter "label=com.ultrazend.component=application" || true)"
if [ -n "${labelled_app_containers}" ]; then
  echo "${labelled_app_containers}" | xargs -r docker rm -f >/dev/null 2>&1 || true
fi
remove_container_if_exists "ultrazend-api"
remove_container_if_exists "ultrazend-frontend"
remove_container_if_exists "ultrazend-backend"

echo "Configurando diretorios persistentes..."
mkdir -p "$STATIC_DIR"
mkdir -p "$CONFIG_DIR/dkim-keys"
mkdir -p "$LOGS_DIR"/{application,errors,security,performance,business}
chown -R root:root "$CONFIG_DIR/dkim-keys" || true
chmod -R 644 "$CONFIG_DIR/dkim-keys" || true
chown -R 1001:1001 "$LOGS_DIR" || true
chmod -R 755 "$LOGS_DIR" || true

if [ -f "$CONFIG_DIR/dkim-keys/ultrazend.com.br-default-private.pem" ]; then
  echo "DKIM private key found in persistent storage"
else
  echo "AVISO: DKIM private key not found in $CONFIG_DIR/dkim-keys"
fi

echo "Atualizando codigo da aplicacao..."
rm -rf "$APP_DIR"
git clone --depth 1 "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"
echo "Repositorio clonado"

echo "Sincronizando configuracoes versionadas para area persistente..."
if [ -d "$APP_DIR/configs" ]; then
  cp -a "$APP_DIR/configs/." "$CONFIG_DIR/"
fi
mkdir -p "$CONFIG_DIR/dkim-keys"
chown -R root:root "$CONFIG_DIR/dkim-keys" || true
chmod -R 644 "$CONFIG_DIR/dkim-keys" || true

echo "Compilando frontend..."
cd "$APP_DIR/frontend"
npm ci --silent --no-progress
npm run build

rm -rf "$STATIC_DIR"/*
cp -r dist/* "$STATIC_DIR/"
chown -R www-data:www-data "$STATIC_DIR"
echo "Frontend compilado e copiado"

echo "Configurando Nginx..."
cat > /etc/nginx/sites-available/ultrazend << 'NGINX_EOF'
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name www.ultrazend.com.br ultrazend.com.br;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server for apex domain
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ultrazend.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/ultrazend.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ultrazend.com.br/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Redirect apex to www
    return 301 https://www.ultrazend.com.br$request_uri;
}

# HTTPS server for www
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.ultrazend.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/www.ultrazend.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.ultrazend.com.br/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 10M;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Email tracking routes - CRITICAL for email analytics
    location /track/ {
        proxy_pass http://127.0.0.1:3001/api/emails/track/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30;
        proxy_send_timeout 30;
        proxy_connect_timeout 30;
        access_log /var/log/nginx/tracking.log;

        # No caching for tracking
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Frontend static files
    location / {
        root /var/www/ultrazend-static;
        try_files $uri $uri/ /index.html;

        # Enhanced caching for assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header Vary "Accept-Encoding";
        }

        # Cache HTML files for shorter time
        location ~* \.(html)$ {
            expires 1h;
            add_header Cache-Control "public, must-revalidate";
        }
    }

    # API Backend with enhanced configuration
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
        proxy_read_timeout 300;
        proxy_send_timeout 300;
        proxy_connect_timeout 300;

        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        limit_req_status 429;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        access_log off;
    }
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
NGINX_EOF

ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/000-ultrazend
rm -f /etc/nginx/sites-enabled/ultrazend
rm -f /etc/nginx/sites-enabled/default
nginx -t && echo "Nginx configurado com sucesso"

echo "Preparando rede e volumes..."
docker network create ultrazend-network >/dev/null 2>&1 || true
docker volume create "$POSTGRES_VOLUME" >/dev/null
docker volume create "$STORAGE_VOLUME" >/dev/null

echo "Garantindo PostgreSQL sem apagar dados..."
if docker ps -aq --filter "name=^/ultrazend-postgres$" | grep -q .; then
  if docker ps --filter "name=^/ultrazend-postgres$" --format '{{.Names}}' | grep -q '^ultrazend-postgres$'; then
    echo "Container ultrazend-postgres ja esta em execucao (preservado)."
  else
    echo "Iniciando container ultrazend-postgres existente..."
    docker start ultrazend-postgres >/dev/null
  fi
else
  echo "Criando container ultrazend-postgres..."
  docker run -d \
    --name ultrazend-postgres \
    --restart unless-stopped \
    --network ultrazend-network \
    -e POSTGRES_DB=ultrazend \
    -e POSTGRES_USER=ultrazend \
    -e POSTGRES_PASSWORD=ultrazend \
    -v ${POSTGRES_VOLUME}:/var/lib/postgresql/data \
    postgres:16-alpine >/dev/null
fi

echo "Aguardando PostgreSQL ficar pronto..."
for i in $(seq 1 30); do
  if docker exec ultrazend-postgres pg_isready -U ultrazend -d ultrazend >/dev/null 2>&1; then
    echo "PostgreSQL pronto."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERRO: PostgreSQL nao ficou pronto a tempo."
    docker logs ultrazend-postgres --tail 50 || true
    exit 1
  fi
  sleep 2
done

echo "Construindo imagem Docker do backend..."
cd "$APP_DIR"
docker build -t ultrazend-api:latest -f backend/Dockerfile backend/

echo "Subindo novo container backend..."
docker run -d \
  --name ultrazend-api \
  --label com.ultrazend.component=application \
  --label com.ultrazend.service=backend \
  --restart unless-stopped \
  --network ultrazend-network \
  -p 3001:3001 \
  -m 512m \
  --memory-swap 512m \
  -e NODE_ENV=production \
  -e DB_CLIENT=pg \
  -e PORT=3001 \
  -e DATABASE_URL=postgresql://ultrazend:ultrazend@ultrazend-postgres:5432/ultrazend?schema=public \
  -e LOG_FILE_PATH=/app/logs \
  -e SMTP_HOST=localhost \
  -e SMTP_PORT=25 \
  -e ULTRAZEND_DIRECT_DELIVERY=true \
  -e ENABLE_DKIM=true \
  -e DKIM_PRIVATE_KEY_PATH=/app/configs/dkim-keys/ultrazend.com.br-default-private.pem \
  -e DKIM_SELECTOR=default \
  -e DKIM_DOMAIN=ultrazend.com.br \
  -e QUEUE_ENABLED=true \
  -v "$LOGS_DIR":/app/logs \
  -v "$CONFIG_DIR":/app/configs \
  -v ${STORAGE_VOLUME}:/app/storage \
  ultrazend-api:latest \
  sh -c "npm run migrate:latest && node dist/index.js"

echo "Aguardando container inicializar..."
sleep 15

if ! docker ps --filter "name=^/ultrazend-api$" --format '{{.Names}}' | grep -q '^ultrazend-api$'; then
  echo "ERRO: Container ultrazend-api nao esta rodando"
  docker logs ultrazend-api --tail 80 || true
  exit 1
fi

systemctl reload nginx
echo "Servicos iniciados"

echo "Configurando SSL..."
if [ ! -f /etc/letsencrypt/live/$BASE_DOMAIN/fullchain.pem ]; then
  echo "Obtendo certificado SSL para apex domain..."
  certbot certonly --nginx -d $BASE_DOMAIN --non-interactive --agree-tos --email admin@ultrazend.com.br || echo "SSL setup for apex completed with warnings"
fi

if [ ! -f /etc/letsencrypt/live/$WWW_DOMAIN/fullchain.pem ]; then
  echo "Obtendo certificado SSL para www domain..."
  certbot certonly --nginx -d $WWW_DOMAIN --non-interactive --agree-tos --email admin@ultrazend.com.br || echo "SSL setup for www completed with warnings"
fi

systemctl reload nginx
echo "SSL configurado para ambos dominios"

echo "Validando deployment..."
sleep 10

if docker ps --filter "name=^/ultrazend-api$" --format '{{.Names}}' | grep -q '^ultrazend-api$'; then
  echo "Docker: ultrazend-api rodando"
  docker ps --filter "name=^/ultrazend-api$"
else
  echo "Docker: ultrazend-api falhou"
  docker logs ultrazend-api --tail 50 || true
  exit 1
fi

if nginx -t >/dev/null 2>&1; then
  echo "Nginx: configuracao OK"
else
  echo "Nginx: erro na configuracao"
  exit 1
fi

echo "Testando health check do container..."
sleep 5
if docker exec ultrazend-api node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" 2>/dev/null; then
  echo "Health check: OK"
else
  echo "ERRO: Health check falhou"
  docker logs ultrazend-api --tail 80 || true
  exit 1
fi

echo ""
echo "DEPLOY CONCLUIDO!"
echo "================="
echo "Frontend: $STATIC_DIR"
echo "Backend: $APP_DIR/backend"
echo "Persistent Configs: $CONFIG_DIR"
echo "Persistent Logs: $LOGS_DIR"
echo "Storage Volume: $STORAGE_VOLUME"
echo "Postgres Volume: $POSTGRES_VOLUME"
echo "API URL: https://$DOMAIN/api/"
echo "Frontend URL: https://$DOMAIN/"

docker_status="$(docker ps --filter "name=^/ultrazend-api$" --format "{{.Status}}" || echo 'not found')"
echo "Docker Status: $docker_status"
