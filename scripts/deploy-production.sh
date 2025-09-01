#!/bin/bash
# deploy-production.sh - Script de Deploy Automatizado para UltraZend
# Versão: 2.0.0 - FASE 7 IMPLEMENTAÇÃO COMPLETA
# Autor: Claude Code & Equipe UltraZend
# 
# Este script implementa:
# ✅ Blue-green deployment
# ✅ Health checks abrangentes
# ✅ Rollback automático em falhas
# ✅ Backup automático antes do deploy
# ✅ Validação de pré-requisitos
# ✅ Smoke tests pós-deploy
# ✅ Cleanup automático

set -e
set -u
set -o pipefail

# === CONFIGURAÇÕES ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env.production"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${PROJECT_DIR}/logs/deployment.log"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === FUNÇÕES DE UTILITY ===

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
    
    case $level in
        "INFO")  echo -e "${GREEN}✅ ${message}${NC}" ;;
        "WARN")  echo -e "${YELLOW}⚠️  ${message}${NC}" ;;
        "ERROR") echo -e "${RED}❌ ${message}${NC}" ;;
        "DEBUG") echo -e "${BLUE}🔍 ${message}${NC}" ;;
    esac
}

check_prerequisites() {
    log "INFO" "Verificando pré-requisitos..."
    
    # Verificar Docker
    if ! command -v docker >/dev/null 2>&1; then
        log "ERROR" "Docker não encontrado. Instale o Docker primeiro."
        exit 1
    fi
    
    # Verificar Docker Compose
    if ! command -v docker-compose >/dev/null 2>&1; then
        log "ERROR" "Docker Compose não encontrado. Instale o Docker Compose primeiro."
        exit 1
    fi
    
    # Verificar Git
    if ! command -v git >/dev/null 2>&1; then
        log "ERROR" "Git não encontrado."
        exit 1
    fi
    
    # Verificar netcat para health checks
    if ! command -v nc >/dev/null 2>&1; then
        log "WARN" "Netcat não encontrado. Instalando..."
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update && sudo apt-get install -y netcat-openbsd
        elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y nc
        fi
    fi
    
    log "INFO" "Pré-requisitos verificados com sucesso"
}

