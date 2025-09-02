#!/bin/bash

# 🚀 ULTRAZEND - Deploy Master Script
# Script unificado e inteligente para deploy em produção
# Versão: 3.0.0 - LIMPO E ORGANIZADO

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
NC='\033[0m'

# Logging
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }

# Show usage
show_usage() {
    echo "🚀 ULTRAZEND Deploy Master - Docker Only"
    echo "======================================="
    echo "Usage: ./deploy.sh [OPTIONS]"
    echo ""
    echo "OPTIONS:"
    echo "  --fresh  - Fresh server setup + deploy"
    echo "  --auto   - Skip confirmations"
    echo "  --help   - Show this help"
    echo ""
    echo "EXAMPLES:"
    echo "  ./deploy.sh              # Standard Docker deploy"
    echo "  ./deploy.sh --auto       # Deploy without confirmation"
    echo "  ./deploy.sh --fresh      # Setup clean server + deploy"
    echo ""
    echo "🐳 Uses Docker exclusively (no PM2 complexity!)"
    echo ""
}

# Docker-only deployment (no method detection needed)
prepare_docker_environment() {
    log "🐳 Preparing Docker environment..."
    
    # Always use Docker - no more PM2 complexity!
    log "Using Docker exclusively for reliable deployment"
}

# Validate prerequisites
validate_prereqs() {
    log "🔍 Validating prerequisites..."
    
    # Check local files
    [ ! -d "backend" ] && error "Backend directory not found"
    [ ! -d "frontend" ] && error "Frontend directory not found"
    [ ! -f "backend/package.json" ] && error "Backend package.json not found"
    [ ! -f "frontend/package.json" ] && error "Frontend package.json not found"
    
    # Check Docker configuration files
    [ ! -f "docker-compose.prod.yml" ] && error "docker-compose.prod.yml not found"
    [ ! -f "backend/Dockerfile" ] && error "backend/Dockerfile not found"
    
    # Check .env files
    if [ ! -f "configs/.env.production" ] && [ ! -f "backend/.env.production.deploy" ]; then
        error "No production .env file found"
    fi
    
    # Test SSH connection
    if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST 'echo "SSH OK"' >/dev/null 2>&1; then
        error "SSH connection failed to $SERVER_HOST"
    fi
    
    success "Prerequisites validated"
}

# Build applications locally
build_apps() {
    log "🏗️ Building applications..."
    
    # Backend build
    log "Building backend..."
    cd backend
    npm ci
    npm run build
    [ ! -f "dist/index.js" ] && error "Backend build failed"
    cd ..
    
    # Frontend build
    log "Building frontend..."
    cd frontend
    npm ci
    npm run build
    [ ! -d "dist" ] && error "Frontend build failed"
    cd ..
    
    success "Applications built successfully"
}

# Transfer files to server
transfer_files() {
    log "📤 Transferring files to server..."
    
    rsync -avz --progress \
        --exclude='node_modules/' \
        --exclude='*.log' \
        --exclude='.git/' \
        --exclude='coverage/' \
        --exclude='__tests__/' \
        -e "ssh -o StrictHostKeyChecking=no" \
        ./ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/
    
    success "Files transferred"
}

# Deploy with Docker (only method)
deploy_application() {
    log "🐳 Deploying with Docker..."
    
    ssh $SERVER_USER@$SERVER_HOST << 'EOFDOCKER'
cd /var/www/ultrazend

# Install Docker if needed
if ! command -v docker >/dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker && systemctl enable docker
fi

if ! command -v docker-compose >/dev/null; then
    echo "📦 Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# REMOVE PM2 completely (no more PM2!)
echo "🗑️ Removing PM2 completely..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true
# Optionally uninstall PM2 completely
npm uninstall -g pm2 2>/dev/null || true

# Configure .env
if [ ! -f "backend/.env" ]; then
    if [ -f "configs/.env.production" ]; then
        cp configs/.env.production backend/.env
    elif [ -f "backend/.env.production.deploy" ]; then
        cp backend/.env.production.deploy backend/.env
    fi
fi

# Deploy with Docker (clean and reliable)
echo "🐳 Starting Docker deployment..."
docker-compose -f docker-compose.prod.yml down --remove-orphans --volumes || true
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

echo "✅ Docker deployment completed successfully"
EOFDOCKER

    success "Docker deployment completed - PM2 eliminated!"
}


