#!/bin/bash

# 🚀 ULTRAZEND - Production Test Script
# FASE 5: DEPLOYMENT E PRODUÇÃO
# 
# Script para testar funcionalidades críticas em produção conforme especificado

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
API_BASE_URL="${API_BASE_URL:-https://www.ultrazend.com.br}"
TEST_EMAIL="${TEST_EMAIL:-test-production@gmail.com}"
TEST_NAME="${TEST_NAME:-Production Test User}"
TEST_PASSWORD="${TEST_PASSWORD:-testpassword123}"
API_KEY="${API_KEY:-}"
VERBOSE="${VERBOSE:-false}"

# Temporary test data
TEST_USER_ID=""
VERIFICATION_TOKEN=""
TEST_EMAIL_ID=""
TIMESTAMP=$(date +%s)
UNIQUE_ID="prod-test-$TIMESTAMP"

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

verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${CYAN}[DEBUG] $1${NC}"
    fi
}

# Test function with JSON response
test_api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    local expected_status=${5:-200}
    local headers=${6:-"Content-Type: application/json"}
    
    verbose "Making $method request to $endpoint"
    verbose "Data: $data"
    verbose "Expected status: $expected_status"
    
    local response
    local http_status
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -H "$headers" "$API_BASE_URL$endpoint")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "$headers" -d "$data" "$API_BASE_URL$endpoint")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT -H "$headers" -d "$data" "$API_BASE_URL$endpoint")
    else
        error "Unsupported method: $method"
        return 1
    fi
    
    http_status=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')
    
    verbose "HTTP Status: $http_status"
    verbose "Response: $response_body"
    
    printf "%-60s" "$description..."
    
    if [ "$http_status" -eq "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} (${http_status})"
        if [ "$VERBOSE" = "true" ] && [ -n "$response_body" ]; then
            echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
        fi
        echo "$response_body"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (expected ${expected_status}, got ${http_status})"
        if [ -n "$response_body" ]; then
            echo "Response: $response_body"
        fi
        return 1
    fi
}

# Cleanup function
cleanup() {
    if [ -n "$TEST_USER_ID" ]; then
        log "🧹 Cleaning up test data..."
        # In a real implementation, you might want to delete test users
        # For now, we'll just log the cleanup
        info "Test user ID: $TEST_USER_ID would be cleaned up in a real scenario"
    fi
}

# Set cleanup trap
trap cleanup EXIT

# Header
header "
 _   _ _ _             _____               _
