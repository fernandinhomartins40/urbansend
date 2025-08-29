#!/bin/bash

# 🚀 UrbanSend Container Startup Script
# VPS: 72.60.10.112

set -e

echo "🚀 Iniciando UrbanSend Container..."
echo "📅 Data: $(date)"
echo "🌐 VPS: 72.60.10.112"
echo "🔌 Porta Principal: 3010"
echo "📧 Porta SMTP: 25"

# Debug: Verificar ambiente
echo "🔍 DEBUG: Verificando ambiente..."
whoami
pwd
ls -la /app/
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# === CONFIGURAR DIRETÓRIOS ===
echo "📁 Configurando diretórios..."
mkdir -p /app/data /app/logs /app/data/uploads /app/data/backups

# Verificar se o banco de dados existe, se não, executar migrações
if [ ! -f "/app/data/database.sqlite" ]; then
    echo "🗄️ Banco de dados não encontrado, executando migrações iniciais..."
    cd /app/backend
    npm run migrate:latest
    echo "✅ Migrações concluídas"
else
    echo "🗄️ Banco de dados encontrado, verificando migrações pendentes..."
    cd /app/backend
    npm run migrate:latest || echo "⚠️ Nenhuma migração pendente"
fi

# === CONFIGURAR NGINX ===
echo "🌐 Configurando Nginx..."

# Criar diretórios necessários (evitar /var/run que é do sistema)
mkdir -p /var/log/nginx /tmp
chmod 755 /var/log/nginx || echo "⚠️ Chmod falhou em /var/log/nginx"

# Testar configuração do nginx
nginx -c /etc/nginx/nginx.conf -t || {
    echo "❌ Erro na configuração do Nginx!"
    exit 1
}

echo "✅ Configuração do Nginx válida"

# === INICIAR NGINX ===
echo "🌐 Iniciando Nginx..."
nginx -c /etc/nginx/nginx.conf -g "daemon off;" &
NGINX_PID=$!

# Aguardar nginx inicializar
sleep 2

# Verificar se nginx está rodando
if ! kill -0 $NGINX_PID 2>/dev/null; then
    echo "❌ Falha ao iniciar Nginx!"
    exit 1
fi

echo "✅ Nginx iniciado com PID: $NGINX_PID"

# === INICIAR BACKEND ===
echo "🔧 Iniciando Backend Node.js..."
cd /app/backend

# Exportar variáveis de ambiente do arquivo .env
export $(cat /app/.env | grep -v '^#' | xargs)

# Iniciar o backend
npm start &
BACKEND_PID=$!

# Aguardar backend inicializar
sleep 5

# Verificar se backend está rodando
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Falha ao iniciar Backend!"
    kill $NGINX_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Backend iniciado com PID: $BACKEND_PID"

# === HEALTH CHECKS ===
echo "🏥 Executando health checks..."

# Verificar Nginx
if curl -f http://localhost:3010/health >/dev/null 2>&1; then
    echo "✅ Nginx respondendo na porta 3010"
else
    echo "⚠️ Nginx não está respondendo adequadamente"
fi

# Verificar Backend API
sleep 3
if curl -f http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "✅ Backend API respondendo na porta 3001"
else
    echo "⚠️ Backend API não está respondendo adequadamente"
fi

# === FINALIZAÇÃO ===
echo ""
echo "🎉 UrbanSend Container iniciado com sucesso!"
echo "🌐 Aplicação disponível em: http://72.60.10.112:3010"
echo "📧 SMTP Server na porta: 25"
echo "📊 Logs disponíveis em: /app/logs/"
echo ""
echo "🔍 Monitorando processos..."

# === FUNÇÃO DE CLEANUP ===
cleanup() {
    echo ""
    echo "🛑 Recebido sinal de parada, finalizando processos..."
    
    # Parar backend
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "⏹️ Parando Backend..."
        kill -TERM $BACKEND_PID
        wait $BACKEND_PID 2>/dev/null || true
    fi
    
    # Parar nginx
    if kill -0 $NGINX_PID 2>/dev/null; then
        echo "⏹️ Parando Nginx..."
        kill -TERM $NGINX_PID
        wait $NGINX_PID 2>/dev/null || true
    fi
    
    echo "✅ Processos finalizados com segurança"
    exit 0
}

# Capturar sinais de parada
trap cleanup SIGTERM SIGINT SIGQUIT

# === LOOP DE MONITORAMENTO ===
while true; do
    # Verificar se nginx ainda está rodando
    if ! kill -0 $NGINX_PID 2>/dev/null; then
        echo "❌ Nginx parou inesperadamente!"
        cleanup
        exit 1
    fi
    
    # Verificar se backend ainda está rodando
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ Backend parou inesperadamente!"
        cleanup
        exit 1
    fi
    
    # Aguardar 30 segundos antes da próxima verificação
    sleep 30
done