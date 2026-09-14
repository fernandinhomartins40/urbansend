# Auditoria de otimização VPS — VeloMail / UltraZend

Data: 2026-09-13
Escopo: `backend/`, `frontend/`, `docker-compose.yml`, `.github/workflows/`, `.github/scripts/deploy-production-remote.sh`, `ecosystem.config.js`
Objetivo: reduzir consumo de RAM, CPU, disco, tamanho de imagem e número de containers **sem remover funcionalidade**.

---

## Resumo executivo

A aplicação é bem menor do que a infraestrutura que a cerca. Os desperdícios reais encontrados são de **infraestrutura e processo de deploy**, não de código de negócio.

Os cinco achados de maior impacto:

1. **O build inteiro roda na VPS.** O workflow ativo faz SSH e executa na produção: `git clone`, `npm ci` do frontend, `vite build`, e `docker build` do backend. Isso consome RAM/CPU/disco da VPS compartilhada a cada deploy — exatamente o recurso que se quer economizar.
2. **Prisma pesa ~190 MB na imagem e o client não é importado por nenhuma linha de código.** O Prisma é usado **apenas** como CLI (`prisma db push`) para aplicar schema no Postgres. O runtime usa Knex. Além disso, `prisma generate` roda **na VPS a cada deploy**, gastando CPU para gerar um client que ninguém usa.
3. **Dependências de runtime sem nenhum uso**: `sharp`, `multer`, `inversify`, `reflect-metadata`, `express-prom-bundle`, `prom-client`. Zero imports no código.
4. **Logs sem rotação no Docker** (`json-file` default = crescimento ilimitado) somados a uma retenção Winston de até dezenas de GB em disco.
5. **Dockerfile faz `npm ci` três vezes** (duas no builder, uma no runtime) e carrega TypeScript + toolchain para dentro do estágio final.

Nenhuma funcionalidade precisa ser removida para corrigir qualquer um desses pontos.

---

## Arquitetura atual

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite 5, build estático servido pelo Nginx (`/var/www/ultrazend-static`) |
| Backend | Node 18 (Alpine), Express 5, TypeScript compilado para `dist/` |
| Banco | PostgreSQL 16 (container), acessado via **Knex** |
| Schema | Aplicado via **Prisma CLI** (`db push`) — Prisma **não** é ORM de runtime aqui |
| SMTP | `smtp-server` + `nodemailer` embutidos no processo da API |
| WebSocket | `socket.io` no mesmo processo |
| Agendamento | `node-cron` + `setInterval` no mesmo processo |
| Proxy | Nginx no host (não containerizado) |
| Deploy | GitHub Actions → SSH (sshpass) → build na VPS |

**Ponto importante:** existe um `ecosystem.config.js` (PM2, SQLite, workers Redis) que **não corresponde ao deploy real**. O deploy real é Docker + PostgreSQL. O arquivo PM2 é legado e descreve uma arquitetura que não está em produção.

---

## Containers atuais

Em produção, pelo `deploy-production-remote.sh`, são apenas **2 containers**:

| Container | Imagem | Função | Limite atual |
|---|---|---|---|
| `ultrazend-postgres` | `postgres:16-alpine` | Banco | **nenhum** |
| `ultrazend-api` | `ultrazend-api:latest` | API + SMTP + WS + cron | `-m 512m` |

Nginx roda no host. Não há container de Redis, MinIO, worker ou cron em produção.

**Conclusão desta seção: a contagem de containers já é enxuta (2). O ganho não está em remover containers — está em imagem, build e limites.**

---

## Inventário de serviços

