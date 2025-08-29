# Multi-stage build for unified container
FROM node:18-alpine AS backend-build

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
RUN npm ci

# Copy backend source and build
COPY backend/src ./src
COPY backend/tsconfig.json ./
COPY backend/knexfile.js ./
RUN npm run build

# Build frontend
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# Final stage with Nginx + Node.js
FROM node:18-alpine

# Install nginx and curl
RUN apk add --no-cache nginx curl

WORKDIR /app

# Copy backend build and dependencies
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build /app/backend/package*.json ./backend/
COPY backend/knexfile.js ./backend/
COPY backend/src/migrations ./backend/src/migrations

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create directories
RUN mkdir -p /app/data /app/logs /var/log/nginx /var/lib/nginx /var/tmp/nginx

# Copy nginx configuration for internal routing
COPY nginx.conf /etc/nginx/nginx.conf

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