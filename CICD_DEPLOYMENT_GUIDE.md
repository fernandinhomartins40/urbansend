# 🚀 Guia Completo de CI/CD - UrbanSend

## 🎯 Deploy Automático para VPS 72.60.10.112:3010 com www.urbanmail.com.br

---

## 📋 VISÃO GERAL

### Workflow Implementado:
```
GitHub Repository → GitHub Actions → VPS Deploy
├── 🔨 Build & Test
├── 🚀 Deploy para VPS  
├── 🧪 Health Checks
└── 📢 Notificações
```

### Repositório:
- **URL**: https://github.com/fernandinhomartins40/urbansend/
- **Secret**: `VPS_PASSWORD` (senha SSH da VPS)
- **Domínio**: www.urbanmail.com.br
- **VPS**: 72.60.10.112:3010

---

## ⚙️ CONFIGURAÇÃO INICIAL

### 1. **Configurar Secret no GitHub**
```bash
# Executar script automatizado
chmod +x scripts/setup-vps-secrets.sh
./scripts/setup-vps-secrets.sh
```

### 2. **Configurar DNS (Obrigatório)**
Ver arquivo: `DNS_EMAIL_CONFIGURATION.md`

**Registros DNS mínimos:**
```
A      @           72.60.10.112
A      www         72.60.10.112
A      mail        72.60.10.112
MX     @           mail.urbanmail.com.br  10
TXT    @           "v=spf1 a mx ip4:72.60.10.112 ~all"
```

---

## 🚀 WORKFLOWS DISPONÍVEIS

### 1. **Deploy Principal** (`.github/workflows/deploy.yml`)
**Trigger**: Push para `main` ou `production`

#### Stages:
1. **🔨 Build & Test**:
   - Build da imagem Docker
   - Testes de integridade
   - Health checks

2. **🚀 Deploy**:
   - Preparar ambiente VPS
   - Transferir arquivos via sshpass
   - Deploy do container
   - Configuração produção

3. **🧪 Post-Deploy Tests**:
   - Health check da aplicação
   - Teste de conectividade
   - Verificação do domínio

4. **📢 Notificações**:
   - Status do deploy
   - URLs de acesso

### 2. **Workflow de Teste** (`.github/workflows/test-workflow.yml`)
**Trigger**: Push para `develop` ou Pull Requests

#### Stages:
- Build Test
- Security Test
- Configuration Test
- Deploy Simulation

---

## 🔧 CONFIGURAÇÃO DETALHADA

### Arquivos do Workflow:
```
.github/workflows/
├── deploy.yml           # Deploy produção
└── test-workflow.yml    # Testes CI

scripts/
├── setup-vps-secrets.sh # Configurar secrets
├── build-and-test.sh    # Teste local
└── deploy-vps.sh        # Deploy manual

docker/
├── .env.production      # Config produção
├── nginx.conf           # Nginx para domínio
└── start.sh            # Script inicialização
```

### Variáveis de Produção:
```bash
# Domínio e URLs (porta 3010 para compatibilidade com múltiplas apps na VPS)
DOMAIN=www.urbanmail.com.br
PUBLIC_URL=http://www.urbanmail.com.br
FRONTEND_URL=http://www.urbanmail.com.br
API_URL=http://www.urbanmail.com.br/api
INTERNAL_PORT=3010

# SMTP
SMTP_HOSTNAME=www.urbanmail.com.br
FROM_EMAIL=noreply@urbanmail.com.br

# CORS  
ALLOWED_ORIGINS=http://www.urbanmail.com.br,https://www.urbanmail.com.br,http://urbanmail.com.br,https://urbanmail.com.br
```

---

## 🚀 COMO USAR

### Deploy Automático:
```bash
# 1. Fazer alterações no código
git add .
git commit -m "feat: nova funcionalidade"

# 2. Push para main (dispara deploy)
git push origin main

# 3. Acompanhar deploy
# Acessar: https://github.com/fernandinhomartins40/urbansend/actions
```

### Deploy Manual:
```bash
# Via GitHub Actions (Manual Trigger)
# 1. Ir para Actions no GitHub
# 2. Selecionar "Deploy to VPS"
# 3. Clicar "Run workflow"
# 4. Selecionar branch e ambiente
```

### Teste Local Antes do Deploy:
```bash
# Testar build localmente
./scripts/build-and-test.sh

# Ou usar workflow de teste
git checkout -b feature/minha-feature
git push origin feature/minha-feature
# Workflow de teste será executado automaticamente
```

---

## 📊 MONITORAMENTO

### Logs do Workflow:
- **GitHub Actions**: https://github.com/fernandinhomartins40/urbansend/actions
- **Real-time**: Acompanhar execução em tempo real
- **Histórico**: Todos os deploys ficam registrados

### Logs da Aplicação:
```bash
# SSH na VPS
ssh root@72.60.10.112

# Ver logs da aplicação
cd /opt/urbansend
docker-compose logs -f

# Status dos containers
docker-compose ps

# Restart se necessário
docker-compose restart
```

### Health Checks:
- **Application**: http://www.urbanmail.com.br:3010/health
- **IP Access**: http://72.60.10.112:3010/health
- **SMTP**: `telnet www.urbanmail.com.br 25`

