# Simplified single-stage build to avoid npm ci timeout issues
FROM node:18-alpine

# Install nginx and curl
RUN apk add --no-cache nginx curl

WORKDIR /app

# Copy all source files
COPY backend ./backend
COPY frontend ./frontend
COPY nginx.conf /etc/nginx/nginx.conf

# Install backend dependencies and build
WORKDIR /app/backend
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm install --no-audit --no-fund && \
    npm run build

# Install frontend dependencies and build  
WORKDIR /app/frontend
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm install --no-audit --no-fund && \
    npm run build

# Clean up dev dependencies to reduce image size
RUN npm prune --production

WORKDIR /app

# Create directories
RUN mkdir -p /app/data /app/logs /var/log/nginx /var/lib/nginx /var/tmp/nginx

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh

# Start nginx in background
nginx

# Start backend
cd /app/backend
exec node dist/index.js
EOF

RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 3010 25

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3010/health || exit 1

CMD ["/app/start.sh"]