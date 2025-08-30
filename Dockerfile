# Multi-stage build for UltraZend
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci

# Copy source code
COPY backend ./backend
COPY frontend ./frontend

# Build applications
RUN cd backend && npm run build
RUN cd frontend && npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install nginx for serving frontend
RUN apk add --no-cache nginx

# Copy built applications
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/frontend/dist ./frontend/dist

# Copy configuration files
COPY configs/.env.production ./backend/.env
COPY configs/nginx-ssl.conf /etc/nginx/http.d/default.conf

# Create necessary directories
RUN mkdir -p /var/www/ultrazend/{data,logs,backup} && \
    chown -R node:node /var/www/ultrazend && \
    mkdir -p /run/nginx

# Expose ports
EXPOSE 80 443 3001 25

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]