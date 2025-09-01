#!/bin/bash

# 📧 Email Delivery Test Script for UltraZend
# Testa delivery de emails através do servidor SMTP

set -e

SMTP_HOST="${1:-localhost}"
SMTP_PORT="${2:-25}"
TEST_RECIPIENT="${3:-test@example.com}"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$*"
    
    case $level in
        "INFO")  echo -e "${GREEN}✅ ${message}${NC}" ;;
        "WARN")  echo -e "${YELLOW}⚠️  ${message}${NC}" ;;
        "ERROR") echo -e "${RED}❌ ${message}${NC}" ;;
        "DEBUG") echo -e "${BLUE}🔍 ${message}${NC}" ;;
    esac
}

test_smtp_connection() {
    log "INFO" "Testando conexão SMTP em ${SMTP_HOST}:${SMTP_PORT}..."
    
    if ! command -v nc >/dev/null 2>&1; then
        log "ERROR" "Netcat não encontrado. Instale netcat-openbsd."
        return 1
    fi
    
    if nc -z "$SMTP_HOST" "$SMTP_PORT" -w 5; then
        log "INFO" "Conexão SMTP estabelecida com sucesso"
        return 0
    else
        log "ERROR" "Falha ao conectar com $SMTP_HOST:$SMTP_PORT"
        return 1
    fi
}

send_test_email() {
    log "INFO" "Enviando email de teste para $TEST_RECIPIENT..."
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local message_id="test-$(date +%s)@ultrazend.test"
    
    # Criar email de teste
    local email_content=$(cat << EOF
EHLO ultrazend.test
MAIL FROM:<test@ultrazend.com.br>
RCPT TO:<$TEST_RECIPIENT>
DATA
From: UltraZend Test <test@ultrazend.com.br>
To: <$TEST_RECIPIENT>
Subject: Teste de Delivery UltraZend - $timestamp
Message-ID: <$message_id>
Date: $(date -R)
Content-Type: text/plain; charset=UTF-8

Olá!

Este é um email de teste gerado automaticamente pelo sistema UltraZend SMTP.

Informações do teste:
- Horário: $timestamp
- Servidor: $SMTP_HOST:$SMTP_PORT
- Message-ID: $message_id

Se você recebeu este email, significa que o servidor SMTP está funcionando corretamente!

--
UltraZend SMTP Server
https://ultrazend.com.br
.
QUIT
EOF
)

    # Enviar via netcat
    if echo "$email_content" | nc "$SMTP_HOST" "$SMTP_PORT" -w 30; then
        log "INFO" "Email de teste enviado com sucesso"
        log "INFO" "Message-ID: $message_id"
        return 0
    else
        log "ERROR" "Falha ao enviar email de teste"
        return 1
    fi
}

test_api_endpoint() {
    log "INFO" "Testando endpoint da API..."
    
    local api_url="http://localhost:3001/api/emails/send"
    local test_payload=$(cat << EOF
{
  "to": "$TEST_RECIPIENT",
  "from": "test@ultrazend.com.br",
  "subject": "Teste API UltraZend - $(date '+%Y-%m-%d %H:%M:%S')",
  "html": "<h1>Teste API</h1><p>Este email foi enviado via API REST do UltraZend.</p>",
  "text": "Teste API\n\nEste email foi enviado via API REST do UltraZend."
}
EOF
)

    if command -v curl >/dev/null 2>&1; then
        local response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
            -H "Content-Type: application/json" \
            -X POST \
            -d "$test_payload" \
            "$api_url")
        
        local http_code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
        local body=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')
        
        if [[ "$http_code" == "200" ]] || [[ "$http_code" == "202" ]]; then
            log "INFO" "API endpoint respondeu corretamente (HTTP $http_code)"
            log "DEBUG" "Resposta: $body"
            return 0
        else
            log "ERROR" "API endpoint retornou erro (HTTP $http_code)"
            log "DEBUG" "Resposta: $body"
            return 1
        fi
    else
        log "WARN" "cURL não encontrado. Pulando teste de API."
        return 0
    fi
}

main() {
    echo "📧 Teste de Delivery de Email - UltraZend SMTP"
    echo "=============================================="
    echo "Servidor: $SMTP_HOST:$SMTP_PORT"
    echo "Destinatário: $TEST_RECIPIENT"
    echo ""
    
    local tests_passed=0
    local total_tests=3
    
    # Teste 1: Conexão SMTP
    if test_smtp_connection; then
        ((tests_passed++))
    fi
    
    echo ""
    
    # Teste 2: Envio direto via SMTP
    if send_test_email; then
        ((tests_passed++))
    fi
    
    echo ""
    
    # Teste 3: API endpoint
    if test_api_endpoint; then
        ((tests_passed++))
    fi
    
    echo ""
    echo "=============================================="
    
    if [[ $tests_passed -eq $total_tests ]]; then
        log "INFO" "🎉 Todos os testes passaram! ($tests_passed/$total_tests)"
        log "INFO" "Servidor SMTP está funcionando corretamente"
    elif [[ $tests_passed -gt 0 ]]; then
        log "WARN" "⚠️ Testes parciais ($tests_passed/$total_tests)"
        log "WARN" "Verifique os logs para detalhes dos testes que falharam"
    else
        log "ERROR" "❌ Todos os testes falharam"
        log "ERROR" "Verifique a configuração do servidor SMTP"
    fi
    
    echo ""
    log "INFO" "Verifique se o email chegou na caixa de entrada de $TEST_RECIPIENT"
    log "INFO" "Nota: Pode levar alguns minutos para o email chegar"
}

# Mostrar uso se argumentos estiverem incorretos
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    echo "Uso: $0 [SMTP_HOST] [SMTP_PORT] [TEST_RECIPIENT]"
    echo ""
    echo "Parâmetros:"
    echo "  SMTP_HOST       - Servidor SMTP (padrão: localhost)"
    echo "  SMTP_PORT       - Porta SMTP (padrão: 25)"
    echo "  TEST_RECIPIENT  - Email de destino para teste (padrão: test@example.com)"
    echo ""
    echo "Exemplos:"
    echo "  $0"
    echo "  $0 mail.ultrazend.com.br 25 admin@ultrazend.com.br"
    echo "  $0 localhost 587 test@gmail.com"
    exit 0
fi

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi