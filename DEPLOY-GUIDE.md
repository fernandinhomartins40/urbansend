# 🚀 UltraZend - Guia de Deploy Completo

## 📋 Scripts de Deploy Disponíveis

### 1. **`deploy.sh`** - Master Script (RECOMENDADO)
Script inteligente que detecta automaticamente o tipo de deploy necessário.

```bash
# Menu interativo
./deploy.sh

# Deploy automático (detecta o tipo)
./deploy.sh AUTO

# Fresh install em servidor limpo
./deploy.sh FRESH

# Update de aplicação existente
./deploy.sh UPDATE

# Quick start completo
./deploy.sh QUICKSTART
```

### 2. **`deploy-fresh-server.sh`** - Servidor Limpo
Para primeira instalação em servidor completamente limpo.

```bash
chmod +x deploy-fresh-server.sh
./deploy-fresh-server.sh
```

**Inclui:**
- Instalação de dependências (Node.js, Nginx, PM2, etc.)
- Configuração de firewall
- Certificados SSL automáticos
- Configuração completa do ambiente

### 3. **`deploy-update.sh`** - Atualizações
Para atualizar aplicação já existente com zero downtime.

```bash
chmod +x deploy-update.sh
./deploy-update.sh
```

**Características:**
- Backup automático antes da atualização
- Rollback automático em caso de falha
- Zero downtime deployment
- Health checks pós-deploy

### 4. **`quick-start.sh`** - Setup Completo
Configuração completa incluindo email, backup e monitoramento.

```bash
chmod +x quick-start.sh
./quick-start.sh
```

## 🎯 Cenários de Uso

### Cenário 1: Primeiro Deploy (Servidor Limpo)
**Situação:** VPS limpa, primeira instalação
```bash
./deploy.sh FRESH
```

### Cenário 2: Atualizando Código
**Situação:** Aplicação já rodando, precisa atualizar
```bash  
./deploy.sh UPDATE
```

### Cenário 3: Não Sei Qual Usar
**Situação:** Deixar o script decidir
```bash
./deploy.sh AUTO
```

### Cenário 4: Setup Enterprise Completo
**Situação:** Quer email, backup e monitoramento
```bash
./deploy.sh QUICKSTART
```

## 🔧 Pré-Requisitos

### Local (Desenvolvimento)
- Node.js 18+ instalado
- NPM com dependências instaladas
- Builds frontend/backend prontos (ou será feito automaticamente)

### Servidor (Produção)  
- Ubuntu 20.04+ ou similar
- Acesso SSH como root
- Porta 22 (SSH), 80 (HTTP), 443 (HTTPS) abertas
- Domínio apontando para o servidor

## 📁 Estrutura de Arquivos Necessária

```
urbansend/
├── backend/
│   ├── package.json
│   ├── dist/index.js (será criado automaticamente)
│   └── src/
├── frontend/
│   ├── package.json  
│   ├── dist/ (será criado automaticamente)
│   └── src/
├── configs/
│   ├── .env.production
│   └── nginx-ssl.conf
├── ecosystem.config.js
└── deploy scripts (.sh)
```

## ⚙️ Configuração

### 1. Variáveis no Script
Edite as variáveis no início dos scripts conforme necessário:

```bash
# Configuração padrão
SERVER_HOST="31.97.162.155"
SERVER_USER="root"
DOMAIN="ultrazend.com.br"
SUBDOMAIN="www.ultrazend.com.br"
ADMIN_EMAIL="admin@ultrazend.com.br"
```

### 2. SSH Key Setup (Recomendado)
Configure chave SSH para evitar digitar senha:

```bash
# Gerar chave SSH (se não existir)
ssh-keygen -t rsa -b 4096

# Copiar para servidor
ssh-copy-id root@31.97.162.155
```

## 🚀 Deploy Step-by-Step

### Primeiro Deploy

1. **Preparação Local**
   ```bash
   # Clone e prepare projeto
   git clone https://github.com/fernandinhomartins40/urbansend.git
   cd urbansend
   
   # Instalar dependências
   cd backend && npm install && cd ..
   cd frontend && npm install && cd ..
   ```

2. **Executar Deploy**
   ```bash
   # Deploy inteligente
   ./deploy.sh AUTO
   
   # OU deploy fresh específico
   ./deploy.sh FRESH
   ```

3. **Verificar Resultado**
   ```bash
   # Check health
   curl https://www.ultrazend.com.br/health
   
   # Check logs
   ssh root@31.97.162.155 'pm2 logs ultrazend'
   ```

### Deploys Posteriores (Updates)

1. **Fazer Alterações no Código**
   ```bash
   # Editar código, fazer commits, etc.
   git add .
   git commit -m "Nova feature"
   ```

2. **Deploy Update**  
   ```bash
   ./deploy.sh UPDATE
   ```

3. **Verificar**
   ```bash
   curl https://www.ultrazend.com.br/health
   ```

## 🛠️ Troubleshooting

### Deploy Falha

