# Deployment Guide - UrbanSend Unified Container

## Arquitetura da Solução

A aplicação UrbanSend foi configurada para rodar em um **container único e isolado** com as seguintes características:

### Estrutura do Container
- **Porta Externa**: 3010 (aplicação web)
- **Porta SMTP**: 25 (servidor de e-mail)
- **Nginx Interno**: Roteamento entre frontend e backend
- **Redis Isolado**: Porta 6380 (não conflita com outras aplicações)

### Componentes
1. **Frontend (React + Vite)**: Servido pelo Nginx na porta 3010
2. **Backend (Node.js + Express)**: Roda na porta 3000 interna
3. **Nginx**: Proxy reverso para roteamento interno
4. **Servidor SMTP**: Porta 25 para delivery de e-mails
5. **Redis**: Sistema de filas isolado

## Deployment

### Opção 1: Deploy Local (Requer SSH configurado)
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Opção 2: Deploy para CI/CD
```bash
chmod +x scripts/deploy-ci.sh
./scripts/deploy-ci.sh
```

### Opção 3: Deploy GitHub Actions
```bash
chmod +x scripts/deploy-github.sh
./scripts/deploy-github.sh
```

## Scripts de Deploy Disponíveis

### 🔧 `scripts/deploy.sh` - Deploy Local
- **Uso**: Desenvolvimento local com SSH configurado
- **Requisitos**: Chaves SSH ou senha configurada
- **Funcionalidades**: 
  - Teste de conexão SSH
  - Build automático frontend/backend
  - Cópia otimizada de arquivos
  - Deploy completo com verificações

### 🤖 `scripts/deploy-ci.sh` - Deploy CI/CD
- **Uso**: Ambientes de CI/CD (Jenkins, GitLab CI, etc.)
- **Funcionalidades**:
  - Empacotamento com tar
  - Deploy via pipe SSH
  - Método alternativo para ambientes restritivos
  - Logs detalhados

### 🚀 `scripts/deploy-github.sh` - GitHub Actions
- **Uso**: Integração com GitHub Actions
- **Funcionalidades**:
  - Transferência via base64 (compatível com qualquer shell)
  - Deploy sem dependências externas
  - Configuração automática do nginx
  - Verificações de saúde completas

### 📋 Deploy Manual

1. **Build das aplicações**:
```bash
cd frontend && npm run build
cd ../backend && npm run build
```

2. **Deploy para VPS**:
```bash
# Copiar arquivos
scp -r frontend/dist root@72.60.10.112:/root/urbansend-unified/frontend-dist
scp -r backend/dist root@72.60.10.112:/root/urbansend-unified/backend-dist
scp -r backend/src/migrations root@72.60.10.112:/root/urbansend-unified/backend-migrations
scp backend/package*.json root@72.60.10.112:/root/urbansend-unified/backend-
scp backend/knexfile.js root@72.60.10.112:/root/urbansend-unified/backend-knexfile.js
scp Dockerfile.unified root@72.60.10.112:/root/urbansend-unified/Dockerfile
scp nginx.unified.conf root@72.60.10.112:/root/urbansend-unified/nginx.conf
scp docker-compose.unified.yml root@72.60.10.112:/root/urbansend-unified/docker-compose.yml

# Construir e iniciar containers
ssh root@72.60.10.112 "cd /root/urbansend-unified && docker-compose up --build -d"
```

## Configuração do Nginx da VPS

O nginx da VPS deve estar configurado para:
- **Frontend**: `proxy_pass http://localhost:3010`
- **Backend API**: `proxy_pass http://localhost:3010/api/`

Ambos apontam para a mesma porta 3010, onde o nginx interno faz o roteamento correto.

## Isolamento de Serviços

### Portas Utilizadas
- **3010**: Aplicação UrbanSend (externa)
- **3020**: Aplicação DigiUrban (já existente)
- **25**: SMTP UrbanSend
- **6379**: Redis DigiUrban
- **6380**: Redis UrbanSend (isolado)

### Network Isolation
- Network: `urbansend_network` (isolada)
- Volumes nomeados: `urbansend_*` (isolados)
- Containers prefixados: `urbansend_*`

## Verificações de Saúde

1. **Aplicação Web**:
```bash
curl -f http://localhost:3010/health
```

2. **Servidor SMTP**:
```bash
netstat -tlnp | grep :25
```

3. **Logs**:
```bash
docker-compose logs -f urbansend_app
```

## Troubleshooting

### Container não inicia
```bash
docker-compose logs urbansend_app
docker-compose ps
```

### Porta 25 não está disponível
- Verificar se outro serviço está usando a porta
- Verificar firewall: `ufw allow 25`
- Verificar logs do SMTP: `docker-compose logs urbansend_app | grep SMTP`

### Frontend não carrega
- Verificar nginx interno: `docker-compose exec urbansend_app nginx -t`
- Verificar logs do nginx: `docker-compose logs urbansend_app | grep nginx`

### Backend API não responde
- Verificar conexão com Redis: `docker-compose logs urbansend_redis`
- Verificar banco de dados: logs de migração
- Verificar variáveis de ambiente no docker-compose

## Monitoramento

### Health Checks
- Container health: `docker-compose ps`
- Application health: `curl http://localhost:3010/health`
- SMTP server: `telnet localhost 25`

### Logs
```bash
# Todos os logs
docker-compose logs -f

# Apenas aplicação
docker-compose logs -f urbansend_app

# Apenas Redis
docker-compose logs -f urbansend_redis
```