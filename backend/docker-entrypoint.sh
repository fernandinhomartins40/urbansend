#!/bin/bash
set -e

echo "🚀 UltraZend Docker Entrypoint - Starting..."
echo "Arguments: $@"
echo "User: $(whoami) ($(id))"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p /app/logs/application /app/logs/errors /app/logs/combined /app/logs/exceptions
mkdir -p /app/data

# Fix permissions for volumes
echo "🔧 Setting permissions..."
chown -R root:root /app/logs /app/data /app 2>/dev/null || echo "⚠️ Permission setting skipped"
chmod -R 755 /app/logs /app/data

echo "✅ Setup complete - Starting application"
echo "Command: $@"

# Execute the main command
exec "$@"