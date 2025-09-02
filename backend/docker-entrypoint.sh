#!/bin/bash
set -e

# Corrigir permissões dos volumes montados
echo "🔧 Corrigindo permissões dos volumes..."

# Criar diretórios de logs necessários se não existirem
mkdir -p /app/logs/application /app/logs/errors /app/logs/combined /app/logs/exceptions
mkdir -p /app/data

# Corrigir permissões (precisa ser feito após mount dos volumes)
if [ "$(id -u)" = "0" ]; then
    # Se rodando como root, mudar ownership e depois executar como ultrazend
    chown -R ultrazend:nodejs /app/logs /app/data
    chmod -R 755 /app/logs /app/data
    echo "✅ Permissões corrigidas pelo root"
    # Executar comando como usuário ultrazend
    exec su ultrazend -c "$*"
else
    # Já é usuário ultrazend, só corrigir permissões possíveis
    chmod -R 755 /app/logs /app/data 2>/dev/null || echo "⚠️ Não foi possível corrigir todas as permissões"
    echo "✅ Iniciando aplicação como ultrazend"
fi

# Executar comando passado como parâmetro
exec "$@"