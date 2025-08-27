# 🚀 Deploy Guide - UrbanSend

Este guia explica como fazer deploy da aplicação UrbanSend na VPS usando GitHub Actions.

## 📋 Pré-requisitos

1. **VPS Configurada**: 
   - IP: `72.60.10.112`
   - Usuário: `root`
   - Senha configurada no GitHub Secrets como `VPS_PASSWORD`

2. **GitHub Repository**:
   - Secret `VPS_PASSWORD` configurado
   - Acesso aos workflows do GitHub Actions

## 🔧 Configuração do Deploy

### 1. Secret do GitHub

Certifique-se que o secret `VPS_PASSWORD` está configurado no repositório:
- Vá em **Settings** > **Secrets and variables** > **Actions**
- Adicione `VPS_PASSWORD` com a senha do usuário root da VPS

### 2. Portas da Aplicação

- **Backend**: http://72.60.10.112:3010
- **Frontend**: http://72.60.10.112:3011  
- **Redis Commander**: http://72.60.10.112:8082

## 🚀 Deploy Automático

### Triggers do Deploy

O deploy acontece automaticamente quando:
- 📝 Push para branch `main` ou `master`
- 🔄 Execução manual via GitHub Actions

### Processo do Deploy

1. **Build**: Compila frontend e backend com TypeScript strict mode
2. **Validação**: Executa typechecking em ambos os projetos
3. **Deploy**: 
   - Instala dependências na VPS
   - Instala Docker/Docker Compose se necessário
   - Copia arquivos de build
   - Configura ambiente de produção
   - Inicia containers Docker
   - Executa migrações do banco de dados

### Arquivos de Deploy

- **`.github/workflows/deploy.yml`**: Workflow principal (completo)
- **`.github/workflows/deploy-v2.yml`**: Workflow otimizado (usa script)
- **`scripts/deploy.sh`**: Script de deploy standalone

## 🐳 Arquitetura do Deploy

```yaml
services:
  backend:
    ports: ["3010:3000"]
    environment:
      - NODE_ENV=production
      - JWT_SECRET=urbansend-super-secret-jwt-key-production-2024
      - CORS_ORIGIN=http://72.60.10.112:3011
  
  frontend:
    ports: ["3011:80"]
    
  redis:
    ports: ["6380:6379"]
    
  redis-commander:
    ports: ["8082:8081"]
```

## 🔍 Monitoramento

### Health Check

- **Endpoint**: `http://72.60.10.112:3010/health`
- **Response**:
```json
{
  "status": "OK",
  "timestamp": "2024-01-XX...",
  "uptime": 123.45,
  "environment": "production"
}
```

### Logs

Para visualizar logs da aplicação:

```bash
ssh root@72.60.10.112
cd /var/www/urbansend
docker-compose logs -f
```

### Containers

Para verificar status dos containers:

```bash
ssh root@72.60.10.112
cd /var/www/urbansend
docker ps
```

## 🔧 Deploy Manual

Se necessário, você pode executar deploy manual:

```bash
# Clone o repositório
git clone <repo-url>
cd urbansend

# Build local
cd frontend && npm ci && npm run build && cd ..
cd backend && npm ci && npm run build && cd ..

# Deploy usando script
chmod +x scripts/deploy.sh
VPS_PASSWORD="sua-senha" ./scripts/deploy.sh
```

## 🛠️ Troubleshooting

### Problemas Comuns

1. **Port já em uso**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

2. **Migrations falharam**:
   ```bash
   docker-compose exec backend npm run migrate:latest
   ```

3. **Rebuild completo**:
   ```bash
   docker-compose down -v
   docker system prune -f
   docker-compose up -d --build
   ```

### Verificações

- ✅ VPS acessível: `ping 72.60.10.112`
- ✅ SSH funcionando: `ssh root@72.60.10.112`
- ✅ Docker instalado: `docker --version`
- ✅ Aplicação rodando: `curl http://72.60.10.112:3010/health`

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do GitHub Actions
2. Acesse a VPS e verifique logs dos containers
3. Teste os endpoints de health check
4. Verifique se todas as portas estão liberadas

---

**🎉 Deploy configurado com sucesso!** 

A aplicação será automaticamente deployada a cada push para a branch main.