#!/bin/bash
set -e

echo "🚀 UltraZend Docker Entrypoint - Starting..."
echo "Arguments: $@"
echo "User: $(whoami) ($(id))"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Create necessary directories (user already has permissions)
echo "📁 Ensuring directories exist..."
mkdir -p /app/logs/application /app/logs/errors /app/logs/combined /app/logs/exceptions
mkdir -p /app/data

# Verify permissions (non-root user)
echo "🔧 Checking permissions..."
if [ -w "/app/data" ] && [ -w "/app/logs" ]; then
    echo "✅ Directory permissions OK"
else
    echo "⚠️ WARNING: Limited write permissions - some features may not work"
fi

# Security check - ensure not running as root
if [ "$(id -u)" = "0" ]; then
    echo "❌ ERROR: Running as root user - security risk!"
    exit 1
fi

echo "✅ Security check passed - running as non-root user"
echo "🚀 Starting application: $@"

# Execute the main command
exec "$@"