#!/bin/bash

# 🚀 ULTRAZEND - Service Status Checker
# FASE 5: DEPLOYMENT E PRODUÇÃO
# 
# Script para verificar o status de todos os serviços do ULTRAZEND

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SERVER_HOST="${SERVER_HOST:-31.97.162.155}"
SERVER_USER="${SERVER_USER:-root}"
APP_NAME="ultrazend"
API_BASE_URL="https://www.ultrazend.com.br"
LOCAL_CHECK="${1:-false}"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${CYAN}[INFO] $1${NC}"
}

header() {
    echo -e "${PURPLE}$1${NC}"
}

# Test function with timeout
test_endpoint() {
    local url=$1
    local description=$2
    local timeout=${3:-10}
    
    printf "%-50s" "Testing $description..."
    
    if command -v curl >/dev/null 2>&1; then
        if curl -f -s -m $timeout "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ OK${NC}"
            return 0
        else
            echo -e "${RED}❌ FAILED${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️ CURL NOT AVAILABLE${NC}"
        return 1
    fi
}

# Test JSON endpoint
test_json_endpoint() {
    local url=$1
    local description=$2
    local expected_field=$3
    local timeout=${4:-10}
    
    printf "%-50s" "Testing $description..."
    
    if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        local response
        response=$(curl -f -s -m $timeout "$url" 2>/dev/null)
        
        if [ $? -eq 0 ] && echo "$response" | jq -e ".$expected_field" >/dev/null 2>&1; then
            local value
            value=$(echo "$response" | jq -r ".$expected_field")
            echo -e "${GREEN}✅ OK${NC} (${value})"
            return 0
        else
            echo -e "${RED}❌ FAILED${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️ CURL/JQ NOT AVAILABLE${NC}"
        return 1
    fi
}

# Header
header "
 _   _ _ _             _____               _
