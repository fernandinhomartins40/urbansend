#!/bin/sh
# UltraZend Docker Start Script

set -e

echo "🚀 Starting UltraZend services..."

# Start nginx in background
echo "🌐 Starting nginx..."
nginx -t && nginx -g "daemon off;" &

# Start the Node.js backend
echo "🔧 Starting backend service..."
cd /app/backend
exec node dist/index.js