1. **Verificar Logs**
   ```bash
   # Logs do script
   tail -f /tmp/ultrazend-*-deploy-*.log
   
   # Logs da aplicação
   ssh root@31.97.162.155 'pm2 logs ultrazend'
   ```

2. **Rollback Manual**
   ```bash
   ssh root@31.97.162.155
   cd /var/www/ultrazend
   pm2 stop ultrazend
   
   # Restaurar backup mais recente
   cd /var/backups/ultrazend
   latest_backup=$(ls -t *.tar.gz | head -1)
   tar -xzf "$latest_backup" -C /var/www/ultrazend --strip-components=1
   
   pm2 start /var/www/ultrazend/ecosystem.config.js --env production
   ```

### Aplicação Não Inicia

1. **Verificar PM2**
   ```bash
   ssh root@31.97.162.155 'pm2 status'
   ssh root@31.97.162.155 'pm2 logs ultrazend --lines 50'
   ```

2. **Verificar Dependências**
   ```bash
   ssh root@31.97.162.155
   cd /var/www/ultrazend/backend
   npm install --production
   ```

3. **Verificar Build**
   ```bash
   ssh root@31.97.162.155
   cd /var/www/ultrazend/backend
   ls -la dist/
   npm run build
   ```

### SSL Não Funciona

1. **Verificar Certificados**
   ```bash
   ssh root@31.97.162.155 'ls -la /etc/letsencrypt/live/www.ultrazend.com.br/'
   ```

2. **Renovar Certificados**
   ```bash
   ssh root@31.97.162.155
   systemctl stop nginx
   certbot renew --force-renewal
   systemctl start nginx
   ```

### Nginx Não Funciona

1. **Verificar Status**
   ```bash
   ssh root@31.97.162.155 'systemctl status nginx'
   ```

2. **Testar Configuração**
   ```bash
   ssh root@31.97.162.155 'nginx -t'
   ```

3. **Verificar Logs**
   ```bash
   ssh root@31.97.162.155 'tail -f /var/log/nginx/error.log'
   ```

## 📊 Monitoramento Pós-Deploy

### Comandos Úteis
```bash
# Status geral
ssh root@31.97.162.155 'pm2 status && systemctl status nginx'

# Logs em tempo real
ssh root@31.97.162.155 'pm2 logs ultrazend --follow'

# Monitoramento de recursos
ssh root@31.97.162.155 'pm2 monit'

# Health check manual
curl -v https://www.ultrazend.com.br/health
```

### Métricas Importantes
- **Response Time**: < 500ms
- **Memory Usage**: < 512MB
- **CPU Usage**: < 50%
- **Uptime**: > 99%
- **Error Rate**: < 1%

## 🔒 Segurança

### Checklist Pós-Deploy
- [ ] SSL/TLS funcionando (A+ rating)
- [ ] Firewall configurado (apenas portas necessárias)
- [ ] SSH com chave (desabilitar password se possível)
- [ ] Aplicação rodando como www-data (não root)
- [ ] Logs protegidos e rotacionados
- [ ] Backup automático funcionando

### Hardening Adicional
```bash
# Desabilitar root login SSH
ssh root@31.97.162.155 'sed -i "s/PermitRootLogin yes/PermitRootLogin no/" /etc/ssh/sshd_config'

# Configurar fail2ban
ssh root@31.97.162.155 'apt install fail2ban && systemctl enable fail2ban'

# Updates automáticos
ssh root@31.97.162.155 'apt install unattended-upgrades'
```

## 📈 Otimizações

### Performance
- Usar CDN para assets estáticos
- Configurar cache no Nginx
- Otimizar imagens e assets
- Monitorar métricas de performance

### Escalabilidade  
- Múltiplas instâncias PM2 se necessário
- Load balancer se múltiplos servidores
- Database read replicas para alta carga
- Monitoramento avançado (Prometheus/Grafana)

## 🆘 Suporte

### Logs Importantes
```bash
# Deploy logs
/tmp/ultrazend-*-deploy-*.log

# Application logs  
/var/www/ultrazend/logs/

# System logs
/var/log/nginx/
/var/log/pm2/
```

### Comandos de Emergência
```bash
# Parar tudo
ssh root@31.97.162.155 'pm2 stop all && systemctl stop nginx'

# Reiniciar tudo
ssh root@31.97.162.155 'systemctl start nginx && pm2 restart all'

# Backup de emergência
./backup-system.sh create emergency

# Rollback de emergência
./deploy-update.sh # (fará rollback automático se falhar)
```

---

## 🎉 Deploy Bem-Sucedido!

Após deploy bem-sucedido, sua aplicação estará disponível em:

- 🌐 **Website**: https://www.ultrazend.com.br
- 🔍 **Health Check**: https://www.ultrazend.com.br/health  
- 🔌 **API**: https://www.ultrazend.com.br/api
- 📊 **Monitoring**: Scripts automáticos configurados
- 💾 **Backup**: Sistema automático ativo

**A aplicação UltraZend está agora production-ready!** 🚀