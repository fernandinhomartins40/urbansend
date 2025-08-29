# Deploy Manual - UrbanSend

## Problema Identificado
O erro `Permission denied (publickey,password)` indica que a autenticação SSH não está funcionando adequadamente.

## Soluções Possíveis

### Opção 1: Configurar Chave SSH
```bash
# Gerar chave SSH (se não existir)
ssh-keygen -t rsa -b 4096 -C "seu_email@exemplo.com"

# Copiar chave pública para o servidor
ssh-copy-id root@72.60.10.112
```

### Opção 2: Deploy Manual via Terminal SSH
1. Conecte-se manualmente ao servidor:
```bash
ssh root@72.60.10.112
```

2. Execute os seguintes comandos no servidor:
```bash
# Navegar para o diretório do projeto
cd /root/urbansend-sync

# Fazer pull das mudanças
git pull origin main

# Construir backend
cd backend
npm ci
npm run build

# Construir frontend  
cd ../frontend
npm ci
npm run build

# Copiar arquivos para produção
cd ..
mkdir -p /var/www/urbansend
cp -r backend/dist /var/www/urbansend/
cp backend/package*.json /var/www/urbansend/
cp backend/knexfile.js /var/www/urbansend/
mkdir -p /var/www/urbansend/src
cp -r backend/src/migrations /var/www/urbansend/src/
mkdir -p /var/www/urbansend/frontend-dist
cp -r frontend/dist/* /var/www/urbansend/frontend-dist/
cp Dockerfile.backend /var/www/urbansend/
cp Dockerfile.frontend /var/www/urbansend/
cp nginx.conf /var/www/urbansend/
cp docker-compose.production.yml /var/www/urbansend/docker-compose.yml

# Deploy com Docker
cd /var/www/urbansend
docker-compose -p urbansend down --remove-orphans || true
docker-compose -p urbansend up -d --build

# Aguardar e executar migrações
sleep 30
docker-compose -p urbansend exec -T urbansend_backend npm run migrate:latest || true

# Verificar status
docker ps --filter 'name=urbansend_'
```

### Opção 3: Reiniciar Serviços Existentes
Se os containers já estão rodando, apenas reinicie:
```bash
ssh root@72.60.10.112 "cd /var/www/urbansend && docker-compose -p urbansend restart"
```

## Verificação
Após o deploy, verifique:
- Frontend: https://www.urbanmail.com.br
- Backend: https://www.urbanmail.com.br/api/health
- Redis UI: http://72.60.10.112:8082

## Troubleshooting SSH

### Verificar se SSH está funcionando
```bash
# Teste de conectividade
telnet 72.60.10.112 22

# Teste SSH com debug
ssh -v root@72.60.10.112
```

### Configurar SSH no Windows (se necessário)
```bash
# Instalar OpenSSH (PowerShell como Admin)
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0

# Ou usar PuTTY/WSL para SSH
```

## Correção da Aplicação

O principal problema que foi corrigido:
- **CORS**: Adicionado `https://www.urbanmail.com.br` aos origins permitidos
- **Configuração**: Sincronizados arquivos entre workspace e VPS
- **Build**: Garantido que o build está funcionando

## Próximos Passos

1. Resolver problema de SSH para automatizar deploy
2. Testar a aplicação após deploy manual
3. Verificar se o erro de CORS foi resolvido no registro de usuários