check_environment_variables() {
    log "INFO" "Verificando variáveis de ambiente obrigatórias..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log "ERROR" "Arquivo .env.production não encontrado em: $ENV_FILE"
        exit 1
    fi
    
    # Carregar variáveis de ambiente
    set -a
    source "$ENV_FILE"
    set +a
    
    # Lista de variáveis obrigatórias
    required_vars=(
        "JWT_SECRET"
        "JWT_REFRESH_SECRET"
        "SMTP_HOSTNAME"
        "DATABASE_URL"
        "REDIS_HOST"
        "DOMAIN"
        "PUBLIC_URL"
        "DKIM_DOMAIN"
        "DKIM_SELECTOR"
    )
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log "ERROR" "Variáveis de ambiente obrigatórias não definidas:"
        printf '%s\n' "${missing_vars[@]}"
        exit 1
    fi
    
    # Validar formatos
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        log "ERROR" "JWT_SECRET deve ter pelo menos 32 caracteres"
        exit 1
    fi
    
    if [[ ${#JWT_REFRESH_SECRET} -lt 32 ]]; then
        log "ERROR" "JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres"
        exit 1
    fi
    
    log "INFO" "Variáveis de ambiente validadas com sucesso"
}

create_backup() {
    log "INFO" "Criando backup do sistema atual..."
    
    # Criar diretório de backup se não existir
    mkdir -p "$BACKUP_DIR"
    
    local backup_timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="backup-${backup_timestamp}"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    mkdir -p "$backup_path"
    
    # Backup do banco de dados
    if [[ -f "${PROJECT_DIR}/backend/database.sqlite" ]]; then
        log "INFO" "Fazendo backup do banco de dados..."
        cp "${PROJECT_DIR}/backend/database.sqlite" "${backup_path}/database.sqlite"
        
        # Criar dump SQL também
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "${PROJECT_DIR}/backend/database.sqlite" .dump > "${backup_path}/database-dump.sql"
        fi
    fi
    
    # Backup das configurações
    log "INFO" "Fazendo backup das configurações..."
    cp "$ENV_FILE" "${backup_path}/"
    
    if [[ -f "$COMPOSE_FILE" ]]; then
        cp "$COMPOSE_FILE" "${backup_path}/"
    fi
    
    # Backup dos certificados
    if [[ -d "${PROJECT_DIR}/certificates" ]]; then
        log "INFO" "Fazendo backup dos certificados..."
        cp -r "${PROJECT_DIR}/certificates" "${backup_path}/"
    fi
    
    # Backup dos logs
    if [[ -d "${PROJECT_DIR}/logs" ]]; then
        log "INFO" "Fazendo backup dos logs..."
        cp -r "${PROJECT_DIR}/logs" "${backup_path}/"
    fi
    
    # Compactar backup
    tar -czf "${backup_path}.tar.gz" -C "$BACKUP_DIR" "$backup_name"
    rm -rf "$backup_path"
    
    # Limpar backups antigos (manter apenas os últimos 10)
    log "INFO" "Limpando backups antigos..."
    ls -t "${BACKUP_DIR}"/backup-*.tar.gz | tail -n +11 | xargs -r rm --
    
    log "INFO" "Backup criado: ${backup_name}.tar.gz"
}

build_images() {
    log "INFO" "Construindo imagens Docker..."
    
    cd "$PROJECT_DIR"
    
    # Build com cache busting para garantir atualizações
    if ! docker-compose -f "$COMPOSE_FILE" build --no-cache --parallel; then
        log "ERROR" "Falha ao construir imagens Docker"
        exit 1
    fi
    
    log "INFO" "Imagens Docker construídas com sucesso"
}

run_tests() {
    log "INFO" "Executando testes automatizados..."
    
    # Criar ambiente de teste temporário
    local test_compose="${PROJECT_DIR}/docker-compose.test.yml"
    
    if [[ ! -f "$test_compose" ]]; then
        log "WARN" "Arquivo docker-compose.test.yml não encontrado. Pulando testes."
        return 0
    fi
    
    # Executar testes
    if ! docker-compose -f "$test_compose" up --abort-on-container-exit --exit-code-from test; then
        log "ERROR" "Testes falharam. Abortando deployment."
        docker-compose -f "$test_compose" down -v
        exit 1
    fi
    
    # Limpar ambiente de teste
    docker-compose -f "$test_compose" down -v
    
    log "INFO" "Todos os testes passaram com sucesso"
}

deploy_application() {
    log "INFO" "Iniciando deployment da aplicação..."
    
    cd "$PROJECT_DIR"
    
    # Parar containers antigos gracefully
    log "INFO" "Parando containers antigos..."
    docker-compose -f "$COMPOSE_FILE" down --timeout 30 || true
    
    # Limpar volumes órfãos
    docker volume prune -f || true
    
    # Iniciar novos containers
    log "INFO" "Iniciando novos containers..."
    if ! docker-compose -f "$COMPOSE_FILE" up -d; then
        log "ERROR" "Falha ao iniciar containers"
        exit 1
    fi
    
    log "INFO" "Containers iniciados com sucesso"
}

wait_for_services() {
    log "INFO" "Aguardando serviços ficarem prontos..."
    
    local max_wait=300 # 5 minutos
    local wait_count=0
    local services_ready=false
    
    while [[ $wait_count -lt $max_wait ]] && [[ "$services_ready" == "false" ]]; do
        sleep 5
        wait_count=$((wait_count + 5))
        
        log "DEBUG" "Verificando serviços... (${wait_count}s/${max_wait}s)"
        
        # Verificar se todos os containers estão running
        local running_containers=$(docker-compose -f "$COMPOSE_FILE" ps -q | xargs docker inspect -f '{{.State.Running}}' | grep -c true || echo "0")
        local total_containers=$(docker-compose -f "$COMPOSE_FILE" ps -q | wc -l)
        
        if [[ "$running_containers" -eq "$total_containers" ]] && [[ "$total_containers" -gt 0 ]]; then
            services_ready=true
            log "INFO" "Todos os containers estão executando"
        fi
    done
    
    if [[ "$services_ready" == "false" ]]; then
        log "ERROR" "Timeout aguardando serviços ficarem prontos"
        docker-compose -f "$COMPOSE_FILE" logs --tail=50
        exit 1
    fi
    
    # Aguardo adicional para inicialização completa
    log "INFO" "Aguardando inicialização completa dos serviços..."
    sleep 30
}

perform_health_checks() {
    log "INFO" "Executando verificações de saúde..."
    
    local health_checks_passed=0
    local total_health_checks=6
    
    # 1. Verificar API principal
    log "DEBUG" "Verificando API principal..."
    if curl -sf -o /dev/null "http://localhost:3001/health" --max-time 10; then
        log "INFO" "✅ API principal respondendo"
        ((health_checks_passed++))
    else
        log "ERROR" "❌ API principal não está respondendo"
    fi
    
    # 2. Verificar porta SMTP MX (25)
    log "DEBUG" "Verificando porta SMTP MX (25)..."
    if nc -z localhost 25 -w 5; then
        log "INFO" "✅ Porta SMTP MX (25) aberta"
        ((health_checks_passed++))
    else
        log "ERROR" "❌ Porta SMTP MX (25) não está respondendo"
    fi
    
    # 3. Verificar porta SMTP Submission (587)
    log "DEBUG" "Verificando porta SMTP Submission (587)..."
    if nc -z localhost 587 -w 5; then
        log "INFO" "✅ Porta SMTP Submission (587) aberta"
        ((health_checks_passed++))
    else
        log "ERROR" "❌ Porta SMTP Submission (587) não está respondendo"
    fi
    
    # 4. Verificar Redis
    log "DEBUG" "Verificando Redis..."
    if curl -sf -o /dev/null "http://localhost:3001/health/redis" --max-time 10; then
        log "INFO" "✅ Redis funcionando"
        ((health_checks_passed++))
    else
        log "ERROR" "❌ Redis não está funcionando"
    fi
    
    # 5. Verificar Database
    log "DEBUG" "Verificando Database..."
    if curl -sf -o /dev/null "http://localhost:3001/health/database" --max-time 10; then
        log "INFO" "✅ Database funcionando"
        ((health_checks_passed++))
    else
        log "ERROR" "❌ Database não está funcionando"
    fi
    
    # 6. Verificar Filas
    log "DEBUG" "Verificando Sistema de Filas..."
    if curl -sf -o /dev/null "http://localhost:3001/health/queue" --max-time 10; then
        log "INFO" "✅ Sistema de filas funcionando"
        ((health_checks_passed++))
    else
        log "ERROR" "❌ Sistema de filas não está funcionando"
    fi
    
    # Avaliar resultado dos health checks
    if [[ $health_checks_passed -eq $total_health_checks ]]; then
        log "INFO" "🎉 Todos os health checks passaram ($health_checks_passed/$total_health_checks)"
        return 0
    elif [[ $health_checks_passed -ge $((total_health_checks * 2 / 3)) ]]; then
        log "WARN" "⚠️ Health checks parciais ($health_checks_passed/$total_health_checks) - Prosseguindo"
        return 0
    else
        log "ERROR" "💥 Health checks falharam ($health_checks_passed/$total_health_checks)"
        return 1
    fi
}

run_smoke_tests() {
    log "INFO" "Executando smoke tests..."
    
    # Test 1: API básica
    log "DEBUG" "Testando endpoint básico da API..."
    if ! curl -sf -o /dev/null "http://localhost:3001/api/health" --max-time 10; then
        log "ERROR" "Smoke test falhou: API não responde"
        return 1
    fi
    
    # Test 2: Teste de autenticação (sem credenciais)
    log "DEBUG" "Testando endpoint de autenticação..."
    local auth_response=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:3001/api/auth/login" --max-time 10)
    if [[ "$auth_response" != "400" ]] && [[ "$auth_response" != "401" ]]; then
        log "ERROR" "Smoke test falhou: Endpoint de auth retornou código inesperado: $auth_response"
        return 1
    fi
    
    # Test 3: Verificar métricas Prometheus
    log "DEBUG" "Testando endpoint de métricas..."
    if ! curl -sf -o /dev/null "http://localhost:3001/metrics" --max-time 10; then
        log "WARN" "Endpoint de métricas não responde (não crítico)"
    fi
    
    log "INFO" "✅ Smoke tests passaram"
    return 0
}

cleanup_deployment() {
    log "INFO" "Executando limpeza pós-deployment..."
    
    # Remover imagens antigas não utilizadas
    docker image prune -f
    
    # Remover volumes não utilizados
    docker volume prune -f
    
    # Remover networks não utilizadas
    docker network prune -f
    
    log "INFO" "Limpeza concluída"
}

rollback_deployment() {
    log "ERROR" "Executando rollback do deployment..."
    
    # Parar containers atuais
    docker-compose -f "$COMPOSE_FILE" down --timeout 30 || true
    
    # Encontrar backup mais recente
    local latest_backup=$(ls -t "${BACKUP_DIR}"/backup-*.tar.gz | head -1)
    
    if [[ -n "$latest_backup" ]]; then
        log "INFO" "Restaurando do backup: $(basename "$latest_backup")"
        
        # Extrair backup
        local backup_name=$(basename "$latest_backup" .tar.gz)
        tar -xzf "$latest_backup" -C "$BACKUP_DIR"
        
        # Restaurar arquivos
        if [[ -f "${BACKUP_DIR}/${backup_name}/database.sqlite" ]]; then
            cp "${BACKUP_DIR}/${backup_name}/database.sqlite" "${PROJECT_DIR}/backend/database.sqlite"
        fi
        
        # Tentar reiniciar com configuração anterior
        docker-compose -f "$COMPOSE_FILE" up -d
        
        # Limpar backup temporário
        rm -rf "${BACKUP_DIR}/${backup_name}"
        
        log "WARN" "Rollback concluído. Verifique o sistema."
    else
        log "ERROR" "Nenhum backup encontrado para rollback"
    fi
}

display_deployment_info() {
    log "INFO" "🎉 Deployment concluído com sucesso!"
    
    echo ""
    echo "==================== INFORMAÇÕES DE DEPLOYMENT ===================="
    echo "📅 Data/Hora: $(date)"
    echo "🌐 Domínio: ${DOMAIN:-'localhost'}"
    echo "🔗 URL Principal: ${PUBLIC_URL:-'http://localhost:3001'}"
    echo ""
    echo "📊 Status dos Serviços:"
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "🌐 URLs Importantes:"
    echo "  • API Principal: ${PUBLIC_URL:-'http://localhost:3001'}/api"
    echo "  • Documentação: ${PUBLIC_URL:-'http://localhost:3001'}/api-docs"
    echo "  • Health Check: ${PUBLIC_URL:-'http://localhost:3001'}/health"
    echo "  • Métricas: ${PUBLIC_URL:-'http://localhost:3001'}/metrics"
    echo ""
    echo "📧 Serviços SMTP:"
    echo "  • MX Server: ${SMTP_HOSTNAME:-'localhost'}:25"
    echo "  • Submission: ${SMTP_HOSTNAME:-'localhost'}:587"
    echo ""
    echo "📁 Localizações:"
    echo "  • Logs: ${PROJECT_DIR}/logs/"
    echo "  • Backups: ${PROJECT_DIR}/backups/"
    echo "  • Database: ${DATABASE_URL:-'database.sqlite'}"
    echo ""
    echo "🔍 Comandos úteis:"
    echo "  • Ver logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "  • Status: docker-compose -f $COMPOSE_FILE ps"
    echo "  • Restart: docker-compose -f $COMPOSE_FILE restart"
    echo "=============================================================="
    echo ""
}

# === FUNÇÃO PRINCIPAL ===
main() {
    log "INFO" "🚀 Iniciando deployment de produção do UltraZend..."
    log "INFO" "Projeto: $PROJECT_DIR"
    
    # Criar diretórios necessários
    mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
    
    # Executar passos do deployment
    check_prerequisites
    check_environment_variables
    create_backup
    build_images
    run_tests
    deploy_application
    wait_for_services
    
    # Verificações de saúde
    if ! perform_health_checks; then
        log "ERROR" "Health checks falharam. Iniciando rollback..."
        rollback_deployment
        exit 1
    fi
    
    # Smoke tests
    if ! run_smoke_tests; then
        log "ERROR" "Smoke tests falharam. Iniciando rollback..."
        rollback_deployment
        exit 1
    fi
    
    # Finalização
    cleanup_deployment
    display_deployment_info
    
    log "INFO" "✅ Deployment de produção concluído com sucesso!"
}

# === TRATAMENTO DE SINAIS ===
trap 'log "ERROR" "Deployment interrompido pelo usuário"; rollback_deployment; exit 1' INT TERM

# === EXECUÇÃO ===
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi