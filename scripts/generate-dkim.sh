#!/bin/bash

# 🔐 DKIM Key Generation Script for UltraZend
# Gera chaves DKIM para assinatura de emails

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERT_DIR="${PROJECT_DIR}/certificates"
ENV_FILE="${PROJECT_DIR}/.env.production"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$*"
    
    case $level in
        "INFO")  echo -e "${GREEN}✅ ${message}${NC}" ;;
        "WARN")  echo -e "${YELLOW}⚠️  ${message}${NC}" ;;
        "ERROR") echo -e "${RED}❌ ${message}${NC}" ;;
    esac
}

# Criar diretório de certificados
mkdir -p "$CERT_DIR"

# Verificar se OpenSSL está instalado
if ! command -v openssl >/dev/null 2>&1; then
    log "ERROR" "OpenSSL não encontrado. Instale o OpenSSL primeiro."
    exit 1
fi

# Carregar configurações se existir
DOMAIN="ultrazend.com.br"
SELECTOR="default"

if [[ -f "$ENV_FILE" ]]; then
    source "$ENV_FILE"
    if [[ -n "$DKIM_DOMAIN" ]]; then
        DOMAIN="$DKIM_DOMAIN"
    fi
    if [[ -n "$DKIM_SELECTOR" ]]; then
        SELECTOR="$DKIM_SELECTOR"
    fi
fi

log "INFO" "Gerando chaves DKIM para o domínio: $DOMAIN"
log "INFO" "Seletor DKIM: $SELECTOR"

# Gerar chave privada DKIM (2048 bits)
PRIVATE_KEY_FILE="${CERT_DIR}/dkim-private.key"
PUBLIC_KEY_FILE="${CERT_DIR}/dkim-public.key"
DNS_RECORD_FILE="${CERT_DIR}/dkim-dns-record.txt"

log "INFO" "Gerando chave privada DKIM..."
openssl genrsa -out "$PRIVATE_KEY_FILE" 2048

# Extrair chave pública
log "INFO" "Extraindo chave pública..."
openssl rsa -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE"

# Gerar registro DNS
log "INFO" "Gerando registro DNS..."

# Extrair chave pública em formato base64 para DNS
PUBLIC_KEY_B64=$(openssl rsa -in "$PRIVATE_KEY_FILE" -pubout -outform DER 2>/dev/null | openssl base64 -A)

# Criar registro DNS DKIM
cat > "$DNS_RECORD_FILE" << EOF
# Registro DKIM DNS para $DOMAIN
# Adicione este registro TXT no seu DNS:

Nome: ${SELECTOR}._domainkey.${DOMAIN}
Tipo: TXT
Valor: "v=DKIM1; k=rsa; t=s; p=${PUBLIC_KEY_B64}"

# Registro completo:
${SELECTOR}._domainkey.${DOMAIN}. IN TXT "v=DKIM1; k=rsa; t=s; p=${PUBLIC_KEY_B64}"

# Explicação dos parâmetros:
# v=DKIM1    - Versão do DKIM
# k=rsa      - Tipo de chave (RSA)
# t=s        - Modo de teste (remova em produção)
# p=...      - Chave pública em base64
EOF

# Configurar permissões seguras
chmod 600 "$PRIVATE_KEY_FILE"
chmod 644 "$PUBLIC_KEY_FILE"
chmod 644 "$DNS_RECORD_FILE"

log "INFO" "✅ Chaves DKIM geradas com sucesso!"
echo ""
echo "📁 Arquivos gerados:"
echo "  • Chave privada: $PRIVATE_KEY_FILE"
echo "  • Chave pública: $PUBLIC_KEY_FILE"  
echo "  • Registro DNS: $DNS_RECORD_FILE"
echo ""
log "WARN" "⚠️  IMPORTANTE:"
echo "  1. Mantenha a chave privada segura e nunca a compartilhe"
echo "  2. Adicione o registro DNS antes de ativar a assinatura DKIM"
echo "  3. Teste a configuração DNS com: dig TXT ${SELECTOR}._domainkey.${DOMAIN}"
echo "  4. Remova 't=s' do registro DNS quando estiver em produção"
echo ""
echo "📋 Registro DNS a ser adicionado:"
cat "$DNS_RECORD_FILE"
echo ""
log "INFO" "Para testar a configuração DNS após adicionar o registro:"
echo "  dig TXT ${SELECTOR}._domainkey.${DOMAIN}"
echo "  nslookup -type=TXT ${SELECTOR}._domainkey.${DOMAIN}"