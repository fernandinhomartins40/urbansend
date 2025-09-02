#!/bin/bash

# 🔒 UltraZend - Security Validation Script
# Validates security configurations and non-root execution

set -e

echo "🔒 Starting UltraZend Security Validation..."
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        FAILED=$((FAILED + 1))
    fi
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

echo "1. Testing Container User Security..."
echo "------------------------------------"

# Test 1: Check if running as root
if [ "$(id -u)" = "0" ]; then
    print_result 1 "Container should NOT run as root user"
else
    print_result 0 "Container runs as non-root user ($(whoami))"
fi

# Test 2: Check user ID
USER_ID=$(id -u)
if [ "$USER_ID" = "1001" ]; then
    print_result 0 "User ID is correct (1001)"
else
    print_result 1 "User ID should be 1001, got $USER_ID"
fi

# Test 3: Check group
GROUP_NAME=$(id -gn)
if [ "$GROUP_NAME" = "nodegroup" ]; then
    print_result 0 "Group is correct (nodegroup)"
else
    print_result 1 "Group should be nodegroup, got $GROUP_NAME"
fi

echo ""
echo "2. Testing Directory Permissions..."
echo "----------------------------------"

# Test 4: Check data directory permissions
if [ -w "/app/data" ]; then
    print_result 0 "Data directory is writable"
else
    print_result 1 "Data directory is not writable"
fi

# Test 5: Check logs directory permissions
if [ -w "/app/logs" ]; then
    print_result 0 "Logs directory is writable"
else
    print_result 1 "Logs directory is not writable"
fi

# Test 6: Check certificates directory (should exist but may not be writable)
if [ -d "/app/certificates" ]; then
    print_result 0 "Certificates directory exists"
    if [ -w "/app/certificates" ]; then
        print_warning "Certificates directory is writable (may be unnecessary)"
    fi
else
    print_result 1 "Certificates directory does not exist"
fi

echo ""
echo "3. Testing File System Security..."
echo "--------------------------------"

# Test 7: Check if sensitive system directories are not writable
if [ ! -w "/etc" ] && [ ! -w "/var" ] && [ ! -w "/usr" ]; then
    print_result 0 "System directories are protected (not writable)"
else
    print_result 1 "System directories should not be writable"
fi

# Test 8: Check Node.js security
NODE_VERSION=$(node --version)
if [[ "$NODE_VERSION" =~ ^v1[89]\. ]]; then
    print_result 0 "Node.js version is secure ($NODE_VERSION)"
else
    print_warning "Node.js version may have security concerns ($NODE_VERSION)"
fi

echo ""
echo "4. Testing Application Security..."
echo "--------------------------------"

# Test 9: Check if package.json exists and is readable
if [ -r "/app/package.json" ]; then
    print_result 0 "package.json is readable"
else
    print_result 1 "package.json is not readable"
fi

# Test 10: Check if environment variables are set (but not display values)
if [ -n "$NODE_ENV" ]; then
    print_result 0 "NODE_ENV is set"
else
    print_result 1 "NODE_ENV is not set"
fi

# Test 11: Check database file permissions
if [ -f "/app/data/ultrazend.sqlite" ]; then
    DB_PERMS=$(stat -c "%a" /app/data/ultrazend.sqlite 2>/dev/null || echo "unknown")
    if [ "$DB_PERMS" = "644" ] || [ "$DB_PERMS" = "664" ] || [ "$DB_PERMS" = "660" ]; then
        print_result 0 "Database file permissions are secure ($DB_PERMS)"
    else
        print_warning "Database file permissions may be too permissive ($DB_PERMS)"
    fi
else
    print_warning "Database file not found (may be created at runtime)"
fi

echo ""
echo "5. Testing Network Security..."
echo "-----------------------------"

# Test 12: Check listening ports (should only be application ports)
LISTENING_PORTS=$(netstat -tlnp 2>/dev/null | grep LISTEN | wc -l || echo "0")
print_warning "Application will listen on $LISTENING_PORTS port(s) when started"

echo ""
echo "========================================="
echo "🔒 Security Validation Complete"
echo "========================================="
echo -e "${GREEN}Tests Passed: $PASSED${NC}"
echo -e "${RED}Tests Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All security tests passed!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some security tests failed. Please review and fix.${NC}"
    exit 1
fi