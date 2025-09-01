#!/bin/bash

# ========================================
# SCRIPT DE VERIFICAÇÃO DNS - ULTRAZEND
# ========================================

set -e

DOMAIN="ultrazend.com.br"
MAIL_SERVER="mail.ultrazend.com.br"

echo "🔍 Verificando configuração DNS para SMTP do UltraZend..."
echo "=================================================="

# Função para verificar DNS com timeout
check_dns() {
    local query_type=$1
    local domain=$2
    local expected=$3
    
    echo -n "Verificando $query_type para $domain... "
    
    result=$(dig +short +time=10 +tries=3 $query_type $domain 2>/dev/null || echo "FALHA")
    
    if [[ "$result" == "FALHA" || -z "$result" ]]; then
        echo "❌ FALHA"
        return 1
    else
        echo "✅ $result"
        if [[ -n "$expected" && "$result" != *"$expected"* ]]; then
            echo "   ⚠️  Valor esperado: $expected"
        fi
        return 0
    fi
}

# Verificações DNS essenciais
echo ""
echo "📧 Verificando MX Records:"
check_dns "MX" $DOMAIN $MAIL_SERVER

echo ""
echo "🌐 Verificando A Records:"
check_dns "A" $MAIL_SERVER

echo ""
echo "📝 Verificando SPF Record:"
check_dns "TXT" $DOMAIN "v=spf1"

echo ""
echo "🔐 Verificando DKIM Record:"
check_dns "TXT" "default._domainkey.$DOMAIN" "v=DKIM1"

echo ""
echo "🛡️ Verificando DMARC Record:"
check_dns "TXT" "_dmarc.$DOMAIN" "v=DMARC1"

echo ""
echo "🔄 Verificando DNS Reverso:"
# Obter IP do servidor de email
MAIL_IP=$(dig +short A $MAIL_SERVER 2>/dev/null || nslookup $MAIL_SERVER | grep "Address" | tail -1 | cut -d' ' -f2 || echo "")
if [[ -n "$MAIL_IP" && "$MAIL_IP" != "FALHA" ]]; then
    echo -n "Verificando PTR para $MAIL_IP... "
    ptr_result=$(dig +short -x $MAIL_IP 2>/dev/null || echo "FALHA")
    if [[ "$ptr_result" == "FALHA" || -z "$ptr_result" ]]; then
        echo "❌ FALHA"
    else
        echo "✅ $ptr_result"
    fi
else
    echo "❌ Não foi possível obter IP do servidor de email"
fi

echo ""
echo "🔧 Verificando conectividade SMTP:"
check_smtp_ports() {
    local host=$1
    local port=$2
    local service=$3
    
    echo -n "Testando $service (porta $port)... "
    if timeout 10 nc -z $host $port 2>/dev/null; then
        echo "✅ ABERTA"
    else
        echo "❌ FECHADA/FILTRADA"
    fi
}

if [[ -n "$MAIL_IP" && "$MAIL_IP" != "FALHA" ]]; then
    check_smtp_ports $MAIL_SERVER 25 "MX Server"
    check_smtp_ports $MAIL_SERVER 587 "Submission Server"
    check_smtp_ports $MAIL_SERVER 465 "SMTPS Server"
else
    echo "❌ Não foi possível testar portas SMTP (IP não encontrado)"
fi

echo ""
echo "📊 Verificando reputação do servidor:"
if [[ -n "$MAIL_IP" && "$MAIL_IP" != "FALHA" ]]; then
    echo "🔍 Verificando blacklists para IP: $MAIL_IP"
    
    # Lista de blacklists populares
    blacklists=(
        "zen.spamhaus.org"
        "bl.spamcop.net" 
        "dnsbl.sorbs.net"
        "psbl.surriel.com"
        "spam.dnsbl.anonmails.de"
    )
    
    for bl in "${blacklists[@]}"; do
        reversed_ip=$(echo $MAIL_IP | awk -F. '{print $4"."$3"."$2"."$1}')
        echo -n "  Verificando $bl... "
        
        if dig +short +time=5 $reversed_ip.$bl A 2>/dev/null | grep -q "^127\."; then
            echo "❌ LISTADO"
        else
            echo "✅ LIMPO"
        fi
    done
else
    echo "❌ Não foi possível verificar reputação (IP não encontrado)"
fi

echo ""
echo "🎯 Verificando configurações de segurança:"

# Verificar se TLS está configurado
echo -n "Testando STARTTLS na porta 587... "
if timeout 10 openssl s_client -connect $MAIL_SERVER:587 -starttls smtp -quiet < /dev/null 2>/dev/null | grep -q "CONNECTED"; then
    echo "✅ STARTTLS FUNCIONAL"
else
    echo "❌ STARTTLS NÃO FUNCIONA"
fi

echo ""
echo "=================================================="
echo "✅ Verificação DNS completa!"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo "1. Corrigir qualquer item marcado com ❌"
echo "2. Aguardar propagação DNS (até 48h)"
echo "3. Re-executar este script para confirmar"
echo "4. Testar envio de email real"
echo ""
echo "💡 DICA: Para melhor deliverability:"
echo "- Configure DNS reverso (PTR) com seu provedor"
echo "- Monitore reputação IP regularmente"  
echo "- Mantenha volumes de email consistentes"
echo "=================================================="