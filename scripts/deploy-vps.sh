#!/bin/bash

# 🚀 Script de Deploy para VPS - UrbanSend
# VPS: 72.60.10.112

set -e

# === CONFIGURAÇÕES ===
VPS_IP="72.60.10.112"
VPS_USER="root"  # Ajustar conforme necessário
VPS_PATH="/opt/urbansend"
LOCAL_PATH="$(pwd)"

# === CORES ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🚀 Deploy UrbanSend para VPS"
echo "🌐 IP: $VPS_IP"
echo "📁 Destino: $VPS_PATH"
echo "📅 $(date)"
echo ""

# === VERIFICAR CONECTIVIDADE ===
log_info "Verificando conectividade com VPS..."

if ping -c 1 $VPS_IP &> /dev/null; then
    log_success "VPS está acessível"
else
    log_error "VPS não está acessível"
    exit 1
fi

# === VERIFICAR SSH ===
log_info "Testando conexão SSH..."

if ssh -o ConnectTimeout=10 -o BatchMode=yes $VPS_USER@$VPS_IP exit &> /dev/null; then
    log_success "Conexão SSH OK"
else
    log_error "Falha na conexão SSH. Verifique as credenciais!"
    log_info "Comando para testar: ssh $VPS_USER@$VPS_IP"
    exit 1
fi

# === BUILD LOCAL ===
log_info "Construindo imagem localmente..."

if docker build -t urbansend:latest . ; then
    log_success "Imagem construída com sucesso"
else
    log_error "Falha no build da imagem"
    exit 1
fi

# === SALVAR IMAGEM ===
log_info "Salvando imagem para transferência..."

if docker save urbansend:latest | gzip > urbansend-image.tar.gz; then
    log_success "Imagem salva: urbansend-image.tar.gz"
    IMAGE_SIZE=$(du -h urbansend-image.tar.gz | cut -f1)
    log_info "Tamanho: $IMAGE_SIZE"
else
    log_error "Falha ao salvar imagem"
    exit 1
fi

# === PREPARAR VPS ===
log_info "Preparando ambiente no VPS..."

ssh $VPS_USER@$VPS_IP << 'EOF'
# Instalar Docker se não existir
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker instalado"
fi

# Instalar Docker Compose se não existir
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Instalando Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose instalado"
fi

# Criar diretório da aplicação
mkdir -p /opt/urbansend/{data,logs}
chmod 755 /opt/urbansend/{data,logs}
echo "✅ Diretórios criados"
EOF

log_success "Ambiente VPS preparado"

# === TRANSFERIR ARQUIVOS ===
log_info "Transferindo arquivos para VPS..."

# Transferir imagem Docker
if scp urbansend-image.tar.gz $VPS_USER@$VPS_IP:$VPS_PATH/; then
    log_success "Imagem transferida"
else
    log_error "Falha na transferência da imagem"
    exit 1
fi

# Transferir docker-compose
if scp docker-compose.yml $VPS_USER@$VPS_IP:$VPS_PATH/; then
    log_success "docker-compose.yml transferido"
else
    log_error "Falha na transferência do docker-compose.yml"
    exit 1
fi

# Transferir configurações
if scp -r docker/ $VPS_USER@$VPS_IP:$VPS_PATH/; then
    log_success "Configurações transferidas"
else
    log_error "Falha na transferência das configurações"
    exit 1
fi

# === DEPLOY NO VPS ===
log_info "Executando deploy no VPS..."

ssh $VPS_USER@$VPS_IP << EOF
cd $VPS_PATH

# Parar aplicação anterior se existir
echo "🛑 Parando aplicação anterior..."
docker-compose down --remove-orphans 2>/dev/null || true

# Remover imagem antiga
docker rmi urbansend:latest 2>/dev/null || true

# Carregar nova imagem
echo "📦 Carregando nova imagem..."
if gunzip -c urbansend-image.tar.gz | docker load; then
    echo "✅ Imagem carregada"
else
    echo "❌ Falha ao carregar imagem"
    exit 1
fi

# Configurar permissões
chmod +x docker/start.sh

# Verificar configuração
if [ ! -f "docker/.env.production" ]; then
    echo "⚠️ Arquivo .env.production não encontrado, usando padrão"
    cp docker/.env.production.example docker/.env.production 2>/dev/null || true
fi

# Iniciar aplicação
echo "🚀 Iniciando aplicação..."
if docker-compose up -d; then
    echo "✅ Aplicação iniciada"
else
    echo "❌ Falha ao iniciar aplicação"
    exit 1
fi

# Aguardar inicialização
echo "⏳ Aguardando inicialização (30 segundos)..."
sleep 30

# Verificar se está rodando
if curl -f http://localhost:3010/health &>/dev/null; then
    echo "✅ Aplicação respondendo"
else
    echo "⚠️ Aplicação pode não estar totalmente inicializada"
    echo "📋 Logs dos últimos minutos:"
    docker-compose logs --tail 20
fi

# Limpeza
rm -f urbansend-image.tar.gz

echo "🎉 Deploy concluído!"
echo "🌐 Aplicação disponível em: http://$VPS_IP:3010"
EOF

log_success "Deploy executado no VPS"

# === LIMPEZA LOCAL ===
log_info "Limpando arquivos temporários..."
rm -f urbansend-image.tar.gz
log_success "Limpeza concluída"

# === TESTE FINAL ===
log_info "Testando aplicação na VPS..."

sleep 5

if curl -f http://$VPS_IP:3010/health &>/dev/null; then
    log_success "✅ Aplicação está online em http://$VPS_IP:3010"
else
    log_warning "⚠️ Aplicação pode ainda estar inicializando"
    log_info "💡 Teste manualmente: curl http://$VPS_IP:3010/health"
fi

# === RESUMO FINAL ===
echo ""
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "================================"
echo "🌐 URL: http://$VPS_IP:3010"
echo "📧 SMTP: $VPS_IP:25"
echo "📊 Monitoramento: docker-compose logs -f"
echo "🔄 Restart: docker-compose restart"
echo "🛑 Parar: docker-compose down"
echo ""
echo "📋 Comandos úteis no VPS:"
echo "  cd $VPS_PATH"
echo "  docker-compose logs -f"
echo "  docker-compose restart"
echo "  docker-compose ps"
echo ""

log_success "Deploy finalizado! 🚀"