# 🚀 GitHub Actions Workflows - UrbanSend

Este diretório contém os workflows automatizados para deploy da aplicação **UrbanSend** na VPS de produção.

## 📁 Arquivos Ativos

- **`deploy.yml`**: 🚀 Workflow principal de deploy para produção
- **`fix-connectivity.yml`**: 🔧 Workflow para diagnóstico e correção de problemas
- **`README.md`**: 📖 Este arquivo de documentação

## 🎯 Deploy Automático

### ✅ Deploy Principal (deploy.yml)

**Trigger automático:** Push para branch `main`  
**Trigger manual:** Via GitHub Actions UI

**Funcionalidades:**
- ✅ Build otimizado do backend (TypeScript → JavaScript)
- ✅ Build otimizado do frontend (React/Vite → Static files)
- ✅ Deploy via Docker Production com multi-stage builds
- ✅ Configuração automática do ambiente VPS
- ✅ Nginx reverse proxy com SSL ready
- ✅ Health checks avançados
- ✅ Rollback em caso de falha

### 🔧 Correção de Problemas (fix-connectivity.yml)

**Trigger:** Manual apenas

**Ações disponíveis:**
- `diagnose`: 🔍 Diagnóstico completo do sistema
- `fix-firewall`: 🔥 Correção de regras de firewall
- `restart-services`: 🔄 Reiniciar serviços UrbanSend
- `full-reset`: 💥 Reset completo do ambiente

## ⚙️ Configuração Necessária

### Secrets do GitHub (obrigatórios)

Configure em: **Settings → Secrets and variables → Actions**

```
VPS_PASSWORD: senha_do_usuario_root_da_vps
```

### Variáveis de Ambiente

- **VPS_HOST**: `72.60.10.112`
- **DOMAIN**: `www.urbanmail.com.br`
- **APP_DIR**: `/var/www/urbansend`

## 🚀 Como Fazer Deploy

### 1. Deploy Automático (Recomendado)
```bash
git add .
git commit -m "feat: nova funcionalidade"
git push origin main
```
> Deploy inicia automaticamente em 5-10 segundos

### 2. Deploy Manual
1. Acesse **Actions** no GitHub
2. Selecione "🚀 Deploy UrbanSend Production"
3. Clique em "Run workflow"
4. Aguarde conclusão (~5-10 minutos)

## 📊 O que Acontece no Deploy

1. **🏗️ Build Phase** (~3-4 min):
   - Setup Node.js 18
   - Install dependencies
   - Compile TypeScript backend
   - Build React frontend
   - Validate builds

2. **🚀 Deploy Phase** (~2-3 min):
   - Configure VPS environment
   - Install Docker & Docker Compose
   - Stop old containers
   - Copy application files
   - Start production services
   - Run database migrations

3. **✅ Verification** (~1-2 min):
   - Configure Nginx reverse proxy
   - Health check endpoints
   - Validate SMTP server
   - Generate SSL-ready configuration

## 🌐 URLs Pós-Deploy

- **Frontend**: https://www.urbanmail.com.br
- **API**: https://www.urbanmail.com.br/api/
- **Health Check**: http://72.60.10.112:3010/health
- **SMTP Server**: 72.60.10.112:25

## 🔧 Solução de Problemas

### ❌ Deploy Falhou?

1. **Verifique logs**:
   - Actions → Deploy → Click no job com erro
   - Expanda step com ❌ para ver detalhes

2. **Problemas comuns**:
   - Senha VPS incorreta → Atualize secret `VPS_PASSWORD`
   - Timeout SSH → Verifique conectividade da VPS
   - Build falhou → Verifique erros de TypeScript/compilação

3. **Diagnosticar VPS**:
   - Actions → "🔧 Fix VPS Connectivity Issues"
   - Selecione "diagnose" → Run workflow

### 🆘 Reset Completo

Se nada funcionar:
1. Actions → "🔧 Fix VPS Connectivity Issues"
2. Selecione "full-reset" → Run workflow
3. Aguarde 10-15 minutos
4. Execute deploy novamente

## 🔐 Configuração SSL (Pós-Deploy)

SSH na VPS e execute:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d www.urbanmail.com.br
```

## 📈 Status do Sistema

Após deploy bem-sucedido, monitore via:
- Health endpoint: `curl http://72.60.10.112:3010/health`
- Logs: `docker compose -f docker-compose.production.yml logs -f`
- Containers: `docker compose -f docker-compose.production.yml ps`

## 🎊 Pronto para Produção!

Sua aplicação **UrbanSend** está configurada para deploy profissional com:
- ✅ Zero-downtime deployments
- ✅ Health checks automáticos  
- ✅ SSL/HTTPS ready
- ✅ SMTP server funcional
- ✅ Monitoramento integrado
- ✅ Rollback automático