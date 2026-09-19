# VPS-OPT — Inventário (Etapa 1: Descoberta)

> **Escopo desta etapa:** somente descoberta. Nada foi otimizado, alterado, reiniciado ou apagado.
> Nenhum serviço foi tocado. Este documento e o `VPS-OPT-BASELINE.md` são os únicos artefatos.

| Campo | Valor |
|---|---|
| Data da coleta | 2026-09-16 (repositório) · **2026-09-17 (medição no host)** |
| Repositório | `urbansend` (produto: **VeloMail**, nome interno legado: **UltraZend**) |
| Branch / commit | `main` / `7e1e9bf` |
| Host alvo | VPS Hostinger `72.60.10.108` (4 vCPU / ~16 GB RAM / 194 GB disco) |
| Host **compartilhado** com | `aprenderia`, `digiurban`, `m2centerauto` — **4 aplicações no mesmo host** |
| Acesso à VPS nesta sessão | **OBTIDO** (SSH/Paramiko) — métricas em `VPS-OPT-BASELINE.md` |
| Estado em produção | **NO AR e saudável**; deploy `7e1e9bf` bem-sucedido em 16/09 20:33Z |

**Convenção de status:** `VERIFIED` (evidência direta no repositório ou medição), `PENDING`
(indício encontrado, confirmação exige acesso ao host), `NOT VERIFIED` (não foi possível avaliar),
`NOT APPLICABLE` (não existe na stack, com justificativa).

---

## 1. Arquitetura

Aplicação de envio de e-mail transacional (clone de Resend), monorepo com backend Node/Express,
frontend React SPA servido como estático pelo Nginx do host, e PostgreSQL em container.

```
Internet ──► Nginx (host, systemd, COMPARTILHADO com as outras 3 apps)
              ├─ /              → /var/www/ultrazend-static (SPA estática, arquivos)
              ├─ /api/          → 127.0.0.1:3001  (container ultrazend-api)
              ├─ /track/        → 127.0.0.1:3001/api/emails/track/
              └─ /health        → 127.0.0.1:3001/api/health/simple

Docker (rede bridge `ultrazend-network`)
   ├─ ultrazend-api        (residente, Node 18, porta 3001 publicada)
   ├─ ultrazend-postgres   (residente, Postgres 16-alpine, porta NÃO publicada)
   └─ ultrazend-migration  (efêmero: aplica schema + seed e sai)
```

**Ponto de atenção arquitetural:** existem **duas descrições de arquitetura conflitantes e
mutuamente exclusivas** no repositório. Ver §11.

| ID | Item | Evidência | Status |
|---|---|---|---|
| ARQ-01 | Monorepo: `backend/`, `frontend/`, 2 pacotes SMTP soltos | listagem da raiz | VERIFIED |
| ARQ-02 | Deploy real = `docker run` explícitos, **não** compose | `.github/scripts/deploy-production-remote.sh` | VERIFIED |
| ARQ-03 | Nginx no host (não containerizado), compartilhado entre 4 apps | script de deploy, blocos `nginx -t` / fallback | VERIFIED |
| ARQ-04 | Frontend compilado no runner do GitHub, entregue por `scp` como tarball | `.github/workflows/deploy-production.yml` | VERIFIED |

---

## 2. Stack e versões

| Camada | Tecnologia | Versão declarada | Fonte | Status |
|---|---|---|---|---|
| Runtime backend | Node.js | `>=18` (imagem `node:18-alpine`) | `backend/package.json`, `backend/Dockerfile` | VERIFIED |
| Runtime CI/build | Node.js | 20 | `deploy-production.yml` | VERIFIED |
| Framework backend | Express | `^5.2.1` | `backend/package.json` | VERIFIED |
| Linguagem | TypeScript | `^5.6.2` | idem | VERIFIED |
| Query builder (runtime) | Knex | `^3.1.0` | idem | VERIFIED |
| Schema tool (deploy) | Prisma | `^6.12.0` (**devDependency**) | idem | VERIFIED |
| Banco (produção) | PostgreSQL | `16-alpine` | script de deploy | VERIFIED |
| Banco (dev/legado) | SQLite | `sqlite3 ^6.0.1` | `backend/knexfile.js` | VERIFIED |
| Frontend | React + Vite | 18.3 / Vite 5.4 | `frontend/package.json` | VERIFIED |
| Gerenciador de pacotes | npm (`npm ci`) | — | workflows | VERIFIED |
| Proxy | Nginx + Certbot/Let's Encrypt | — | script de deploy | VERIFIED |
| Registry | GHCR (`ghcr.io`) | — | `deploy-production.yml` | VERIFIED |

---

## 3. Aplicações

| ID | Aplicação | Caminho | Build | Entrega | Status |
|---|---|---|---|---|---|
| APP-01 | Backend API + SMTP | `backend/` | `tsc` → `dist/` (imagem Docker, no runner) | container residente | VERIFIED |
| APP-02 | Frontend SPA | `frontend/` | `vite build` → `dist/` (no runner) | tarball → `/var/www/ultrazend-static` | VERIFIED |
| APP-03 | `@ultrazend/smtp-internal` | `ultrazend-smtp-module/` | não construído por nenhum pipeline | **não entregue** | VERIFIED (órfão) |
| APP-04 | `@ultrazend/smtp-server` | `ultrazend-smtp-server/` | não construído por nenhum pipeline | **não entregue** | VERIFIED (órfão) |

