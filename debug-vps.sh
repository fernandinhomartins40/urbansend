#!/bin/bash

echo "🔍 DIAGNÓSTICO COMPLETO VPS - URBANSEND"
echo "======================================"

# 1. Sistema geral
echo "📋 1. SISTEMA:"
hostname
date
uptime

# 2. Docker status
echo -e "\n🐳 2. DOCKER:"
if command -v docker >/dev/null; then
    echo "✅ Docker instalado: $(docker --version)"
    echo "Status: $(systemctl is-active docker)"
    
    echo -e "\n🔍 Containers rodando:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo -e "\n🔍 Todos os containers:"
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo -e "\n🔍 Imagens Docker:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
else
    echo "❌ Docker NÃO instalado"
fi

# 3. Diretório da aplicação
echo -e "\n📁 3. DIRETÓRIO APLICAÇÃO:"
APP_DIR="/var/www/urbansend"
if [ -d "$APP_DIR" ]; then
    echo "✅ Diretório existe: $APP_DIR"
    cd "$APP_DIR"
    echo -e "\nConteúdo:"
    ls -la
    
    if [ -f "docker-compose.production.yml" ]; then
        echo -e "\n✅ docker-compose.production.yml existe"
        echo "Serviços definidos:"
        docker compose -f docker-compose.production.yml config --services 2>/dev/null || echo "Erro ao ler docker-compose"
        
        echo -e "\nStatus docker-compose:"
        docker compose -f docker-compose.production.yml ps
    else
        echo "❌ docker-compose.production.yml NÃO encontrado"
    fi
    
    if [ -f ".env.production" ]; then
        echo -e "\n✅ .env.production existe"
    else
        echo -e "\n❌ .env.production NÃO encontrado"
    fi
else
    echo "❌ Diretório NÃO existe: $APP_DIR"
fi

# 4. Portas em uso
echo -e "\n🌐 4. PORTAS EM USO:"
echo "Portas importantes (3010, 25, 6379, 80, 443):"
netstat -tlnp | grep -E ":(3010|25|6379|80|443)" || echo "Nenhuma das portas esperadas em uso"

# 5. Firewall
echo -e "\n🔥 5. FIREWALL:"
if command -v ufw >/dev/null; then
    echo "✅ UFW:"
    ufw status
else
    echo "❌ UFW não instalado"
fi

# 6. Logs Docker Compose
echo -e "\n📝 6. LOGS DOCKER COMPOSE:"
if [ -f "$APP_DIR/docker-compose.production.yml" ]; then
    cd "$APP_DIR"
    echo "Logs recentes (últimas 50 linhas):"
    docker compose -f docker-compose.production.yml logs --tail=50 2>/dev/null || echo "Sem logs disponíveis"
else
    echo "docker-compose.production.yml não encontrado"
fi

# 7. Teste interno
echo -e "\n🏥 7. TESTE CONECTIVIDADE INTERNA:"
echo "Testando localhost:3010/health:"
curl -v --connect-timeout 10 http://localhost:3010/health 2>&1 || echo "Falha conexão interna"

# 8. Recursos sistema
echo -e "\n💾 8. RECURSOS:"
echo "Memória:"
free -h
echo -e "\nDisco:"
df -h /
echo -e "\nProcessos relacionados:"
ps aux | grep -E "(docker|node|npm)" | grep -v grep

echo -e "\n✅ DIAGNÓSTICO COMPLETO"
echo "======================================="