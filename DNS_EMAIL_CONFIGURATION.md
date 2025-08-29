# 📧 Configuração DNS para Servidor de Email - UrbanMail

## 🎯 Domínio: www.urbanmail.com.br | VPS: 72.60.10.112

---

## 📋 REGISTROS DNS OBRIGATÓRIOS

### 1. **Registro A (Obrigatório)**
```
Tipo: A
Nome: @
Valor: 72.60.10.112
TTL: 300 (5 minutos)

Tipo: A  
Nome: www
Valor: 72.60.10.112
TTL: 300
```

### 2. **Registro MX (Email Server)**
```
Tipo: MX
Nome: @
Valor: mail.urbanmail.com.br
Prioridade: 10
TTL: 300

Tipo: A
Nome: mail
Valor: 72.60.10.112
TTL: 300
```

### 3. **Registros SPF (Anti-Spam)**
```
Tipo: TXT
Nome: @
Valor: "v=spf1 a mx ip4:72.60.10.112 ~all"
TTL: 300
```

### 4. **Registro DKIM (Assinatura Digital)**
```
Tipo: TXT
Nome: default._domainkey
Valor: "v=DKIM1; k=rsa; p=<CHAVE_PUBLICA_DKIM>"
TTL: 300
```

### 5. **Registro DMARC (Política de Email)**
```
Tipo: TXT
Nome: _dmarc
Valor: "v=DMARC1; p=quarantine; rua=mailto:dmarc@urbanmail.com.br"
TTL: 300
```

---

## 🔧 CONFIGURAÇÃO NO PAINEL DNS

### Para **Cloudflare**:
1. Acesse o painel Cloudflare
2. Selecione o domínio `urbanmail.com.br`
3. Vá em "DNS" > "Records"
4. Adicione os registros acima
5. **IMPORTANTE**: Desative o proxy (ícone nuvem cinza) para registros MX

### Para **cPanel/WHM**:
1. Acesse o DNS Zone Editor
2. Selecione o domínio
3. Adicione os registros conforme tabela acima

### Para **AWS Route 53**:
1. Acesse o Route 53 Console
2. Selecione a Hosted Zone do domínio
3. Crie os registros conforme especificado

---

## 🛠️ CONFIGURAÇÃO AUTOMÁTICA VIA API

### Script para Cloudflare API:
```bash
#!/bin/bash
# Cloudflare API Configuration

ZONE_ID="seu_zone_id_aqui"
API_TOKEN="seu_api_token_aqui"
VPS_IP="72.60.10.112"

# Criar registros A
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "@",
    "content": "'$VPS_IP'",
    "ttl": 300
  }'

# Criar registro MX
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "MX",
    "name": "@",
    "content": "mail.urbanmail.com.br",
    "priority": 10,
    "ttl": 300
  }'

# Criar registro SPF
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "TXT",
    "name": "@",
    "content": "v=spf1 a mx ip4:'$VPS_IP' ~all",
    "ttl": 300
  }'
```

---

## 📊 VERIFICAÇÃO DE CONFIGURAÇÃO

### 1. **Testar Resolução DNS**:
```bash
# Testar registro A
dig A www.urbanmail.com.br
dig A urbanmail.com.br

# Testar registro MX  
dig MX urbanmail.com.br

# Testar registros TXT (SPF/DMARC)
dig TXT urbanmail.com.br
dig TXT _dmarc.urbanmail.com.br
```

### 2. **Ferramentas Online**:
- **MXToolbox**: https://mxtoolbox.com/
- **DNS Checker**: https://dnschecker.org/
- **SPF Checker**: https://www.kitterman.com/spf/validate.html
- **DMARC Checker**: https://dmarc.org/dmarc-checker/

### 3. **Teste de Email**:
```bash
# Testar SMTP Server
telnet www.urbanmail.com.br 25

# Enviar email de teste
echo "Test email" | mail -s "Test" -r noreply@urbanmail.com.br test@gmail.com
```

---

## 🔐 CONFIGURAÇÃO DKIM

### Gerar Chaves DKIM no Servidor:
```bash
# No VPS, instalar OpenDKIM
apt-get install opendkim opendkim-tools

# Gerar chave privada
opendkim-genkey -t -s default -d urbanmail.com.br

# Visualizar chave pública para DNS
cat default.txt
```

### Exemplo de Saída:
```
default._domainkey.urbanmail.com.br. IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
```

---

## 🚨 PROBLEMAS COMUNS

### 1. **Email vai para SPAM**:
- ✅ Verificar se SPF está correto
- ✅ Configurar DKIM
- ✅ Implementar DMARC
- ✅ Configurar PTR record (reverse DNS)

### 2. **DNS não resolve**:
- ✅ Aguardar propagação (até 48h)
- ✅ Verificar TTL baixo (300s)
- ✅ Confirmar proxy desabilitado no MX

### 3. **SMTP não conecta**:
- ✅ Verificar firewall porta 25
- ✅ Confirmar serviço rodando
- ✅ Testar telnet para porta 25

---

## 📋 CHECKLIST DE CONFIGURAÇÃO

### Antes do Deploy:
- [ ] Domínio registrado e ativo
- [ ] DNS apontando para 72.60.10.112
- [ ] Registros MX configurados
- [ ] SPF configurado
- [ ] Firewall liberando portas 25 e 3010

### Após o Deploy:
- [ ] Aplicação acessível via www.urbanmail.com.br
- [ ] SMTP respondendo na porta 25
- [ ] Teste de envio de email funcionando
- [ ] Health check OK
- [ ] SSL/HTTPS configurado (opcional)

---

## 🎯 COMANDOS DE VERIFICAÇÃO

### No VPS:
```bash
# Verificar se aplicação está rodando
curl http://localhost:3010/health

# Testar SMTP local
telnet localhost 25

# Verificar logs
docker-compose logs -f

# Status do container
docker-compose ps
```

### Externamente:
```bash
# Testar aplicação
curl http://www.urbanmail.com.br/health

# Testar SMTP externo  
telnet www.urbanmail.com.br 25

# Verificar DNS
nslookup www.urbanmail.com.br
nslookup -q=mx urbanmail.com.br
```

---

## 🔧 CONFIGURAÇÕES AVANÇADAS

### Reverse DNS (PTR):
Configurar no provedor VPS para que 72.60.10.112 resolva para `mail.urbanmail.com.br`

### SSL/TLS para SMTP:
Configurar certificado SSL para SMTP seguro (porta 587/993)

### Rate Limiting:
Implementar rate limiting específico para SMTP

---

**✅ DNS e Email Server configurados para www.urbanmail.com.br na VPS 72.60.10.112:3010**