# NAO adicione `# syntax=docker/dockerfile:1` aqui. Essa diretiva faz o BuildKit
# baixar o frontend do Docker Hub a cada build, e nesta VPS (saturada, ~94
# containers) isso falha com "TLS handshake timeout" e derruba o deploy.
# Nenhum recurso deste arquivo depende dela: sem heredoc, sem RUN --mount,
# sem COPY --link. Ver docs/VPS-ORPHAN-CLEANUP-REPORT.md.

# ---------------------------------------------------------------------------
# Stage 1: dependências de produção
# Instala apenas o que o runtime precisa. O Prisma CLI (~190 MB) é instalado
# separadamente no stage de migration, porque nenhuma linha de src/ importa
# @prisma/client — o Prisma aqui é só ferramenta de schema (prisma db push).
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS prod-deps

WORKDIR /app

COPY package*.json ./
# `bcrypt` e dependência de runtime; um rebuild que falha não pode ser
# ignorado. `sqlite3` é devDependency e não pertence à imagem PostgreSQL de
# produção, portanto tentar recompilá-lo aqui só mascarava configuração ruim.
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild bcrypt --build-from-source=false && \
    npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2: build TypeScript
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder

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
FROM ${NODE_IMAGE} AS runtime

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
    CMD node -e "require('http').get('http://localhost:3001/api/health/simple', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

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
RUN npm install --no-save --no-package-lock --no-audit --no-fund prisma@6.12.0 @prisma/client@6.12.0 && \
    npm cache clean --force && \
    chown -R nodejs:nodejs /app/node_modules/prisma /app/node_modules/.bin

USER nodejs

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "migrate:latest"]
