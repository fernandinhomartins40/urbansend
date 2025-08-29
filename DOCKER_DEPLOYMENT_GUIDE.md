# 🐳 Guia Completo de Deployment Docker - UrbanSend

## 🎯 IMPLEMENTAÇÃO: Container Único na VPS 72.60.10.112

---

## 📋 VISÃO GERAL

### Arquitetura Implementada:
```
Container UrbanSend (72.60.10.112:3010)
├── 🌐 Nginx (Reverse Proxy + Static Assets)
├── 🔧 Backend Node.js (API + WebSocket)
├── 📧 SMTP Server (Porta 25)
├── 🗄️ SQLite Database (Volume Persistente)
└── 📊 Logs e Uploads (Volumes Persistentes)
```

### Portas Configuradas:
- **3010**: Aplicação principal (HTTP) ⭐
- **25**: SMTP Server (Email) 📧

---

## 🚀 DEPLOYMENT RÁPIDO

### 1. Deploy Automatizado (Recomendado):
```bash
# Dar permissão e executar
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

### 2. Deploy Manual:
```bash
# 1. Build da imagem
docker build -t urbansend:latest .

# 2. Iniciar aplicação
docker-compose up -d

# 3. Verificar status
docker-compose ps
docker-compose logs -f
```

---

## 🛠️ CONFIGURAÇÃO DETALHADA

### Estrutura de Arquivos:
```
urbansend/
├── 🐳 Dockerfile                 # Imagem principal
├── 🔧 docker-compose.yml         # Produção
├── 🔧 docker-compose.dev.yml     # Desenvolvimento  
├── 📁 docker/
│   ├── nginx.conf              # Configuração Nginx
│   ├── start.sh                # Script de inicialização
│   ├── .env.production         # Variáveis produção
│   └── .env.development        # Variáveis desenvolvimento
├── 📁 scripts/
│   ├── build-and-test.sh       # Teste local
│   └── deploy-vps.sh           # Deploy automatizado
└── 📄 .dockerignore            # Arquivos ignorados
```

---

## ⚙️ CONFIGURAÇÕES DE PRODUÇÃO

### Variáveis de Ambiente (docker/.env.production):
```bash
# === VPS CONFIGURATION ===
NODE_ENV=production
DOMAIN=72.60.10.112
PORT=3001
PUBLIC_URL=http://72.60.10.112:3010

# === SECURITY (⚠️ ALTERAR EM PRODUÇÃO!) ===
JWT_SECRET=sua_chave_jwt_super_secreta_32_chars
COOKIE_SECRET=sua_chave_cookie_secreta_32_chars
API_KEY_SALT=sua_chave_salt_api_keys_32_chars

# === DATABASE ===
DATABASE_URL=/app/data/database.sqlite

# === SMTP ===
SMTP_SERVER_PORT=25
SMTP_HOSTNAME=72.60.10.112

# === CORS ===
ALLOWED_ORIGINS=http://72.60.10.112:3010
```

### Nginx Configuration:
- ✅ Reverse proxy para backend
- ✅ Servir assets estáticos
- ✅ WebSocket support
- ✅ Rate limiting
- ✅ Security headers
- ✅ GZIP compression

---

## 📊 MONITORAMENTO E MANUTENÇÃO

### Comandos Úteis:
```bash
# Status dos containers
docker-compose ps

# Logs em tempo real
docker-compose logs -f

# Logs específicos
docker-compose logs urbansend

# Restart da aplicação
docker-compose restart

# Parar aplicação
docker-compose down

# Update da aplicação
docker-compose down
docker build -t urbansend:latest .
docker-compose up -d

# Health check manual
curl http://72.60.10.112:3010/health
```

### Verificações de Saúde:
```bash
# 1. Container rodando
docker ps | grep urbansend

# 2. Aplicação respondendo
curl -f http://72.60.10.112:3010/health

# 3. Frontend carregando
curl -f http://72.60.10.112:3010/

# 4. API funcionando
curl -f http://72.60.10.112:3010/api/health

# 5. SMTP ativo
telnet 72.60.10.112 25
```

---

## 🔧 DESENVOLVIMENTO E TESTES

### Teste Local:
```bash
# Executar testes automatizados
chmod +x scripts/build-and-test.sh
./scripts/build-and-test.sh

# Ou desenvolvimento com live reload
docker-compose -f docker-compose.dev.yml up
```

### Debug:
```bash
# Acessar container
docker exec -it urbansend-app bash

# Ver processos internos
docker exec urbansend-app ps aux

