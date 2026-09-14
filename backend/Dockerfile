# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: dependências de produção
# Instala apenas o que o runtime precisa. O Prisma CLI (~190 MB) é instalado
# separadamente no stage de migration, porque nenhuma linha de src/ importa
# @prisma/client — o Prisma aqui é só ferramenta de schema (prisma db push).
# ---------------------------------------------------------------------------
FROM node:18-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild bcrypt sqlite3 --build-from-source=false 2>/dev/null || true && \
    npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2: build TypeScript
# ---------------------------------------------------------------------------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runtime
# Contém apenas: node_modules de produção, dist/, scripts e knexfile.
# Sem TypeScript, sem Prisma, sem devDependencies.
# ---------------------------------------------------------------------------
FROM node:18-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/logs && \
    chown nodejs:nodejs /app/logs

# O usuario e criado ANTES dos COPY e cada COPY ja grava com o dono correto.
# Um `chown -R` posterior custaria uma camada extra do tamanho de node_modules
# (~230 MB medidos), porque reescreve cada arquivo em vez de mudar metadados.
COPY --chown=nodejs:nodejs package*.json ./
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs src/migrations ./src/migrations
COPY --chown=nodejs:nodejs scripts ./scripts
COPY --chown=nodejs:nodejs prisma ./prisma
COPY --chown=nodejs:nodejs knexfile.js ./knexfile.js

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health/simple', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------------------
# Stage 4: migration (opcional, usado só no deploy)
# Adiciona o Prisma CLI sobre o runtime para executar `prisma db push`.
# Roda como container efêmero: sobe, aplica o schema, sai. Nunca fica residente,
# então os ~190 MB do Prisma não pesam na imagem que fica no ar 24h.
# ---------------------------------------------------------------------------
FROM runtime AS migration

USER root

# --chown limitado ao que o npm realmente cria; um chown -R /app duplicaria
# node_modules inteiro numa camada nova.
RUN npm install --no-save --no-audit --no-fund prisma@^6.12.0 @prisma/client@^6.12.0 && \
    npm cache clean --force && \
    chown -R nodejs:nodejs /app/node_modules/prisma /app/node_modules/.bin

USER nodejs

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "migrate:latest"]
