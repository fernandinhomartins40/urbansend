# ✅ CHECKLIST - ELIMINAÇÃO POSTFIX E MIGRAÇÃO ULTRAZEND PURO

> **OBJETIVO:** Executar migração para UltraZend SMTP 100% independente

---

## 🚨 **PRÉ-REQUISITOS (OBRIGATÓRIOS)**

- [ ] **Backup completo** do servidor feito
- [ ] **Git commit** de todo código atual
- [ ] **Documentar** configuração Postfix atual (caso precise rollback)
- [ ] **Avisar equipe** sobre janela de manutenção
- [ ] **Testar ambiente local** antes de aplicar em produção

---

## 📋 **FASE 1: PREPARAÇÃO**

### **1.1 Análise de Estado Atual**
- [ ] Verificar emails na fila: `redis-cli LLEN bull:email-processing:*`
- [ ] Ver processos ativos: `ps aux | grep postfix`
- [ ] Confirmar porta 25 em uso: `netstat -tlnp | grep :25`
- [ ] Backup logs: `cp /var/log/mail.log /backup/mail.log.$(date +%Y%m%d)`

### **1.2 Preparar Workers**
- [ ] Criar arquivo `src/workers/emailWorker.ts`
- [ ] Criar arquivo `ecosystem.config.js` 
- [ ] Testar worker localmente: `node dist/workers/emailWorker.js`

---

## 🛑 **FASE 2: PARADA CONTROLADA**

### **2.1 Parar Postfix**
```bash
- [ ] systemctl stop postfix
- [ ] systemctl disable postfix  
- [ ] ps aux | grep postfix  # Confirmar parado
```

### **2.2 Liberar Porta 25**
```bash
- [ ] netstat -tlnp | grep :25  # Confirmar livre
- [ ] ss -tlnp | grep :25       # Dupla verificação
```

---

## 🔧 **FASE 3: MODIFICAÇÕES DE CÓDIGO**

### **3.1 Modificar SMTPDeliveryService**
- [ ] Editar `src/services/smtpDelivery.ts`
- [ ] Remover/modificar linha 50-52 (lógica isDevelopment)
- [ ] Forçar sempre entrega direta aos MX records
- [ ] Adicionar logs mais detalhados
- [ ] Build: `npm run build`

### **3.2 Atualizar Configurações**
- [ ] Editar `.env` - remover configs Postfix
- [ ] Adicionar configs UltraZend puras
- [ ] Verificar DKIM_PRIVATE_KEY_PATH existe
- [ ] Confirmar NODE_ENV=production

---

## 🚀 **FASE 4: ATIVAÇÃO ULTRAZEND PURO**

### **4.1 Restart com Nova Configuração**
```bash
- [ ] pm2 stop all
- [ ] pm2 start ecosystem.config.js  
- [ ] pm2 logs --lines 50           # Verificar inicialização
```

### **4.2 Verificar Serviços Ativos**
- [ ] API respondendo: `curl http://localhost:3000/health`
- [ ] Redis conectado: `redis-cli ping`
- [ ] Workers processando: `pm2 list`

---

## 🧪 **FASE 5: TESTES CRÍTICOS**

### **5.1 Teste Entrega Direta**
```bash
- [ ] cd /var/www/ultrazend/backend
- [ ] NODE_ENV=production node -e "
      const { SMTPDeliveryService } = require('./dist/services/smtpDelivery.js');
      const smtp = new SMTPDeliveryService();
      smtp.deliverEmail({
        from: 'noreply@ultrazend.com.br',
        to: 'teste@gmail.com',
        subject: 'Test UltraZend Direct',
        html: '<h1>Success!</h1>'
      }).then(console.log).catch(console.error);
      "
```

### **5.2 Teste API Completa**
```bash
- [ ] curl -X POST http://localhost:3000/api/emails/send \
      -H "Authorization: Bearer SEU_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"to":"teste@gmail.com","subject":"API Test","html":"<h1>Via API</h1>"}'
```

