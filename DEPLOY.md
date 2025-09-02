# 🚀 UltraZend - Deploy Guide

## 📋 Nova Estrutura Organizada

**Antes**: 46 arquivos de deploy diferentes
**Agora**: 3 scripts limpos e eficientes

### 📁 Arquivos de Deploy

```
├── deploy.sh              # 🎯 Script principal unificado
├── setup-server.sh        # 🏗️ Configuração inicial do servidor  
├── ecosystem.config.js    # ⚙️ Configuração PM2
├── docker-compose.prod.yml # 🐳 Configuração Docker
└── .github/workflows/deploy-production.yml # 🤖 CI/CD
```

## 🚀 Como Fazer Deploy

### **Opção 1: Deploy Automático (Recomendado)**
```bash
# Auto-detecta melhor método (Docker ou PM2)
./deploy.sh

# Específicar método
./deploy.sh docker
./deploy.sh pm2

# Modo automático (sem confirmação)
./deploy.sh docker --auto
```

### **Opção 2: Servidor Novo (Primeira vez)**
```bash
# 1. Configurar servidor limpo
./setup-server.sh

# 2. Fazer deploy
./deploy.sh docker
```

### **Opção 3: GitHub Actions** 
```bash
# Automático no push para main
git push origin main
```

## 📊 Métodos de Deploy

### 🐳 **Docker (Recomendado)**
- ✅ Isolamento completo
- ✅ Health checks nativos  
- ✅ Rollback fácil
- ✅ Escalabilidade
- ✅ Zero dependências do servidor

```bash
./deploy.sh docker
```

### 📦 **PM2 (Tradicional)**
- ✅ Deploy direto no servidor
- ✅ Controle granular
- ✅ Menor uso de recursos
- ⚠️ Dependente do ambiente

```bash
./deploy.sh pm2
```

## 🔧 Scripts Detalhados

### **`deploy.sh` - Master Script**
- Auto-detecção do melhor método
- Validação de pré-requisitos
- Build das aplicações
- Transfer de arquivos
- Deploy inteligente
- Health checks

### **`setup-server.sh` - Server Setup**
- Atualização do sistema
- Instalação Node.js, Docker, Nginx
- Configuração firewall
- Criação de diretórios
- Configuração Nginx básica

## 📋 Pré-requisitos

### **Local**
- Node.js 18+
- npm 9+
- Git
- SSH access ao servidor

### **Servidor**
- Ubuntu 20.04+ ou Debian 11+
- SSH root access
- Portas 80, 443, 25, 587 abertas

## 🎯 Comandos Úteis

### **Status e Monitoramento**
```bash
# PM2
ssh root@31.97.162.155 'pm2 status'
ssh root@31.97.162.155 'pm2 logs ultrazend'

# Docker  
ssh root@31.97.162.155 'docker ps'
ssh root@31.97.162.155 'docker logs ultrazend-backend'

# Nginx
ssh root@31.97.162.155 'systemctl status nginx'
```

### **Troubleshooting**
```bash
# Health check manual
curl -f https://www.ultrazend.com.br/health

# Logs da aplicação
ssh root@31.97.162.155 'tail -f /var/www/ultrazend/logs/app.log'

# Restart serviços
ssh root@31.97.162.155 'pm2 restart ultrazend'
# ou
ssh root@31.97.162.155 'docker-compose -f /var/www/ultrazend/docker-compose.prod.yml restart'
```

## ⚙️ Configuração

### **Variáveis de Ambiente**
- `configs/.env.production` - Configuração principal
- `backend/.env.production.deploy` - Configuração alternativa

### **URLs de Produção**
- Website: https://www.ultrazend.com.br
- API: https://www.ultrazend.com.br/api
- Health: https://www.ultrazend.com.br/health

## 🔒 SSL/HTTPS

```bash
# Após primeiro deploy, configurar SSL
ssh root@31.97.162.155
certbot --nginx -d ultrazend.com.br -d www.ultrazend.com.br --email admin@ultrazend.com.br --agree-tos --non-interactive
```

## 🆘 Emergency

Se algo der errado:

```bash
# Rollback rápido via PM2
ssh root@31.97.162.155 'pm2 restart ultrazend'

# Rollback via Docker
ssh root@31.97.162.155 'cd /var/www/ultrazend && docker-compose -f docker-compose.prod.yml restart'

# Reset completo (última opção)
./setup-server.sh  # Reconfigurar servidor
./deploy.sh fresh  # Deploy limpo
```

## ✅ Melhorias Implementadas

### **Organização**
- ✅ 46 → 3 arquivos de deploy
- ✅ Scripts unificados e inteligentes
- ✅ Auto-detecção de método
- ✅ Configuração centralizada

### **Robustez**
- ✅ Validação de pré-requisitos
- ✅ Health checks automáticos
- ✅ Fallback de configuração
- ✅ Error handling robusto

### **Simplicidade**
- ✅ Comando único: `./deploy.sh`
- ✅ Setup automático de servidor
- ✅ Deploy sem surpresas
- ✅ Documentação clara

---

**🎉 Agora você tem um sistema de deploy limpo, organizado e confiável!**