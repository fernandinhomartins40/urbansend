# Multi-stage Dockerfile for UltraZend Backend
FROM node:18-alpine AS base

# Install necessary packages for production
RUN apk add --no-cache \
    sqlite \
    curl \
    bash \
    openssl

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
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# Production stage
FROM base AS production
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ultrazend -u 1001 -G nodejs

# Copy production dependencies
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Copy application files
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./src/migrations
COPY --from=build /app/database.sqlite ./database.sqlite

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/certificates && \
    chown -R ultrazend:nodejs /app

# Switch to non-root user
USER ultrazend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Expose ports
EXPOSE 3001 25 587 465

# Start application
CMD ["node", "dist/index.js"]