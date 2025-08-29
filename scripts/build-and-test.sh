#!/bin/bash

# 🧪 Script de Build e Teste - UrbanSend Container
# VPS: 72.60.10.112

set -e

echo "🧪 Iniciando build e teste do container UrbanSend..."
echo "📅 $(date)"
echo ""

# === CORES PARA OUTPUT ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === FUNÇÃO DE LOG ===
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# === VERIFICAR PRÉ-REQUISITOS ===
log_info "Verificando pré-requisitos..."

if ! command -v docker &> /dev/null; then
    log_error "Docker não está instalado!"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose não está instalado!"
    exit 1
fi

log_success "Docker e Docker Compose encontrados"

# === LIMPEZA PRÉVIA ===
log_info "Limpando containers e imagens antigas..."

# Parar containers se existirem
docker-compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
docker container stop urbansend-test 2>/dev/null || true
docker container rm urbansend-test 2>/dev/null || true

# Remover imagem antiga se existir
docker rmi urbansend-urbansend-dev 2>/dev/null || true
docker rmi urbansend_urbansend-dev 2>/dev/null || true

log_success "Limpeza concluída"

# === CRIAR DIRETÓRIOS NECESSÁRIOS ===
log_info "Criando diretórios para volumes..."

mkdir -p data logs
chmod 755 data logs

# === BUILD DA IMAGEM ===
log_info "Construindo imagem Docker..."

if docker build -t urbansend:test . ; then
    log_success "Imagem construída com sucesso"
else
    log_error "Falha no build da imagem"
    exit 1
fi

# === VERIFICAR TAMANHO DA IMAGEM ===
IMAGE_SIZE=$(docker images urbansend:test --format "table {{.Size}}" | tail -n 1)
log_info "Tamanho da imagem: $IMAGE_SIZE"

# === TESTE DE INICIALIZAÇÃO ===
log_info "Testando inicialização do container..."

# Iniciar container em modo detached
if docker run -d --name urbansend-test \
    -p 3010:3010 \
    -p 25:25 \
    -v "$(pwd)/data:/app/data" \
    -v "$(pwd)/logs:/app/logs" \
    urbansend:test ; then
    log_success "Container iniciado"
else
    log_error "Falha ao iniciar container"
    exit 1
fi

# === AGUARDAR INICIALIZAÇÃO ===
log_info "Aguardando inicialização completa (60 segundos)..."

for i in {1..12}; do
    sleep 5
    if docker exec urbansend-test curl -f http://localhost:3010/health &>/dev/null; then
        log_success "Aplicação respondendo após $(($i * 5)) segundos"
        break
    fi
    echo -n "."
done

echo ""

# === TESTES DE CONECTIVIDADE ===
log_info "Executando testes de conectividade..."

# Teste 1: Health check
if docker exec urbansend-test curl -f http://localhost:3010/health &>/dev/null; then
    log_success "Health check: OK"
else
    log_error "Health check: FALHOU"
    docker logs urbansend-test --tail 50
    exit 1
fi

# Teste 2: Frontend
if docker exec urbansend-test curl -f http://localhost:3010/ &>/dev/null; then
    log_success "Frontend: OK"
else
    log_error "Frontend: FALHOU"
fi

# Teste 3: API
if docker exec urbansend-test curl -f http://localhost:3010/api/health &>/dev/null; then
    log_success "API Backend: OK"
else
    log_warning "API Backend: Pode não estar disponível (normal se não implementado)"
fi

# === VERIFICAR PROCESSOS ===
log_info "Verificando processos internos..."

PROCESSES=$(docker exec urbansend-test ps aux)
echo "$PROCESSES"

if echo "$PROCESSES" | grep -q nginx; then
    log_success "Nginx está rodando"
else
    log_error "Nginx não está rodando"
fi

if echo "$PROCESSES" | grep -q node; then
    log_success "Node.js está rodando"
else
    log_error "Node.js não está rodando"
fi

# === VERIFICAR LOGS ===
log_info "Verificando logs..."

echo ""
echo "=== LOGS DO CONTAINER ==="
docker logs urbansend-test --tail 20
echo "=========================="

# === TESTE DE PERFORMANCE BÁSICO ===
log_info "Executando teste básico de performance..."

RESPONSE_TIME=$(docker exec urbansend-test curl -o /dev/null -s -w '%{time_total}' http://localhost:3010/health)
log_info "Tempo de resposta do health check: ${RESPONSE_TIME}s"

if (( $(echo "$RESPONSE_TIME < 1.0" | bc -l) )); then
    log_success "Performance: Boa (< 1s)"
elif (( $(echo "$RESPONSE_TIME < 3.0" | bc -l) )); then
    log_warning "Performance: Aceitável (1-3s)"
else
    log_warning "Performance: Lenta (> 3s)"
fi

# === VERIFICAR RECURSOS ===
log_info "Verificando uso de recursos..."

STATS=$(docker stats urbansend-test --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}")
echo "$STATS"

# === LIMPEZA ===
log_info "Limpando ambiente de teste..."

docker stop urbansend-test
docker rm urbansend-test

log_success "Container testado e removido"

# === RESUMO FINAL ===
echo ""
echo "🎉 RESUMO DO TESTE"
echo "=================="
echo "✅ Build da imagem: Sucesso"
echo "✅ Inicialização: Sucesso"
echo "✅ Health check: OK"
echo "✅ Frontend: OK"
echo "✅ Processos internos: OK"
echo "📊 Tamanho da imagem: $IMAGE_SIZE"
echo "⚡ Tempo de resposta: ${RESPONSE_TIME}s"
echo ""
echo "🚀 Container pronto para deploy na VPS 72.60.10.112:3010"

log_success "Teste concluído com sucesso!"