---

## 🔐 SEGURANÇA

### Secrets Configurados:
- ✅ `VPS_PASSWORD`: Senha SSH (criptografada no GitHub)

### Boas Práticas:
- ✅ SSH via sshpass (sem chaves expostas)
- ✅ Secrets encriptados no GitHub
- ✅ Teste antes do deploy
- ✅ Health checks automáticos
- ✅ Rollback automático em falhas

### Firewall VPS:
```bash
# Liberar portas necessárias
ufw allow 22    # SSH
ufw allow 3010  # Aplicação
ufw allow 25    # SMTP
ufw enable
```

---

## 🚨 TROUBLESHOOTING

### Problemas Comuns:

#### 1. **Deploy Falha na Conexão SSH**:
```
Solução:
- Verificar secret VPS_PASSWORD
- Confirmar IP da VPS: 72.60.10.112
- Testar: ssh root@72.60.10.112
```

#### 2. **Aplicação Não Responde**:
```
Verificar:
- docker-compose ps
- docker-compose logs
- curl http://localhost:3010/health
- Firewall liberado na porta 3010
```

#### 3. **Domínio Não Resolve**:
```
Verificar:
- DNS propagado: nslookup www.urbanmail.com.br
- TTL baixo (300s) para propagação rápida
- Registros A apontando para 72.60.10.112
```

#### 4. **SMTP Não Funciona**:
```
Verificar:
- telnet www.urbanmail.com.br 25
- Registros MX configurados
- SPF record configurado
- Porta 25 liberada no firewall
```

### Logs de Debug:
```bash
# GitHub Actions
# Ver logs detalhados na aba Actions

# VPS
ssh root@72.60.10.112
cd /opt/urbansend

# Logs do container
docker-compose logs urbansend

# Logs do nginx
docker exec urbansend-app cat /var/log/nginx/error.log

# Processos internos
docker exec urbansend-app ps aux

# Teste de conectividade interna
docker exec urbansend-app curl localhost:3010/health
```

---

## 🔄 ROLLBACK

### Em caso de problemas:

#### Rollback Automático:
- Deploy falha → Container anterior mantido
- Health check falha → Deploy é abortado

#### Rollback Manual:
```bash
ssh root@72.60.10.112
cd /opt/urbansend

# Ver imagens disponíveis
docker images | grep urbansend

# Voltar para imagem anterior
docker tag urbansend:backup urbansend:latest
docker-compose up -d

# Ou re-executar deploy de commit anterior
# Via GitHub Actions com commit específico
```

---

## 📈 MÉTRICAS E PERFORMANCE

### Tempos Esperados:
- **Build**: ~3-5 minutos
- **Deploy**: ~2-3 minutos  
- **Health Check**: ~30 segundos
- **Total**: ~5-8 minutos

### Recursos Utilizados:
- **GitHub Actions**: ~10 minutos/deploy
- **VPS Resources**: 256MB RAM, 200MB disk
- **Network**: Transfer de ~100-200MB

---

## 🛠️ MANUTENÇÃO

### Updates Regulares:
```bash
# 1. Update dependências
npm update

# 2. Rebuild imagens
docker system prune
git push origin main

# 3. Backup antes de updates grandes
ssh root@72.60.10.112
cd /opt/urbansend
tar -czf backup-$(date +%Y%m%d).tar.gz data/ logs/
```

### Monitoramento Contínuo:
- ✅ Health checks automáticos
- ✅ Logs estruturados
- ✅ Alertas de falha via GitHub
- ✅ Backup automático de dados

---

## 🎯 PRÓXIMOS PASSOS

### Melhorias Planejadas:
1. **SSL/HTTPS**: Certificado Let's Encrypt
2. **Monitoring**: Prometheus + Grafana
3. **Backup**: Automated backups
4. **Scaling**: Load balancer se necessário
5. **Staging**: Ambiente de homologação

### Ambientes Adicionais:
```yaml
# Adicionar staging environment
staging:
  - Branch: develop
  - URL: staging.urbanmail.com.br
  - VPS: mesma instância, porta diferente
```

---

## ✅ CHECKLIST FINAL

### Pré-Deploy:
- [ ] Secret `VPS_PASSWORD` configurado
- [ ] DNS apontando para 72.60.10.112
- [ ] Registros MX configurados
- [ ] Firewall liberado (portas 3010, 25)
- [ ] SSH funcionando

### Pós-Deploy:
- [ ] Aplicação respondendo em www.urbanmail.com.br
- [ ] Health check OK
- [ ] SMTP funcionando (porta 25)
- [ ] Logs sem erros críticos
- [ ] Backup inicial realizado

---

## 🎉 CONCLUSÃO

**CI/CD completo implementado para:**
- ✅ **Deploy automático** via GitHub Actions
- ✅ **Domínio configurado**: www.urbanmail.com.br
- ✅ **VPS deploy**: 72.60.10.112:3010
- ✅ **Email server**: Porta 25 ativa
- ✅ **Testes automáticos** antes do deploy
- ✅ **Rollback** em caso de falha

**🚀 Push para main = Deploy automático na VPS!**

---

*Documentação atualizada em 29/08/2025*  
*Repositório: https://github.com/fernandinhomartins40/urbansend/*