### **5.3 Verificar Processamento de Filas**
```bash
- [ ] redis-cli LLEN bull:email-processing:waiting
- [ ] redis-cli LLEN bull:email-processing:active  
- [ ] redis-cli LLEN bull:email-processing:completed
- [ ] redis-cli LLEN bull:email-processing:failed
```

---

## 📊 **FASE 6: MONITORAMENTO (PRIMEIRAS 2 HORAS)**

### **6.1 Logs em Tempo Real**
- [ ] `tail -f logs/app.log` (verificar erros)
- [ ] `pm2 logs ultrazend-api` (API logs)
- [ ] `pm2 logs ultrazend-email-worker` (Worker logs)

### **6.2 Métricas de Sistema**
- [ ] CPU/RAM não críticos: `htop`
- [ ] Conexões TCP: `ss -s`
- [ ] Espaço em disco: `df -h`

### **6.3 Métricas de Email**
- [ ] **Emails enviados** > 0
- [ ] **Taxa de falha** < 10%  
- [ ] **Tempo de fila** < 30 segundos
- [ ] **Workers ativos** = 2-3

---

## ✅ **FASE 7: VALIDAÇÃO FINAL**

### **7.1 Checklist de Sucesso**
- [ ] ✅ **Postfix completamente parado** (`systemctl status postfix`)
- [ ] ✅ **UltraZend SMTP funcionando** (emails sendo entregues)
- [ ] ✅ **API respondendo** (200 OK em /health)  
- [ ] ✅ **Workers processando** (filas sendo esvaziadas)
- [ ] ✅ **DKIM assinando** (logs mostram signatures)
- [ ] ✅ **Sem erros críticos** nos logs

### **7.2 Teste de Stress (Opcional)**
```bash
- [ ] for i in {1..10}; do
        curl -X POST localhost:3000/api/emails/send \
        -H "Authorization: Bearer API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"to\":\"test$i@gmail.com\",\"subject\":\"Stress Test $i\",\"html\":\"<h1>Test $i</h1>\"}"
        done
```

---

## 🚨 **PLANO DE ROLLBACK (SE FALHAR)**

### **Se Algo der Errado:**
1. [ ] `git checkout HEAD~1 -- src/services/smtpDelivery.ts`
2. [ ] `npm run build`  
3. [ ] `systemctl start postfix`
4. [ ] `pm2 restart ultrazend-api`
5. [ ] Aguardar 5 minutos e testar

### **Sinais de Problema:**
- ❌ Emails não sendo entregues por > 10 minutos
- ❌ Workers com erro contínuo
- ❌ API retornando 500 
- ❌ Filas crescendo sem parar

---

## 📈 **MÉTRICAS DE SUCESSO (24h)**

### **OBRIGATÓRIAS:**
- [ ] **100% emails** via entrega direta (0% Postfix)
- [ ] **Taxa de entrega** > 90%
- [ ] **Latência média** < 10 segundos
- [ ] **Uptime API** > 99%

### **DESEJÁVEIS:**
- [ ] **Throughput** > 500 emails/hora
- [ ] **Fila máxima** < 50 emails
- [ ] **CPU média** < 50%
- [ ] **RAM média** < 80%

---

## 🎯 **APÓS SUCESSO TOTAL**

### **Limpeza Final:**
- [ ] `apt remove postfix` (remover completamente)
- [ ] Remover arquivos de config Postfix órfãos
- [ ] Atualizar documentação
- [ ] Comunicar sucesso para equipe

### **Próximos Passos:**
- [ ] Configurar DNS DMARC policy
- [ ] Implementar IP warming strategy  
- [ ] Setup monitoring dashboard
- [ ] Planejar scaling para mais clientes

---

**🚀 RESULTADO ESPERADO: UltraZend 100% independente, funcionando como concorrente direto do Resend!**

---

*Execute este checklist passo-a-passo. Em caso de dúvidas, consulte PLANO_MIGRACAO_ULTRAZEND_PURO.md*