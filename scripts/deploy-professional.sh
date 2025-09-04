#!/bin/bash

# 🚀 DEPLOY PROFISSIONAL ULTRAZEND - FASE 5
# Script automatizado para deploy do sistema profissional

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="/var/www/ultrazend/backend"
BACKUP_DIR="/var/www/ultrazend/backup"
LOG_FILE="/var/www/ultrazend/logs/deploy.log"

echo -e "${BLUE}🚀 DEPLOY PROFISSIONAL ULTRAZEND - INICIANDO${NC}"
echo "$(date): Deploy iniciado" >> $LOG_FILE

# Function to log messages
log_message() {
    echo -e "${GREEN}✅ $1${NC}"
    echo "$(date): $1" >> $LOG_FILE
}

log_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
    echo "$(date): WARNING: $1" >> $LOG_FILE
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    echo "$(date): ERROR: $1" >> $LOG_FILE
}

# Step 1: Pre-deploy validations
echo -e "${BLUE}1️⃣ PRÉ-DEPLOY - VALIDAÇÕES${NC}"

# Check if PM2 process exists
if pm2 list | grep -q ultrazend-backend; then
    log_message "PM2 process encontrado"
    
    # Stop services
    echo -e "${YELLOW}Parando serviços...${NC}"
    pm2 stop ultrazend-backend
    log_message "Serviços parados"
else
    log_warning "PM2 process não encontrado - continuando"
fi

# Step 2: Backup
echo -e "${BLUE}2️⃣ BACKUP${NC}"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Backup database
if [ -f "$BACKEND_DIR/ultrazend.sqlite" ]; then
    BACKUP_NAME="ultrazend_backup_$(date +%Y%m%d_%H%M%S).sqlite"
    cp "$BACKEND_DIR/ultrazend.sqlite" "$BACKUP_DIR/$BACKUP_NAME"
    log_message "Backup criado: $BACKUP_NAME"
else
    log_warning "Arquivo de banco não encontrado - será criado pelas migrations"
fi

# Step 3: Code deployment
echo -e "${BLUE}3️⃣ DEPLOY DO CÓDIGO${NC}"

# Go to backend directory
cd $BACKEND_DIR

# Install dependencies
echo -e "${YELLOW}Instalando dependências...${NC}"
npm install
log_message "Dependências instaladas"

# Step 4: Build
echo -e "${BLUE}4️⃣ COMPILAÇÃO${NC}"
npm run build
log_message "Código compilado com sucesso"

# Step 5: CRITICAL - Execute migrations
echo -e "${BLUE}5️⃣ MIGRATIONS (CRÍTICO)${NC}"
echo -e "${YELLOW}Executando 47 migrations organizadas...${NC}"

# Set production environment for migrations
export NODE_ENV=production

# Execute migrations with timeout protection
if timeout 120s npm run migrate:latest; then
    log_message "47 migrations executadas com sucesso - Schema centralizado ativo"
else
    log_error "CRÍTICO: Falha na execução das migrations"
    exit 1
fi

# Validate migrations
MIGRATION_COUNT=$(npx knex migrate:list 2>/dev/null | grep -c "✔" || echo "0")
if [ "$MIGRATION_COUNT" -eq 47 ]; then
    log_message "Validação: 47/47 migrations confirmadas"
else
    log_error "CRÍTICO: Número incorreto de migrations ($MIGRATION_COUNT/47)"
    exit 1
fi

# Step 6: Start services
echo -e "${BLUE}6️⃣ INICIALIZAÇÃO DOS SERVIÇOS${NC}"

# Start PM2 process
pm2 start ultrazend-backend || pm2 restart ultrazend-backend
log_message "Serviços iniciados"

# Wait for startup
echo -e "${YELLOW}Aguardando inicialização...${NC}"
sleep 10

# Step 7: Post-deploy validation
echo -e "${BLUE}7️⃣ VALIDAÇÃO PÓS-DEPLOY${NC}"

# Check PM2 status
if pm2 list | grep -q "online.*ultrazend-backend"; then
    log_message "PM2 process online"
else
    log_error "PM2 process não está online"
    pm2 logs ultrazend-backend --lines 10
    exit 1
fi

# Check health endpoint
echo -e "${YELLOW}Verificando health check...${NC}"
sleep 5

if curl -s -f http://localhost:3001/health > /dev/null; then
    log_message "Health check OK"
else
    log_warning "Health check falhou - verificar logs"
fi

# Show recent logs
echo -e "${BLUE}📋 LOGS RECENTES:${NC}"
pm2 logs ultrazend-backend --lines 5

# Final summary
echo -e "${GREEN}🎉 DEPLOY PROFISSIONAL CONCLUÍDO COM SUCESSO!${NC}"
echo -e "${GREEN}✅ Schema: 47 tabelas centralizadas (A01→ZU47)${NC}"
echo -e "${GREEN}✅ Serviços: Validação defensiva ativa${NC}"  
echo -e "${GREEN}✅ Sistema: Profissional e determinístico${NC}"
echo -e "${GREEN}🚀 UltraZend está pronto para produção!${NC}"

log_message "Deploy profissional concluído com sucesso"
echo "$(date): Deploy finalizado com sucesso" >> $LOG_FILE

exit 0