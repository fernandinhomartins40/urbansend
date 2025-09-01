# 🚀 UltraZend - Guia de Troubleshooting de Deploy

## 🔍 Problemas Comuns e Soluções

### 1. Erro: "missing ) after argument list" 

**Sintomas:**
- Console do browser mostra erro de sintaxe em main.tsx
- Landing page não renderiza
- JavaScript falha ao carregar

**Causa Raiz:**
- Arquivos TypeScript (.tsx) sendo servidos ao invés dos compilados (.js)
- Git clone sobrescrevendo o build do frontend

**Solução:**
```bash
# Na VPS, verificar se arquivos compilados estão presentes
ssh root@31.97.162.155 "cd /var/www/ultrazend && ls -la frontend/assets/"

# Se não há assets/, frontend source foi servido por engano
# Rebuild e reenvio do frontend:
cd frontend && npm run build
scp -r dist/* root@31.97.162.155:/var/www/ultrazend/frontend/
```

### 2. Deploy Trava em "waiting restart"

**Sintomas:**
- PM2 mostra status "waiting restart"
- Aplicação não fica online
- Deploy falha após timeout

**Causa Raiz:**
- Diretórios obrigatórios não existem (data/, logs/)
- Permissões incorretas
- Configuração PM2 inválida

**Solução:**
```bash
# Na VPS, criar diretórios e corrigir permissões
ssh root@31.97.162.155 "
  cd /var/www/ultrazend && 
  mkdir -p data logs && 
  touch data/database.sqlite &&
  chown -R www-data:www-data data &&
  pm2 restart ultrazend
"
```

### 3. Nomenclatura Inconsistente

**Sintomas:**
- Conflitos entre "urbansend" e "ultrazend"
- Processos com nomes antigos
- Paths incorretos

**Solução:**
```bash
# Executar busca completa por referências antigas
./scripts/deploy-test.sh

# Se encontradas, corrigir manualmente:
grep -r "urbansend" --exclude-dir=.git --exclude-dir=node_modules .
```

### 4. Frontend Build Não Funciona

**Sintomas:**
- Tela branca no browser
- Erro 404 para assets
- JavaScript não carrega

**Verificações:**
```bash
# 1. Verificar se build existe localmente
cd frontend && ls -la dist/

# 2. Verificar se upload funcionou
ssh root@31.97.162.155 "ls -la /var/www/ultrazend/frontend/assets/"

# 3. Verificar se servidor está servindo arquivos corretos
curl -s https://www.ultrazend.com.br | grep -o 'assets/.*\.js'
```

## 🛠️ Scripts de Diagnóstico

### Verificação Completa da VPS
```bash
ssh root@31.97.162.155 "
  echo '=== PM2 STATUS ==='
  pm2 status
  
  echo '=== PORTAS ==='
  netstat -tlnp | grep -E ':(80|443|3001)'
  
  echo '=== FRONTEND FILES ==='
  ls -la /var/www/ultrazend/frontend/
  
  echo '=== BACKEND STATUS ==='
  curl -s http://localhost:3001/health
  
  echo '=== DISK SPACE ==='
  df -h /var/www/
"
```

### Teste de Conectividade
```bash
# Testar todos os endpoints
curl -I https://www.ultrazend.com.br
curl -I https://www.ultrazend.com.br/health
curl -I https://www.ultrazend.com.br/api/health
```

### Reset Completo (Último Recurso)
```bash
# 1. Parar tudo
ssh root@31.97.162.155 "pm2 delete all && pm2 kill"

# 2. Limpar completamente
ssh root@31.97.162.155 "rm -rf /var/www/ultrazend"

# 3. Trigger novo deploy
echo "$(date)" > .deploy-trigger
git add . && git commit -m "deploy: reset completo" && git push
```

## 📋 Checklist Pré-Deploy

Antes de cada deploy, execute:

```bash
# Execute o script de teste
./scripts/deploy-test.sh

# Verifique se não há referências antigas
grep -r "urbansend" --exclude-dir=.git --exclude-dir=node_modules . || echo "✅ Sem referências antigas"

# Teste builds localmente
cd backend && npm run build && cd ..
cd frontend && npm run build && ls -la dist/assets/ && cd ..

# Verifique commits recentes
git log --oneline -3
```

## 🔧 Configurações Importantes

### Variáveis de Ambiente VPS
```bash
NODE_ENV=production
PORT=3001
HTTPS_PORT=443
DATABASE_URL=/var/www/ultrazend/data/database.sqlite
FRONTEND_URL=https://www.ultrazend.com.br
```

### Estrutura de Diretórios VPS
```
/var/www/ultrazend/
├── backend/          # Código do backend + dist/
├── frontend/         # SOMENTE arquivos compilados (HTML, CSS, JS)
├── data/            # Database SQLite
├── logs/            # Logs da aplicação  
└── ecosystem.config.js
```

### PM2 Configuração
- **Nome do processo**: `ultrazend`
- **Script**: `/var/www/ultrazend/backend/dist/index.js`
- **Modo**: `cluster`
- **Portas**: 80, 443, 3001

## 🚨 Sinais de Alerta

⚠️ **Deploy com problemas se:**
- PM2 status mostra "waiting restart" por mais de 30s
- Health check (/health) não responde
- Frontend serve arquivos .tsx ao invés de .js
- Logs PM2 estão vazios
- Assets directory não existe no frontend

✅ **Deploy bem-sucedido quando:**
- PM2 status: "online" 
- Health check: HTTP 200
- Frontend assets carregando (.js, .css)
- Logs mostram "Sistema criado usuário ID: 1"
- Todas as portas (80, 443, 3001) escutando