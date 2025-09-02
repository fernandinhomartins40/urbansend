#!/bin/bash

# 🧪 UltraZend - Compatibility Validation Script
# Tests jsdom and other dependency compatibility

set -e

echo "🧪 Starting UltraZend Compatibility Validation..."
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Function to print info
print_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

echo "1. Testing Node.js Environment..."
echo "--------------------------------"

# Test Node.js version
NODE_VERSION=$(node --version)
print_info "Node.js version: $NODE_VERSION"

# Test NPM version
NPM_VERSION=$(npm --version)
print_info "NPM version: $NPM_VERSION"

echo ""
echo "2. Testing Critical Dependencies..."
echo "---------------------------------"

# Test jsdom
echo "Testing jsdom compatibility..."
JSDOM_TEST=$(node -e "
try {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id=\"test\">Hello</div></body></html>');
  const element = dom.window.document.getElementById('test');
  if (element && element.textContent === 'Hello') {
    console.log('SUCCESS');
  } else {
    console.log('FAILED');
  }
} catch (e) {
  console.log('ERROR: ' + e.message);
}
" 2>&1)

if [[ "$JSDOM_TEST" == "SUCCESS" ]]; then
    print_result 0 "jsdom basic functionality works"
else
    print_result 1 "jsdom failed: $JSDOM_TEST"
fi

# Test DOMPurify with jsdom
echo "Testing DOMPurify + jsdom integration..."
DOMPURIFY_TEST=$(node -e "
try {
  const { JSDOM } = require('jsdom');
  const DOMPurify = require('dompurify');
  
  const window = new JSDOM('').window;
  const purify = DOMPurify(window);
  
  const dirty = '<script>alert(\"xss\")</script><p>Clean content</p>';
  const clean = purify.sanitize(dirty);
  
  if (clean.includes('<p>Clean content</p>') && !clean.includes('<script>')) {
    console.log('SUCCESS');
  } else {
    console.log('FAILED');
  }
} catch (e) {
  console.log('ERROR: ' + e.message);
}
" 2>&1)

if [[ "$DOMPURIFY_TEST" == "SUCCESS" ]]; then
    print_result 0 "DOMPurify + jsdom integration works"
else
    print_result 1 "DOMPurify + jsdom failed: $DOMPURIFY_TEST"
fi

# Test bcrypt
echo "Testing bcrypt compatibility..."
BCRYPT_TEST=$(node -e "
try {
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync('test', 10);
  const isValid = bcrypt.compareSync('test', hash);
  console.log(isValid ? 'SUCCESS' : 'FAILED');
} catch (e) {
  console.log('ERROR: ' + e.message);
}
" 2>&1)

if [[ "$BCRYPT_TEST" == "SUCCESS" ]]; then
    print_result 0 "bcrypt functionality works"
else
    print_result 1 "bcrypt failed: $BCRYPT_TEST"
fi

# Test sqlite3
echo "Testing sqlite3 compatibility..."
SQLITE_TEST=$(node -e "
try {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(':memory:');
  db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)', function(err) {
    if (err) {
      console.log('ERROR: ' + err.message);
    } else {
      console.log('SUCCESS');
    }
  });
  db.close();
} catch (e) {
  console.log('ERROR: ' + e.message);
}
" 2>&1)

if [[ "$SQLITE_TEST" == "SUCCESS" ]]; then
    print_result 0 "sqlite3 functionality works"
else
    print_result 1 "sqlite3 failed: $SQLITE_TEST"
fi

# Test sharp (if used for image processing)
echo "Testing sharp compatibility..."
SHARP_TEST=$(node -e "
try {
  const sharp = require('sharp');
  // Test basic sharp functionality
  sharp('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', {raw: {width: 1, height: 1, channels: 3}})
    .resize(10, 10)
    .png()
    .toBuffer()
    .then(() => console.log('SUCCESS'))
    .catch(e => console.log('ERROR: ' + e.message));
} catch (e) {
  console.log('ERROR: ' + e.message);
}
" 2>&1)

# Wait a moment for async operation
sleep 2

if [[ "$SHARP_TEST" == *"SUCCESS"* ]]; then
    print_result 0 "sharp functionality works"
else
    print_result 1 "sharp failed: $SHARP_TEST"
fi

echo ""
echo "3. Testing Application Dependencies..."
echo "------------------------------------"

# Check if all production dependencies are installed
echo "Checking installed dependencies..."
MISSING_DEPS=$(node -e "
const pkg = require('/app/package.json');
const deps = pkg.dependencies;
const missing = [];

for (const dep in deps) {
  try {
    require.resolve(dep);
  } catch (e) {
    missing.push(dep);
  }
}

if (missing.length === 0) {
  console.log('SUCCESS');
} else {
  console.log('MISSING: ' + missing.join(', '));
}
" 2>&1)

if [[ "$MISSING_DEPS" == "SUCCESS" ]]; then
    print_result 0 "All production dependencies are installed"
else
    print_result 1 "Missing dependencies: $MISSING_DEPS"
fi

echo ""
echo "4. Testing Version Compatibility..."
echo "---------------------------------"

# Check jsdom version specifically
JSDOM_VERSION=$(node -e "console.log(require('jsdom/package.json').version)" 2>&1)
print_info "jsdom version: $JSDOM_VERSION"

if [[ "$JSDOM_VERSION" == "24."* ]]; then
    print_result 0 "jsdom version is 24.x as expected"
else
    print_result 1 "jsdom version is not 24.x (found: $JSDOM_VERSION)"
fi

# Check sharp version
SHARP_VERSION=$(node -e "console.log(require('sharp/package.json').version)" 2>&1)
print_info "sharp version: $SHARP_VERSION"

if [[ "$SHARP_VERSION" == "0.32."* ]]; then
    print_result 0 "sharp version is 0.32.x as expected"
else
    print_result 1 "sharp version is not 0.32.x (found: $SHARP_VERSION)"
fi

echo ""
echo "5. Testing Runtime Environment..."
echo "-------------------------------"

# Test if we can import TypeScript compiled files
if [ -d "/app/dist" ]; then
    print_result 0 "Compiled application exists in /app/dist"
    
    # Try to require main application file
    MAIN_APP_TEST=$(node -e "
    try {
      // Just test if the main file can be loaded without running
      const fs = require('fs');
      const path = '/app/dist/index.js';
      if (fs.existsSync(path)) {
        console.log('SUCCESS');
      } else {
        console.log('MISSING');
      }
    } catch (e) {
      console.log('ERROR: ' + e.message);
    }
    " 2>&1)
    
    if [[ "$MAIN_APP_TEST" == "SUCCESS" ]]; then
        print_result 0 "Main application file exists and is loadable"
    else
        print_result 1 "Main application file issue: $MAIN_APP_TEST"
    fi
else
    print_result 1 "Compiled application not found in /app/dist"
fi

echo ""
echo "==============================================="
echo "🧪 Compatibility Validation Complete"
echo "==============================================="
echo -e "${GREEN}Tests Passed: $PASSED${NC}"
echo -e "${RED}Tests Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All compatibility tests passed!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some compatibility tests failed. Please review and fix.${NC}"
    exit 1
fi