| SERVIÇO | EXISTE | USADO PELO CÓDIGO | NECESSÁRIO EM PROD | RAM ESTIMADA | PODE SER REMOVIDO |
|---|---|---|---|---|---|
| PostgreSQL | Sim (container) | Sim (Knex) | **Sim** | NÃO MEDIDO | Não |
| Knex | Sim | Sim (`src/config/database.ts`) | Sim | — | Não |
| Prisma **client** (`@prisma/client`) | Sim (dep) | **Não** — zero imports | Não | 0 (não carregado) | **Sim (da imagem final)** |
| Prisma **CLI** (`prisma`) | Sim (dep) | Sim — `db push` no deploy | Sim, **só no deploy** | 0 em runtime | Separar do runtime |
| Redis / BullMQ | Não (só ENV legada) | **Não** — zero imports | Não | 0 | ENVs legadas podem sair |
| MinIO / S3 | Não | **Não** | Não | 0 | — |
| Workers dedicados | Só `.backup` | **Não** | Não | 0 | Arquivos mortos |
| `node-cron` | Sim | Sim (`healthCheckScheduler`, `AutoRollbackService`) | Sim | dentro da API | Não |
| SMTP server | Sim | Sim | Sim | dentro da API | Não |
| `socket.io` | Sim | Sim | Sim | dentro da API | Não |
| `sharp` | Sim (dep) | **Não** | Não | 0 | **Sim** |
| `multer` | Sim (dep) | **Não** | Não | 0 | **Sim** |
| `inversify` + `reflect-metadata` | Sim (dep) | **Não** | Não | 0 | **Sim** |
| `express-prom-bundle` + `prom-client` | Sim (dep) | **Não** | Não | 0 | **Sim** |
| `sqlite3` | Sim (dep) | Só em testes e fallback | Não em prod (usa `pg`) | 0 | Mover para devDependencies |
| Volume `ultrazend-storage` | Sim | **Nada escreve nele** | Não | — | Manter (vazio, custo ~0) |

---

## Armazenamento

Não há uploads. A busca por `multer`, `.single(`, `.array(` e escrita em `/app/storage` não retornou nenhum handler de upload real. O volume `ultrazend-storage` é montado mas está ocioso.

**Decisão: não introduzir MinIO/S3 nem trocar nada aqui.** Não existe carga de storage a otimizar. O volume fica como está (custo próximo de zero) para não quebrar o mount.

---

## Problemas encontrados

### P0-1 — Build executado na VPS
**Evidência:** `.github/scripts/deploy-production-remote.sh` executa na produção:
- `git clone --depth 1` do repositório inteiro
- `npm ci` + `npm run build` do **frontend** (Vite)
- `docker build` da imagem do **backend**

**Impacto:** pico de RAM/CPU/disco na VPS compartilhada a cada deploy. O script tem inclusive um *guard* que roda `docker image prune` quando o disco cai abaixo de 1.5 GB — sintoma claro de pressão de disco causada pelo próprio build.
**Risco de corrigir:** moderado (muda o pipeline; exige GHCR e credenciais).
**Solução:** buildar no GitHub Actions, publicar no GHCR, e a VPS apenas `docker pull` + `up`.
**Como testar:** rodar o workflow e confirmar que nenhum `npm ci`/`docker build` aparece no log SSH.

### P0-2 — Prisma inteiro na imagem final (~190 MB)
**Evidência medida (`node_modules` local):** `@prisma` = 121 MB, `prisma` = 68.9 MB. Busca por `@prisma/client` / `PrismaClient` em `backend/src`: **zero ocorrências**.
**Impacto:** ~190 MB de imagem e de disco na VPS, mais CPU de `prisma generate` a cada deploy para gerar um client que nada importa.
**Risco:** **alto se feito errado** — o `prisma db push` É necessário para o schema do Postgres. A correção não é remover Prisma, é **tirá-lo do runtime residente**.
**Solução:** remover o `prisma generate` (passo inútil) e manter o CLI apenas no caminho de migration.
**Como testar:** `migrate` isolado, depois runtime isolado — não confiar só no health check.

### P0-3 — Logs Docker sem rotação
**Evidência:** nenhum `--log-opt max-size` no `docker run` do deploy nem no `docker-compose.yml`. Driver default `json-file` cresce indefinidamente.
**Impacto:** disco da VPS compartilhada. É a causa mais comum de VPS cheia.
**Risco:** baixíssimo.
**Solução:** `--log-opt max-size=10m --log-opt max-file=3`.

### P1-1 — Retenção Winston excessiva
**Evidência:** `backend/src/config/logger.ts` — `business` 100m×365d, `security` 50m×180d, `errors` 100m×90d, `application` 100m×30d.
**Impacto:** teto teórico de dezenas de GB em `/var/lib/ultrazend/logs`.
**Risco:** baixo tecnicamente, mas **retenção de log de segurança/negócio pode ter requisito legal**. Não alterado nesta auditoria sem decisão do dono do produto.

### P1-2 — Postgres sem limite de memória
**Evidência:** o `docker run` do Postgres não passa `-m` nem tuning. O default do Postgres se dimensiona assumindo a máquina inteira.
**Impacto:** numa VPS compartilhada, pode crescer e pressionar as outras aplicações.
**Risco:** moderado — limite apertado demais causa lentidão/OOM.
**Solução:** limite explícito + `shared_buffers` coerente com o limite.

### P1-3 — Pool de conexões — ~~superdimensionado~~ **NÃO RECOMENDADO (reprovado em teste)**
**Evidência:** `knexfile.js`, config `pg`: `pool: { min: 2, max: 12 }` para **1 única instância** de API.
**Hipótese inicial:** reduzir para `min: 1, max: 5` liberaria conexões no Postgres compartilhado.

**Resultado do teste — a hipótese foi REPROVADA e a mudança revertida.**
Com `max: 5` a aplicação **não conclui o boot**: a inicialização abre conexões em vários
subsistemas simultaneamente (DKIMManager, RateLimiter, ReputationManager, EmailProcessor,
DeliveryManager, WebhookService, MonitoringService), satura o pool e o
`SMTPServer.validateRequiredTables()` fica esperando indefinidamente por uma conexão que
nunca é liberada — o `server.listen()` nunca é alcançado. Medido em `pg_stat_activity`:
exatamente 5 conexões presas (`max` do pool).

**Ação tomada:** valores originais (`min 2 / max 12`) **restaurados**. Ficaram apenas
parametrizáveis por `DB_POOL_MIN` / `DB_POOL_MAX`, sem mudar o padrão.

> **Observação importante:** esse teste expôs um **bug pré-existente de inicialização** —
> a aplicação satura qualquer `max` que receba durante o boot (com `max: 12` ela também
> consome as 12). Não é regressão desta auditoria e **não foi corrigido aqui**, por estar
> fora do escopo "reduzir consumo sem alterar arquitetura". Ver "Riscos a monitorar".

### P2-1 — Dockerfile ineficiente
**Evidência:** `backend/Dockerfile` roda `npm ci --omit=dev` **e depois** `npm ci --only=development` no builder — o segundo refaz a árvore inteira, tornando o primeiro desperdício puro. Depois roda `npm ci --omit=dev` mais uma vez no runtime. Também usa `COPY . .`.
**Impacto:** tempo de build e layers maiores.

### P2-2 — Dependências não utilizadas
`sharp`, `multer`, `inversify`, `reflect-metadata`, `express-prom-bundle`, `prom-client` — zero imports em `backend/src`. `sqlite3` aparece só em testes e num rótulo de `health.ts`.

### P2-3 — Workflows redundantes
`ci-cd.yml.disabled` (516 linhas) e `deploy-production.yml.disable` (579 linhas) — ~1100 linhas de workflow morto convivendo com o ativo. Não consomem recursos de runtime (estão desabilitados pela extensão), mas são dívida de manutenção e foram a origem da sua pergunta.

### P2-4 — Arquivos mortos no repositório
`backend/src/index.ts.backup`, `index.ts.safe-backup`, `workers/emailWorker.ts.backup`, `workers/queueProcessor.ts.backup`, `services/monitoringService.fixed.ts`.

### P3-1 — ENVs de serviços inexistentes
`QUEUE_ENABLED=true` é passado no deploy, mas `backend/src/index.ts:24` diz `// queueService removido - sistema simplificado sem queue`. ENVs de Redis no `ecosystem.config.js` idem.

---

## Métricas — ANTES

| Métrica | Valor | Fonte |
|---|---|---|
| Containers em produção | 2 | `deploy-production-remote.sh` |
| Imagem `postgres:16-alpine` | 420 MB | `docker images` local |
| Imagem `ultrazend-api` | ver seção de resultados | build local |
| Limite RAM API | 512 MB | `docker run -m 512m` |
| Limite RAM Postgres | **nenhum** | `docker run` sem `-m` |
| `NODE_OPTIONS` / heap V8 | **não definido** | deploy script |
| RAM real em uso | **NÃO MEDIDO** | sem acesso SSH à VPS |
| CPU real / steal time | **NÃO MEDIDO** | sem acesso SSH à VPS |
| Disco da VPS | **NÃO MEDIDO** | sem acesso SSH à VPS |
| Pool Postgres | min 2 / max 12 | `knexfile.js` |
| Rotação de log Docker | ausente | deploy script |
| Local do build | **VPS** | deploy script |

> **Limitação declarada:** não tenho credenciais SSH da VPS (estão em secrets do GitHub), portanto **não pude executar `docker stats`, `df -h` nem `docker system df` em produção**. Toda medição de RAM/CPU/disco real está marcada como **NÃO MEDIDO**. Os tamanhos de imagem e de dependências foram medidos localmente e são reproduzíveis.

---

## Plano de implementação (por prioridade)

| # | Item | Prioridade | Risco |
|---|---|---|---|
| 1 | Rotação de log Docker | **P0** | baixíssimo |
| 2 | Remover `prisma generate` do deploy | **P0** | baixo |
| 3 | Remover deps não utilizadas + `sqlite3` → dev | **P0** | baixo |
| 4 | Dockerfile multi-stage correto (sem Prisma/TS no runtime) | **P0** | baixo/moderado |
| 5 | Limite de RAM no Postgres + `NODE_OPTIONS` na API | **P1** | moderado |
| 6 | ~~Pool Knex 12 → 5~~ | **NÃO RECOMENDADO** | reprovado em teste — trava o boot |
| 7 | Consolidar workflows (remover os mortos) | **P2** | baixíssimo |
| 8 | Remover arquivos `.backup` | **P2** | baixíssimo |
| 9 | Mover build para CI/GHCR | **P1** | moderado — requer decisão |
| 10 | Reduzir retenção Winston | **NÃO RECOMENDADO sem decisão** | compliance |

---

# Resultado final

> Todos os números desta seção foram **medidos** nesta máquina. Onde não houve medição,
> está escrito **NÃO MEDIDO** — nada foi estimado.

## Metodologia da medição

O número de 360 MB citado numa medição preliminar **foi descartado**: aquela imagem tinha
sido construída a partir de cache e o `docker history` mostrava todas as camadas como `0B`,
ou seja, não era uma medição válida. Para a comparação final, **as duas imagens foram
construídas com `--no-cache`, na mesma máquina**:

- **ANTES:** `Dockerfile` + `package.json` + `package-lock.json` extraídos de `git show HEAD:`
  (estado original, sem nenhuma alteração desta auditoria).
- **DEPOIS:** árvore atual, `--target runtime`.

## ANTES / DEPOIS — medido

| Métrica | ANTES | DEPOIS | Ganho |
|---|---|---|---|
| **Imagem da API (residente 24h)** | **1,37 GB** | **310 MB** | **−~1,06 GB (−77%)** |
| `node_modules` dentro da imagem | NÃO MEDIDO (imagem antiga não isola) | 102,8 MB (292 pacotes) | — |
| Prisma na imagem residente | presente (`@prisma` 44,4 MB + `prisma` 49,2 MB = 93,6 MB) | **ausente** (`npm ls --omit=dev` → vazio) | −93,6 MB |
| Imagem de migration (efêmera) | não existia | 868 MB | sobe, aplica schema e sai |
| Rotação de log Docker | ausente (json-file ilimitado) | `max-size=10m`, `max-file=3` nos 3 containers | crescimento de disco limitado |
| Limite RAM Postgres | **nenhum** | 256 MB + tuning do container | — |
| Limite RAM API | 512 MB, heap V8 sem limite | 512 MB + `--max-old-space-size=384` | folga p/ memória nativa |
| Postgres publicado no host | `5432:5432` no compose | `expose` (só rede interna) | superfície reduzida |
| Workflows no `.github/workflows` | 4 arquivos / 1.236 linhas | 2 arquivos / 141 linhas | −1.095 linhas mortas |
| Containers residentes | 2 | **2** (inalterado) | arquitetura preservada |
| RAM/CPU/disco reais da VPS | **NÃO MEDIDO** | **NÃO MEDIDO** | sem credenciais SSH |

**Ganho principal: a imagem que fica no ar 24h caiu de 1,37 GB para 310 MB.**
Isso reduz disco, tempo de `docker pull` e I/O de deploy. O Prisma não sumiu: passou para
a imagem de migration, que é efêmera.

## O que mudou

| Arquivo | Mudança |
|---|---|
| `backend/Dockerfile` | Reescrito em 4 stages (`prod-deps`, `builder`, `runtime`, `migration`). `COPY --chown` no lugar de `chown -R` (ver abaixo). `mkdir /app/logs` com dono correto. |
| `backend/package.json` | Removidas 6 deps sem uso; `sqlite3`, `prisma` e `@prisma/client` movidos p/ devDependencies. |
| `backend/package-lock.json` | Regenerado (`npm install --package-lock-only`). |
| `backend/scripts/run-db-migrations.js` | Removido `prisma generate` (gerava client que ninguém importa). `prisma db push` **preservado**. |
| `backend/knexfile.js` | Pool **restaurado** a min 2 / max 12; agora parametrizável por ENV. |
| `.github/scripts/deploy-production-remote.sh` | Limites/tuning no Postgres, rotação de log, `NODE_OPTIONS`, migration em container efêmero, `QUEUE_ENABLED` removido. |
| `docker-compose.yml` | Paridade com o deploy: limites, rotação, serviço de migration separado, Postgres não publicado. |
| `.github/workflows/` | Removidos `ci-cd.yml.disabled` e `deploy-production.yml.disable`. |
| Arquivos mortos | Removidos os 5 `.backup`/`.fixed`. |

## Problemas encontrados durante a implementação

1. **A primeira versão do Dockerfile deixou a imagem MAIOR (756 MB).**
   Causa medida no `docker history`: `chown -R nodejs:nodejs /app` criava uma camada de
   **233 MB**, porque reescreve cada arquivo do `node_modules` em vez de alterar metadados.
   Corrigido com `COPY --chown` e criação do usuário antes dos COPY.

2. **Dividir o Prisma em stages não bastou.** `prisma` e `@prisma/client` estavam em
   `dependencies`, então `npm ci --omit=dev` os instalava de qualquer jeito. Só saíram da
   imagem depois de irem para `devDependencies` (verificado: nenhum consumidor em todo o
   repositório, apenas scripts npm que rodam no container de migration).

3. **Redução do pool reprovada** — ver P1-3. Revertida.

4. **A aplicação não chega a servir HTTP neste ambiente de teste.** Ver "Riscos a monitorar".

## Testes executados

| Teste | Resultado |
|---|---|
| `npm run typecheck` | **PASSOU** (após cada grupo de mudanças) |
| `npm run build` | **PASSOU** |
| **MIGRATION** (container efêmero, Postgres real) | **PASSOU** — `db push` em 7,1 s; **89 tabelas** criadas |
| **SEED** (testado separadamente) | **PASSOU** — verificado no banco: `admin@teste.local`, `is_admin = t` |
| **RUNTIME** (app boot) | **PARCIAL** — sobe, conecta no banco, inicializa serviços; **não chega ao `listen()`** (idem no baseline — ver riscos) |
| Prisma CLI na imagem de migration | **PASSOU** — `prisma validate` → "schema is valid" |
| Postgres com 256 MB + tuning | **PASSOU** — sobe saudável; `shared_buffers=64MB`, `max_connections=50` confirmados |
| `docker compose config` | **PASSOU** |
| `bash -n` no script de deploy | **PASSOU** |
| `npm run test:unit` (completo) | **NÃO CONCLUÍDO** — excede o tempo limite do ambiente |
| Testes unitários (subconjunto) | 3 passaram / 9 falharam — falhas **pré-existentes** (`UNIQUE constraint failed: users.email`), reproduzidas com o `setup.ts` original |

## Riscos a monitorar

1. **Bug pré-existente de inicialização (o mais importante).**
   Em ambiente de teste, nem a imagem otimizada nem **a imagem baseline construída do
   `git HEAD` sem nenhuma alteração** chegam a responder HTTP: ambas param logo após
   "Health check scheduler started successfully" e nunca executam `server.listen()`.
   O ponto de bloqueio é `SMTPServer.validateRequiredTables()` esperando conexão do pool.
   **Como o baseline falha igual, isto não é regressão desta auditoria** — mas indica
   fragilidade real no boot. Em produção o deploy tem `--env-file` completo (DKIM, SMTP,
   configs montados), o que provavelmente muda o comportamento; **não foi possível
   confirmar sem acesso à VPS**.

2. **`SUPER_ADMIN_PASSWORD` é obrigatório.** O seed falha sem ela (verificado). O compose
   agora bloqueia a subida se estiver faltando, em vez de falhar no meio do deploy.

3. **Postgres com 256 MB** foi validado apenas subindo/migrando/seedando — **não** sob
   carga de produção. Se houver lentidão, subir o limite é a primeira coisa a tentar.

4. **Retenção do Winston mantida** (até 365 dias em `business`). Não foi reduzida por
   possível requisito de compliance — precisa de decisão sua.

## Otimizações NÃO realizadas

| Item | Motivo |
|---|---|
| **Mover build para GitHub Actions + GHCR** (P0-1, maior ganho) | Requer credenciais de registry e decisão sua. Hoje a VPS ainda compila. |
| Reduzir retenção de logs Winston | Possível compliance — precisa de decisão. |
| Reduzir pool do Knex | **Testado e reprovado** (trava o boot). |
| Corrigir o deadlock de inicialização | Fora do escopo (é bug de arquitetura, não de consumo) e pré-existente. |
| Remover Prisma do projeto | **Não removido**: é necessário para `prisma db push`. Apenas saiu da imagem residente. |
| Remover containers | Não havia o que remover: Redis, BullMQ, MinIO e workers **não existem** nesta aplicação. |
