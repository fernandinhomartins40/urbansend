# 🛠️ GUIA DE TROUBLESHOOTING - ULTRAZEND
## Diagnóstico e Solução de Problemas

### **Versão**: 2.0.0 - FASE 7 IMPLEMENTAÇÃO COMPLETA
### **Última Atualização**: 01/09/2025

---

## 📋 **ÍNDICE**

1. [Problemas Comuns](#-problemas-comuns)
2. [Diagnóstico Rápido](#-diagnóstico-rápido)
3. [Logs e Monitoramento](#-logs-e-monitoramento)
4. [Performance](#-performance)
5. [Segurança](#-segurança)
6. [Rede e DNS](#-rede-e-dns)
7. [Base de Dados](#-base-de-dados)
8. [Comandos Úteis](#-comandos-úteis)
9. [Escalação](#-escalação)

---

## 🚨 **PROBLEMAS COMUNS**

### **1. SMTP Não Aceita Conexões**

**Sintomas:**
- Erro: "Connection refused" na porta 25 ou 587
- Clients não conseguem se conectar
- Health check SMTP falhando

**Diagnóstico:**
```bash
# Verificar se portas estão abertas
netstat -tlnp | grep -E ':25|:587'

# Testar conectividade local
telnet localhost 25
telnet localhost 587

# Verificar processo SMTP
ps aux | grep smtp
docker-compose ps | grep app
```

**Soluções:**

**Solução 1 - Reiniciar Serviços**
```bash
# Reiniciar containers
docker-compose -f docker-compose.prod.yml restart

# Verificar logs
docker-compose logs -f app | grep smtp
```

**Solução 2 - Verificar Firewall**
```bash
# Ubuntu/UFW
sudo ufw status
sudo ufw allow 25
sudo ufw allow 587

# CentOS/Firewalld
firewall-cmd --list-ports
firewall-cmd --add-port=25/tcp --permanent
firewall-cmd --add-port=587/tcp --permanent
firewall-cmd --reload
```

**Solução 3 - Verificar Configuração**
```bash
# Verificar variáveis de ambiente
docker-compose exec app printenv | grep SMTP

# Verificar configuração de rede
docker network ls
docker network inspect ultrazend_default
```

---

### **2. Emails Não São Entregues**

**Sintomas:**
- Emails ficam em status "queued" indefinidamente
- Status "failed" sem motivo claro
- Destinatários não recebem emails

**Diagnóstico:**
```bash
# Verificar fila Redis
docker-compose exec redis redis-cli
> LLEN email-processing:waiting
> LLEN email-processing:active
> LLEN email-processing:failed

# Verificar logs de delivery
docker-compose logs app | grep -i delivery

# Testar MX records do destinatário
nslookup -type=MX example.com
dig MX example.com
```

**Soluções:**

**Solução 1 - Verificar DNS**
```bash
# Verificar configuração DNS própria
nslookup mail.ultrazend.com.br
nslookup -type=PTR [SEU_IP]

# Script de verificação DNS
./scripts/verify-dns.sh ultrazend.com.br
```

**Solução 2 - Verificar Reputação IP**
```bash
# Verificar blacklists
./scripts/check-blacklists.sh [SEU_IP]

# Verificar manualmente
nslookup [IP_REVERSO].zen.spamhaus.org
nslookup [IP_REVERSO].bl.spamcop.net
```

**Solução 3 - Reiniciar Filas**
```bash
# Limpar filas travadas
docker-compose exec redis redis-cli FLUSHDB

# Reiniciar processamento
docker-compose restart app
```

---

### **3. API Retorna Erros 500**

**Sintomas:**
- Erro interno do servidor
- API não responde
- Frontend não consegue se comunicar

**Diagnóstico:**
```bash
# Verificar logs da aplicação
docker-compose logs app | tail -50

# Verificar saúde dos serviços
curl http://localhost:3001/health
curl http://localhost:3001/health/database
curl http://localhost:3001/health/redis

# Verificar uso de recursos
docker stats
```

**Soluções:**

**Solução 1 - Verificar Database**
```bash
# Testar conexão com banco
sqlite3 backend/database.sqlite "SELECT COUNT(*) FROM users;"

# Verificar integridade
sqlite3 backend/database.sqlite "PRAGMA integrity_check;"

# Backup e restaurar se necessário
cp backend/database.sqlite backend/database.sqlite.backup
```

**Solução 2 - Verificar Redis**
```bash
# Testar conexão Redis
docker-compose exec redis redis-cli ping

# Verificar uso de memória
docker-compose exec redis redis-cli info memory
```

**Solução 3 - Verificar Logs Detalhados**
```bash
# Logs com nível debug
export LOG_LEVEL=debug
docker-compose restart app

# Monitorar logs em tempo real
docker-compose logs -f app | grep ERROR
```

---

### **4. Performance Degradada**

**Sintomas:**
- Resposta lenta da API (>2s)
- Emails demoram para ser processados
- Alta utilização de CPU/memória

**Diagnóstico:**
```bash
# Verificar recursos do sistema
top
htop
free -h
df -h

# Verificar métricas da aplicação
curl http://localhost:3001/metrics | grep response_time

# Verificar filas
curl http://localhost:3001/health/queue
```

**Soluções:**

**Solução 1 - Otimizar Banco**
```bash
# Vacuum SQLite
sqlite3 backend/database.sqlite "VACUUM;"

# Reindex
sqlite3 backend/database.sqlite "REINDEX;"

# Verificar queries lentas
tail -f logs/ultrazend.log | grep "slow query"
```

**Solução 2 - Ajustar Concorrência**
```bash
# Editar docker-compose.prod.yml
environment:
  - QUEUE_CONCURRENCY=25  # Reduzir se CPU alta
  - MAX_CONNECTIONS=10    # Ajustar conforme recursos
```

**Solução 3 - Limpar Cache**
```bash
# Limpar cache Redis
docker-compose exec redis redis-cli FLUSHALL

# Reiniciar aplicação
docker-compose restart app
```

---

## 🔍 **DIAGNÓSTICO RÁPIDO**

### **Script de Diagnóstico Completo**

```bash
#!/bin/bash
# diagnostic-tool.sh - Ferramenta de diagnóstico UltraZend

echo "🔍 UltraZend Diagnostic Tool v2.0.0"
echo "=================================="

# 1. Verificar serviços básicos
echo "📊 System Status:"
echo "  • Uptime: $(uptime)"
echo "  • Load: $(uptime | awk '{print $10}')"
echo "  • Memory: $(free -h | grep Mem | awk '{print $3"/"$2}')"
echo "  • Disk: $(df -h / | tail -1 | awk '{print $5}')"

# 2. Verificar containers
echo -e "\n🐳 Container Status:"
docker-compose ps

# 3. Verificar portas
echo -e "\n🌐 Network Status:"
echo "  • Port 25: $(nc -z localhost 25 && echo "✅ Open" || echo "❌ Closed")"
echo "  • Port 587: $(nc -z localhost 587 && echo "✅ Open" || echo "❌ Closed")"
echo "  • Port 3001: $(nc -z localhost 3001 && echo "✅ Open" || echo "❌ Closed")"

# 4. Verificar health endpoints
echo -e "\n🏥 Health Checks:"
health_status=$(curl -s -w "%{http_code}" http://localhost:3001/health -o /dev/null)
echo "  • Main Health: $([ "$health_status" = "200" ] && echo "✅ Healthy" || echo "❌ Unhealthy ($health_status)")"

db_status=$(curl -s -w "%{http_code}" http://localhost:3001/health/database -o /dev/null)
echo "  • Database: $([ "$db_status" = "200" ] && echo "✅ Healthy" || echo "❌ Unhealthy ($db_status)")"

redis_status=$(curl -s -w "%{http_code}" http://localhost:3001/health/redis -o /dev/null)
echo "  • Redis: $([ "$redis_status" = "200" ] && echo "✅ Healthy" || echo "❌ Unhealthy ($redis_status)")"

# 5. Verificar filas
echo -e "\n📬 Queue Status:"
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    waiting=$(docker-compose exec -T redis redis-cli LLEN email-processing:waiting 2>/dev/null || echo "N/A")
    active=$(docker-compose exec -T redis redis-cli LLEN email-processing:active 2>/dev/null || echo "N/A")
    failed=$(docker-compose exec -T redis redis-cli LLEN email-processing:failed 2>/dev/null || echo "N/A")
    echo "  • Waiting: $waiting"
    echo "  • Active: $active"
    echo "  • Failed: $failed"
else
    echo "  • ❌ Cannot connect to Redis"
fi

# 6. Verificar DNS
echo -e "\n🌐 DNS Configuration:"
mx_record=$(nslookup -type=MX ultrazend.com.br 2>/dev/null | grep "mail exchanger" | head -1)
echo "  • MX Record: ${mx_record:-"❌ Not configured"}"

# 7. Últimos erros
echo -e "\n🚨 Recent Errors (last 10):"
docker-compose logs --tail=100 app 2>/dev/null | grep ERROR | tail -10

echo -e "\n✅ Diagnostic complete!"
```

### **Health Check Avançado**

```bash
#!/bin/bash
# health-check-advanced.sh

check_smtp_functionality() {
    echo "🔍 Testing SMTP functionality..."
    
    # Test MX port
    if timeout 5 bash -c "</dev/tcp/localhost/25"; then
        echo "✅ MX port 25 accessible"
    else
        echo "❌ MX port 25 not accessible"
    fi
    
    # Test Submission port
    if timeout 5 bash -c "</dev/tcp/localhost/587"; then
        echo "✅ Submission port 587 accessible"
    else
        echo "❌ Submission port 587 not accessible"
    fi
    
    # Test SMTP banner
    smtp_banner=$(echo "QUIT" | nc -w 5 localhost 25 2>/dev/null | head -1)
    if [[ $smtp_banner == *"220"* ]]; then
        echo "✅ SMTP banner: $smtp_banner"
    else
        echo "❌ Invalid SMTP banner: $smtp_banner"
    fi
}

check_email_queue() {
    echo "🔍 Checking email queue..."
    
    if ! docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        echo "❌ Redis not accessible"
        return 1
    fi
    
    local waiting=$(docker-compose exec -T redis redis-cli LLEN email-processing:waiting)
    local active=$(docker-compose exec -T redis redis-cli LLEN email-processing:active)
    local completed=$(docker-compose exec -T redis redis-cli LLEN email-processing:completed)
    local failed=$(docker-compose exec -T redis redis-cli LLEN email-processing:failed)
    
    echo "📊 Queue Statistics:"
    echo "  • Waiting: $waiting"
    echo "  • Active: $active"
    echo "  • Completed: $completed"
    echo "  • Failed: $failed"
    
    if [ "$waiting" -gt 1000 ]; then
        echo "⚠️  High number of waiting emails ($waiting)"
    fi
    
    if [ "$failed" -gt 100 ]; then
        echo "⚠️  High number of failed emails ($failed)"
    fi
}

check_disk_space() {
    echo "🔍 Checking disk space..."
    
    usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$usage" -gt 85 ]; then
        echo "⚠️  Disk usage high: ${usage}%"
    else
        echo "✅ Disk usage OK: ${usage}%"
    fi
    
    # Check logs directory
    if [ -d "logs" ]; then
        log_size=$(du -sh logs | awk '{print $1}')
        echo "📁 Log directory size: $log_size"
    fi
    
    # Check database size
    if [ -f "backend/database.sqlite" ]; then
        db_size=$(du -sh backend/database.sqlite | awk '{print $1}')
        echo "💾 Database size: $db_size"
    fi
}

check_memory_usage() {
    echo "🔍 Checking memory usage..."
    
    mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ "$mem_usage" -gt 85 ]; then
        echo "⚠️  Memory usage high: ${mem_usage}%"
    else
        echo "✅ Memory usage OK: ${mem_usage}%"
    fi
    
    # Docker container memory
    echo "🐳 Container memory usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
}

# Execute all checks
check_smtp_functionality
check_email_queue
check_disk_space
check_memory_usage
```

---

## 📊 **LOGS E MONITORAMENTO**

### **Estrutura de Logs**

```
logs/
├── ultrazend.log          # Log principal da aplicação
├── smtp-server.log        # Logs específicos do SMTP
├── email-delivery.log     # Logs de entrega de emails
├── security.log          # Logs de segurança e ataques
├── performance.log        # Métricas de performance
└── error.log             # Apenas erros críticos
```

### **Comandos de Log Úteis**

```bash
# Ver logs em tempo real
tail -f logs/ultrazend.log

# Filtrar apenas erros
grep ERROR logs/ultrazend.log | tail -20

# Filtrar por correlationId
grep "req-123456789" logs/ultrazend.log

# Logs de SMTP específicos
docker-compose logs -f app | grep "SMTP"

# Logs de email delivery
docker-compose logs -f app | grep "delivery"

# Estatísticas de log
echo "📊 Log Statistics (last 1000 lines):"
tail -1000 logs/ultrazend.log | cut -d' ' -f3 | sort | uniq -c | sort -nr

# Erros mais comuns
echo "🚨 Most common errors:"
grep ERROR logs/ultrazend.log | cut -d']' -f3 | sort | uniq -c | sort -nr | head -10
```

### **Métricas Prometheus**

```bash
# Verificar métricas disponíveis
curl http://localhost:3001/metrics | grep "# HELP"

# Emails enviados nas últimas 24h
curl -s http://localhost:3001/metrics | grep "ultrazend_emails_sent_total"

# Response time médio
curl -s http://localhost:3001/metrics | grep "ultrazend_response_time"

# Status das filas
curl -s http://localhost:3001/metrics | grep "ultrazend_queue_size"

# Conexões SMTP
curl -s http://localhost:3001/metrics | grep "ultrazend_smtp_connections"
```

---

## ⚡ **PERFORMANCE**

### **Otimização de Performance**

**1. Database Optimization**
```bash
# Vacuum SQLite regularmente
sqlite3 backend/database.sqlite "VACUUM;"

# Analizar queries lentas
sqlite3 backend/database.sqlite "PRAGMA compile_options;" | grep ENABLE_STAT

# Verificar índices
sqlite3 backend/database.sqlite ".schema" | grep INDEX
```

**2. Redis Optimization**
```bash
# Configurar Redis para performance
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Monitorar Redis
docker-compose exec redis redis-cli --latency
docker-compose exec redis redis-cli INFO memory
```

**3. Application Tuning**
```bash
# Ajustar variáveis de ambiente no docker-compose.prod.yml
environment:
  - NODE_ENV=production
  - QUEUE_CONCURRENCY=50      # Ajustar conforme CPU
  - DATABASE_POOL_SIZE=20     # Pool de conexões DB
  - REDIS_MAX_CONNECTIONS=10  # Pool Redis
  - LOG_LEVEL=info           # Reduzir logs em produção
```

### **Benchmarking**

```bash
#!/bin/bash
# benchmark-tool.sh

echo "🚀 UltraZend Performance Benchmark"

# API Performance Test
echo "📊 API Performance Test:"
ab -n 100 -c 10 http://localhost:3001/health

# Database Performance
echo "💾 Database Performance Test:"
time sqlite3 backend/database.sqlite "SELECT COUNT(*) FROM emails;"
time sqlite3 backend/database.sqlite "SELECT * FROM emails ORDER BY created_at DESC LIMIT 100;"

# Redis Performance
echo "📮 Redis Performance Test:"
docker-compose exec -T redis redis-cli --latency-history -i 1

# SMTP Connection Test
echo "📧 SMTP Connection Test:"
time echo "QUIT" | nc localhost 25
time echo "QUIT" | nc localhost 587
```

---

## 🔒 **SEGURANÇA**

### **Verificação de Segurança**

```bash
#!/bin/bash
# security-check.sh

echo "🔒 Security Check - UltraZend"

# 1. Verificar portas abertas
echo "🌐 Open Ports:"
nmap -sT localhost | grep open

# 2. Verificar usuários conectados
echo "👥 Active Sessions:"
who

# 3. Verificar logs de autenticação
echo "🔑 Recent Auth Attempts:"
grep "authentication" logs/ultrazend.log | tail -10

# 4. Verificar rate limiting
echo "🚦 Rate Limiting Status:"
curl -s http://localhost:3001/metrics | grep rate_limit

# 5. Verificar certificados SSL
echo "🔐 SSL Certificate Status:"
echo | openssl s_client -connect ultrazend.com.br:443 -servername ultrazend.com.br 2>/dev/null | openssl x509 -noout -dates

# 6. Verificar DKIM
echo "📧 DKIM Configuration:"
if [ -f "certificates/dkim_private.pem" ]; then
    echo "✅ DKIM private key exists"
    openssl rsa -in certificates/dkim_private.pem -pubout -out /tmp/dkim_public.pem 2>/dev/null
    echo "✅ DKIM public key generated"
else
    echo "❌ DKIM private key missing"
fi
```

### **Hardening Checklist**

```bash
# 1. Firewall Rules
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 25/tcp
sudo ufw allow 587/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 2. Fail2Ban Configuration
sudo apt install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# 3. Update System
sudo apt update && sudo apt upgrade -y

# 4. Remove Unnecessary Packages
sudo apt autoremove -y

# 5. Configure Log Rotation
sudo logrotate -f /etc/logrotate.conf
```

---

## 🌐 **REDE E DNS**

### **Verificação DNS Completa**

```bash
#!/bin/bash
# dns-verification.sh

DOMAIN="ultrazend.com.br"
IP="SEU_IP_AQUI"

echo "🌐 DNS Verification for $DOMAIN"

# MX Records
echo "📧 MX Records:"
dig MX $DOMAIN +short

# A Records
echo "🏠 A Records:"
dig A mail.$DOMAIN +short
dig A www.$DOMAIN +short

# PTR Records (Reverse DNS)
echo "🔄 PTR Records:"
dig -x $IP +short

# SPF Record
echo "🛡️ SPF Record:"
dig TXT $DOMAIN +short | grep "v=spf1"

# DKIM Record
echo "🔑 DKIM Record:"
dig TXT default._domainkey.$DOMAIN +short

# DMARC Record
echo "🔒 DMARC Record:"
dig TXT _dmarc.$DOMAIN +short

# Test SMTP connectivity externally
echo "📬 External SMTP Test:"
nc -zv mail.$DOMAIN 25
nc -zv mail.$DOMAIN 587
```

### **Teste de Reputação IP**

```bash
#!/bin/bash
# ip-reputation-check.sh

IP="SEU_IP_AQUI"

echo "🔍 IP Reputation Check for $IP"

# Reverse IP for DNSBL queries
REVERSE_IP=$(echo $IP | awk -F. '{print $4"."$3"."$2"."$1}')

# Common DNS Blacklists
BLACKLISTS=(
    "zen.spamhaus.org"
    "bl.spamcop.net"
    "dnsbl.sorbs.net"
    "ix.dnsbl.manitu.net"
    "rbl.efnetrbl.org"
)

for bl in "${BLACKLISTS[@]}"; do
    result=$(nslookup ${REVERSE_IP}.${bl} 2>/dev/null)
    if echo "$result" | grep -q "127.0.0"; then
        echo "❌ LISTED in $bl"
    else
        echo "✅ Not listed in $bl"
    fi
done

# Check if IP has PTR record
ptr=$(nslookup $IP 2>/dev/null | grep "name =" | awk '{print $4}')
if [ -n "$ptr" ]; then
    echo "✅ PTR record: $ptr"
else
    echo "❌ No PTR record found"
fi
```

---

## 💾 **BASE DE DADOS**

### **Manutenção do Banco**

```bash
#!/bin/bash
# database-maintenance.sh

DB_PATH="backend/database.sqlite"
BACKUP_PATH="backups/database-$(date +%Y%m%d-%H%M%S).sqlite"

echo "💾 Database Maintenance - UltraZend"

# 1. Backup
echo "📥 Creating backup..."
mkdir -p backups
cp "$DB_PATH" "$BACKUP_PATH"
echo "✅ Backup created: $BACKUP_PATH"

# 2. Integrity Check
echo "🔍 Checking integrity..."
integrity=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")
if [ "$integrity" = "ok" ]; then
    echo "✅ Database integrity OK"
else
    echo "❌ Database integrity issues: $integrity"
fi

# 3. Vacuum
echo "🧹 Running VACUUM..."
sqlite3 "$DB_PATH" "VACUUM;"
echo "✅ VACUUM completed"

# 4. Reindex
echo "📊 Rebuilding indexes..."
sqlite3 "$DB_PATH" "REINDEX;"
echo "✅ Reindex completed"

# 5. Statistics
echo "📈 Database Statistics:"
echo "  • Users: $(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;")"
echo "  • Emails: $(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM emails;")"
echo "  • Size: $(du -sh "$DB_PATH" | awk '{print $1}')"

# 6. Performance Test
echo "⚡ Performance Test:"
time sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM emails WHERE created_at > date('now', '-1 day');"

echo "✅ Database maintenance completed"
```

### **Queries de Diagnóstico**

```sql
-- Verificar emails recentes
SELECT status, COUNT(*) as count, 
       datetime(created_at) as created
FROM emails 
WHERE created_at > datetime('now', '-24 hours')
GROUP BY status
ORDER BY created_at DESC;

-- Top destinatários com falhas
SELECT to_email, COUNT(*) as failed_count
FROM emails 
WHERE status = 'failed' 
  AND created_at > datetime('now', '-7 days')
GROUP BY to_email
ORDER BY failed_count DESC
LIMIT 10;

-- Usuários mais ativos
SELECT u.email, COUNT(e.id) as emails_sent
FROM users u
LEFT JOIN emails e ON u.id = e.user_id
WHERE e.created_at > datetime('now', '-30 days')
GROUP BY u.id, u.email
ORDER BY emails_sent DESC
LIMIT 10;

-- Performance de entrega por hora
SELECT 
    strftime('%Y-%m-%d %H:00', created_at) as hour,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
    ROUND(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as delivery_rate
FROM emails
WHERE created_at > datetime('now', '-24 hours')
GROUP BY strftime('%Y-%m-%d %H:00', created_at)
ORDER BY hour;
```

---

## 🔧 **COMANDOS ÚTEIS**

### **Comandos de Emergência**

```bash
# 🚨 EMERGÊNCIA - Parar tudo imediatamente
docker-compose down

# 🔄 Reiniciar todos os serviços
docker-compose -f docker-compose.prod.yml restart

# 🧹 Limpeza completa (CUIDADO!)
docker-compose down -v
docker system prune -af

# 💾 Backup rápido do banco
cp backend/database.sqlite backups/emergency-$(date +%Y%m%d-%H%M%S).sqlite

# 📊 Status rápido
docker-compose ps && curl -s http://localhost:3001/health | jq .status
```

### **Scripts de Manutenção**

```bash
# Limpeza de logs antigos
find logs/ -name "*.log" -mtime +30 -delete

# Limpeza de backups antigos
find backups/ -name "*.sqlite" -mtime +30 -delete

# Otimização automática do banco
sqlite3 backend/database.sqlite "PRAGMA optimize;"

# Reiniciar filas Redis
docker-compose exec redis redis-cli FLUSHDB

# Verificar certificados SSL expirando
openssl x509 -in certificates/ultrazend.com.br.crt -noout -checkend $((30*24*3600))
```

### **Monitoramento Contínuo**

```bash
#!/bin/bash
# monitor.sh - Monitor contínuo

while true; do
    clear
    echo "🖥️ UltraZend System Monitor - $(date)"
    echo "=================================="
    
    # CPU e Memory
    echo "💻 System Resources:"
    echo "  CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
    echo "  Memory: $(free | grep Mem | awk '{printf "%.1f%", $3/$2 * 100.0}')%"
    echo "  Disk: $(df / | tail -1 | awk '{print $5}')"
    
    # Services
    echo -e "\n📊 Service Status:"
    api_status=$(curl -s -w "%{http_code}" http://localhost:3001/health -o /dev/null)
    echo "  API: $([ "$api_status" = "200" ] && echo "✅ UP" || echo "❌ DOWN")"
    
    smtp_25=$(nc -z localhost 25 && echo "✅ UP" || echo "❌ DOWN")
    echo "  SMTP 25: $smtp_25"
    
    smtp_587=$(nc -z localhost 587 && echo "✅ UP" || echo "❌ DOWN")
    echo "  SMTP 587: $smtp_587"
    
    # Queue Stats
    echo -e "\n📬 Queue Stats:"
    if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        waiting=$(docker-compose exec -T redis redis-cli LLEN email-processing:waiting 2>/dev/null)
        active=$(docker-compose exec -T redis redis-cli LLEN email-processing:active 2>/dev/null)
        echo "  Waiting: $waiting"
        echo "  Active: $active"
    else
        echo "  ❌ Redis not accessible"
    fi
    
    # Recent Errors
    echo -e "\n🚨 Recent Errors:"
    docker-compose logs --since="1m" app 2>/dev/null | grep ERROR | tail -3
    
    sleep 30
done
```

---

## 📞 **ESCALAÇÃO**

### **Níveis de Escalação**

**🟢 Nível 1 - Problemas Menores (Self-Service)**
- API com latência alta (>500ms)
- Emails em fila (waiting < 1000)
- Logs com warnings ocasionais
- **Ação**: Seguir troubleshooting básico

**🟡 Nível 2 - Problemas Médios (Suporte Técnico)**
- API indisponível por >5 minutos
- SMTP não aceita conexões
- Fila de emails travada (>5000 waiting)
- Database com erros
- **Ação**: Executar scripts de diagnóstico, criar ticket

**🔴 Nível 3 - Problemas Críticos (Emergência)**
- Sistema completamente fora do ar
- Perda de dados
- Violação de segurança
- Corrupção do banco de dados
- **Ação**: Escalação imediata, ativação do plano de contingência

### **Informações para Suporte**

Ao entrar em contato com o suporte, inclua:

```bash
# Gerar relatório de suporte
./scripts/generate-support-report.sh

# Informações essenciais:
echo "🆔 System ID: $(hostname)"
echo "📅 Timestamp: $(date -Iseconds)"
echo "🔢 Version: $(grep version package.json | cut -d'"' -f4)"
echo "🌍 Environment: $NODE_ENV"
echo "💻 OS: $(uname -a)"

# Logs dos últimos 30 minutos
docker-compose logs --since="30m" > support-logs-$(date +%Y%m%d-%H%M%S).txt

# Health check completo
curl -s http://localhost:3001/health | jq . > health-report.json

# Configuração atual (sem senhas)
env | grep -E '^(SMTP_|DATABASE_|REDIS_)' | sed 's/=.*PASSWORD.*/=***/' > config-report.txt
```

### **Contatos de Emergência**

- **Email**: suporte@ultrazend.com.br
- **Telegram**: @UltraZendSupport
- **Status Page**: https://status.ultrazend.com.br
- **Documentação**: https://docs.ultrazend.com.br

### **SLA e Tempos de Resposta**

- **Nível 1**: 4 horas úteis
- **Nível 2**: 2 horas
- **Nível 3**: 30 minutos
- **Emergência**: 15 minutos

---

## ✅ **CHECKLIST DE MANUTENÇÃO**

### **Diário**
- [ ] Verificar health checks
- [ ] Monitorar filas de email
- [ ] Revisar logs de erro
- [ ] Verificar uso de recursos

### **Semanal**
- [ ] Executar diagnóstico completo
- [ ] Limpar logs antigos
- [ ] Otimizar banco de dados
- [ ] Verificar certificados SSL
- [ ] Teste de backup/restore

### **Mensal**
- [ ] Auditoria de segurança
- [ ] Análise de performance
- [ ] Verificar blacklists IP
- [ ] Atualizar dependências
- [ ] Revisar configurações

---

**Este guia é atualizado regularmente. Sempre consulte a versão mais recente em https://docs.ultrazend.com.br/troubleshooting**

**Versão do Documento**: 2.0.0  
**Status**: ✅ **IMPLEMENTAÇÃO COMPLETA - PRODUÇÃO READY**  
**Responsável**: Claude Code & Equipe UltraZend