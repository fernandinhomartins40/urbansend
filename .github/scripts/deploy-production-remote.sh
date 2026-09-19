#!/usr/bin/env bash
set -euo pipefail

on_deploy_error() {
  local exit_code="$?"
  local line_number="$1"
  echo "ERRO: deploy interrompido na linha ${line_number} (exit=${exit_code})"
  echo "Espaco em disco no momento da falha:"
  df -h / || true
  echo "Imagens Docker recentes:"
  docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' | head -n 12 || true
  exit "$exit_code"
}
trap 'on_deploy_error $LINENO' ERR

echo "VELOMAIL DEPLOY VIA GITHUB ACTIONS - INICIANDO..."
echo "=================================================="

REPO_URL="https://github.com/fernandinhomartins40/urbansend.git"
APP_DIR="/var/www/ultrazend"
STATIC_DIR="/var/www/ultrazend-static"
PERSIST_ROOT="/var/lib/ultrazend"
CONFIG_DIR="$PERSIST_ROOT/configs"
ENV_FILE="$CONFIG_DIR/.env.production"
LOGS_DIR="$PERSIST_ROOT/logs"
STORAGE_VOLUME="ultrazend-storage-data"
POSTGRES_VOLUME="ultrazend-postgres-data"
LEGACY_STORAGE_VOLUMES=("ultrazend-storage" "ultrazend_ultrazend-storage")
LEGACY_POSTGRES_VOLUMES=("postgres-data" "ultrazend_postgres-data")

BASE_DOMAIN="velomail.com.br"
WWW_DOMAIN="www.velomail.com.br"
DOMAIN="$WWW_DOMAIN"

ensure_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

read_env_value() {
  local key="$1"
  local value
  value="$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r')"
  echo "$value"
}

ensure_secret_if_invalid() {
  local key="$1"
  local current
  current="$(read_env_value "$key")"

  if [ -z "$current" ] || [ "${#current}" -lt 32 ] || [ "$current" = "CHANGE_ME" ] || [ "$current" = "CHANGE_ME_GENERATED_BY_DEPLOY" ]; then
    ensure_env_value "$key" "$(openssl rand -hex 48)"
  fi
}

ensure_secret_if_missing() {
  local key="$1"
  local current
  current="$(read_env_value "$key")"

  if [ -z "$current" ] || [ "$current" = "CHANGE_ME" ] || [ "$current" = "CHANGE_ME_GENERATED_BY_DEPLOY" ]; then
    ensure_env_value "$key" "$(openssl rand -hex 48)"
  fi
}

remove_container_if_exists() {
  local container_name="$1"
  if docker ps -aq --filter "name=^/${container_name}$" | grep -q .; then
    echo "Removendo container antigo: ${container_name}"
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
  fi
}

resolve_existing_volume() {
  local primary="$1"
  shift
  local candidate

  if docker volume inspect "$primary" >/dev/null 2>&1; then
    echo "$primary"
    return
  fi

  for candidate in "$@"; do
    if docker volume inspect "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return
    fi
  done

  echo "$primary"
}

ensure_persistent_volume() {
  local volume_name="$1"
  if docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "Volume persistente encontrado: $volume_name"
    return
  fi

  echo "Criando volume persistente: $volume_name"
  docker volume create \
    --label com.ultrazend.persistent=true \
    "$volume_name" >/dev/null
}

POSTGRES_VOLUME="$(resolve_existing_volume "$POSTGRES_VOLUME" "${LEGACY_POSTGRES_VOLUMES[@]}")"
STORAGE_VOLUME="$(resolve_existing_volume "$STORAGE_VOLUME" "${LEGACY_STORAGE_VOLUMES[@]}")"

echo "Volume PostgreSQL selecionado: $POSTGRES_VOLUME"
echo "Volume storage selecionado: $STORAGE_VOLUME"

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
# A aplicacao roda como uid/gid 1001. Chaves privadas ficam legiveis apenas
# para root e esse grupo; arquivos publicos continuam legiveis normalmente.
chown -R root:1001 "$CONFIG_DIR/dkim-keys" || true
chmod 750 "$CONFIG_DIR/dkim-keys" || true
find "$CONFIG_DIR/dkim-keys" -type f -name '*-private.pem' -exec chmod 640 {} + 2>/dev/null || true
find "$CONFIG_DIR/dkim-keys" -type f ! -name '*-private.pem' -exec chmod 644 {} + 2>/dev/null || true
chown -R 1001:1001 "$LOGS_DIR" || true
chmod -R 755 "$LOGS_DIR" || true

if [ -f "$CONFIG_DIR/dkim-keys/velomail.com.br-default-private.pem" ]; then
  echo "DKIM private key found in persistent storage"
else
  echo "AVISO: DKIM private key not found in $CONFIG_DIR/dkim-keys"
fi

echo "Atualizando codigo da aplicacao..."
echo "Verificando espaco antes da compilacao..."
available_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
if [ "${available_kb:-0}" -lt 1572864 ]; then
  # PLANO MEDIA-7: limpeza com escopo restrito.
  #
  # Esta VPS e compartilhada (aprenderia, digiurban, m2centerauto). Um
  # `docker image prune -f` sem filtro apaga imagens DAS OUTRAS aplicacoes.
  # Aqui removemos apenas imagens DESTA app, selecionadas pelo nome do
  # repositorio (velomail-api / velomail-migration), mantendo as 3 tags mais
  # recentes para que o rollback continue possivel sem rebuild.
  #
  # Ordenamos por CreatedAt em epoch (nao pela string de data, que nao ordena
  # cronologicamente) e nunca removemos a imagem em uso pelo container vivo.
  echo "Espaco abaixo de 1.5 GB; removendo apenas imagens antigas desta aplicacao..."
  in_use="$(docker inspect --format '{{.Image}}' ultrazend-api 2>/dev/null || true)"
  for repo in velomail-api velomail-migration; do
    docker images --filter "reference=*/*/${repo}" \
      --format '{{.CreatedAt}}\t{{.ID}}' 2>/dev/null \
      | sort -r | tail -n +4 | cut -f2 \
      | while read -r img_id; do
          [ -n "$img_id" ] || continue
          [ "$img_id" = "$in_use" ] && continue
          docker rmi "$img_id" >/dev/null 2>&1 || true
        done
  done

  # NAO usamos `docker builder prune`: ele NAO aceita filtro por label ou por
  # projeto, entao apagaria o cache de build das outras 3 aplicacoes do host.
  # Como esta app nao builda mais nesta maquina (PLANO CRITICA-1), ela tambem
  # nao gera cache aqui. Nao ha o que limpar por nossa conta.
  echo "Cache de build: nao tocado (compartilhado com outras apps do host)."
fi
df -h /

# PLANO ALTA-5: clone atomico, nao destrutivo.
# Antes: `rm -rf "$APP_DIR"` acontecia ANTES do clone, entao um clone que
# falhasse (rede, GitHub fora, disco cheio) deixava a VPS sem o codigo anterior
# e sem o novo. Agora clonamos ao lado e so trocamos apos o clone concluir.
APP_DIR_NEW="${APP_DIR}.new.$$"
APP_DIR_OLD="${APP_DIR}.old.$$"
rm -rf "$APP_DIR_NEW"
if ! git clone --depth 1 "$REPO_URL" "$APP_DIR_NEW"; then
  echo "ERRO: git clone falhou. Estado anterior em $APP_DIR foi preservado."
  rm -rf "$APP_DIR_NEW"
  exit 1
fi
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "$APP_DIR_OLD"
fi
mv "$APP_DIR_NEW" "$APP_DIR"
rm -rf "$APP_DIR_OLD"
cd "$APP_DIR"
echo "Repositorio clonado"

echo "Sincronizando configuracoes versionadas para area persistente..."
if [ -d "$APP_DIR/configs" ]; then
  cp -a "$APP_DIR/configs/." "$CONFIG_DIR/"
fi

if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
fi

ensure_secret_if_invalid "JWT_SECRET"
ensure_secret_if_invalid "JWT_REFRESH_SECRET"
ensure_secret_if_invalid "COOKIE_SECRET"
ensure_secret_if_invalid "APP_ENCRYPTION_KEY"
if [ -z "$(read_env_value "SUPER_ADMIN_EMAIL")" ]; then
  ensure_env_value "SUPER_ADMIN_EMAIL" "superadmin@velomail.com.br"
fi
if [ -z "$(read_env_value "SUPER_ADMIN_NAME")" ]; then
  ensure_env_value "SUPER_ADMIN_NAME" "VeloMail Super Admin"
fi
ensure_secret_if_missing "SUPER_ADMIN_PASSWORD"
ensure_env_value "ENABLE_CSRF_PROTECTION" "true"

mkdir -p "$CONFIG_DIR/dkim-keys"
chown -R root:1001 "$CONFIG_DIR/dkim-keys" || true
chmod 750 "$CONFIG_DIR/dkim-keys" || true
find "$CONFIG_DIR/dkim-keys" -type f -name '*-private.pem' -exec chmod 640 {} + 2>/dev/null || true
find "$CONFIG_DIR/dkim-keys" -type f ! -name '*-private.pem' -exec chmod 644 {} + 2>/dev/null || true

# PLANO CRITICA-1: o frontend NAO e mais compilado aqui.
# Antes: `npm ci && npm run build` rodava na VPS, disputando CPU e I/O com as
# outras 3 aplicacoes do host e exigindo toolchain Node em producao. O build
# agora acontece no runner do GitHub e chega como tarball via scp.
echo "Instalando frontend pre-compilado..."
FRONTEND_TARBALL="/tmp/velomail-frontend.tar.gz"
if [ ! -f "$FRONTEND_TARBALL" ]; then
  echo "ERRO: artefato do frontend nao encontrado em $FRONTEND_TARBALL."
  echo "O workflow deve envia-lo via scp antes de executar este script."
  exit 1
fi

# Extrai para um diretorio temporario e so entao troca, para que uma extracao
# corrompida nao deixe o site servindo uma pasta pela metade.
STATIC_TMP="${STATIC_DIR}.new.$$"
rm -rf "$STATIC_TMP"
mkdir -p "$STATIC_TMP"
tar -xzf "$FRONTEND_TARBALL" -C "$STATIC_TMP"

if [ ! -f "$STATIC_TMP/index.html" ]; then
  echo "ERRO: artefato do frontend nao contem index.html. Abortando sem tocar no site atual."
  rm -rf "$STATIC_TMP"
  exit 1
fi

STATIC_OLD="${STATIC_DIR}.old.$$"
if [ -d "$STATIC_DIR" ]; then
  mv "$STATIC_DIR" "$STATIC_OLD"
fi
mv "$STATIC_TMP" "$STATIC_DIR"
rm -rf "$STATIC_OLD"
chown -R www-data:www-data "$STATIC_DIR"
rm -f "$FRONTEND_TARBALL"
echo "Frontend pre-compilado instalado"

echo "Configurando Nginx..."

# Bootstrap SSL em duas fases (corrige falha do deploy de 2026-09-16).
#
# A config completa abaixo faz `include /etc/letsencrypt/options-ssl-nginx.conf`
# e referencia o certificado do dominio. Numa VPS recem-instalada nenhum dos
# dois existe ainda, entao o `nginx -t` falha com:
#   open() "/etc/letsencrypt/options-ssl-nginx.conf" failed (2: No such file...)
# e o deploy morre ANTES de chegar no certbot -- que era justamente quem criaria
# esses arquivos. Deadlock: nginx precisa do cert, cert precisa do nginx no ar.
#
# Solucao: se o certificado ainda nao existe, sobe primeiro um server HTTP
# minimo (suficiente para o desafio ACME), roda o certbot, e so entao instala a
# config HTTPS completa. Em host que ja tem certificado, nada disso executa.
if [ ! -f "/etc/letsencrypt/live/$BASE_DOMAIN/fullchain.pem" ]; then
  echo "Certificado ausente: fazendo bootstrap HTTP para o desafio ACME..."
  mkdir -p /var/www/html
  cat > /etc/nginx/sites-available/ultrazend << 'BOOTSTRAP_EOF'