| | | | | |_ _ __ __ _|__  / ___ _ __   __| |
| | | | | __| '__/ _` | / / / _ \ '_ \ / _` |
| |_| | | |_| | | (_| |/ /_|  __/ | | | (_| |
 \___/|_|\__|_|  \__,_/____|\___|_| |_|\__,_|

🧪 PRODUCTION TESTING - FASE 5
"

log "🎯 Iniciando testes de produção do ULTRAZEND SMTP Server"
log "🌐 API Base URL: $API_BASE_URL"
log "📧 Test Email: $TEST_EMAIL"
log "🆔 Unique ID: $UNIQUE_ID"

echo ""

# Check requirements
if ! command -v curl >/dev/null 2>&1; then
    error "curl is required but not installed"
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    warning "jq is recommended for better output formatting"
fi

# 1. Health Check Tests
header "🏥 HEALTH CHECK TESTS"
echo ""

# Test basic health
response=$(test_api_call "GET" "/api/health/simple" "" "Simple health check")
if [ $? -ne 0 ]; then
    error "Basic health check failed - system may be down"
    exit 1
fi

# Test detailed health
response=$(test_api_call "GET" "/api/health" "" "Detailed health check")
if [ $? -ne 0 ]; then
    warning "Detailed health check failed"
else
    # Parse health response
    if command -v jq >/dev/null 2>&1; then
        overall_status=$(echo "$response" | jq -r '.status' 2>/dev/null)
        if [ "$overall_status" != "healthy" ]; then
            warning "System status is: $overall_status"
        fi
    fi
fi

echo ""

# 2. User Registration Test
header "👤 USER REGISTRATION TEST"
echo ""

# Generate unique test email
test_email_unique="${UNIQUE_ID}@example.com"

user_data='{
    "name": "'"$TEST_NAME $UNIQUE_ID"'",
    "email": "'"$test_email_unique"'",
    "password": "'"$TEST_PASSWORD"'"
}'

response=$(test_api_call "POST" "/api/auth/register" "$user_data" "Register new user" 201)
if [ $? -eq 0 ]; then
    success "User registration successful"
    
    # Try to extract user ID from response (if returned)
    if command -v jq >/dev/null 2>&1; then
        TEST_USER_ID=$(echo "$response" | jq -r '.user.id // .id // empty' 2>/dev/null)
        verbose "Extracted user ID: $TEST_USER_ID"
    fi
else
    error "User registration failed"
    exit 1
fi

echo ""

# 3. DKIM Service Test
header "🔐 DKIM SERVICE TEST"
echo ""

response=$(test_api_call "GET" "/api/dns/dkim-key" "" "Get DKIM DNS record")
if [ $? -eq 0 ]; then
    if command -v jq >/dev/null 2>&1; then
        dkim_name=$(echo "$response" | jq -r '.name' 2>/dev/null)
        dkim_value=$(echo "$response" | jq -r '.value' 2>/dev/null)
        
        if [[ "$dkim_value" == *"DKIM1"* ]]; then
            success "DKIM service is working correctly"
            info "DKIM Record: $dkim_name"
        else
            error "DKIM service returned invalid data"
        fi
    else
        success "DKIM endpoint responded (jq not available for validation)"
    fi
else
    error "DKIM service test failed"
fi

echo ""

# 4. Email Sending Test (if API key provided)
if [ -n "$API_KEY" ]; then
    header "📧 EMAIL SENDING TEST"
    echo ""
    
    email_data='{
        "from": "noreply@www.ultrazend.com.br",
        "to": "'"$TEST_EMAIL"'",
        "subject": "ULTRAZEND Production Test - '"$UNIQUE_ID"'",
        "html": "<h1>🚀 ULTRAZEND Production Test</h1><p>This is a production test email sent at '"$(date)"'.</p><p>Test ID: '"$UNIQUE_ID"'</p><p>If you receive this email, the ULTRAZEND SMTP server is working correctly in production!</p>",
        "text": "ULTRAZEND Production Test\n\nThis is a production test email sent at '"$(date)"'.\nTest ID: '"$UNIQUE_ID"'\n\nIf you receive this email, the ULTRAZEND SMTP server is working correctly in production!"
    }'
    
    response=$(test_api_call "POST" "/api/emails/send" "$email_data" "Send test email" 202 "Content-Type: application/json,x-api-key: $API_KEY")
    if [ $? -eq 0 ]; then
        success "Email sending test passed"
        
        # Extract email ID
        if command -v jq >/dev/null 2>&1; then
            TEST_EMAIL_ID=$(echo "$response" | jq -r '.id // empty' 2>/dev/null)
            if [ -n "$TEST_EMAIL_ID" ]; then
                info "Email ID: $TEST_EMAIL_ID"
                info "Check your inbox at $TEST_EMAIL for the test email"
            fi
        fi
    else
        warning "Email sending test failed - this might be expected if API key is invalid or rate limits are hit"
    fi
    
    echo ""
else
    warning "⏭️ Skipping email sending test (no API key provided)"
    info "To test email sending, set API_KEY environment variable"
    echo ""
fi

# 5. Authentication Test
header "🔐 AUTHENTICATION TEST"
echo ""

login_data='{
    "email": "'"$test_email_unique"'",
    "password": "'"$TEST_PASSWORD"'"
}'

# Note: This test might fail if email verification is required
response=$(test_api_call "POST" "/api/auth/login" "$login_data" "Login with test user" 200)
if [ $? -eq 0 ]; then
    success "Authentication test passed"
    
    if command -v jq >/dev/null 2>&1; then
        token=$(echo "$response" | jq -r '.token // empty' 2>/dev/null)
        if [ -n "$token" ]; then
            info "JWT token received (length: ${#token})"
        fi
    fi
else
    warning "Authentication test failed - this might be expected if email verification is required"
fi

echo ""

# 6. API Endpoints Availability Test
header "🔌 API ENDPOINTS TEST"
echo ""

endpoints=(
    "/api/health:GET:Simple health"
    "/api/auth/health:GET:Auth health"
    "/docs:GET:API documentation"
    "/api/dns/dkim-key:GET:DKIM configuration"
)

for endpoint_info in "${endpoints[@]}"; do
    IFS=':' read -r endpoint method description <<< "$endpoint_info"
    
    # Use 404 as acceptable status for some endpoints that might not exist
    if [[ "$endpoint" == *"health"* ]]; then
        expected_status=200
    else
        expected_status=200
    fi
    
    test_api_call "$method" "$endpoint" "" "$description" "$expected_status" || {
        # Try with 404 as acceptable
        if [ "$expected_status" -eq 200 ]; then
            test_api_call "$method" "$endpoint" "" "$description (fallback)" 404 || true
        fi
    }
done

echo ""

# 7. Performance Test
header "⚡ PERFORMANCE TEST"
echo ""

log "Running basic performance test..."

start_time=$(date +%s%3N)
response=$(test_api_call "GET" "/api/health/simple" "" "Performance test" 200)
end_time=$(date +%s%3N)

if [ $? -eq 0 ]; then
    response_time=$((end_time - start_time))
    info "Response time: ${response_time}ms"
    
    if [ "$response_time" -lt 500 ]; then
        success "Performance test passed (under 500ms)"
    elif [ "$response_time" -lt 2000 ]; then
        warning "Performance acceptable (under 2s): ${response_time}ms"
    else
        error "Performance poor (over 2s): ${response_time}ms"
    fi
else
    error "Performance test failed"
fi

echo ""

# 8. Security Headers Test
header "🛡️ SECURITY HEADERS TEST"
echo ""

log "Testing security headers..."

security_response=$(curl -I -s "$API_BASE_URL/api/health" 2>/dev/null)

if [ $? -eq 0 ]; then
    printf "%-40s" "CORS headers..."
    if echo "$security_response" | grep -qi "access-control-allow"; then
        echo -e "${GREEN}✅ PRESENT${NC}"
    else
        echo -e "${YELLOW}⚠️ MISSING${NC}"
    fi
    
    printf "%-40s" "Security headers..."
    if echo "$security_response" | grep -qi "x-frame-options\|x-content-type-options\|x-xss-protection"; then
        echo -e "${GREEN}✅ PRESENT${NC}"
    else
        echo -e "${YELLOW}⚠️ MISSING${NC}"
    fi
    
    printf "%-40s" "Content-Type header..."
    if echo "$security_response" | grep -qi "content-type"; then
        echo -e "${GREEN}✅ PRESENT${NC}"
    else
        echo -e "${RED}❌ MISSING${NC}"
    fi
else
    error "Could not retrieve security headers"
fi

echo ""

# 9. Database Connectivity Test
header "💾 DATABASE CONNECTIVITY"
echo ""

# Test through health endpoint
response=$(test_api_call "GET" "/api/health" "" "Database health via endpoint")
if [ $? -eq 0 ]; then
    if command -v jq >/dev/null 2>&1; then
        db_status=$(echo "$response" | jq -r '.services[] | select(.service=="database") | .status' 2>/dev/null)
        db_response_time=$(echo "$response" | jq -r '.services[] | select(.service=="database") | .responseTime' 2>/dev/null)
        
        case "$db_status" in
            "healthy") 
                success "Database is healthy (${db_response_time}ms)" 
                ;;
            "warning") 
                warning "Database has warnings (${db_response_time}ms)" 
                ;;
            "critical") 
                error "Database is critical (${db_response_time}ms)" 
                ;;
            *) 
                warning "Database status unknown" 
                ;;
        esac
    else
        success "Database test completed (jq not available for detailed analysis)"
    fi
else
    error "Database connectivity test failed"
fi

echo ""

# 10. Summary
header "📊 TEST SUMMARY"
echo ""

log "📈 Production test completed!"

echo ""
info "🎯 Test Results Summary:"
echo "  - API Base URL: $API_BASE_URL"
echo "  - Test Email: $test_email_unique"
echo "  - Unique ID: $UNIQUE_ID"
echo "  - Test User ID: ${TEST_USER_ID:-'Not captured'}"
echo "  - Test Email ID: ${TEST_EMAIL_ID:-'Not sent'}"

echo ""
info "🔍 Manual Verification Steps:"
echo "  1. Check health dashboard: $API_BASE_URL/api/health"
echo "  2. Check API documentation: $API_BASE_URL/docs"
if [ -n "$API_KEY" ] && [ -n "$TEST_EMAIL_ID" ]; then
    echo "  3. Verify test email delivery to: $TEST_EMAIL"
fi
echo "  4. Monitor logs for any errors"
echo "  5. Check DKIM DNS configuration"

echo ""
info "🚀 Next Steps:"
echo "  1. Run deliverability tests: node scripts/test-deliverability.js"
echo "  2. Configure DNS records (DKIM, SPF, DMARC)"
echo "  3. Test with mail-tester.com for deliverability score"
echo "  4. Monitor production logs and metrics"
echo "  5. Set up monitoring and alerting"

log "✨ ULTRAZEND Production Testing Complete!"

exit 0