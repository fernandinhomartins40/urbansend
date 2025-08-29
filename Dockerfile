FROM node:18-alpine

# Install nginx, curl and build tools for sqlite3
RUN apk add --no-cache nginx curl python3 make g++

WORKDIR /app

# Copy built files
COPY frontend/dist ./frontend/dist
COPY backend/dist ./backend/dist
COPY backend/src/migrations ./backend/src/migrations
COPY backend/knexfile.js ./backend/knexfile.js
COPY backend/package*.json ./backend/
COPY nginx.conf /etc/nginx/nginx.conf

# Install dependencies and rebuild sqlite3 for Linux
WORKDIR /app/backend
RUN npm ci --omit=dev --no-audit --no-fund

# Create directories and permissions
RUN mkdir -p /app/data /app/logs /var/log/nginx /var/lib/nginx /var/tmp/nginx /run/nginx && \
    chown -R nginx:nginx /var/log/nginx /var/lib/nginx /var/tmp/nginx /run/nginx || true

# Startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'nginx -t && nginx &' >> /app/start.sh && \
    echo 'sleep 2' >> /app/start.sh && \
    echo 'cd /app/backend && exec node dist/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 3010 25

CMD ["/app/start.sh"]