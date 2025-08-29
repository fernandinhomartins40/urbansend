#!/bin/bash
set -e

echo "🚀 Deploying UrbanSend..."

# Build locally and save
echo "📦 Building and saving image..."
docker build -t urbansend .
docker save urbansend:latest | gzip > urbansend.tar.gz

# Transfer to VPS
echo "📤 Transferring to VPS..."
scp urbansend.tar.gz root@72.60.10.112:/root/
scp docker-compose.yml root@72.60.10.112:/root/

# Deploy on VPS
echo "🐳 Deploying on VPS..."
ssh root@72.60.10.112 '
    cd /root
    docker load < urbansend.tar.gz
    docker-compose down || true
    docker-compose up -d
    sleep 10
    docker ps
    echo "✅ Deploy completed!"
'

echo "🌐 Application available at: http://72.60.10.112:3010"