**APP-03 / APP-04 — uso não comprovado:** busca por `@ultrazend/smtp` em todos os `package.json`,
`*.ts`, `*.yml` e `*.sh` fora dos próprios diretórios retornou **zero ocorrências**; o Dockerfile e o
script de deploy também não os mencionam. Pelo protocolo (§2), *busca sem resultado não autoriza
remoção* — ficam registrados como **candidatos a revisão**, não como lixo confirmado.

---

## 4. Containers e processos

Catálogo do que o **script de deploy de produção** cria. Os limites declarados abaixo foram
**confirmados como efetivos** por `docker inspect` em 2026-09-17 — todos conferem
(ver `VPS-OPT-BASELINE.md` §3).

| ID | Nome | Imagem | Função | Depende de | Volumes | Rede | Portas | Healthcheck | Persistência | RAM decl. | CPU decl. | PIDs | Restart | Tipo | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CNT-01 | `ultrazend-api` | `ghcr.io/<owner>/velomail-api:sha-<commit>` → tag local `ultrazend-api:latest` | API HTTP + SMTP + cron in-process | postgres, migration | `$LOGS_DIR:/app/logs`, `$CONFIG_DIR:/app/configs`, `ultrazend-storage-data:/app/storage` | `ultrazend-network` | `3001:3001` | `/api/health/simple` | via volumes | `-m 512m`, swap 512m | `--cpus=1.5` | 300 | `unless-stopped` | **permanente** | VERIFIED (declarado) |
| CNT-02 | `ultrazend-postgres` | `postgres:16-alpine` | banco | — | `ultrazend-postgres-data:/var/lib/postgresql/data` | `ultrazend-network` | **não publicada** (só rede interna) | `pg_isready` (loop do deploy) | **sim, crítica** | `-m 256m`, swap 256m | `--cpus=1.0` | 200 | `unless-stopped` | **permanente** | VERIFIED (declarado) |
| CNT-03 | `ultrazend-migration` | `velomail-migration:sha-<commit>` | `prisma db push` + seed super admin | postgres healthy | `$CONFIG_DIR:/app/configs` | `ultrazend-network` | — | — | escreve no banco | `-m 512m` | `--cpus=1.0` | 200 | `--rm` | **job efêmero** | VERIFIED (declarado) |

### 4.1 Processos internos ao CNT-01

O container `ultrazend-api` **não é só uma API**. Ele carrega no mesmo processo Node:

| ID | Processo | Onde | Evidência | Status |
|---|---|---|---|---|
| PRC-01 | Servidor HTTP Express (3001) | `backend/src/index.ts:773` | `server.listen(PORT)` | VERIFIED |
| PRC-02 | WebSocket Socket.IO | `backend/src/index.ts:217` | `new Server(primaryServer, …)` | VERIFIED |
| PRC-03 | **Servidor SMTP MX (porta 25)** | `backend/src/services/smtpServer.ts:491` | `mxServer.listen(mxPort)`; prod = 25 | VERIFIED (código) |
| PRC-04 | **Servidor SMTP Submission (porta 587)** | `backend/src/services/smtpServer.ts:503` | `submissionServer.listen(587)` | VERIFIED (código) |
| PRC-05 | `healthCheckScheduler` — **8 cron jobs** | `backend/src/scheduler/healthCheckScheduler.ts` | `cron.schedule` ×8 (5min, 15min, 30min, 1h, 4h, diário 2h, semanal, 6h) | VERIFIED |
| PRC-06 | `AutoRollbackService` — cron a cada 10 min | `backend/src/services/AutoRollbackService.ts:132` | `cron.schedule('*/10 * * * *')`; **atrás de feature flag** | VERIFIED |
| PRC-07 | `domainVerificationInitializer` | `backend/src/index.ts:671` | job de verificação de domínio | VERIFIED |
| PRC-08 | `monitoringService` | `backend/src/index.ts:605` | coleta de métricas periódica | VERIFIED |

**PRC-03 / PRC-04 — RESOLVIDO por medição (VERIFIED, 2026-09-17):** o código abre 25 e 587 dentro
do container e os logs registram `MX Server listening on port 25` / `SMTP Server started
successfully`. Mas o `docker run` publica **apenas** `-p 3001:3001`, e as portas 25/587 do host
pertencem ao container **`ultrazend-smtp`, do projeto digiurban** (apesar do prefixo `ultrazend-`).
Teste na porta 25 do host: `421 mail.digiurban.com.br You talk too soon`.

Ou seja: **o SMTP do VeloMail escuta num vácuo** — ativo dentro do namespace do container,
inalcançável de fora. Os logs de sucesso reportam o `listen()` interno, não acessibilidade real.
O **envio** não é afetado (usa entrega direta via MX, `ULTRAZEND_DIRECT_DELIVERY=true`); o que está
inerte é o **recebimento**. Detalhes em `VPS-OPT-BASELINE.md` §6.1.

### 4.2 Processos declarados que NÃO existem no deploy atual

| ID | Item | Declarado em | Realidade | Status |
|---|---|---|---|---|
| PRC-09 | PM2 `ultrazend-api` (fork) | `ecosystem.config.js` | deploy não usa PM2 | VERIFIED (obsoleto) |
| PRC-10 | PM2 `ultrazend-email-worker` → `dist/workers/emailWorker.js` | `ecosystem.config.js` | **`backend/src/workers/` está VAZIO** | VERIFIED (código inexistente) |
| PRC-11 | PM2 `ultrazend-queue-processor` → `dist/workers/queueProcessor.js` | `ecosystem.config.js` | **`backend/src/workers/` está VAZIO** | VERIFIED (código inexistente) |

