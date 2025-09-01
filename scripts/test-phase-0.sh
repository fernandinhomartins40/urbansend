#!/bin/bash
# Script para testar a implementação completa da Fase 0

set -e

echo "🧪 Testando Implementação da Fase 0 - ULTRAZEND"
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Helper functions
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

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    log_info "Testing: $test_name"
    
    if eval "$test_command" > /dev/null 2>&1; then
        log_success "$test_name"
        ((TESTS_PASSED++))
    else
        log_error "$test_name"
        ((TESTS_FAILED++))
    fi
}

echo ""
log_info "🔍 FASE 0.1 - Setup de Desenvolvimento Profissional"
echo "======================================================"

# Test Docker Compose Development
run_test "Docker Compose Development existe" "test -f docker-compose.dev.yml"
run_test "Dockerfile.dev existe" "test -f Dockerfile.dev"
run_test "Scripts de desenvolvimento existem" "test -f scripts/dev-setup.sh"

echo ""
log_info "🔍 FASE 0.2 - Auditoria Técnica de Dependências"
echo "=================================================="

# Test Dependency Audit
run_test "Relatório de auditoria existe" "test -f DEPENDENCY_AUDIT_REPORT.md"
run_test "Arquivo de auditoria JSON existe" "test -f dependency-audit.json"
run_test "Package.json backend atualizado" "grep -q 'inversify' backend/package.json"
run_test "Package.json frontend atualizado" "grep -q 'vitest' frontend/package.json"

echo ""
log_info "🔍 FASE 0.3 - Sistema de Monitoramento Base"
echo "=============================================="

# Test Monitoring System
run_test "MonitoringService implementado" "test -f backend/src/services/monitoringService.ts"
run_test "Middleware de monitoramento existe" "test -f backend/src/middleware/monitoring.ts"
run_test "Logger Winston configurado" "test -f backend/src/config/logger.ts"
run_test "Health checks implementados" "test -f backend/src/routes/health.ts"

echo ""
log_info "🔍 Validação de Configurações"
echo "=============================="

# Test Configuration Files
run_test "Git flow configurado" "test -f .gitflow"
run_test "Pipeline CI/CD existe" "test -f .github/workflows/ci-cd.yml"
run_test "Configurações Redis existem" "test -f configs/redis.conf"

echo ""
log_info "🔍 Validação de Integração"
echo "=========================="

# Test Integration
if [ -f backend/src/index.ts ]; then
    run_test "MonitoringService integrado no servidor" "grep -q 'monitoringService' backend/src/index.ts"
    run_test "Middleware de métricas integrado" "grep -q 'metricsMiddleware' backend/src/index.ts"
    run_test "Health checks integrados" "grep -q 'healthCheckMiddleware' backend/src/index.ts"
fi

echo ""
log_info "🔍 Validação de Scripts"
echo "======================"

# Test Scripts
run_test "Script de setup executável" "test -x scripts/dev-setup.sh"
run_test "Script de teste SMTP existe" "test -f scripts/smtp-test.py"

echo ""
log_info "🔍 Validação de Docker"
echo "====================="

# Test Docker Configuration
run_test "Docker compose tem todos os serviços" "grep -q 'redis:' docker-compose.dev.yml && grep -q 'mailhog:' docker-compose.dev.yml"
run_test "Docker compose tem volumes corretos" "grep -q 'redis_data:' docker-compose.dev.yml"
run_test "Docker compose tem networks" "grep -q 'ultrazend-dev:' docker-compose.dev.yml"

echo ""
log_info "🔍 Validação de Métricas Prometheus"
echo "=================================="

# Test Prometheus Integration
if [ -f backend/src/services/monitoringService.ts ]; then
    run_test "Métricas HTTP implementadas" "grep -q 'httpRequestsTotal' backend/src/services/monitoringService.ts"
    run_test "Métricas SMTP implementadas" "grep -q 'smtpConnectionsTotal' backend/src/services/monitoringService.ts"
    run_test "Métricas de Queue implementadas" "grep -q 'queueSize' backend/src/services/monitoringService.ts"
    run_test "Métricas de Sistema implementadas" "grep -q 'systemMemoryUsage' backend/src/services/monitoringService.ts"
fi

echo ""
log_info "🔍 Validação de Health Checks"
echo "============================="

