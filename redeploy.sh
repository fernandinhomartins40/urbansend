#!/bin/bash

# 🔄 ULTRAZEND REDEPLOY RÁPIDO
# Para atualizações rápidas sem reconfigurar tudo

set -e
echo "🔄 REDEPLOY RÁPIDO INICIADO..."

APP_DIR="/var/www/ultrazend"
STATIC_DIR="/var/www/ultrazend-static"

cd "$APP_DIR"

# 1. STOP SERVICES
echo "🛑 Parando serviços..."
pm2 stop ultrazend-api || true

# 2. UPDATE CODE
echo "📥 Atualizando código..."
git fetch origin
git reset --hard origin/main

# 3. REBUILD FRONTEND
echo "🏗️ Recompilando frontend..."
cd frontend
npm ci --silent
npm run build
rm -rf "$STATIC_DIR"/*
cp -r dist/* "$STATIC_DIR/"
chown -R www-data:www-data "$STATIC_DIR"

# 4. REBUILD BACKEND
echo "🔨 Recompilando backend..."
cd ../backend
npm ci --silent
npm run build

# 5. RUN NEW MIGRATIONS
echo "📊 Aplicando novas migrations..."
export NODE_ENV=production
npm run migrate:latest || echo "No new migrations"

# Validate migrations worked
migration_count=$(NODE_ENV=production npx knex migrate:list 2>/dev/null | grep -c "Batch\\|COMPLETED\\|✔" || echo "0")
echo "Total migrations aplicadas: $migration_count"
if [ "$migration_count" -lt 5 ]; then
    echo "❌ CRÍTICO: Erro nas migrations - Redeploy FALHOU"
    exit 1
fi

# 6. RESTART SERVICES
echo "🚀 Reiniciando serviços..."
pm2 restart ultrazend-api
pm2 save

echo "✅ REDEPLOY CONCLUÍDO!"
echo "Status: $(pm2 list | grep ultrazend-api | awk '{print $10}')"