---

## 5. Banco de dados e ORM

| ID | Item | Detalhe | Status |
|---|---|---|---|
| DB-01 | SGBD produção | PostgreSQL 16-alpine, container, porta não publicada | VERIFIED |
| DB-02 | Credenciais | usuário/senha/base = `ultrazend` (valor **fixo no script de deploy**) | VERIFIED |
| DB-03 | Acesso runtime | **Knex** (`backend/src/config/database.ts`) | VERIFIED |
| DB-04 | Schema em Postgres | **Prisma `db push --accept-data-loss`** | VERIFIED |
| DB-05 | Schema em SQLite | Knex `migrate:latest` | VERIFIED |
| DB-06 | Migrations Knex | **89 arquivos** em `backend/src/migrations/` | VERIFIED |
| DB-07 | Pool Postgres | `min 2 / max 12` (env `DB_POOL_MIN`/`DB_POOL_MAX`) | VERIFIED |
| DB-08 | Tuning Postgres | `shared_buffers=64MB`, `effective_cache_size=192MB`, `max_connections=50`, `work_mem=4MB` | VERIFIED |
| DB-09 | Seed | `backend/scripts/seed-super-admin.js`, exige `SUPER_ADMIN_PASSWORD` | VERIFIED |
| DB-10 | Tamanho real do banco | **20 MB**, 89 tabelas, 2 usuários, 9–14 conexões de 50 | **VERIFIED** (medido 2026-09-17) |
| DB-11 | Tabela `application_error_logs` | **NÃO EXISTE** no Postgres: criada só pela migration Knex `A81`, ausente do `schema.prisma` → log de erros da aplicação **desativado em produção** | **VERIFIED** (bug ativo, ver baseline §6.2) |

**DB-04 / DB-06 — divergência CONFIRMADA, com consequência real:** em produção (Postgres) as
**89 migrations Knex não são executadas**; o schema vem de `prisma db push`. As migrations só rodam
no caminho SQLite. Duas fontes de verdade coexistem (`schema.prisma` 85 KB e
`schema.sqlite.prisma` 86 KB).

Isso **já quebrou algo em produção** (DB-11): `application_error_logs` é criada pela migration Knex
`A81_create_application_error_logs.js`, mas não existe no `schema.prisma` — logo o `db push` nunca a
cria. `SELECT to_regclass('public.application_error_logs')` retorna vazio, e o container registra a
cada erro: *"Application error log persistence disabled until the application_error_logs table
exists"*. Não derruba a aplicação, mas cega a observabilidade de erros.

O `--accept-data-loss` roda a cada deploy **sem backup prévio** (BKP-02/BKP-04) — no último deploy
ele alterou uma coluna que continha dados. **Nada foi corrigido aqui**: etapa de descoberta.

**DB-07:** o comentário no `knexfile.js` registra que reduzir o pool para `max 5` **foi testado e
falhou** (satura no boot, trava antes do `server.listen()`). Qualquer proposta futura de reduzir
pool precisa respeitar esse histórico.

---

## 6. Storage, volumes e persistência

**Nada foi apagado, movido ou truncado.**

| ID | Recurso | Tipo | Caminho / nome | Proprietário | Consumidores | Retenção | Criticidade | Tamanho | Status |
|---|---|---|---|---|---|---|---|---|---|
| VOL-01 | `ultrazend-postgres-data` | volume nomeado | `/var/lib/postgresql/data` | CNT-02 | CNT-01, CNT-03 | permanente | **CRÍTICA** | **banco 20 MB** | **VERIFIED** (medido) |
| VOL-02 | `ultrazend-storage-data` | volume nomeado | `/app/storage` (CNT-01) | CNT-01 | — | permanente | **INERTE** (vazio) | **4,0 KB** | **VERIFIED** (medido) |
| VOL-03 | `/var/lib/ultrazend/logs` | bind mount | `/app/logs` | CNT-01 (uid 1001) | — | ver LOG-01..05 | média | **8,5 MB** | **VERIFIED** (medido) |
| VOL-04 | `/var/lib/ultrazend/configs` | bind mount | `/app/configs` | host (root) | CNT-01, CNT-03 | permanente | **CRÍTICA** (DKIM + `.env.production`) | **88 KB** | **VERIFIED** (medido; chave `velomail.com.br` presente e carregada) |
| VOL-05 | `/var/www/ultrazend-static` | diretório host | SPA compilada | Nginx (`www-data`) | Nginx | substituído a cada deploy | baixa | ~17 MB (`dist` local) | VERIFIED |
| VOL-06 | `/var/www/ultrazend` | diretório host | clone do repositório | deploy | script de deploy | substituído a cada deploy | baixa | **29 MB** | **VERIFIED** (medido) |
| VOL-07 | Volumes legados | volumes nomeados | `ultrazend-storage`, `ultrazend_ultrazend-storage`, `postgres-data`, `ultrazend_postgres-data` | — | fallback nunca acionado | — | **NÃO EXISTEM** | 0 B | **VERIFIED** (medido) |