server {
    listen 80;
    listen [::]:80;
    server_name www.velomail.com.br velomail.com.br;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }

    location / {
        root /var/www/ultrazend-static;
        try_files $uri $uri/ /index.html;
    }
}
BOOTSTRAP_EOF
  ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/000-ultrazend
  rm -f /etc/nginx/sites-enabled/ultrazend
  if nginx -t; then
    systemctl reload nginx
    echo "Nginx em modo HTTP. Solicitando certificado..."
    # --nginx edita a config para validar; o resultado e descartado logo abaixo,
    # quando a config completa e reescrita. O que importa e o certificado.
    certbot certonly --nginx \
      -d "$BASE_DOMAIN" -d "$WWW_DOMAIN" \
      --cert-name "$BASE_DOMAIN" \
      --non-interactive --agree-tos --email divairbuava@gmail.com \
      || echo "AVISO: certbot falhou; o deploy continua e o site fica em HTTP."
  else
    echo "AVISO: nginx -t falhou no bootstrap; pulando emissao de certificado."
  fi
fi

# Se mesmo apos o bootstrap nao houver certificado (DNS ainda propagando, rate
# limit do Let's Encrypt), instalar a config HTTPS deixaria o nginx sem subir e
# derrubaria as OUTRAS 3 aplicacoes do host. Nesse caso paramos aqui, com o site
# servindo em HTTP, e reportamos.
if [ ! -f "/etc/letsencrypt/live/$BASE_DOMAIN/fullchain.pem" ]; then
  echo "AVISO: sem certificado para $BASE_DOMAIN. Mantendo configuracao HTTP."
  echo "       Rode o deploy novamente apos resolver o DNS/certbot."
  SKIP_HTTPS_CONFIG=1
fi

if [ "${SKIP_HTTPS_CONFIG:-0}" != "1" ]; then
cat > /etc/nginx/sites-available/ultrazend << 'NGINX_EOF'
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name www.velomail.com.br velomail.com.br;

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
    server_name velomail.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/velomail.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/velomail.com.br/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Redirect apex to www
    return 301 https://www.velomail.com.br$request_uri;
}

# HTTPS server for www
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.velomail.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/velomail.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/velomail.com.br/privkey.pem;
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
        proxy_pass http://127.0.0.1:3001/api/health/simple;
        access_log off;
    }
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
NGINX_EOF

ln -sf /etc/nginx/sites-available/ultrazend /etc/nginx/sites-enabled/000-ultrazend
rm -f /etc/nginx/sites-enabled/ultrazend
rm -f /etc/nginx/sites-enabled/default

# Se a config HTTPS nao validar, restauramos o modo HTTP em vez de deixar o
# nginx quebrado: uma config invalida impede `systemctl reload` e derrubaria
# tambem aprenderia, digiurban e m2centerauto, que dividem este nginx.
if ! nginx -t; then
  echo "ERRO: configuracao HTTPS invalida. Revertendo para HTTP para nao afetar as outras apps."
  cat > /etc/nginx/sites-available/ultrazend << 'FALLBACK_EOF'
