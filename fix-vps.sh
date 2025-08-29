#!/bin/bash

echo "🔧 CORREÇÃO AUTOMÁTICA VPS - URBANSEND"
echo "====================================="

APP_DIR="/var/www/urbansend"

# 1. Parar tudo
echo "🛑 1. PARANDO TODOS OS CONTAINERS..."
docker stop $(docker ps -q --filter "name=urbansend") 2>/dev/null || true
docker rm $(docker ps -aq --filter "name=urbansend") 2>/dev/null || true
cd $APP_DIR 2>/dev/null && docker compose -f docker-compose.production.yml down --remove-orphans 2>/dev/null || true

# 2. Limpeza
echo -e "\n🧹 2. LIMPEZA COMPLETA..."
docker container prune -f
docker image prune -f
docker network prune -f
docker volume prune -f 2>/dev/null || true

# 3. Verificar Docker
echo -e "\n🐳 3. VERIFICANDO DOCKER..."
if ! command -v docker >/dev/null; then
    echo "Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

systemctl start docker
systemctl enable docker
echo "✅ Docker ativo: $(systemctl is-active docker)"

# 4. Verificar diretório e arquivos
echo -e "\n📁 4. VERIFICANDO ARQUIVOS..."
if [ ! -d "$APP_DIR" ]; then
    echo "❌ Diretório não existe. Execute o deploy primeiro!"
    exit 1
fi

cd "$APP_DIR"
echo "Conteúdo atual:"
ls -la

if [ ! -f "docker-compose.production.yml" ]; then
    echo "❌ docker-compose.production.yml não encontrado!"
    echo "Execute o workflow de deploy primeiro!"
    exit 1
fi

# 5. Instalar dependências
echo -e "\n📦 5. INSTALANDO DEPENDÊNCIAS..."
if [ -f "package.json" ]; then
    npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --production --no-audit --no-fund
    echo "✅ Dependências instaladas"
else
    echo "⚠️ package.json não encontrado"
fi

# 6. Configurar firewall
echo -e "\n🔥 6. CONFIGURANDO FIREWALL..."
ufw allow 3010/tcp comment "UrbanSend App" 2>/dev/null || true
ufw allow 25/tcp comment "UrbanSend SMTP" 2>/dev/null || true
ufw allow 6379/tcp comment "Redis" 2>/dev/null || true
echo "✅ Firewall configurado"

# 7. Iniciar serviços
echo -e "\n🚀 7. INICIANDO SERVIÇOS..."
docker compose -f docker-compose.production.yml up -d --build --force-recreate

# 8. Aguardar inicialização
echo -e "\n⏳ 8. AGUARDANDO INICIALIZAÇÃO (90s)..."
sleep 90

# 9. Verificar status
echo -e "\n📊 9. STATUS FINAL..."
echo "Containers:"
docker compose -f docker-compose.production.yml ps

echo -e "\nPortas:"
netstat -tlnp | grep -E ":(3010|25|6379)" || echo "Portas não encontradas"

echo -e "\nLogs recentes:"
docker compose -f docker-compose.production.yml logs --tail=20

# 10. Teste final
echo -e "\n🏥 10. TESTE FINAL..."
echo "Teste interno:"
curl -f http://localhost:3010/health 2>/dev/null && echo "✅ Funcionando internamente" || echo "❌ Falha interna"

echo -e "\n✅ CORREÇÃO COMPLETA!"
echo "Teste externo: curl http://72.60.10.112:3010/health"