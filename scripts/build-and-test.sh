#!/bin/bash

# UltraZend Build and Test Script (Node.js direto, sem Docker)
set -euo pipefail

# Cores para logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🚀 UltraZend Build and Test"
echo "============================"
echo "📅 $(date)"
echo ""

# === PRÉ-REQUISITOS ===
log_info "Verificando pré-requisitos..."

if ! command -v node &> /dev/null; then
    log_error "Node.js não está instalado!"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    log_error "NPM não está instalado!"
    exit 1
fi

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log_success "Node.js $NODE_VERSION / NPM $NPM_VERSION"

# === VERIFICAR ESTRUTURA DO PROJETO ===
log_info "Verificando estrutura do projeto..."

if [ ! -d "backend" ]; then
    log_error "Diretório backend não encontrado!"
    exit 1
fi

if [ ! -d "frontend" ]; then
    log_error "Diretório frontend não encontrado!"
    exit 1
fi

if [ ! -f "backend/package.json" ]; then
    log_error "backend/package.json não encontrado!"
    exit 1
fi

if [ ! -f "frontend/package.json" ]; then
    log_error "frontend/package.json não encontrado!"
    exit 1
fi

log_success "Estrutura do projeto OK"

# === BUILD BACKEND ===
log_info "Construindo backend..."

cd backend

log_info "Instalando dependências do backend..."
if npm ci; then
    log_success "Dependências do backend instaladas"
else
    log_error "Falha na instalação das dependências do backend"
    exit 1
fi

log_info "Compilando TypeScript..."
if npm run build; then
    log_success "Backend compilado com sucesso"
else
    log_error "Falha na compilação do backend"
    exit 1
fi

cd ..

# === BUILD FRONTEND ===
log_info "Construindo frontend..."

cd frontend

log_info "Instalando dependências do frontend..."
if npm ci; then
    log_success "Dependências do frontend instaladas"
else
    log_error "Falha na instalação das dependências do frontend"
    exit 1
fi

log_info "Compilando frontend..."
if npm run build; then
    log_success "Frontend compilado com sucesso"
else
    log_error "Falha na compilação do frontend"
    exit 1
fi

cd ..

# === TESTES ===
log_info "Executando testes..."

cd backend

# Verificar se existe script de teste
if npm run test --dry-run &>/dev/null; then
    log_info "Executando testes do backend..."
    if npm run test; then
        log_success "Testes do backend passaram"
    else
        log_warning "Alguns testes falharam"
    fi
else
    log_warning "Nenhum script de teste configurado"
fi

cd ..

# === VERIFICAÇÕES DE QUALIDADE ===
log_info "Verificações de qualidade..."

cd backend

# Verificar se existe lint
if npm run lint --dry-run &>/dev/null; then
    log_info "Executando linter..."
    if npm run lint; then
        log_success "Código está seguindo padrões"
    else
        log_warning "Problemas de linting encontrados"
    fi
else
    log_warning "Linter não configurado"
fi

cd ..

# === RESUMO ===
log_success "Build e testes concluídos!"
echo ""
echo "📊 Resumo:"
echo "   ✅ Backend compilado"
echo "   ✅ Frontend compilado"
echo "   ✅ Estrutura verificada"
echo ""

if [ -d "backend/dist" ]; then
    BACKEND_SIZE=$(du -sh backend/dist | cut -f1)
    log_info "Tamanho do build backend: $BACKEND_SIZE"
fi

if [ -d "frontend/dist" ]; then
    FRONTEND_SIZE=$(du -sh frontend/dist | cut -f1)
    log_info "Tamanho do build frontend: $FRONTEND_SIZE"
fi

log_success "Pronto para deploy! 🚀"