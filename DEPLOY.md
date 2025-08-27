# 🚀 Deploy Guide - UrbanSend (Isolated Docker)

Este guia explica como fazer deploy ISOLADO da aplicação UrbanSend na VPS usando GitHub Actions com Docker completamente isolado.

## 🔒 Isolamento Completo

A aplicação é deployada com **isolamento total** para evitar conflitos com outras aplicações na mesma VPS:

- ✅ **Network isolada**: `urbansend_network`
- ✅ **Containers nomeados**: `urbansend_backend`, `urbansend_frontend`, `urbansend_redis`
- ✅ **Volumes isolados**: `urbansend_redis_data`, `urbansend_backend_data`
- ✅ **Portas dedicadas**: 3010 (backend), 3011 (frontend), 6380 (redis), 8082 (redis-ui)
- ✅ **Project namespace**: Todos os recursos Docker usam prefixo `urbansend`

## 📋 Pré-requisitos

1. **VPS Configurada**: 
   - IP: `72.60.10.112`
   - Usuário: `root`
   - Senha configurada no GitHub Secrets como `VPS_PASSWORD`
   - Docker será instalado automaticamente se não existir

2. **GitHub Repository**:
   - Secret `VPS_PASSWORD` configurado
   - Acesso aos workflows do GitHub Actions

## 🐳 Arquitetura Docker Isolada

```yaml
# Rede isolada
networks:
  urbansend_network:
    driver: bridge

# Volumes isolados  
volumes:
  urbansend_redis_data:
  urbansend_backend_data: 
  urbansend_backend_logs:

# Containers isolados
services:
  urbansend_backend:
    container_name: urbansend_backend
    ports: ["3010:3000"]
    networks: [urbansend_network]
    
  urbansend_frontend:
    container_name: urbansend_frontend  
    ports: ["3011:80"]
    networks: [urbansend_network]
    
  urbansend_redis:
    container_name: urbansend_redis
    ports: ["6380:6379"]  
    networks: [urbansend_network]
    
  urbansend_redis_ui:
    container_name: urbansend_redis_ui
    ports: ["8082:8081"]
    networks: [urbansend_network]
```

## 🚀 Deploy Automático

### Triggers do Deploy

O deploy acontece automaticamente quando:
- 📝 Push para branch `main` ou `master`
- 🔄 Execução manual via GitHub Actions

### Processo do Deploy Isolado

1. **Build**: Compila frontend e backend com TypeScript strict mode
2. **Validação**: Executa typechecking em ambos os projetos
3. **Preparação Docker**: 
   - Cria Dockerfiles otimizados para produção
   - Configura nginx.conf para frontend
   - Copia arquivos de build para VPS
4. **Deploy Isolado**:
   - Para containers existentes da aplicação (apenas UrbanSend)
   - Remove network anterior se existir
   - Cria network isolada `urbansend_network`
   - Constrói e inicia containers com nomes únicos
   - Executa migrações do banco de dados
   - Verifica saúde dos serviços

## 🔧 Portas e Acesso

- **Backend**: http://72.60.10.112:3010
- **Frontend**: http://72.60.10.112:3011  
- **Redis**: Interno na rede Docker (não exposto)
- **Redis UI**: http://72.60.10.112:8082

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

### Logs Isolados

Para visualizar logs apenas da aplicação UrbanSend:

```bash
ssh root@72.60.10.112
cd /var/www/urbansend

# Logs de todos os containers UrbanSend
docker-compose -p urbansend logs -f

# Logs específicos
docker logs urbansend_backend -f
docker logs urbansend_frontend -f  
docker logs urbansend_redis -f
```

### Status dos Containers

Para verificar status dos containers UrbanSend:

```bash
# Apenas containers UrbanSend
docker ps --filter 'name=urbansend_'

# Ou usando docker-compose
cd /var/www/urbansend
docker-compose -p urbansend ps
```

## 🔧 Gerenciamento da Aplicação

### Comandos de Controle

```bash
ssh root@72.60.10.112
cd /var/www/urbansend

# Parar aplicação (sem afetar outras apps)
docker-compose -p urbansend down

# Reiniciar aplicação
docker-compose -p urbansend restart

# Rebuild completo
docker-compose -p urbansend down
docker-compose -p urbansend up -d --build

# Ver recursos utilizados
docker-compose -p urbansend top
```

### Limpeza (se necessário)

```bash
# Remover completamente a aplicação
docker-compose -p urbansend down -v --remove-orphans
docker network rm urbansend_network
docker volume rm urbansend_redis_data urbansend_backend_data urbansend_backend_logs
```

## 🛠️ Troubleshooting

### Problemas Comuns

1. **Conflito de Portas**:
   - As portas 3010, 3011, 6380, 8082 devem estar livres
   - Verificar: `netstat -tlnp | grep :3010`

2. **Containers não iniciam**:
   ```bash
   cd /var/www/urbansend
   docker-compose -p urbansend logs
   ```

3. **Network isolada com problemas**:
   ```bash
   docker network rm urbansend_network
   docker-compose -p urbansend up -d
   ```

4. **Rebuild completo**:
   ```bash
   docker-compose -p urbansend down -v
   docker system prune -f
   docker-compose -p urbansend up -d --build
   ```

### Verificações de Isolamento

```bash
# Verificar se a rede está isolada
docker network inspect urbansend_network

# Verificar se volumes estão isolados  
docker volume ls | grep urbansend

# Verificar se containers estão usando recursos isolados
docker inspect urbansend_backend | grep -A 5 "Networks"
```

## 📞 Vantagens do Deploy Isolado

✅ **Zero conflitos** com outras aplicações na VPS  
✅ **Recursos dedicados** (volumes, networks, containers)  
✅ **Gerenciamento independente** (start/stop/restart)  
✅ **Logs separados** para facilitar debugging  
✅ **Upgrades seguros** sem afetar outras aplicações  
✅ **Backup granular** de dados específicos da aplicação  
✅ **Monitoramento isolado** de recursos  

---

**🔒 Deploy Isolado Configurado com Sucesso!** 

A aplicação UrbanSend roda completamente isolada, sem interferir com outras aplicações na VPS.