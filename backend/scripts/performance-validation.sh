#!/bin/bash

# 📊 UltraZend - Performance Validation Script
# Monitors system resources and application performance

set -e

echo "📊 Starting UltraZend Performance Validation..."
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print info with different levels
print_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

print_metric() {
    echo -e "${PURPLE}📊 METRIC${NC}: $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

print_good() {
    echo -e "${GREEN}✅ GOOD${NC}: $1"
}

print_concern() {
    echo -e "${RED}🚨 CONCERN${NC}: $1"
}

echo "1. System Resources Overview..."
echo "------------------------------"

# Memory information
MEMORY_TOTAL=$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo "unknown")
MEMORY_AVAILABLE=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo "unknown")

if [ "$MEMORY_TOTAL" != "unknown" ]; then
    MEMORY_TOTAL_MB=$((MEMORY_TOTAL / 1024))
    MEMORY_AVAILABLE_MB=$((MEMORY_AVAILABLE / 1024))
    MEMORY_USED_MB=$((MEMORY_TOTAL_MB - MEMORY_AVAILABLE_MB))
    MEMORY_USAGE_PERCENT=$(((MEMORY_USED_MB * 100) / MEMORY_TOTAL_MB))
    
    print_metric "Total Memory: ${MEMORY_TOTAL_MB}MB"
    print_metric "Used Memory: ${MEMORY_USED_MB}MB (${MEMORY_USAGE_PERCENT}%)"
    print_metric "Available Memory: ${MEMORY_AVAILABLE_MB}MB"
    
    if [ $MEMORY_USAGE_PERCENT -lt 70 ]; then
        print_good "Memory usage is healthy"
    elif [ $MEMORY_USAGE_PERCENT -lt 85 ]; then
        print_warning "Memory usage is getting high"
    else
        print_concern "Memory usage is critically high"
    fi
else
    print_warning "Could not read memory information"
fi

echo ""

# CPU information
CPU_COUNT=$(nproc 2>/dev/null || echo "unknown")
print_metric "CPU Cores: $CPU_COUNT"

# Load average (if available)
if [ -f /proc/loadavg ]; then
    LOAD_AVG=$(cat /proc/loadavg | cut -d' ' -f1-3)
    print_metric "Load Average (1m, 5m, 15m): $LOAD_AVG"
fi

echo ""
echo "2. Container Resource Limits..."
echo "------------------------------"

# Check if running in a container with resource limits
if [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
    MEMORY_LIMIT=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo "unknown")
    if [ "$MEMORY_LIMIT" != "unknown" ] && [ "$MEMORY_LIMIT" -lt 9223372036854775807 ]; then
        MEMORY_LIMIT_MB=$((MEMORY_LIMIT / 1024 / 1024))
        print_metric "Container Memory Limit: ${MEMORY_LIMIT_MB}MB"
        
        if [ $MEMORY_LIMIT_MB -lt 256 ]; then
            print_concern "Memory limit is very low for Node.js application"
        elif [ $MEMORY_LIMIT_MB -lt 512 ]; then
            print_warning "Memory limit is low, monitor for OOM kills"
        else
            print_good "Memory limit is adequate"
        fi
    else
        print_info "No memory limit set (using system memory)"
    fi
fi

