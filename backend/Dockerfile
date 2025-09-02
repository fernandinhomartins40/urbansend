# Multi-stage Dockerfile for UltraZend Backend - OPTIMIZED FOR NATIVE DEPS
FROM node:18-bullseye-slim AS base

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    sqlite3 \
    libsqlite3-dev \
    python3 \
    make \
    g++ \
    gcc \
    libc6-dev \
    libvips-dev \
    pkg-config \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/*

# Set Python for native module compilation
ENV PYTHON=python3

# Development stage
FROM base AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
EXPOSE 3001 25 587 465
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Configure npm for native dependencies (Python já configurado via ENV)
RUN npm config set prefer-offline false && \
    npm config set audit-level moderate

# Install all dependencies with verbose logging
RUN npm ci --verbose --no-audit

COPY . .

# Create empty database file (migrations will run on startup)
RUN touch ultrazend.sqlite

RUN npm run build

# Production stage - Debian slim with runtime deps
FROM node:18-bullseye-slim AS production
WORKDIR /app

# Install only runtime dependencies (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    sqlite3 \
    libsqlite3-0 \
    libvips42 \
    && apt-get purge -y --auto-remove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/* \
    && rm -rf /usr/share/info/*

# Create non-root user with proper permissions
RUN groupadd -r nodegroup --gid=1001 && \
    useradd -r -g nodegroup --uid=1001 --home=/app --shell=/bin/bash nodeuser

# Copy only necessary files from build stage
COPY --from=build --chown=nodeuser:nodegroup /app/node_modules ./node_modules
COPY --from=build --chown=nodeuser:nodegroup /app/package*.json ./
COPY --from=build --chown=nodeuser:nodegroup /app/dist ./dist
COPY --from=build --chown=nodeuser:nodegroup /app/src/migrations ./src/migrations
COPY --from=build --chown=nodeuser:nodegroup /app/knexfile.js ./knexfile.js

# Copy entrypoint script with correct permissions
COPY --chown=nodeuser:nodegroup docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy database with correct ownership
COPY --from=build --chown=nodeuser:nodegroup /app/ultrazend.sqlite ./ultrazend.sqlite

# Create necessary directories with correct structure and permissions
RUN mkdir -p /app/data /app/logs/application /app/logs/errors /app/logs/combined /app/logs/exceptions /app/certificates && \
    chown -R nodeuser:nodegroup /app && \
    chmod -R 755 /app/logs /app/data && \
    chmod -R 750 /app/certificates

# Switch to non-root user
USER nodeuser

# Health check robusto (alinhado com nossas correções)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3001/health || curl -f http://localhost:3001/api/health || exit 1

# Environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Expose ports
EXPOSE 3001 25 587 465

# Set entrypoint to handle permissions and user switching
ENTRYPOINT ["docker-entrypoint.sh"]

# Start application diretamente (sem PM2)
# Usa exec form para proper signal handling
CMD ["node", "dist/index.js"]