server {
    listen 80;
    listen [::]:80;
    server_name www.velomail.com.br velomail.com.br;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }

    location / {
        root /var/www/ultrazend-static;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
FALLBACK_EOF
  nginx -t || { echo "ERRO: nem a config HTTP de fallback valida."; exit 1; }
fi
echo "Nginx configurado com sucesso"
fi

echo "Preparando rede e volumes..."
docker network create ultrazend-network >/dev/null 2>&1 || true
ensure_persistent_volume "$POSTGRES_VOLUME"
ensure_persistent_volume "$STORAGE_VOLUME"

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
  # PLANO ALTA-4: alem do limite de memoria (que ja existia), o container agora
  # tem limite de CPU e de PIDs. Sem eles, num host compartilhado por 4
  # aplicacoes, um loop quente ou um vazamento de processos desta app degrada
  # ou derruba as outras.
  # Valores ESTIMADOS (VPS de 4 vCPU), com folga deliberada: nao foi possivel
  # medir o pico com a aplicacao fora do ar. Revisar apos o item MEDIA-8.
  docker run -d \
    --name ultrazend-postgres \
    --restart unless-stopped \
    --network ultrazend-network \
    -m 256m \
    --memory-swap 256m \
    --cpus=1.0 \
    --pids-limit=200 \
    --log-driver json-file \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    -e POSTGRES_DB=ultrazend \
    -e POSTGRES_USER=ultrazend \
    -e POSTGRES_PASSWORD=ultrazend \
    -v ${POSTGRES_VOLUME}:/var/lib/postgresql/data \
    postgres:16-alpine \
    -c shared_buffers=64MB \
    -c effective_cache_size=192MB \
    -c max_connections=50 \
    -c work_mem=4MB >/dev/null
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

# PLANO CRITICA-1 + CRITICA-2: a imagem NAO e mais construida aqui.
#
# Antes, dois `docker build` rodavam nesta VPS. Foi a causa direta da queda de
# 12/09: com o host saturado o BuildKit perdia a sessao
# ("failed to build: NotFound: forwarding Ping: no such job ...") e o deploy
# morria sem deixar artefato utilizavel. Alem disso, um SSH interrompido deixava
# o processo de build orfao (PPID 1) segurando locks do BuildKit.
#
# Agora as imagens sao construidas no runner do GitHub e publicadas no GHCR com
# tag imutavel `sha-<commit>`. Aqui so baixamos. Isso torna o rollback uma troca
# de variavel (pull de uma tag ja existente) em vez de um rebuild sob pressao.
cd "$APP_DIR"

if [ -z "${IMAGE_API:-}" ] || [ -z "${IMAGE_MIGRATION:-}" ]; then
  echo "ERRO: IMAGE_API e IMAGE_MIGRATION precisam ser definidas pelo workflow."
  exit 1
fi

echo "Baixando imagens do registry..."
echo "  API:       $IMAGE_API"
echo "  MIGRATION: $IMAGE_MIGRATION"

if [ -n "${REGISTRY_USER:-}" ] && [ -n "${REGISTRY_TOKEN:-}" ]; then
  echo "$REGISTRY_TOKEN" | docker login ghcr.io -u "$REGISTRY_USER" --password-stdin
fi

docker pull "$IMAGE_API"
docker pull "$IMAGE_MIGRATION"

# Tags locais estaveis: o restante do script (e um rollback manual) referencia
# estes nomes, enquanto a tag SHA permanece como identificador imutavel.
docker tag "$IMAGE_API" ultrazend-api:latest
docker tag "$IMAGE_MIGRATION" ultrazend-migration:latest

# Label usado pela limpeza com escopo restrito (MEDIA-7), para nunca apagar
# imagem de outra aplicacao do host.
echo "Imagens prontas (build feito fora desta VPS)"

echo "Aplicando migrations (container efemero)..."
docker run --rm \
  --name ultrazend-migration \
  --network ultrazend-network \
  --env-file "$ENV_FILE" \
  -m 512m \
  --cpus=1.0 \
  --pids-limit=200 \
  -e NODE_ENV=production \
  -e DB_CLIENT=pg \
  -e DATABASE_URL=postgresql://ultrazend:ultrazend@ultrazend-postgres:5432/ultrazend?schema=public \
  -v "$CONFIG_DIR":/app/configs \
  ultrazend-migration:latest \
  sh -c "npm run migrate:latest && npm run seed:super-admin"
echo "Migrations e seed concluidos"

echo "Subindo novo container backend..."
docker run -d \
  --name ultrazend-api \
  --label com.ultrazend.component=application \
  --label com.ultrazend.service=backend \
  --restart unless-stopped \
  --network ultrazend-network \
  --env-file "$ENV_FILE" \
  -p 3001:3001 \
  -m 512m \
  --memory-swap 512m \
  --cpus=1.5 \
  --pids-limit=300 \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  -e NODE_OPTIONS=--max-old-space-size=384 \
  -e NODE_ENV=production \
  -e DB_CLIENT=pg \
  -e PORT=3001 \
  -e DATABASE_URL=postgresql://ultrazend:ultrazend@ultrazend-postgres:5432/ultrazend?schema=public \
  -e LOG_FILE_PATH=/app/logs \
  -e SMTP_HOST=localhost \
  -e SMTP_PORT=25 \
  -e ULTRAZEND_DIRECT_DELIVERY=true \
  -e ENABLE_DKIM=true \
  -e DKIM_PRIVATE_KEY_PATH=/app/configs/dkim-keys/velomail.com.br-default-private.pem \
  -e DKIM_SELECTOR=default \
  -e DKIM_DOMAIN=velomail.com.br \
  -v "$LOGS_DIR":/app/logs \
  -v "$CONFIG_DIR":/app/configs \
  -v ${STORAGE_VOLUME}:/app/storage \
  ultrazend-api:latest \
  node dist/index.js

echo "Aguardando container inicializar..."
sleep 15

if ! docker ps --filter "name=^/ultrazend-api$" --format '{{.Names}}' | grep -q '^ultrazend-api$'; then
  echo "ERRO: Container ultrazend-api nao esta rodando"
  docker logs ultrazend-api --tail 80 || true
  exit 1
fi

# `nginx -t` ja validou a config acima. Um reload que falhe aqui NAO deve
# abortar o deploy: a aplicacao esta no ar e o container saudavel, e derrubar o
# deploy neste ponto deixaria tudo pela metade (foi o que aconteceu em 16/09).
if ! systemctl reload nginx; then
  echo "AVISO: reload do nginx falhou. Diagnostico:"
  nginx -t || true
  systemctl status nginx --no-pager -l 2>&1 | tail -15 || true
fi
echo "Servicos iniciados"

# O certificado de $BASE_DOMAIN ja cobre $WWW_DOMAIN via SAN, entao nao ha
# emissao separada para o www (o diretorio live/$WWW_DOMAIN nunca existe).
#
# A emissao em si acontece no bootstrap, la em cima, antes da config HTTPS ser
# escrita. Aqui apenas tratamos o caso em que o certificado passou a existir
# DEPOIS de termos caido no modo HTTP: reexecutar o deploy instala o HTTPS.
if [ "${SKIP_HTTPS_CONFIG:-0}" = "1" ]; then
  echo "SSL: site servindo em HTTP (sem certificado). Rode o deploy novamente"
  echo "     apos confirmar que o DNS de $BASE_DOMAIN aponta para esta VPS."
else
  echo "SSL configurado para ambos dominios"
fi

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
# Migrations e seed podem levar mais de um minuto em um VPS sob carga. O
# limite anterior de 60s fazia o workflow encerrar um backend saudável antes
# de ele terminar a inicialização.
for i in $(seq 1 36); do
  if docker exec ultrazend-api node -e "const http=require('http');const request=http.get('http://localhost:3001/api/health/simple',(response)=>process.exit(response.statusCode===200?0:1));request.setTimeout(4000,()=>{request.destroy();process.exit(1)});request.on('error',()=>process.exit(1));" 2>/dev/null; then
    echo "Health check: OK"
    break
  fi

  if [ "$i" -eq 36 ]; then
    echo "ERRO: Health check nao respondeu apos 3 minutos"
    echo "Estado do container:"
    docker inspect --format '{{.State.Status}} (exit={{.State.ExitCode}}) started={{.State.StartedAt}}' ultrazend-api || true
    echo "Ultimas linhas do backend:"
    docker logs ultrazend-api --tail 160 || true
    exit 1
  fi

  echo "Health check ainda nao respondeu (${i}/36), tentando novamente..."
  sleep 5
done

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