| | | | | |_ _ __ __ _|__  / ___ _ __   __| |
| | | | | __| '__/ _` | / / / _ \ '_ \ / _` |
| |_| | | |_| | | (_| |/ /_|  __/ | | | (_| |
 \___/|_|\__|_|  \__,_/____|\___|_| |_|\__,_|

🔍 SERVICE STATUS CHECKER - FASE 5
"

log "🎯 Verificando status dos serviços ULTRAZEND"
log "🌐 API Base URL: $API_BASE_URL"

if [ "$LOCAL_CHECK" != "true" ]; then
    log "🖥️ Servidor: $SERVER_HOST"
fi

echo ""

# 1. Basic Connectivity Tests
header "📡 CONNECTIVITY TESTS"
echo ""

if [ "$LOCAL_CHECK" != "true" ]; then
    test_endpoint "http://$SERVER_HOST" "Server HTTP connectivity"
    test_endpoint "https://$SERVER_HOST" "Server HTTPS connectivity"
else
    log "Skipping server connectivity (local check mode)"
fi

test_endpoint "$API_BASE_URL" "Main website"

echo ""

# 2. Health Check Tests
header "🏥 HEALTH CHECK TESTS"
echo ""

test_json_endpoint "$API_BASE_URL/api/health/simple" "Simple health check" "status"
test_json_endpoint "$API_BASE_URL/api/health/liveness" "Liveness probe" "status"
test_json_endpoint "$API_BASE_URL/api/health/readiness" "Readiness probe" "status"

# Detailed health check
printf "%-50s" "Testing detailed health check..."
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    health_response=$(curl -f -s -m 15 "$API_BASE_URL/api/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        overall_status=$(echo "$health_response" | jq -r '.status')
        uptime=$(echo "$health_response" | jq -r '.uptime')
        version=$(echo "$health_response" | jq -r '.version')
        
        if [ "$overall_status" = "healthy" ]; then
            echo -e "${GREEN}✅ HEALTHY${NC} (uptime: ${uptime}s, version: ${version})"
        elif [ "$overall_status" = "degraded" ]; then
            echo -e "${YELLOW}⚠️ DEGRADED${NC} (uptime: ${uptime}s, version: ${version})"
        else
            echo -e "${RED}❌ CRITICAL${NC} (uptime: ${uptime}s, version: ${version})"
        fi
        
        # Show service details
        echo ""
        info "Service Status Details:"
        echo "$health_response" | jq -r '.services[] | "  - \(.service): \(.status) (\(.message // "no message"))"' 2>/dev/null || echo "  Could not parse service details"
        
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ CURL/JQ NOT AVAILABLE${NC}"
fi

echo ""

# 3. API Endpoint Tests
header "🔌 API ENDPOINT TESTS"
echo ""

test_endpoint "$API_BASE_URL/api/auth/health" "Auth service" 5 || test_endpoint "$API_BASE_URL/api/auth" "Auth service (fallback)" 5
test_endpoint "$API_BASE_URL/api/emails/health" "Email service" 5 || test_endpoint "$API_BASE_URL/api/emails" "Email service (fallback)" 5
test_endpoint "$API_BASE_URL/api/dns/dkim-key" "DKIM service" 5
test_endpoint "$API_BASE_URL/docs" "API documentation" 5

echo ""

# 4. Server Service Status (if not local check)
if [ "$LOCAL_CHECK" != "true" ]; then
    header "🖥️ SERVER SERVICE STATUS"
    echo ""
    
    log "Checking PM2 status..."
    ssh_output=$(ssh -o ConnectTimeout=10 "$SERVER_USER@$SERVER_HOST" '
        echo "=== PM2 Status ==="
        pm2 status 2>/dev/null || echo "PM2 not available"
        
        echo ""
        echo "=== Port Status ==="
        netstat -tlnp 2>/dev/null | grep -E ":(3001|25|587|80|443|6379)" || echo "No relevant ports found"
        
        echo ""
        echo "=== Process Status ==="
        ps aux | grep -E "(node|pm2)" | grep -v grep | head -5 || echo "No Node.js processes found"
        
        echo ""
        echo "=== Disk Usage ==="
        df -h /var/www/ultrazend 2>/dev/null || echo "Path not found"
        
        echo ""
        echo "=== Memory Usage ==="
        free -h 2>/dev/null || echo "Memory info not available"
        
        echo ""
        echo "=== Recent Logs ==="
        tail -n 5 /var/www/ultrazend/logs/app.log 2>/dev/null || echo "No app logs found"
        
    ' 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        success "Server status retrieved successfully"
        echo "$ssh_output"
    else
        error "Failed to retrieve server status"
    fi
    
    echo ""
fi

# 5. Database Status
header "💾 DATABASE STATUS"
echo ""

printf "%-50s" "Testing database via health endpoint..."
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    health_response=$(curl -f -s -m 10 "$API_BASE_URL/api/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        db_status=$(echo "$health_response" | jq -r '.services[] | select(.service=="database") | .status')
        db_message=$(echo "$health_response" | jq -r '.services[] | select(.service=="database") | .message')
        
        if [ "$db_status" = "healthy" ]; then
            echo -e "${GREEN}✅ HEALTHY${NC} (${db_message})"
        elif [ "$db_status" = "warning" ]; then
            echo -e "${YELLOW}⚠️ WARNING${NC} (${db_message})"
        else
            echo -e "${RED}❌ CRITICAL${NC} (${db_message})"
        fi
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ CURL/JQ NOT AVAILABLE${NC}"
fi

echo ""

# 6. Queue Status
header "📬 QUEUE STATUS"
echo ""

printf "%-50s" "Testing Redis via health endpoint..."
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    health_response=$(curl -f -s -m 10 "$API_BASE_URL/api/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        redis_status=$(echo "$health_response" | jq -r '.services[] | select(.service=="redis") | .status')
        redis_message=$(echo "$health_response" | jq -r '.services[] | select(.service=="redis") | .message')
        
        if [ "$redis_status" = "healthy" ]; then
            echo -e "${GREEN}✅ HEALTHY${NC} (${redis_message})"
        elif [ "$redis_status" = "warning" ]; then
            echo -e "${YELLOW}⚠️ WARNING${NC} (${redis_message})"
        else
            echo -e "${RED}❌ CRITICAL${NC} (${redis_message})"
        fi
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ CURL/JQ NOT AVAILABLE${NC}"
fi

echo ""

# 7. SMTP Status
header "📧 SMTP SERVICE STATUS"
echo ""

printf "%-50s" "Testing SMTP via health endpoint..."
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    health_response=$(curl -f -s -m 15 "$API_BASE_URL/api/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        smtp_status=$(echo "$health_response" | jq -r '.services[] | select(.service=="smtp") | .status')
        smtp_message=$(echo "$health_response" | jq -r '.services[] | select(.service=="smtp") | .message')
        
        if [ "$smtp_status" = "healthy" ]; then
            echo -e "${GREEN}✅ HEALTHY${NC} (${smtp_message})"
        elif [ "$smtp_status" = "warning" ]; then
            echo -e "${YELLOW}⚠️ WARNING${NC} (${smtp_message})"
        else
            echo -e "${RED}❌ CRITICAL${NC} (${smtp_message})"
        fi
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ CURL/JQ NOT AVAILABLE${NC}"
fi

# Test SMTP ports directly
if [ "$LOCAL_CHECK" != "true" ]; then
    printf "%-50s" "Testing SMTP port 25..."
    if timeout 5 bash -c "</dev/tcp/$SERVER_HOST/25" 2>/dev/null; then
        echo -e "${GREEN}✅ OPEN${NC}"
    else
        echo -e "${RED}❌ CLOSED${NC}"
    fi
    
    printf "%-50s" "Testing SMTP port 587..."
    if timeout 5 bash -c "</dev/tcp/$SERVER_HOST/587" 2>/dev/null; then
        echo -e "${GREEN}✅ OPEN${NC}"
    else
        echo -e "${YELLOW}⚠️ CLOSED/FILTERED${NC}"
    fi
fi

echo ""

# 8. DNS & DKIM Status
header "🔐 DNS & DKIM STATUS"
echo ""

# Test DKIM key endpoint
printf "%-50s" "Testing DKIM key generation..."
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    dkim_response=$(curl -f -s -m 10 "$API_BASE_URL/api/dns/dkim-key" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        dkim_name=$(echo "$dkim_response" | jq -r '.name' 2>/dev/null)
        dkim_value=$(echo "$dkim_response" | jq -r '.value' 2>/dev/null)
        
        if [[ "$dkim_value" == *"DKIM1"* ]]; then
            echo -e "${GREEN}✅ HEALTHY${NC} (${dkim_name})"
        else
            echo -e "${RED}❌ INVALID${NC}"
        fi
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ CURL/JQ NOT AVAILABLE${NC}"
fi

# DNS checks (if dig is available)
if command -v dig >/dev/null 2>&1; then
    printf "%-50s" "Checking DKIM DNS record..."
    if dig +short TXT default._domainkey.www.ultrazend.com.br | grep -q "DKIM1"; then
        echo -e "${GREEN}✅ CONFIGURED${NC}"
    else
        echo -e "${YELLOW}⚠️ NOT CONFIGURED${NC}"
    fi
    
    printf "%-50s" "Checking SPF DNS record..."
    if dig +short TXT www.ultrazend.com.br | grep -q "v=spf1"; then
        echo -e "${GREEN}✅ CONFIGURED${NC}"
    else
        echo -e "${YELLOW}⚠️ NOT CONFIGURED${NC}"
    fi
    
    printf "%-50s" "Checking MX DNS record..."
    if dig +short MX www.ultrazend.com.br | grep -q "www.ultrazend.com.br"; then
        echo -e "${GREEN}✅ CONFIGURED${NC}"
    else
        echo -e "${YELLOW}⚠️ NOT CONFIGURED${NC}"
    fi
else
    warning "dig command not available for DNS checks"
fi

echo ""

# 9. Summary
header "📊 STATUS SUMMARY"
echo ""

# Overall assessment
log "Performing overall system assessment..."

overall_status="unknown"
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    health_response=$(curl -f -s -m 15 "$API_BASE_URL/api/health" 2>/dev/null)
    if [ $? -eq 0 ]; then
        overall_status=$(echo "$health_response" | jq -r '.status')
        services_count=$(echo "$health_response" | jq -r '.services | length')
        healthy_count=$(echo "$health_response" | jq -r '[.services[] | select(.status=="healthy")] | length')
        warning_count=$(echo "$health_response" | jq -r '[.services[] | select(.status=="warning")] | length')
        critical_count=$(echo "$health_response" | jq -r '[.services[] | select(.status=="critical")] | length')
        
        echo "📈 System Status: $(
            case "$overall_status" in
                "healthy") echo -e "${GREEN}HEALTHY${NC}" ;;
                "degraded") echo -e "${YELLOW}DEGRADED${NC}" ;;
                "critical") echo -e "${RED}CRITICAL${NC}" ;;
                *) echo -e "${CYAN}UNKNOWN${NC}" ;;
            esac
        )"
        echo "🔧 Total Services: $services_count"
        echo "✅ Healthy: $healthy_count"
        echo "⚠️ Warning: $warning_count"
        echo "❌ Critical: $critical_count"
    else
        echo -e "📈 System Status: ${RED}UNREACHABLE${NC}"
    fi
else
    echo -e "📈 System Status: ${YELLOW}CANNOT_DETERMINE${NC} (curl/jq not available)"
fi

echo ""
log "✨ Status check completed!"

# Exit code based on overall status
case "$overall_status" in
    "healthy") exit 0 ;;
    "degraded") exit 1 ;;
    "critical") exit 2 ;;
    *) exit 3 ;;
esac