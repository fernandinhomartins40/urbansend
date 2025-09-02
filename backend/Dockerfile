# Multi-stage Dockerfile for UltraZend Backend - OPTIMIZED FOR NATIVE DEPS
FROM node:18-bullseye-slim AS base

# Install system dependencies for native modules (bcrypt, sqlite3, sharp)
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    sqlite3 \
    libsqlite3-dev \
    python3 \
    python3-pip \
    make \
    g++ \
    gcc \
    libc6-dev \
    libvips-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

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

# Configure npm for native dependencies
RUN npm config set python python3 && \
    npm config set prefer-offline false && \
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

# Install runtime dependencies for native modules
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    sqlite3 \
    libsqlite3-0 \
    libvips42 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ultrazend -u 1001 -G nodejs

# Copy production dependencies and built application from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./src/migrations
COPY --from=build /app/knexfile.js ./knexfile.js

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy database
COPY --from=build /app/ultrazend.sqlite ./ultrazend.sqlite

# Create necessary directories with correct structure
RUN mkdir -p /app/data /app/logs/application /app/logs/errors /app/logs/combined /app/certificates && \
    chown -R ultrazend:nodejs /app && \
    chmod -R 755 /app/logs

# Keep as root to fix permissions on startup, then switch to ultrazend
# USER ultrazend - will be handled by entrypoint script

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