# Fresh server setup (Docker-focused)
setup_fresh_server() {
    log "🆕 Setting up fresh server for Docker deployment..."
    
    ssh $SERVER_USER@$SERVER_HOST << 'EOFFRESH'
# Update system
echo "📦 Updating system..."
apt-get update && apt-get upgrade -y

# Install essential packages (Docker-focused)
echo "📦 Installing essential packages..."
apt-get install -y curl wget git nginx sqlite3 ufw jq

# Install Docker immediately 
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl start docker && systemctl enable docker

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Configure firewall
echo "🔒 Configuring firewall..."
ufw --force enable
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 25    # SMTP
ufw allow 587   # SMTP Submission

# Create directories
echo "📁 Creating application directories..."
mkdir -p /var/www/ultrazend/{data,logs,uploads,certificates}
mkdir -p /var/backups/ultrazend

# Remove any PM2 installation (clean start)
echo "🗑️ Ensuring no PM2 remnants..."
npm uninstall -g pm2 2>/dev/null || true
pm2 kill 2>/dev/null || true

echo "✅ Fresh Docker-ready server setup completed"
EOFFRESH

    success "Fresh server setup completed - Docker ready!"
    
    # Continue with Docker deployment only
    deploy_application
}

# Health checks
health_checks() {
    log "🏥 Running health checks..."
    
    sleep 15  # Wait for services to start
    
    # Check API endpoint
    if ssh $SERVER_USER@$SERVER_HOST 'curl -sf -m 10 http://localhost:3001/health >/dev/null'; then
        success "API health check passed"
        return 0
    else
        warning "API health check failed"
        return 1
    fi
}

# Main deployment logic
main() {
    # Parse arguments
    AUTO_MODE=false
    FRESH_SETUP=false
    
    while [ $# -gt 0 ]; do
        case "$1" in
            "--help"|"-h"|"help")
                show_usage
                exit 0
                ;;
            "--fresh")
                FRESH_SETUP=true
                ;;
            "--auto")
                AUTO_MODE=true
                ;;
            *)
                error "Opção desconhecida: $1. Use --help para ajuda."
                ;;
        esac
        shift
    done
    
    echo "🚀 ULTRAZEND DEPLOY MASTER - DOCKER ONLY"
    echo "========================================"
    log "Servidor: $SERVER_HOST"
    log "Modo automático: $AUTO_MODE"
    log "Setup limpo: $FRESH_SETUP"
    echo ""
    
    # Confirmation (unless auto mode)
    if [ "$AUTO_MODE" = "false" ]; then
        echo "🐳 Deploy Docker para servidor de produção: $SERVER_HOST"
        read -p "Continuar? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Deploy cancelado"
            exit 0
        fi
    fi
    
    # Execute deployment steps
    prepare_docker_environment
    validate_prereqs
    build_apps
    transfer_files
    
    # Fresh setup ou deploy normal
    if [ "$FRESH_SETUP" = "true" ]; then
        setup_fresh_server
    else
        deploy_application
    fi
    
    # Final health check
    if health_checks; then
        success "🎉 DEPLOY DOCKER REALIZADO COM SUCESSO!"
        echo ""
        log "URLs de produção:"
        log "  • Website: https://www.ultrazend.com.br"
        log "  • API: https://www.ultrazend.com.br/api"  
        log "  • Health: https://www.ultrazend.com.br/health"
        log ""
        log "🐳 PM2 totalmente eliminado - Usando Docker exclusivamente!"
    else
        warning "⚠️ Deploy concluído mas health checks falharam"
        log "Verifique os logs do servidor"
    fi
}

# Run main function
main "$@"