**VOL-02 — CONFIRMADO INERTE (VERIFIED, 2026-09-17):** a busca no código não achava nenhuma escrita
em `/app/storage`, e a inspeção no host confirma: o volume tem **4,0 KB e nenhum arquivo**
(`ls -la /app/storage` mostra apenas `.` e `..`). É um recurso inerte, de custo desprezível em
disco. Continua candidato a revisão — não a remoção automática, já que está declarado como volume
persistente e a decisão é de produto.

**VOL-07 — RISCO ELIMINADO (VERIFIED, 2026-09-17):** `docker volume ls` mostra 17 volumes no host e
**nenhum legado do VeloMail existe** (`ultrazend-storage`, `postgres-data`, `ultrazend_*` ausentes).
Só existem `ultrazend-postgres-data` e `ultrazend-storage-data`. O fallback de
`resolve_existing_volume()` nunca precisou atuar. Reclaimable de volumes no host: **0 B**.

---

## 7. Docker, build e deploy

### 7.1 Cadeia completa

```
push main (paths: backend/**, frontend/**, configs/**, workflows)
  │
  ├─ job `build` (runner GitHub ubuntu-latest, timeout 30 min)
  │    ├─ checkout (ref = rollback_sha OU github.sha)
  │    ├─ check-tracked-sensitive-files.mjs           ← único gate de qualidade
  │    ├─ resolve tags: ghcr.io/<owner>/velomail-{api,migration}:sha-<commit>
  │    ├─ docker manifest inspect → se a imagem existe, PULA o build (rollback sem rebuild)
  │    ├─ build+push target `runtime`   (cache GHA mode=max)
  │    ├─ build+push target `migration` (cache GHA mode=max)
  │    ├─ npm ci && npm run build (frontend, Node 20)
  │    └─ tar.gz do dist → artifact (retention 7d)
  │
  └─ job `deploy` (needs: build)
       ├─ sshpass + ssh-keyscan
       ├─ scp tarball → /tmp/velomail-frontend.tar.gz
       └─ ssh: executa deploy-production-remote.sh com IMAGE_API/IMAGE_MIGRATION/REGISTRY_*
            ├─ remove containers com label com.ultrazend.component=application
            ├─ (se disco < 1.5 GB) poda APENAS imagens velomail-*, mantendo 3 tags
            ├─ git clone --depth 1 atômico (.new → swap → .old removido)
            ├─ sincroniza configs/ → /var/lib/ultrazend/configs
            ├─ gera segredos ausentes (openssl rand -hex 48)
            ├─ Nginx: bootstrap HTTP → certbot → config HTTPS (fallback p/ HTTP se inválida)
            ├─ garante rede + volumes persistentes
            ├─ Postgres: reaproveita container existente, NÃO recria
            ├─ docker pull das 2 imagens + tag local :latest
            ├─ docker run --rm migration (db push + seed)
            ├─ docker run -d ultrazend-api
            ├─ systemctl reload nginx (falha NÃO aborta o deploy)
            └─ healthcheck: até 36 tentativas × 5s = 3 min
```

| ID | Item | Detalhe | Status |
|---|---|---|---|
| BLD-01 | Local do build | **runner GitHub**, nunca na VPS | VERIFIED |
| BLD-02 | Dockerfile | 4 stages: `prod-deps`, `builder`, `runtime`, `migration` | VERIFIED |
| BLD-03 | Tag de imagem | `sha-<commit>` (imutável) + `:latest` local | VERIFIED |
| BLD-04 | Cache de build | GitHub Actions cache (`type=gha,mode=max`) — **fora da VPS** | VERIFIED |
| BLD-05 | Arquitetura de CPU da imagem | **amd64/linux** — compatível com o host | **VERIFIED** (medido) |
| BLD-11 | Tamanho das imagens no host | API **310 MB**; migration **868 MB** (efêmera, não fica residente) | **VERIFIED** (medido) |
| BLD-12 | Duração do deploy | **3m20s** (run `35147306986`, success). Antes de o build sair da VPS: 55 min **e falhava** | **VERIFIED** (GitHub API) |
| BLD-06 | Autenticação | GHCR via `GITHUB_TOKEN`; SSH via **senha** (`secrets.VPS_PASSWORD` + `sshpass`) | VERIFIED |
| BLD-07 | Rollback | `workflow_dispatch` com `rollback_sha`; pull de tag existente, sem rebuild | VERIFIED |
| BLD-08 | Compila na VPS? | **Não** — explicitamente removido (PLANO CRITICA-1) | VERIFIED |
| BLD-09 | `.dockerignore` | exclui `node_modules`, `dist`, `.git`, `*.sqlite`, `.env*` | VERIFIED |
| BLD-10 | Contexto de build | 3,7 MB / 315 arquivos | VERIFIED (medição histórica, ver baseline §3) |

> Nenhuma credencial foi lida, exibida ou inspecionada. Os nomes de secrets acima vêm da definição
> do workflow; seus valores não foram acessados.

### 7.2 Compose

`docker-compose.yml` existe e é **documentadamente apenas para desenvolvimento local** (declarado no
cabeçalho do próprio arquivo). Mantém paridade manual de limites com o script de deploy.
**Editá-lo não afeta produção.**

### 7.3 Gate de qualidade

| ID | Situação | Status |
|---|---|---|
| CI-01 | `quality.yml` roda **somente em `pull_request`** | VERIFIED |
| CI-02 | Em push para `main`, o único check é `check-tracked-sensitive-files.mjs` | VERIFIED |
| CI-03 | Typecheck, testes e `npm audit` **não bloqueiam** o deploy de `main` (commit `7e1e9bf` removeu o gate) | VERIFIED |

