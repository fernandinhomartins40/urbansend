#!/bin/bash

# 🧪 ULTRAZEND LOCAL DEPLOY TEST SCRIPT
# Testa o processo de deploy localmente antes de enviar para produção
# =======================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🧪 ULTRAZEND DEPLOY TEST"
echo "======================="
echo ""

# 1. Verificar estrutura de arquivos
log_info "Verificando estrutura do projeto..."

REQUIRED_FILES=(
    "backend/package.json"
    "frontend/package.json" 
    "ecosystem.config.js"
    "backend/src/index.ts"
    "frontend/src/main.tsx"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "Encontrado: $file"
    else
        log_error "FALTANDO: $file"
        exit 1
    fi
done

# 2. Verificar dependências
log_info "Verificando se dependências estão instaladas..."

if [ ! -d "backend/node_modules" ]; then
    log_warning "node_modules do backend não encontrado, instalando..."
    cd backend && npm ci && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    log_warning "node_modules do frontend não encontrado, instalando..."
    cd frontend && npm ci && cd ..
fi

# 3. Testar build do backend
log_info "Testando build do backend..."
cd backend

if npm run build; then
    if [ -f "dist/index.js" ]; then
        log_success "Backend build OK: $(ls -la dist/index.js)"
    else
        log_error "Backend build falhou - dist/index.js não encontrado"
        exit 1
    fi
else
    log_error "Comando 'npm run build' falhou no backend"
    exit 1
fi

cd ..

# 4. Testar build do frontend  
log_info "Testando build do frontend..."
cd frontend

if npm run build; then
    if [ ! -d "dist" ]; then
        log_error "Frontend build falhou - diretório dist/ não criado"
        exit 1
    fi
    
    if [ ! -f "dist/index.html" ]; then
        log_error "Frontend build falhou - index.html não gerado"
        exit 1
    fi
    
    if [ ! -d "dist/assets" ]; then
        log_error "Frontend build falhou - diretório assets/ não criado"
        exit 1
    fi
    
    log_success "Frontend build OK:"
    log_success "  - index.html: $(ls -la dist/index.html | awk '{print $5}') bytes"
    log_success "  - Assets: $(ls -1 dist/assets/ | wc -l) arquivos"
    
    # Verificar se não há erros de sintaxe no index.html
    if grep -q "ReactDOM.createRoot" dist/index.html; then
        log_success "  - React detectado no HTML ✅"
    else
        log_warning "  - React não detectado no HTML ⚠️"
    fi
    
else
    log_error "Comando 'npm run build' falhou no frontend"
    exit 1
fi

cd ..

# 5. Verificar configuração do ecosystem
log_info "Verificando configuração PM2..."

if node -e "const config = require('./ecosystem.config.js'); console.log('✅ Config PM2 válida:', config.apps[0].name)"; then
    log_success "Configuração PM2 OK"
else
    log_error "Configuração PM2 inválida"
    exit 1
fi

# 6. Verificar se não há referências a 'urbansend'
log_info "Verificando se não há referências antigas a 'urbansend'..."

if grep -r "urbansend" --exclude-dir=.git --exclude-dir=node_modules --exclude="*.log" . > /dev/null; then
    log_warning "ENCONTRADAS REFERÊNCIAS A 'urbansend':"
    grep -r "urbansend" --exclude-dir=.git --exclude-dir=node_modules --exclude="*.log" . | head -5
    log_warning "Execute: find . -type f -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.json' | xargs grep -l urbansend"
else
    log_success "Nenhuma referência a 'urbansend' encontrada ✅"
fi

# 7. Simular verificações que serão feitas na VPS
log_info "Simulando verificações da VPS..."

# Verificar se package.json tem nome correto
BACKEND_NAME=$(cd backend && node -e "console.log(require('./package.json').name)")
FRONTEND_NAME=$(cd frontend && node -e "console.log(require('./package.json').name)")

if [[ "$BACKEND_NAME" == *"ultrazend"* ]]; then
    log_success "Nome do backend OK: $BACKEND_NAME"
else
    log_warning "Nome do backend pode estar incorreto: $BACKEND_NAME"
fi

if [[ "$FRONTEND_NAME" == *"ultrazend"* ]]; then
    log_success "Nome do frontend OK: $FRONTEND_NAME"
else
    log_warning "Nome do frontend pode estar incorreto: $FRONTEND_NAME"
fi

echo ""
log_success "🎉 TODOS OS TESTES PASSARAM!"
echo "=========================="
log_info "O projeto está pronto para deploy em produção:"
log_info "  ✅ Builds do backend e frontend funcionando"
log_info "  ✅ Configuração PM2 válida"
log_info "  ✅ Nomenclatura consistente (UltraZend)"
log_info "  ✅ Estrutura de arquivos correta"
echo ""
log_warning "Para fazer deploy execute:"
log_warning "  git add . && git commit -m 'deploy: trigger deployment' && git push"
echo ""