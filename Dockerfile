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
RUN echo "🔧 Configurando npm..." && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/ && \
    echo "📦 Instalando dependências backend..." && \
    npm install --verbose --no-audit --no-fund && \
    echo "🔨 Fazendo build do backend..." && \
    npm run build && \
    echo "✅ Backend build concluído"

# Install frontend dependencies and build  
WORKDIR /app/frontend
RUN echo "🔧 Configurando npm frontend..." && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/ && \
    echo "📦 Instalando dependências frontend..." && \
    npm install --verbose --no-audit --no-fund && \
    echo "🔨 Fazendo build do frontend..." && \
    npm run build && \
    echo "✅ Frontend build concluído"

# Clean up dev dependencies to reduce image size
RUN npm prune --production

WORKDIR /app

# Create directories
RUN mkdir -p /app/data /app/logs /var/log/nginx /var/lib/nginx /var/tmp/nginx

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start nginx in background' >> /app/start.sh && \
    echo 'nginx' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start backend' >> /app/start.sh && \
    echo 'cd /app/backend' >> /app/start.sh && \
    echo 'exec node dist/index.js' >> /app/start.sh

RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 3010 25

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3010/health || exit 1

CMD ["/app/start.sh"]