# Check CPU limits
if [ -f /sys/fs/cgroup/cpu/cpu.cfs_quota_us ] && [ -f /sys/fs/cgroup/cpu/cpu.cfs_period_us ]; then
    CPU_QUOTA=$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us 2>/dev/null || echo "-1")
    CPU_PERIOD=$(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us 2>/dev/null || echo "100000")
    
    if [ "$CPU_QUOTA" -gt 0 ]; then
        CPU_LIMIT=$(echo "scale=2; $CPU_QUOTA / $CPU_PERIOD" | bc -l 2>/dev/null || echo "unknown")
        print_metric "Container CPU Limit: ${CPU_LIMIT} cores"
        
        if [ $(echo "$CPU_LIMIT < 0.5" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
            print_concern "CPU limit is very low for Node.js application"
        elif [ $(echo "$CPU_LIMIT < 1.0" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
            print_warning "CPU limit is low, may affect performance"
        else
            print_good "CPU limit is adequate"
        fi
    else
        print_info "No CPU limit set"
    fi
fi

echo ""
echo "3. Disk Usage Analysis..."
echo "------------------------"

# Check disk space
DISK_USAGE=$(df -h /app 2>/dev/null || echo "unknown")
if [ "$DISK_USAGE" != "unknown" ]; then
    print_metric "Disk usage for /app:"
    echo "$DISK_USAGE" | tail -n +2 | while IFS= read -r line; do
        echo "  $line"
    done
    
    # Extract usage percentage
    DISK_PERCENT=$(echo "$DISK_USAGE" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ ! -z "$DISK_PERCENT" ] && [ "$DISK_PERCENT" -lt 80 ]; then
        print_good "Disk space usage is healthy"
    elif [ ! -z "$DISK_PERCENT" ] && [ "$DISK_PERCENT" -lt 90 ]; then
        print_warning "Disk space is getting low"
    elif [ ! -z "$DISK_PERCENT" ]; then
        print_concern "Disk space is critically low"
    fi
fi

# Check important directory sizes
echo ""
print_info "Application directory sizes:"
for dir in /app/node_modules /app/dist /app/data /app/logs; do
    if [ -d "$dir" ]; then
        SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1 || echo "unknown")
        print_metric "$(basename "$dir"): $SIZE"
    fi
done

echo ""
echo "4. Node.js Performance Metrics..."
echo "--------------------------------"

# Test Node.js startup time
print_info "Testing Node.js startup performance..."
START_TIME=$(date +%s%N)
node -e "console.log('Node.js startup test')" > /dev/null
END_TIME=$(date +%s%N)
STARTUP_TIME=$(((END_TIME - START_TIME) / 1000000))

print_metric "Node.js startup time: ${STARTUP_TIME}ms"

if [ $STARTUP_TIME -lt 100 ]; then
    print_good "Node.js startup is very fast"
elif [ $STARTUP_TIME -lt 500 ]; then
    print_good "Node.js startup is good"
elif [ $STARTUP_TIME -lt 1000 ]; then
    print_warning "Node.js startup is slow"
else
    print_concern "Node.js startup is very slow"
fi

# Test module loading performance
print_info "Testing critical module loading..."
MODULES=("jsdom" "bcrypt" "sqlite3" "sharp" "express")

for module in "${MODULES[@]}"; do
    START_TIME=$(date +%s%N)
    LOAD_RESULT=$(node -e "
    try {
        require('$module');
        console.log('SUCCESS');
    } catch (e) {
        console.log('ERROR');
    }
    " 2>/dev/null)
    END_TIME=$(date +%s%N)
    LOAD_TIME=$(((END_TIME - START_TIME) / 1000000))
    
    if [ "$LOAD_RESULT" = "SUCCESS" ]; then
        print_metric "$module load time: ${LOAD_TIME}ms"
        
        if [ $LOAD_TIME -gt 1000 ]; then
            print_warning "$module loads slowly (${LOAD_TIME}ms)"
        fi
    else
        print_concern "$module failed to load"
    fi
done

echo ""
echo "5. Application-Specific Performance..."
echo "------------------------------------"

# Test database operations (if database exists)
if [ -f "/app/data/ultrazend.sqlite" ] || [ -r "/app/package.json" ]; then
    print_info "Testing database performance..."
    
    DB_TEST_RESULT=$(node -e "
    const path = require('path');
    const sqlite3 = require('sqlite3');
    
    // Use memory database for testing
    const db = new sqlite3.Database(':memory:');
    
    const start = Date.now();
    db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)', function(err) {
        if (err) {
            console.log('ERROR: ' + err.message);
            return;
        }
        
        db.run('INSERT INTO test (data) VALUES (?)', ['test data'], function(err) {
            if (err) {
                console.log('ERROR: ' + err.message);
                return;
            }
            
            db.get('SELECT * FROM test WHERE id = 1', function(err, row) {
                const end = Date.now();
                if (err) {
                    console.log('ERROR: ' + err.message);
                } else {
                    console.log('SUCCESS:' + (end - start));
                }
                db.close();
            });
        });
    });
    " 2>&1)
    
    if [[ "$DB_TEST_RESULT" == SUCCESS:* ]]; then
        DB_TIME=$(echo "$DB_TEST_RESULT" | cut -d: -f2)
        print_metric "Database operations test: ${DB_TIME}ms"
        
        if [ $DB_TIME -lt 50 ]; then
            print_good "Database performance is excellent"
        elif [ $DB_TIME -lt 200 ]; then
            print_good "Database performance is good"
        else
            print_warning "Database performance may need optimization"
        fi
    else
        print_concern "Database test failed: $DB_TEST_RESULT"
    fi
fi

# Test HTML sanitization performance (jsdom + DOMPurify)
print_info "Testing HTML sanitization performance..."
SANITIZE_TEST=$(node -e "
try {
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);
    
    const testHtml = '<div>Test content</div><script>alert(1)</script><p>More content</p>';
    
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
        purify.sanitize(testHtml);
    }
    const end = Date.now();
    
    console.log('SUCCESS:' + (end - start));
} catch (e) {
    console.log('ERROR: ' + e.message);
}
" 2>&1)

if [[ "$SANITIZE_TEST" == SUCCESS:* ]]; then
    SANITIZE_TIME=$(echo "$SANITIZE_TEST" | cut -d: -f2)
    SANITIZE_PER_OP=$((SANITIZE_TIME / 100))
    print_metric "HTML sanitization (100 ops): ${SANITIZE_TIME}ms (${SANITIZE_PER_OP}ms/op)"
    
    if [ $SANITIZE_PER_OP -lt 5 ]; then
        print_good "HTML sanitization performance is excellent"
    elif [ $SANITIZE_PER_OP -lt 20 ]; then
        print_good "HTML sanitization performance is good"
    else
        print_warning "HTML sanitization performance may need optimization"
    fi
else
    print_concern "HTML sanitization test failed: $SANITIZE_TEST"
fi

echo ""
echo "=============================================="
echo "📊 Performance Validation Complete"
echo "=============================================="

echo ""
print_info "Performance Summary:"
echo "  - Check memory usage and limits"
echo "  - Monitor CPU utilization under load"
echo "  - Watch disk space growth over time"
echo "  - Test application response times in production"
echo ""
print_info "Recommendations:"
echo "  - Set appropriate memory limits (512MB-1GB recommended)"
echo "  - Monitor for memory leaks during extended operation"
echo "  - Use external monitoring for production metrics"
echo "  - Consider caching strategies for database operations"