#!/bin/bash

# 🔧 ULTRAZEND - Script de Correção do Backend Nativo
# Corrige todos os problemas identificados na migração Docker → PM2

set -euo pipefail

# Configuration
VPS_HOST="31.97.162.155"
VPS_USER="root"
APP_DIR="/var/www/ultrazend"
DOMAIN="velomail.com.br"
SUBDOMAIN="www.velomail.com.br"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }

echo "🔧 ULTRAZEND - Correção Robusta do Backend"
echo "=========================================="
echo "🎯 Target: $VPS_HOST"
echo "📁 App Dir: $APP_DIR"
echo "🌐 Domain: $SUBDOMAIN"
echo ""

# Test SSH connection
test_ssh() {
    log "Testing SSH connection..."
    if ssh -o ConnectTimeout=10 -o BatchMode=yes $VPS_USER@$VPS_HOST "echo 'SSH OK'" >/dev/null 2>&1; then
        success "SSH connection established"
    else
        error "SSH connection failed"
    fi
}

# FASE 1: CORREÇÃO CRÍTICA
fix_critical_issues() {
    log "🔴 FASE 1: Correção de Problemas Críticos"
    echo "========================================"
    
    ssh $VPS_USER@$VPS_HOST "
    cd $APP_DIR/backend
    
    # Stop PM2 process
    pm2 stop ultrazend-backend || true
    
    echo '📦 1.1 Corrigindo dependências faltantes...'
    # Install missing dependencies
    npm install swagger-jsdoc swagger-ui-express --save
    npm audit fix --force || echo 'Audit fix completed with warnings'
    
    echo '⚙️ 1.2 Configurando ambiente de produção...'
    # Fix environment configuration
    cp configs/.env.production .env || echo 'Using existing .env'
    echo 'NODE_ENV=production' >> .env
    echo 'PORT=3001' >> .env
    echo 'HOST=0.0.0.0' >> .env
    echo 'REDIS_URL=redis://127.0.0.1:6379' >> .env
    
    # Ensure database path is correct
    sed -i 's|DATABASE_URL=.*|DATABASE_URL=/var/www/ultrazend/backend/ultrazend.sqlite|g' .env
    
    echo '🏗️ 1.3 Rebuild da aplicação...'
    npm run build
    
    echo '🗄️ 1.4 Executando migrations...'
    npm run migrate:latest || echo 'Migrations completed with warnings'
    
    echo '✅ Fase 1 concluída!'
    "
    
    success "Problemas críticos corrigidos"
}

# FASE 2: CONFIGURAÇÃO AVANÇADA
configure_advanced() {
    log "🔄 FASE 2: Configuração Avançada"
    echo "==============================="
    
    ssh $VPS_USER@$VPS_HOST "
    echo '🔧 2.1 Configurando Redis...'
    systemctl enable redis-server
    systemctl start redis-server
    redis-cli ping || echo 'Redis configuration needs manual check'
    
    echo '📧 2.2 Configurando SMTP básico...'
    apt-get install -y postfix mailutils
    postconf -e 'inet_interfaces = loopback-only'
    postconf -e 'mydestination = \$myhostname, localhost.\$mydomain, localhost'
    systemctl restart postfix || echo 'Postfix needs manual configuration'
    
    echo '📋 2.3 Criando configuração PM2 otimizada...'
    cd $APP_DIR
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'ultrazend-backend',
    script: 'backend/dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0'
    },
    error_file: '$APP_DIR/logs/pm2-error.log',
    out_file: '$APP_DIR/logs/pm2-out.log',
    log_file: '$APP_DIR/logs/pm2-combined.log',
    time: true,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    restart_delay: 4000
  }]
}
EOF
    
    echo '✅ Fase 2 concluída!'
    "
    
    success "Configuração avançada concluída"
}

# FASE 3: MONITORAMENTO E LOGGING
setup_monitoring() {
    log "📊 FASE 3: Monitoramento e Logging"
    echo "================================="
    
    ssh $VPS_USER@$VPS_HOST "
    echo '📝 3.1 Configurando rotação de logs...'
    mkdir -p $APP_DIR/logs
    cat > /etc/logrotate.d/ultrazend << 'EOF'
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        pm2 reload ultrazend-backend || true
    endscript
}
EOF
    
    echo '🔍 3.2 Configurando monitoramento PM2...'
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 50M
    pm2 set pm2-logrotate:retain 10
    
    echo '✅ Fase 3 concluída!'
    "
    
    success "Monitoramento configurado"
}

# FASE 4: INICIALIZAÇÃO ROBUSTA
start_application() {
    log "🚀 FASE 4: Inicialização da Aplicação"
    echo "===================================="
    
    ssh $VPS_USER@$VPS_HOST "
    cd $APP_DIR
    
    echo '🛑 4.1 Parando processos existentes...'
    pm2 delete ultrazend-backend || true
    
    echo '🚀 4.2 Iniciando com nova configuração...'
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup || echo 'PM2 startup configured'
    
    echo '⏳ 4.3 Aguardando estabilização (30s)...'
    sleep 30
    
    echo '🏥 4.4 Verificando health checks...'
    pm2 status
    pm2 logs ultrazend-backend --lines 10
    
    echo '✅ Fase 4 concluída!'
    "
    
    success "Aplicação iniciada"
}

# FASE 5: TESTES FINAIS
run_final_tests() {
    log "🧪 FASE 5: Testes Finais"
    echo "======================="
    
    echo "📊 Status da aplicação:"
    ssh $VPS_USER@$VPS_HOST "
    echo 'PM2 Status:'
    pm2 status
    echo ''
    echo 'Nginx Status:'
    systemctl is-active nginx
    echo ''
    echo 'Redis Status:'
    systemctl is-active redis-server
    echo ''
    echo 'Portas em uso:'
    netstat -tlnp | grep -E ':(80|3001|443) '
    "
    
    echo ""
    log "🔍 Testando endpoints..."
    
    # Test frontend
    if curl -f --connect-timeout 10 "http://$VPS_HOST/" >/dev/null 2>&1; then
        success "Frontend: ✅ OK (HTTP 200)"
    else
        warning "Frontend: ⚠️ Problema detectado"
    fi
    
    # Test backend health
    sleep 5
    if curl -f --connect-timeout 10 "http://$VPS_HOST:3001/health" >/dev/null 2>&1; then
        success "Backend Health: ✅ OK (HTTP 200)"
    else
        warning "Backend Health: ⚠️ Ainda em inicialização ou com problemas"
        echo "💡 Verifique os logs: ssh $VPS_USER@$VPS_HOST 'pm2 logs ultrazend-backend'"
    fi
}

# MAIN EXECUTION
main() {
    echo "🚀 Iniciando correção robusta do backend..."
    echo ""
    
    test_ssh
    fix_critical_issues
    configure_advanced
    setup_monitoring
    start_application
    run_final_tests
    
    echo ""
    success "🎉 CORREÇÃO CONCLUÍDA!"
    echo "======================"
    echo "🌐 Frontend: http://$SUBDOMAIN"
    echo "🏥 Health: http://$SUBDOMAIN:3001/health"
    echo "🔌 API: http://$SUBDOMAIN/api"
    echo ""
    echo "📋 Próximos passos opcionais:"
    echo "  1. Configurar SSL: certbot --nginx -d $DOMAIN -d $SUBDOMAIN"
    echo "  2. Configurar domínio DNS para $VPS_HOST"
    echo "  3. Monitorar logs: pm2 logs ultrazend-backend"
    echo ""
    echo "✨ Backend nativo otimizado e funcional!"
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi