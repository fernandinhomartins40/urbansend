#!/bin/bash

# 🚀 ULTRAZEND - Master Deployment Script
# Automatically chooses the right deployment strategy

set -euo pipefail

# Configuration
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
DEPLOY_PATH="/var/www/ultrazend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log() { echo -e "${BLUE}[DEPLOY] $1${NC}"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }
info() { echo -e "${PURPLE}[INFO] $1${NC}"; }

echo "🚀 ULTRAZEND - MASTER DEPLOYMENT"
echo "================================="
log "Servidor: $SERVER_HOST"
log "Analisando ambiente..."
echo ""

# Function to detect deployment type needed
detect_deployment_type() {
    # Check if server is accessible
    if ! ssh $SERVER_USER@$SERVER_HOST 'echo "test"' > /dev/null 2>&1; then
        error "❌ Não foi possível conectar ao servidor $SERVER_HOST"
    fi
    
    # Check if application directory exists
    if ssh $SERVER_USER@$SERVER_HOST "[ -d '$DEPLOY_PATH' ]" 2>/dev/null; then
        # Check if application is running
        if ssh $SERVER_USER@$SERVER_HOST 'pm2 jlist | jq -r ".[] | select(.name==\"ultrazend\") | .pm2_env.status"' 2>/dev/null | grep -q "online"; then
            echo "UPDATE"
        else
            echo "FRESH"
        fi
    else
        echo "FRESH"
    fi
}

# Function to show deployment options
show_menu() {
    echo "Escolha o tipo de deployment:"
    echo ""
    echo "1) 🆕 Fresh Install    - Servidor limpo (primeira instalação)"
    echo "2) 🔄 Update Deploy    - Atualizar aplicação existente" 
    echo "3) 🤖 Auto Detect      - Detectar automaticamente"
    echo "4) 🧪 Quick Start      - Setup completo automatizado"
    echo "5) ❌ Cancelar"
    echo ""
    read -p "Selecione uma opção (1-5): " choice
    
    case $choice in
        1) echo "FRESH" ;;
        2) echo "UPDATE" ;;
        3) echo "AUTO" ;;
        4) echo "QUICKSTART" ;;
        5) echo "CANCEL" ;;
        *) echo "INVALID" ;;
    esac
}

# Main deployment logic
main() {
    # Get deployment type
    if [ "${1:-}" ]; then
        deploy_type="$1"
    else
        deploy_type=$(show_menu)
    fi
    
    case $deploy_type in
        "AUTO")
            log "🤖 Detectando tipo de deployment automaticamente..."
            auto_type=$(detect_deployment_type)
            info "Tipo detectado: $auto_type"
            deploy_type="$auto_type"
            ;;
        "CANCEL")
            log "Deploy cancelado pelo usuário"
            exit 0
            ;;
        "INVALID")
            error "Opção inválida selecionada"
            ;;
    esac
    
    # Pre-flight checks
    log "🔍 Executando verificações pré-deploy..."
    
    # Check required scripts exist
    case $deploy_type in
        "FRESH")
            [ ! -f "deploy-fresh-server.sh" ] && error "Script deploy-fresh-server.sh não encontrado"
            script_to_run="deploy-fresh-server.sh"
            ;;
        "UPDATE")
            [ ! -f "deploy-update.sh" ] && error "Script deploy-update.sh não encontrado"
            script_to_run="deploy-update.sh"
            ;;
        "QUICKSTART")
            [ ! -f "quick-start.sh" ] && error "Script quick-start.sh não encontrado"
            script_to_run="quick-start.sh"
            ;;
        *)
            error "Tipo de deploy inválido: $deploy_type"
            ;;
    esac
    
    # Check local builds exist
    log "Verificando builds locais..."
    local need_build=false
    
    if [ ! -f "backend/dist/index.js" ]; then
        warning "Build do backend não encontrado"
        need_build=true
    fi
    
    if [ ! -d "frontend/dist" ] || [ ! -f "frontend/dist/index.html" ]; then
        warning "Build do frontend não encontrado"
        need_build=true
    fi
    
    if [ "$need_build" = true ]; then
        log "🔨 Executando builds necessários..."
        
        if [ ! -f "backend/dist/index.js" ]; then
            log "Building backend..."
            cd backend && npm run build && cd ..
            success "✅ Backend build concluído"
        fi
        
        if [ ! -d "frontend/dist" ] || [ ! -f "frontend/dist/index.html" ]; then
            log "Building frontend..."
            cd frontend && npm run build && cd ..
            success "✅ Frontend build concluído"
        fi
    else
        success "✅ Builds locais já estão prontos"
    fi
    
    # Show deployment summary
    echo ""
    info "📋 RESUMO DO DEPLOYMENT:"
    info "   Tipo: $deploy_type"
    info "   Script: $script_to_run"
    info "   Servidor: $SERVER_HOST"
    info "   Timestamp: $(date)"
    echo ""
    
    # Confirm deployment
    if [ "${2:-}" != "--auto" ]; then
        read -p "🚀 Confirma o deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Deploy cancelado pelo usuário"
            exit 0
        fi
    fi
    
    # Execute deployment
    log "🚀 Iniciando deployment..."
    echo ""
    
    # Make script executable and run it
    chmod +x "$script_to_run"
    ./"$script_to_run"
    
    # Post-deployment summary
    echo ""
    success "🎉 DEPLOYMENT MASTER CONCLUÍDO!"
    echo "=============================="
    success "✅ Script executado: $script_to_run"
    success "✅ Tipo de deployment: $deploy_type"
    
    # Final verification
    log "🔍 Verificação final..."
    if curl -f -s -m 10 "https://www.ultrazend.com.br/health" > /dev/null 2>&1; then
        success "✅ Aplicação acessível externamente"
    elif ssh $SERVER_USER@$SERVER_HOST 'curl -f -s -m 5 http://localhost:3001/health > /dev/null' 2>/dev/null; then
        warning "⚠️ Aplicação funcionando localmente, mas acesso externo pode estar com problemas"
    else
        warning "⚠️ Verificação de acesso falhou - verifique manualmente"
    fi
    
    echo ""
    info "🌐 URLs da aplicação:"
    info "   Website: https://www.ultrazend.com.br"
    info "   Health: https://www.ultrazend.com.br/health"
    info "   API: https://www.ultrazend.com.br/api"
    echo ""
    
    info "💡 COMANDOS ÚTEIS:"
    info "   Status: ssh $SERVER_USER@$SERVER_HOST 'pm2 status'"
    info "   Logs: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs ultrazend'"
    info "   Restart: ssh $SERVER_USER@$SERVER_HOST 'pm2 restart ultrazend'"
    echo ""
    
    log "🎯 Deployment master finalizado!"
}

# Help function
show_help() {
    echo "ULTRAZEND - Master Deployment Script"
    echo ""
    echo "Usage: $0 [TYPE] [OPTIONS]"
    echo ""
    echo "TIPOS DE DEPLOYMENT:"
    echo "  FRESH       Instalação completa em servidor limpo"
    echo "  UPDATE      Atualização de aplicação existente"
    echo "  AUTO        Detecta automaticamente o tipo necessário"
    echo "  QUICKSTART  Setup completo automatizado"
    echo ""
    echo "OPTIONS:"
    echo "  --auto      Executa sem confirmação interativa"
    echo "  --help      Mostra esta ajuda"
    echo ""
    echo "EXEMPLOS:"
    echo "  $0                    # Menu interativo"
    echo "  $0 FRESH              # Instalação em servidor limpo"
    echo "  $0 UPDATE             # Atualizar aplicação existente"
    echo "  $0 AUTO               # Detecção automática"
    echo "  $0 FRESH --auto       # Instalação sem confirmação"
    echo ""
}

# Parse arguments
case "${1:-}" in
    "--help"|"-h"|"help")
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac