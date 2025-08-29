#!/bin/bash

# 🔐 Script para Configurar Secrets no GitHub
# Repositório: https://github.com/fernandinhomartins40/urbansend/

echo "🔐 Setup GitHub Secrets for UrbanSend Deploy"
echo "============================================="
echo ""

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

# === INFORMAÇÕES ===
REPO_URL="https://github.com/fernandinhomartins40/urbansend/"
VPS_IP="72.60.10.112"
DOMAIN="www.urbanmail.com.br"

log_info "Repositório: $REPO_URL"
log_info "VPS IP: $VPS_IP"  
log_info "Domínio: $DOMAIN"
echo ""

# === VERIFICAR DEPENDÊNCIAS ===
log_info "Verificando dependências..."

if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI (gh) não está instalado!"
    echo "📥 Instale com: https://cli.github.com/"
    echo ""
    echo "Ubuntu/Debian:"
    echo "  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg"
    echo "  echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null"
    echo "  sudo apt update && sudo apt install gh"
    echo ""
    echo "macOS:"
    echo "  brew install gh"
    echo ""
    exit 1
fi

log_success "GitHub CLI encontrado"

# === LOGIN NO GITHUB ===
log_info "Verificando autenticação GitHub..."

if ! gh auth status &>/dev/null; then
    log_warning "Não está autenticado no GitHub"
    log_info "Execute: gh auth login"
    echo ""
    read -p "Deseja fazer login agora? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        gh auth login
    else
        log_error "Autenticação necessária para continuar"
        exit 1
    fi
fi

log_success "Autenticado no GitHub"

# === VERIFICAR REPOSITÓRIO ===
log_info "Verificando acesso ao repositório..."

if gh repo view fernandinhomartins40/urbansend &>/dev/null; then
    log_success "Acesso ao repositório confirmado"
else
    log_error "Sem acesso ao repositório fernandinhomartins40/urbansend"
    echo "Verifique se:"
    echo "1. O repositório existe"
    echo "2. Você tem permissões de admin/write"
    echo "3. Está autenticado corretamente"
    exit 1
fi

# === COLETAR SENHA VPS ===
echo ""
log_info "Configuração de Secrets necessária:"
echo ""
echo "📋 Secret necessário:"
echo "  - VPS_PASSWORD: Senha SSH da VPS $VPS_IP"
echo ""

log_warning "⚠️  A senha será armazenada de forma segura no GitHub Secrets"
log_warning "⚠️  Nunca compartilhe ou exponha esta informação"
echo ""

read -s -p "🔑 Digite a senha SSH da VPS ($VPS_IP): " VPS_PASSWORD
echo ""

if [ -z "$VPS_PASSWORD" ]; then
    log_error "Senha não pode estar vazia!"
    exit 1
fi

# === TESTAR CONECTIVIDADE VPS ===
log_info "Testando conectividade com VPS..."

if ping -c 1 $VPS_IP &> /dev/null; then
    log_success "VPS está acessível"
else
    log_error "VPS não está acessível via ping"
    echo "Verifique:"
    echo "1. Conexão com internet"
    echo "2. IP da VPS: $VPS_IP"
    echo "3. Firewall da VPS"
    exit 1
fi

# === TESTAR SSH (OPCIONAL) ===
if command -v sshpass &> /dev/null; then
    log_info "Testando conexão SSH..."
    
    if sshpass -p "$VPS_PASSWORD" ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$VPS_IP "echo 'SSH OK'" &>/dev/null; then
        log_success "Conexão SSH funcionando"
    else
        log_warning "Falha na conexão SSH - verifique senha e configurações"
        echo "⚠️  Continuando mesmo assim (pode ser configuração SSH)"
    fi
else
    log_info "sshpass não disponível - pulando teste SSH"
fi

# === CONFIGURAR SECRETS ===
log_info "Configurando secret no GitHub..."

# Configurar VPS_PASSWORD
if gh secret set VPS_PASSWORD --body "$VPS_PASSWORD" --repo fernandinhomartins40/urbansend; then
    log_success "Secret VPS_PASSWORD configurado"
else
    log_error "Falha ao configurar secret VPS_PASSWORD"
    exit 1
fi

# === VERIFICAR SECRETS CONFIGURADOS ===
log_info "Verificando secrets configurados..."

SECRETS=$(gh secret list --repo fernandinhomartins40/urbansend)
echo "$SECRETS"

if echo "$SECRETS" | grep -q "VPS_PASSWORD"; then
    log_success "Secret VPS_PASSWORD confirmado"
else
    log_error "Secret VPS_PASSWORD não encontrado"
    exit 1
fi

# === INFORMAÇÕES SOBRE WORKFLOW ===
echo ""
log_info "🚀 CONFIGURAÇÃO COMPLETA!"
echo ""
echo "📋 Secrets configurados:"
echo "  ✅ VPS_PASSWORD (senha SSH)"
echo ""
echo "📁 Workflows disponíveis:"
echo "  - .github/workflows/deploy.yml (Deploy produção)"
echo "  - .github/workflows/test-workflow.yml (Testes)"
echo ""
echo "🚀 Como usar:"
echo "  1. Push para branch 'main' ou 'production'"
echo "  2. Ou execute manualmente via GitHub Actions"
echo "  3. Workflow fará deploy automático para:"
echo "     - VPS: $VPS_IP:3010"
echo "     - Domínio: $DOMAIN"
echo ""
echo "🔗 Links úteis:"
echo "  - Repositório: $REPO_URL"
echo "  - Actions: ${REPO_URL}actions"
echo "  - Settings: ${REPO_URL}settings/secrets/actions"
echo ""

log_success "Setup concluído! 🎉"

# === PRÓXIMOS PASSOS ===
echo ""
log_info "📋 PRÓXIMOS PASSOS:"
echo ""
echo "1. 🌐 Configurar DNS:"
echo "   - Apontar $DOMAIN para $VPS_IP"
echo "   - Configurar registros MX, SPF, DKIM"
echo "   - Consultar: DNS_EMAIL_CONFIGURATION.md"
echo ""
echo "2. 🚀 Fazer primeiro deploy:"
echo "   - git add ."
echo "   - git commit -m 'feat: add CI/CD workflow'"
echo "   - git push origin main"
echo ""
echo "3. 🔍 Monitorar deploy:"
echo "   - Acessar: ${REPO_URL}actions"
echo "   - Acompanhar logs em tempo real"
echo ""
echo "4. ✅ Verificar resultado:"
echo "   - App: http://$DOMAIN"
echo "   - Health: http://$DOMAIN/health"
echo "   - SMTP: telnet $DOMAIN 25"
echo ""

log_success "Tudo pronto para deploy automático! 🚀"