---

## 8. Cache, filas, Redis, object storage

| ID | Serviço | Declarado | Instalado | Referenciado | Em execução | Necessário em runtime | Status |
|---|---|---|---|---|---|---|---|
| SVC-01 | **Redis** | ENVs `REDIS_*` em `.env.example` e `ecosystem.config.js` | **nenhum pacote cliente** (`ioredis`/`redis` ausentes do `package.json`) | 8 arquivos, apenas health-check e métricas | **não há container Redis no deploy** | **NÃO** | VERIFIED — **não usado** |
| SVC-02 | **Fila (Bull/BullMQ)** | comentários `queueService` | não instalado | `backend/src/index.ts:617` = stub que só emite log | não | NÃO | VERIFIED — removido |
| SVC-03 | **MinIO / S3** | — | — | nenhuma referência | — | — | NOT APPLICABLE (nenhum SDK de object storage no `package.json` nem em `src/`) |
| SVC-04 | Cache in-process | `node-cache ^5.1.2` | sim | sim | dentro de CNT-01 | sim | VERIFIED |

**SVC-01 — evidência de que Redis NÃO é usado:**
1. Nenhum `import` de `ioredis`, `redis` ou `bull*` em `backend/src/**/*.ts` (busca retornou vazio).
2. `backend/src/routes/health.ts:82` afirma literalmente: *"V3 Architecture: Redis not required for
   simplified email service"*.
3. `monitoringService.testRedisConnection()` faz apenas **um teste de socket TCP** na porta 6379 —
   não é um cliente Redis; falha silenciosamente e registra métrica.
4. Nenhum container Redis é criado pelo script de deploy.

**Consequência correta:** as ENVs `REDIS_*` e o health-check produzem ruído (métrica sempre
"disconnected"), mas **não consomem RAM de um servidor Redis, porque ele não existe**. Não há
container a eliminar aqui — há ruído de configuração. Registrado para a etapa de análise.

---

## 9. Logs, rotação e backups

| ID | Canal | Caminho | maxSize | Retenção | Status |
|---|---|---|---|---|---|
| LOG-01 | application | `logs/application/app-%DATE%.log` | 100 MB | **30 d** | VERIFIED |
| LOG-02 | errors | `logs/errors/error-%DATE%.log` | 100 MB | **90 d** | VERIFIED |
| LOG-03 | security | `logs/security/security-%DATE%.log` | 50 MB | **180 d** | VERIFIED |
| LOG-04 | performance | `logs/performance/perf-%DATE%.log` | 50 MB | 7 d | VERIFIED |
| LOG-05 | business | `logs/business/business-%DATE%.log` | 100 MB | **365 d** | VERIFIED |
| LOG-06 | Docker json-file (CNT-01, CNT-02) | — | 10 MB × 3 | rotativo | VERIFIED |
| LOG-07 | Nginx tracking | `/var/log/nginx/tracking.log` | logrotate do host | — | VERIFIED (configurado) / **PENDING** (rotação real — GAP-10) |
| LOG-08 | Ocupação real em disco | `/var/lib/ultrazend/logs` | — | — | **8,5 MB** — VERIFIED (medido 2026-09-17) |

**LOG-01..05 — estimativa anterior CORRIGIDA pela medição:** o teto teórico sugeria "dezenas de GB".
Medido em 2026-09-17: **8,5 MB no total** (application 2,2 MB · business 2,2 MB · performance 2,2 MB
· security 2,2 MB · errors 44 KB). A aplicação está no ar há ~1 dia, então a retenção longa ainda
não acumulou — mas a taxa observada (~1,8 MB/dia em `business`) projeta ~650 MB/ano nesse canal,
não dezenas de GB. **Este risco é muito menor do que o estimado e não é prioridade.**

| ID | Backup | Detalhe | Status |
|---|---|---|---|
| BKP-01 | `backup-system.sh` (raiz, 10,9 KB) | existe no repositório, mas **não está instalado nem agendado** no host | **VERIFIED** (ausência confirmada) |
| BKP-02 | Backup automatizado do Postgres no deploy | **não existe** no script de deploy | VERIFIED (ausência) |
| BKP-03 | Dumps / snapshots no host | — | **PENDING** |
| BKP-04 | Agendamento de backup no host | `crontab -l` **vazio**; `/etc/cron.d/` só tem `certbot`, `e2scrub_all`, `monarx-update` → **NENHUM backup do PostgreSQL** | **VERIFIED** (medido 2026-09-17) |

**BKP-02 + BKP-04 = o risco mais grave da auditoria.** O deploy roda `prisma db push
--accept-data-loss` a cada execução **sem nenhum backup prévio**, e **não existe backup agendado de
espécie alguma** no host (confirmado por `crontab -l` e `/etc/cron.d/`). O log do último deploy
mostra o Prisma alterando uma coluna que continha dados. É risco de **perda de dados**, não de
desperdício de recursos. Registrado; tratamento fora do escopo desta etapa.

---

## 10. Configurações de recursos e sua aplicação efetiva

| ID | Parâmetro | Valor declarado | Onde | Aplicação efetiva | Status |
|---|---|---|---|---|---|
| RES-01 | RAM CNT-01 | `-m 512m --memory-swap 512m` | script de deploy | **512 MiB confirmado**; uso real 94,91 MiB (18,54 %) | **VERIFIED** |
| RES-02 | Heap Node CNT-01 | `NODE_OPTIONS=--max-old-space-size=384` | script de deploy | **`heapUsed` 69–70 MB**, `rss` ~143 MB, estável | **VERIFIED** |
| RES-03 | CPU CNT-01 | `--cpus=1.5` | script de deploy | **`NanoCpus=1500000000` confirmado**; uso 0,12 % | **VERIFIED** |
| RES-04 | PIDs CNT-01 | `--pids-limit=300` | script de deploy | **300 confirmado**; uso 12 PIDs | **VERIFIED** |
| RES-05 | RAM CNT-02 | `-m 256m --memory-swap 256m` | script de deploy | **256 MiB confirmado**; uso 61,67 MiB (24,09 %) | **VERIFIED** |
| RES-06 | CPU CNT-02 | `--cpus=1.0` | script de deploy | **confirmado**; uso 0,08 % | **VERIFIED** |
| RES-07 | `shared_buffers` | 64 MB | script de deploy | **`SHOW shared_buffers` = 64MB** | **VERIFIED** |
| RES-08 | `max_connections` | 50 | script de deploy | **`SHOW max_connections` = 50**; em uso 9–14 | **VERIFIED** |
| RES-09 | Pool Knex | min 2 / max 12 | `backend/knexfile.js` | **9–14 conexões ativas**, sem pressão | **VERIFIED** |
| RES-10 | `max_memory_restart` PM2 | 512M / 256M | `ecosystem.config.js` | **NÃO APLICADO** (PM2 não é usado) | VERIFIED (inerte) |
| RES-11 | Healthcheck CNT-01 | 30s / timeout 3s / start 40s / 3 retries | Dockerfile + deploy | **ativo**: `200` a cada 30 s em 1–2 ms; container `healthy` | **VERIFIED** |
| RES-12 | Limites do Nginx do host | `client_max_body_size 10M`, rate limit 10 r/s burst 20 | script de deploy | nginx 1.18.0 **ativo**; valores não reconferidos in loco | VERIFIED (declarado) / PENDING |

**Nota metodológica (exigida pelo protocolo §7):** a coluna "declarado" traz **limites
configurados**; a coluna "aplicação efetiva" traz o que o host confirma. Os dois nunca foram
confundidos. A separação entre memória usada, disponível, cache e swap está no baseline §1.

**Estabilidade medida (2026-09-17):** `OOMKilled=false` e `RestartCount=0` nos dois containers,
nenhum registro de OOM em `dmesg`. Os limites estão dimensionados com folga real, não apenas no
papel.

**RES-02 vs RES-01 — preocupação REDUZIDA pela medição:** a folga entre heap (384 MB) e limite
(512 MB) parecia estreita dado tudo que roda no mesmo processo. Medido em repouso: `heapUsed`
**69–70 MB** (18 % do heap permitido) e `rss` **~143 MB**, estáveis ao longo de horas, sem sinal de
vazamento e sem nenhum OOM. **O pico sob carga real continua NOT MEASURED** (GAP-04a) — este número
vale para repouso, não para carga.

---

## 11. Conflito de arquitetura documentada (achado estrutural)

| Dimensão | `ecosystem.config.js` (PM2) | Deploy real (Docker) |
|---|---|---|
| Orquestração | PM2, 3 processos | `docker run`, 2 containers residentes |
| Banco | SQLite (`./ultrazend.sqlite`) | PostgreSQL 16 |
| Redis | `REDIS_ENABLED: 'true'` nos workers | inexistente |
| Workers | 2 processos dedicados | **código ausente** (`backend/src/workers/` vazio) |
| Caminho | `/var/www/ultrazend/backend` | imagem Docker |
| SMTP | portas 2525 / 587 | 25 / 587 (não publicadas) |

`ecosystem.config.js` referencia `dist/workers/emailWorker.js` e `dist/workers/queueProcessor.js`,
mas `backend/src/workers/` está **vazio** — esses arquivos não podem ser produzidos pelo build.
O arquivo é **resíduo de arquitetura anterior**. Classificação: `VERIFIED` como obsoleto,
**sem ação nesta etapa**.

Documentos em `docs/` e na raiz também descrevem estados históricos divergentes
(`GUIA_ARQUITETURA_ULTRAZEND.md`, `PLANO_*`, `AUDITORIA_TECNICA_2026-09.md`). Não foram tratados
como fonte de verdade: a fonte de verdade adotada foi **o script de deploy + o código**.

---

## 12. Serviços externos

| ID | Serviço | Uso | Status |
|---|---|---|---|
| EXT-01 | GitHub Actions | CI/CD | VERIFIED |
| EXT-02 | GHCR | registry de imagens | VERIFIED |
| EXT-03 | Let's Encrypt / Certbot | TLS de `velomail.com.br` + `www` (SAN) | VERIFIED |
| EXT-04 | DNS `velomail.com.br` | MX / SPF / DKIM / DMARC | PENDING |
| EXT-05 | Entrega SMTP direta via MX | `ULTRAZEND_DIRECT_DELIVERY=true` | VERIFIED (configurado) |
| EXT-06 | MCP SDK (`@modelcontextprotocol/sdk`) | rota `backend/src/routes/ai.ts` | VERIFIED |

---

## 13. Lacunas — situação após a medição no host (2026-09-17)

Acesso SSH foi obtido e **9 das 10 lacunas foram fechadas com medição direta**.

| ID | Lacuna | Situação | Resultado |
|---|---|---|---|
| GAP-01 | Métricas ao vivo do host | **FECHADA** | SSH via Paramiko; baseline §1–§5 |
| GAP-02 | Limites efetivos dos containers | **FECHADA** | `docker inspect`: **todos conferem** com o declarado |
| GAP-03 | Tamanho de volumes, banco e logs | **FECHADA** | banco 20 MB · logs 8,5 MB · storage 4 KB |
| GAP-04 | Pico de RAM/CPU, OOM, latência | **PARCIAL** | OOM=0, restarts=0, latência medida; **pico continua NOT MEASURED** |
| GAP-05 | Conteúdo de `ultrazend-storage-data` | **FECHADA** | **vazio** (4 KB, nenhum arquivo) |
| GAP-06 | Volumes legados duplicados | **FECHADA** | **não existem**; reclaimable 0 B |
| GAP-07 | Arquitetura de CPU da imagem | **FECHADA** | **amd64/linux**, compatível |
| GAP-08 | Agendamento de `backup-system.sh` | **FECHADA** | **nenhum backup agendado** (achado grave) |
| GAP-09 | Portas SMTP 25/587 acessíveis | **FECHADA** | pertencem ao **digiurban**; SMTP do VeloMail inalcançável |
| GAP-10 | Rotação de logs do Nginx no host | **PENDENTE** | não verificada nesta coleta |

### Lacunas remanescentes

| ID | Lacuna | Por que continua aberta |
|---|---|---|
| GAP-04a | **Pico** de RAM/CPU sob carga real | Só há amostras em repouso. O tráfego no período era essencialmente o healthcheck a cada 30 s. Exige janela de observação com uso real — um snapshot em repouso não substitui pico. |
| GAP-10 | Rotação de logs do Nginx (`/var/log/nginx/tracking.log`) | Não coletada nesta sessão. |

---

## 14. Matriz de cobertura

| Área | Encontrada | Inventariada | Itens / IDs | Evidência | Status |
|---|---|---|---|---|---|
| Frontend | sim | sim | APP-02, VOL-05 | `frontend/package.json`, workflow | VERIFIED |
| Backend | sim | sim | APP-01, PRC-01..08 | `backend/src/`, `index.ts` | VERIFIED |
| Containers | sim | sim | CNT-01..03 | script de deploy + `docker ps`/`inspect` | **VERIFIED** (declarado e em execução) |
| Dockerfiles | sim (1) | sim | BLD-02 | `backend/Dockerfile` (4 stages) | VERIFIED |
| Compose | sim (1) | sim | §7.2 | `docker-compose.yml` (só dev) | VERIFIED |
| Banco / ORM | sim | sim | DB-01..11 | `knexfile.js`, `run-db-migrations.js`, `psql` | **VERIFIED** (20 MB, 89 tabelas; DB-11 = bug) |
| Redis | declarado, não instalado | sim | SVC-01 | ausência de cliente + `health.ts:82` | VERIFIED (não usado) |
| MinIO / S3 | não | sim | SVC-03 | nenhum SDK no `package.json` | NOT APPLICABLE |
| Storage / volumes | sim | sim | VOL-01..07 | script de deploy + `docker volume ls`, `du` | **VERIFIED** (VOL-02 vazio; sem legados) |
| Workers | declarados, código ausente | sim | PRC-10, PRC-11 | `backend/src/workers/` vazio | VERIFIED (inexistentes) |
| Cron | sim | sim | PRC-05, PRC-06 | `node-cron`, 9 schedules | VERIFIED |
| Filas | removidas | sim | SVC-02 | stub em `index.ts:617` | VERIFIED |
| WebSocket | sim | sim | PRC-02 | `new Server()` em `index.ts:217` | VERIFIED |
| Proxy | sim | sim | ARQ-03, RES-12, LOG-07 | script de deploy + `systemctl` | **VERIFIED** (nginx 1.18.0 ativo) / PENDING (GAP-10) |
| Healthchecks | sim | sim | RES-11, CNT-01..02 | Dockerfile + deploy + logs | **VERIFIED** (respondendo 200 em 1–2 ms) |
| Logs | sim | sim | LOG-01..08 | `logger.ts` + `du` no host | **VERIFIED** (8,5 MB reais) |
| Backups | script existe, **não agendado** | sim | BKP-01..04 | `crontab -l`, `/etc/cron.d/` | **VERIFIED** (nenhum backup existe) |
| Cache | sim | sim | SVC-04 | `node-cache` | VERIFIED |
| Build / Deploy / CI-CD | sim | sim | BLD-01..10, CI-01..03 | workflows + script | VERIFIED |
| Migrations / Seed | sim | sim | DB-04..06, DB-09 | `run-db-migrations.js` | VERIFIED |
| Runtime | sim | sim | §2 | `package.json`, Dockerfile | VERIFIED |
| Limites RAM / CPU | sim | sim | RES-01..08 | script de deploy + `docker inspect` | **VERIFIED** (efetivos = declarados) |
| Heap | sim | sim | RES-02 | `NODE_OPTIONS` + logs de runtime | **VERIFIED** (69–70 MB usados de 384 MB) |
| Pools | sim | sim | RES-09, DB-07 | `knexfile.js` + `pg_stat_activity` | **VERIFIED** (9–14 conexões de 50) |

---

## 15. Gate — segunda passagem

Reconciliação exigida pelo protocolo §10:

| Verificação | Resultado |
|---|---|
| Serviços declarados × inventariados | O compose declara 3 serviços (postgres, migration, api) → todos mapeados em CNT-01..03. `ecosystem.config.js` declara 3 processos PM2 → **nenhum existe no deploy real**, registrados como PRC-09..11. Nenhum serviço ficou fora do inventário. |
| Dockerfiles encontrados × catalogados | 1 Dockerfile (`backend/Dockerfile`), 4 stages → BLD-02. O frontend **não tem** Dockerfile (é estático no Nginx do host) — coerente com ARQ-04. `frontend/nginx.prod.conf` existe mas **não é referenciado** pelo deploy; registrado como resíduo. |
| Volumes × persistência | 3 volumes/binds em CNT-01 + 1 em CNT-02 → VOL-01..04, todos com proprietário e consumidor declarados; legados em VOL-07. Nenhum volume montado ficou sem entrada. |
| Scripts × fluxo de deploy | No fluxo: `deploy-production-remote.sh` e `check-tracked-sensitive-files.mjs` (§7.1). Fora do fluxo: `fix-backend.sh`, `redeploy.sh`, `quick-start.sh`, `setup-server.sh`, `local-deploy-enhanced.sh`, `monitoring-system.sh`, `backup-system.sh`, `install-on-vps.sh`, `force-fix-backend.sh`, `debug-vps.sh`, `setup-email-server.sh` — **não invocados por nenhum workflow**. Uso não comprovado; registrados como candidatos a revisão, **não removidos**. |
| Justificativa de NOT APPLICABLE | Apenas SVC-03 (MinIO/S3): nenhum SDK de object storage em `package.json` e nenhuma referência em `src/`. Justificado. |
| Falta de acesso tratada como lacuna | Sim — GAP-01..10 registradas como lacuna, nunca como ausência. **O acesso foi posteriormente obtido e 9 das 10 foram fechadas por medição** (§13). |
| Reconciliação declarado × em execução (2026-09-17) | Os 3 containers declarados existem no host: `ultrazend-api` e `ultrazend-postgres` residentes e saudáveis, `ultrazend-migration` executado como job efêmero no deploy. Limites efetivos = declarados. **Nenhum container, volume ou processo do VeloMail foi encontrado no host sem entrada correspondente neste inventário.** |
| Divergências que a medição revelou | (a) portas 25/587 são de **outra aplicação** (PRC-03/04); (b) tabela `application_error_logs` **ausente** (DB-11); (c) **nenhum backup agendado** (BKP-04); (d) `ultrazend-smtp`, `ultrazend-messages`, `ultrazend-face` têm prefixo `ultrazend-` mas **pertencem ao digiurban** — atribuí-los ao VeloMail inflaria o consumo em ~199 MiB. |

---

## 16. Contagens

| Item | Quantidade |
|---|---|
| Aplicações com build + deploy ativos | **2** (APP-01, APP-02) |
| Pacotes adicionais sem pipeline | 2 (APP-03, APP-04) |
| Containers em produção | **3** (2 residentes + 1 efêmero) |
| Dockerfiles | **1** (4 stages) |
| Arquivos Compose | 1 (apenas desenvolvimento) |
| Bancos de dados | **1** em produção (PostgreSQL 16); SQLite apenas dev/legado |
| Volumes / entradas de persistência | **7** (2 nomeados + 2 binds + 2 diretórios de host + legados) |
| Processos internos ao container API | **8** (PRC-01..08) |
| Jobs / cron schedules | **9** `cron.schedule` (8 healthCheck + 1 autoRollback) + 1 job de migration |
| Rotas HTTP (arquivos) | 34 |
| Services (arquivos) | 60 |
| Migrations Knex | 89 (não executadas no caminho PostgreSQL) |
| Método de deploy | GitHub Actions → GHCR → SSH (senha) → `docker run` na VPS |

### 16.1 Agregação de estados do inventário

Para tornar a cobertura auditável, esta contagem considera os **89 itens com ID operacional** nas
tabelas ARQ, APP, CNT, PRC, DB, VOL, BLD, CI, SVC, LOG, BKP, RES e EXT. Os rastreadores `GAP-*` são
lacunas/transições, e não serviços adicionais, portanto não entram no denominador. Nas linhas de
status composto, foi usado o estado que ainda exige confirmação para não superestimar a cobertura.

| Estado | Quantidade | Observação |
|---|---:|---|
| VERIFIED | **84** | Evidência de código, pipeline ou medição direta datada. |
| PENDING | **4** | LOG-07 (rotação real), BKP-03 (dumps/snapshots), RES-12 (Nginx in loco), EXT-04 (DNS). |
| NOT VERIFIED | **0** | Nenhum item operacional foi classificado como ausente sem evidência; lacunas de acesso ficam em `PENDING`. |
| NOT APPLICABLE | **1** | SVC-03 (MinIO/S3), justificado em §8 e na matriz de cobertura. |

### 16.2 Limitação da validação local desta revisão

Em 2026-09-17 14:56 BRT, a tentativa somente-leitura de executar `docker ps` no workspace local falhou
por permissão no pipe Docker, e WMI/CIM negou as consultas de host. Portanto, não foi possível
atualizar a observação em execução nesta revisão. A baseline de 03:04–03:25 UTC continua preservada
em `VPS-OPT-BASELINE.md`; qualquer coleta futura deve repetir o protocolo de leitura daquele documento
e criar uma nova entrada datada, sem sobrescrever esta amostra histórica.