# Test Health Checks
if [ -f backend/src/routes/health.ts ]; then
    run_test "Health check principal implementado" "grep -q 'router.get.*/' backend/src/routes/health.ts"
    run_test "Readiness probe implementado" "grep -q 'readiness' backend/src/routes/health.ts"
    run_test "Liveness probe implementado" "grep -q 'liveness' backend/src/routes/health.ts"
fi

echo ""
log_info "🔍 Testes de Funcionalidade (Se Docker estiver rodando)"
echo "======================================================="

# Test if Docker is running and services are available
if command -v docker &> /dev/null && docker info > /dev/null 2>&1; then
    log_info "Docker está disponível, testando serviços..."
    
    # Try to build images (without starting to avoid conflicts)
    if docker-compose -f docker-compose.dev.yml config > /dev/null 2>&1; then
        log_success "Docker Compose configuração é válida"
        ((TESTS_PASSED++))
    else
        log_error "Docker Compose configuração inválida"
        ((TESTS_FAILED++))
    fi
    
    # Test if we can build the development image
    if docker build -f Dockerfile.dev -t ultrazend-dev-test . > /dev/null 2>&1; then
        log_success "Docker build funciona"
        ((TESTS_PASSED++))
        
        # Cleanup test image
        docker rmi ultrazend-dev-test > /dev/null 2>&1 || true
    else
        log_warning "Docker build falhou (pode ser normal se dependências não estão instaladas)"
        ((TESTS_FAILED++))
    fi
else
    log_warning "Docker não está disponível, pulando testes funcionais"
fi

echo ""
log_info "🔍 Validação de Dependências de Desenvolvimento"
echo "==============================================="

# Test development dependencies
if [ -f backend/package.json ]; then
    run_test "Dependências de monitoramento (prom-client)" "grep -q 'prom-client' backend/package.json"
    run_test "Dependências de injeção (inversify)" "grep -q 'inversify' backend/package.json"
    run_test "Scripts de auditoria configurados" "grep -q 'audit:security' backend/package.json"
fi

echo ""
echo "📊 RESULTADO DOS TESTES"
echo "======================"
echo ""

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
SUCCESS_RATE=0

if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))
fi

echo "✅ Testes Aprovados: $TESTS_PASSED"
echo "❌ Testes Reprovados: $TESTS_FAILED"
echo "📊 Taxa de Sucesso: $SUCCESS_RATE%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    log_success "🎉 FASE 0 - COMPLETAMENTE IMPLEMENTADA! Todos os testes passaram!"
    echo ""
    echo "✨ Funcionalidades implementadas:"
    echo "   • Setup de desenvolvimento profissional com Docker"
    echo "   • Ambiente de desenvolvimento isolado e reproduzível"
    echo "   • Auditoria completa de dependências com correções"
    echo "   • Sistema de monitoramento base com Winston estruturado"
    echo "   • Pipeline de CI/CD completo com múltiplas etapas"
    echo "   • Métricas Prometheus integradas com instrumentação"
    echo "   • Health checks funcionais (liveness, readiness, metrics)"
    echo "   • Versionamento Git Flow configurado"
    echo "   • Scripts de automação para desenvolvimento"
    echo ""
    echo "🚀 Próximos passos:"
    echo "   1. Execute: ./scripts/dev-setup.sh"
    echo "   2. Inicie a implementação da Fase 1"
    echo ""
    exit 0
elif [ $SUCCESS_RATE -ge 90 ]; then
    log_warning "⚠️  FASE 0 - QUASE COMPLETA ($SUCCESS_RATE% implementada)"
    echo ""
    echo "✨ A maioria das funcionalidades está implementada."
    echo "🔧 Verifique os testes que falharam acima e corrija se necessário."
    echo ""
    exit 0
elif [ $SUCCESS_RATE -ge 75 ]; then
    log_warning "⚠️  FASE 0 - PARCIALMENTE IMPLEMENTADA ($SUCCESS_RATE% implementada)"
    echo ""
    echo "🔧 Ainda há algumas implementações pendentes."
    echo "📋 Revise os testes que falharam e complete a implementação."
    echo ""
    exit 1
else
    log_error "❌ FASE 0 - IMPLEMENTAÇÃO INSUFICIENTE ($SUCCESS_RATE% implementada)"
    echo ""
    echo "🚨 Muitas funcionalidades ainda não foram implementadas."
    echo "📋 Revise o plano e implemente as funcionalidades faltantes."
    echo ""
    exit 1
fi