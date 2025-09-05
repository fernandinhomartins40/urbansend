#!/bin/bash

# 📦 INSTALADOR ULTRAZEND PARA VPS
# Execute este comando no seu servidor VPS:
# curl -sSL https://raw.githubusercontent.com/fernandinhomartins40/urbansend/main/install-on-vps.sh | bash

echo "📦 INSTALANDO ULTRAZEND NA VPS..."
echo "=================================="

# Verificar se é root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Execute como root: sudo bash install-on-vps.sh"
    exit 1
fi

# Baixar e executar script principal
echo "📥 Baixando script de deploy..."
curl -sSL https://raw.githubusercontent.com/fernandinhomartins40/urbansend/main/deploy-direct.sh -o /tmp/deploy-direct.sh
chmod +x /tmp/deploy-direct.sh

echo "🚀 Executando deploy completo..."
bash /tmp/deploy-direct.sh

echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo ""
echo "🌐 Seu site está em: http://www.ultrazend.com.br"
echo "📊 Para monitorar: pm2 list"
echo "🔄 Para redeploy: bash /var/www/ultrazend/redeploy.sh"