# Multi-stage Dockerfile for UltraZend Backend
FROM node:18-alpine AS base

# Install necessary packages for production including build dependencies for sqlite3
RUN apk add --no-cache \
    sqlite \
    curl \
    bash \
    openssl \
    python3 \
    make \
    g++ \
    sqlite-dev \
    libc6-compat

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
COPY package*.json ./

# Set Python path for native module compilation
ENV PYTHON=python3

# Install all dependencies for build (including dev deps for migrations)
RUN npm ci --verbose

COPY . .

# Create empty database file (migrations will run on startup)
RUN touch ultrazend.sqlite

RUN npm run build

# Production stage - clean Alpine image without build dependencies
FROM node:18-alpine AS production
WORKDIR /app

# Install only runtime dependencies
RUN apk add --no-cache \
    sqlite \
    curl \
    bash \
    openssl \
    libc6-compat

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