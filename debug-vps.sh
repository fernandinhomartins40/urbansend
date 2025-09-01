#!/bin/bash

# Debug script for VPS diagnosis
VPS_HOST="31.97.162.155"
VPS_USER="root"

echo "🔍 Diagnosticando VPS $VPS_HOST..."

sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST << 'DEBUG'

echo "📋 1. Status do PM2:"
pm2 status

echo ""
echo "📋 2. Logs do PM2 (últimas 30 linhas):"
pm2 logs ultrazend --lines 30

echo ""
echo "📋 3. Verificando porta 3001:"
netstat -tlnp | grep :3001 || echo "Porta 3001 não está sendo usada"

echo ""
echo "📋 4. Status dos serviços:"
systemctl status nginx --no-pager -l

echo ""
echo "📋 5. Verificando processo Node.js:"
ps aux | grep node || echo "Nenhum processo Node.js rodando"

echo ""
echo "📋 6. Verificando arquivos de log:"
ls -la /var/www/ultrazend/logs/

echo ""
echo "📋 7. Verificando estrutura de diretórios:"
ls -la /var/www/ultrazend/

echo ""
echo "📋 8. Verificando backend:"
ls -la /var/www/ultrazend/backend/

echo ""
echo "📋 9. Verificando .env:"
ls -la /var/www/ultrazend/backend/.env

echo ""
echo "📋 10. Testando conexão HTTP local:"
curl -I http://localhost:3001/health 2>/dev/null || echo "Backend não responde localmente"

DEBUG