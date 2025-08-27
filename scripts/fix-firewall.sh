#!/bin/bash

# UrbanSend Firewall & Port Configuration Script
set -e

VPS_IP="72.60.10.112"
VPS_USER="root"
BACKEND_PORT="3010"
FRONTEND_PORT="3011"
REDIS_PORT="6380"
REDIS_UI_PORT="8082"

echo "🔥 Configuring firewall and ports for UrbanSend..."

sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "
echo '🔍 Checking current firewall status...'

# Check if ufw is active
if command -v ufw &> /dev/null; then
    echo 'UFW Status:'
    ufw status
    
    # Allow UrbanSend ports
    echo '🔓 Opening UrbanSend ports in UFW...'
    ufw allow ${BACKEND_PORT}/tcp comment 'UrbanSend Backend'
    ufw allow ${FRONTEND_PORT}/tcp comment 'UrbanSend Frontend'  
    ufw allow ${REDIS_UI_PORT}/tcp comment 'UrbanSend Redis UI'
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    
    # Enable UFW if not enabled
    echo 'y' | ufw enable || true
    
    echo 'UFW Status after configuration:'
    ufw status numbered
fi

# Check if iptables is being used
echo '🔍 Checking iptables rules...'
iptables -L -n | head -20

# Add iptables rules for UrbanSend ports
echo '🔓 Adding iptables rules for UrbanSend...'
iptables -I INPUT -p tcp --dport ${BACKEND_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${FRONTEND_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport ${REDIS_UI_PORT} -j ACCEPT || true
iptables -I INPUT -p tcp --dport 22 -j ACCEPT || true
iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true  
iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true

# Save iptables rules
if command -v iptables-save &> /dev/null; then
    iptables-save > /etc/iptables/rules.v4 || true
fi

if command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save || true
fi

echo '🔍 Port status check...'
netstat -tlnp | grep -E ':(${BACKEND_PORT}|${FRONTEND_PORT}|${REDIS_UI_PORT})' || echo 'Ports not yet bound - checking Docker...'

echo '🐳 Docker containers status...'
docker ps --filter 'name=urbansend_' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || echo 'No UrbanSend containers running'

echo '🔍 Checking if applications are responding locally...'
curl -s -o /dev/null -w '%{http_code}' http://localhost:${BACKEND_PORT}/health || echo 'Backend not responding locally'
curl -s -o /dev/null -w '%{http_code}' http://localhost:${FRONTEND_PORT}/ || echo 'Frontend not responding locally'

echo '🌐 Testing external connectivity...'
# Test if ports are open externally (from inside the server)
timeout 5 nc -zv ${VPS_IP} ${BACKEND_PORT} || echo 'Backend port not externally accessible'
timeout 5 nc -zv ${VPS_IP} ${FRONTEND_PORT} || echo 'Frontend port not externally accessible'

echo '📋 Network configuration summary:'
echo 'Interface configuration:'
ip addr show | grep -E '^[0-9]+:|inet '

echo 'Routing table:'
ip route show

echo '🔧 Restarting Docker to ensure port binding...'
cd /var/www/urbansend || exit 1
docker-compose -p urbansend down || true
sleep 5
docker-compose -p urbansend up -d || true

echo '⏳ Waiting for services to start...'
sleep 30

echo '🔍 Final status check...'
docker-compose -p urbansend ps
netstat -tlnp | grep -E ':(${BACKEND_PORT}|${FRONTEND_PORT}|${REDIS_UI_PORT})'

echo '✅ Firewall and ports configured!'
echo ''
echo '🌐 Test URLs:'
echo 'Backend:  http://${VPS_IP}:${BACKEND_PORT}/health'
echo 'Frontend: http://${VPS_IP}:${FRONTEND_PORT}'
echo 'Redis UI: http://${VPS_IP}:${REDIS_UI_PORT}'
echo ''
echo '🔧 If still not accessible, check your VPS provider firewall/security groups'
"