# Verificar configurações
docker exec urbansend-app cat /etc/nginx/nginx.conf

# Testar conectividade interna
docker exec urbansend-app curl localhost:3001/api/health
```

---

## 💾 BACKUP E PERSISTÊNCIA

### Volumes Configurados:
- **urbansend_data**: `/app/data` (Database, uploads)
- **urbansend_logs**: `/app/logs` (Logs da aplicação)

### Backup Manual:
```bash
# Backup do banco de dados
docker exec urbansend-app sqlite3 /app/data/database.sqlite ".backup /app/data/backup-$(date +%Y%m%d).sqlite"

# Backup completo dos dados
tar -czf urbansend-backup-$(date +%Y%m%d).tar.gz data/ logs/

# Restore do backup
tar -xzf urbansend-backup-YYYYMMDD.tar.gz
docker-compose down
# Restaurar dados
docker-compose up -d
```

---

## 🚨 TROUBLESHOOTING

### Problemas Comuns:

#### 1. Container não inicia:
```bash
# Verificar logs de build
docker build -t urbansend:latest . --no-cache

# Verificar logs de inicialização
docker-compose logs

# Verificar portas em uso
netstat -tulpn | grep :3010
```

#### 2. Aplicação não responde:
```bash
# Verificar se processos estão rodando
docker exec urbansend-app ps aux

# Testar nginx interno
docker exec urbansend-app curl localhost:3010/health

# Testar backend direto
docker exec urbansend-app curl localhost:3001/api/health

# Restart específico
docker-compose restart urbansend
```

#### 3. SMTP não funciona:
```bash
# Verificar porta 25
telnet 72.60.10.112 25

# Verificar logs do SMTP
docker-compose logs | grep -i smtp

# Verificar configuração
docker exec urbansend-app grep -i smtp /app/.env
```

#### 4. Erro de permissões:
```bash
# Corrigir permissões dos volumes
sudo chown -R 1000:1000 data/ logs/

# Restart após correção
docker-compose restart
```

---

## 🔐 SEGURANÇA

### Pontos Importantes:
1. **⚠️ ALTERAR** secrets em `.env.production`
2. **Firewall**: Liberar apenas portas 3010 e 25
3. **SSL/HTTPS**: Configurar posteriormente se necessário
4. **Backup**: Implementar rotina automática
5. **Updates**: Manter imagens atualizadas

### Comandos de Segurança:
```bash
# Verificar imagens vulneráveis
docker scan urbansend:latest

# Limpar imagens não utilizadas
docker image prune

# Verificar recursos utilizados
docker stats urbansend-app
```

---

## 📈 PERFORMANCE

### Otimizações Implementadas:
- ✅ Alpine Linux (imagem pequena)
- ✅ Multi-stage build
- ✅ Nginx para assets estáticos
- ✅ GZIP compression
- ✅ Cache headers otimizados
- ✅ Health checks configurados
- ✅ Resource limits definidos

### Métricas Esperadas:
- **Tamanho da imagem**: ~200-300MB
- **RAM em uso**: ~256MB
- **Inicialização**: ~30-60 segundos
- **Resposta HTTP**: <100ms (local)

---

## 🎯 PRÓXIMOS PASSOS

### Melhorias Futuras:
1. **SSL/HTTPS**: Implementar certificado
2. **Domínio**: Configurar DNS personalizado
3. **Monitoring**: Prometheus + Grafana
4. **CI/CD**: Pipeline automatizado
5. **Scaling**: Load balancer se necessário

---

## 🆘 SUPORTE

### Logs Importantes:
```bash
# Logs da aplicação
docker-compose logs urbansend

# Logs do sistema
journalctl -u docker

# Logs do nginx
docker exec urbansend-app cat /var/log/nginx/error.log
```

### Contatos de Emergência:
- **Health Check**: `http://72.60.10.112:3010/health`
- **Status Page**: `http://72.60.10.112:3010`
- **Logs**: `docker-compose logs -f`

---

## ✅ CHECKLIST DE DEPLOY

- [ ] VPS acessível via SSH
- [ ] Docker e Docker Compose instalados
- [ ] Portas 3010 e 25 liberadas no firewall
- [ ] Scripts de deploy com permissão de execução
- [ ] Variáveis de ambiente configuradas
- [ ] Backup inicial realizado
- [ ] Health checks funcionando
- [ ] Monitoramento configurado

---

**🎉 Container Único UrbanSend implementado com sucesso na VPS 72.60.10.112:3010**

*Documentação atualizada em 29/08/2025*