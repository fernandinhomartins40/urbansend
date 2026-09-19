# Auditoria de imagens Docker

| Campo | Valor |
|---|---|
| Data | 2026-09-17 |
| Escopo | Auditoria estática e de evidência histórica; nenhuma imagem foi construída, puxada, publicada ou removida. |
| Dockerfiles | 1: `backend/Dockerfile` |
| Contexto de produção | `./backend`, em `.github/workflows/deploy-production.yml:120-135` |
| Targets publicados | `runtime` e `migration` |
| Limitação | Sem acesso ao daemon Docker nesta sessão. Tamanhos e espaço são da coleta de 2026-09-17. |

## Medições disponíveis

| Item | Valor | Interpretação |
|---|---:|---|
| `velomail-api` | 310 MB | Tamanho lógico da imagem runtime. |
| `velomail-migration` | 868 MB | Tamanho lógico do job efêmero; suas tags podem usar espaço em disco. |
| Imagens do host | 19,79 GB; 9,22 GB recuperável | Total das quatro aplicações; não atribuir o recuperável ao VeloMail. |
| Build cache do host | 5,73 GB; 1,99 GB recuperável | Compartilhado; VeloMail não faz build na VPS. |
| Contexto backend | 3,7 MB / 315 arquivos | Medição histórica do pipeline. |

Tags e imagens compartilham camadas. Portanto a soma dos tamanhos lógicos não mede disco ocupado nem
espaço recuperável. Este depende de containers, tags e camadas ainda referenciadas.

## Itens auditados

| ID | Evidência, ambiente e achado | Impacto | Proposta, dependências e risco | Aceite, rollback e métrica esperada | Status |
|---|---|---|---|---|---|
| DIA-001 | `backend/Dockerfile:13-91`; workflow:118-140. Quatro estágios: `prod-deps`, `builder`, `runtime`, `migration`; só os dois últimos são publicados. | Build e Prisma CLI ficam fora do residente. | Preservar a separação. Fusão exige startup, banco, migration e seed no mesmo artefato. Risco: imagem/RSS maior ou deploy quebrado. | Aceite: targets constroem e iniciam separadamente em ambiente descartável. Rollback: tags SHA atuais. Ganho: NOT MEASURED. | AUDITED |
| DIA-002 | `backend/.dockerignore`; contexto `./backend`. Exclui `node_modules`, `dist`, `.env*`, bancos locais, logs, VCS e coverage. | Evita artefatos e ENV no contexto. Documentação e testes podem entrar, mas não são copiados pelo Dockerfile. | Medir lista e tamanho do contexto antes de novas exclusões. Não excluir scripts, Prisma ou migrations sem mapear migration/seed. Risco: COPY ou deploy quebrado. | Aceite: contexto reproduzível e builds runtime/migration passam. Rollback: ignore anterior. Economia: NOT MEASURED. | AUDITED |
| DIA-003 | `Dockerfile:18-35`. `prod-deps` usa `npm ci --omit=dev`; `builder` usa `npm ci`, `tsconfig*` e `src`. | Dev dependencies não chegam ao runtime; mudanças de fonte preservam cache de pacotes. | Manter cópia seletiva. Confirmar arquivos de compilação fora de `src` antes de reduzir contexto. Risco: build incompleto. | Aceite: build limpo e imagem inicia. Rollback: Dockerfile anterior. Métrica: cache/duração por stage NOT MEASURED. | AUDITED |
| DIA-004 | `Dockerfile:42-70`; `backend/package.json`. Runtime recebe production modules, `dist`, migrations, scripts, Prisma schema e Knexfile. | Ferramentas de build não entram no residente. Arquivos restantes podem atender caminhos SQLite e operações de recuperação. | Não remover cópias por aparência. Mapear imports e testar startup Postgres, caminho SQLite suportado e deploy antes de bundling. Risco: falha de startup ou recuperação. | Aceite: startup, health, consulta e deploy em ambiente descartável. Rollback: tag runtime anterior. Economia: NOT MEASURED. | PENDING |
| DIA-005 | `Dockerfile:18-19`; package manifest. Runtime usa `bcrypt` e `sqlite3`; base é `node:18-alpine`; `sharp` não está no manifest runtime. Dockerfile tenta rebuild nativo e ignora erro. | Alpine/musl e módulos nativos não têm compatibilidade inferível pelo tamanho. | Manter base até teste de build, startup, autenticação e SQLite em imagem descartável. Risco: falha de binding nativo em runtime/migration. | Aceite: módulos carregam e fluxos passam. Rollback: base/tag atual. Métrica: tamanho/RSS comparativo NOT MEASURED. | PENDING |
| DIA-006 | `prisma/schema.prisma:1-7`; `schema.sqlite.prisma:1-7`; `run-db-migrations.js:36-48`. Prisma 6.12 é CLI PostgreSQL; runtime usa Knex; generator `prisma-client-js`; não há `binaryTargets`, `engineType` ou adapter. | Não há cliente Prisma runtime comprovado; plataforma do engine migration não foi inspecionada. | Manter Prisma fora da imagem runtime. Verificar engine, plataforma, `db push`, schema e seed na imagem migration. Risco: alteração de engine/base quebrar deploy. | Aceite: migration, consulta Knex e seed em banco descartável. Rollback: imagem migration SHA anterior. Métrica: engine/camada exclusiva NOT MEASURED. | PENDING |
| DIA-007 | `Dockerfile:75-91`. `migration` herda runtime e executa `npm install --no-save prisma@^6.12.0 @prisma/client@^6.12.0`; imagem histórica: 868 MB. | Separação protege runtime; o intervalo `^` exige confirmação de reprodutibilidade. Diferença de 558 MB não é camada exclusiva comprovada. | Inventariar camadas e resolução antes de trocar binários, bundling ou dependências. Risco: imagem variável e deploy não reproduzível. | Aceite: builds do mesmo commit produzem artefato esperado; migration/seed passam. Rollback: tag imutável anterior. Economia: NOT MEASURED. | PENDING |
| DIA-008 | `run-db-migrations.js:36-48`; `seed-super-admin.js`; deploy:587-600. Migration executa `db push --accept-data-loss --skip-generate`; seed usa Knex e bcrypt e altera estrutura administrativa. | Migration e seed têm dependências reais distintas. Ausência de backup restaurável e divergência de schema bloqueiam alteração. | Não combinar stages nem remover Prisma, Knex ou bcrypt do target migration. Exigir backup/restore e ensaio integral. Risco: perda de dados ou falha pós-migração. | Aceite: restore, migration, seed, login e consulta passam. Rollback: dados restaurados e imagem anterior com schema compatível. Economia: NOT MEASURED. | BLOCKED |
| DIA-009 | `Dockerfile:47-67`; deploy:638-644. UID/GID 1001, `COPY --chown`, usuário não-root, mounts de logs/configs/storage; `.dockerignore` exclui ENV. | Segredos não são copiados do contexto. Permissões dos bind mounts são do host e não foram inspecionadas. | Preservar usuário/mounts. Auditar permissões efetivas sem ler valores sensíveis antes de mudar ownership. Risco: EACCES ou exposição de chave. | Aceite: API lê arquivos necessários, grava logs e `docker history` não revela segredos. Rollback: permissões atuais. Métrica: NOT MEASURED. | PENDING |
| DIA-010 | `Dockerfile:70-73`; deploy:688-707. Healthcheck simples é executado por Docker e deploy espera até 3 min. | Protege startup, mas não testa migration, seed, consulta ou envio. | Manter health simples; rodar startup, banco, migration e seed como testes separados. Risco: health caro ou falso negativo se misturar responsabilidades. | Aceite: testes falham isoladamente e startup mantém janela atual. Rollback: healthcheck atual. Métrica: startup sob carga NOT MEASURED. | AUDITED |
| DIA-011 | workflow:113-140 usa Buildx e cache GHA para os dois targets; baseline §4.1. | Cache é remoto; cache Docker da VPS é compartilhado. | Manter cache remoto e não limpar cache compartilhado. Medir cache GHA antes de alterar retenção. Risco: build lento/caro ou impacto em outras apps. | Aceite: targets usam cache e rollback existe. Rollback: cache atual. Métrica: cache por projeto NOT MEASURED. | AUDITED |
| DIA-012 | deploy:154-177,574-580; baseline §4.1. Sob menos de 1,5 GB livres, script remove somente imagens VeloMail antigas, preserva três tags e imagem em uso. | Preserva escopo e rollback; referências atuais não foram medidas. | Não limpar nesta etapa. Antes de mudar retenção, listar imagens, digests, containers e tags de rollback. Risco: imagem em uso ou rollback perdido. | Aceite: SHA anterior é puxável/rodável e espaço recuperável medido. Rollback: re-pull de tag imutável. Métrica: NOT MEASURED. | AUDITED |
| DIA-013 | Só existe `backend/Dockerfile`; frontend usa Vite e tarball estático. Não há Next.js, standalone, tracing, Dockerfile frontend ou imports Next. | Itens específicos de Next não se aplicam. | Não introduzir container frontend por uniformidade. | Aceite: N/A. Rollback: N/A. Métrica: NOT APPLICABLE. | NOT APPLICABLE |
| DIA-014 | `APP-03..04`; manifests SMTP; sem referência em Dockerfile, workflow ou deploy. | Não são construídos ou entregues no pipeline observado; busca não elimina consumidor manual/externo. | Mapear publicação, registry e consumidor antes de excluir pacote, lockfile ou artefato. Risco: quebrar pacote interno/desenvolvimento. | Aceite: consumidores e pipeline confirmados. Rollback: Git/tag do pacote. Métrica: NOT MEASURED. | PENDING |
| DIA-015 | `docker-compose.yml:56-148`. Compose local usa os mesmos targets, mas cabeçalho declara `docker run` na produção. | Paridade é manual e Compose não prova estado produtivo. | Testar Compose em ambiente descartável antes de usá-lo para alterar imagem. Risco: env, mounts ou ordem de migration divergentes. | Aceite: Postgres, migration, API e health funcionam com persistência descartável. Rollback: deploy atual. Métrica: NOT MEASURED. | PENDING |

## Testes necessários antes de alterar imagem

| Teste | Critério em ambiente descartável |
|---|---|
| Build runtime | Target `runtime` constrói limpo e inicia como UID 1001. |
| Startup e banco | Health e consulta Knex respondem com Postgres efêmero. |
| Migration | `db push` conclui contra schema descartável e o schema esperado é comparado. |
| Seed | Seed cumpre seu contrato e login administrativo funciona sem expor dados. |
| Módulos nativos | bcrypt e sqlite3 carregam na imagem Alpine. |
| Rollback | Tag SHA anterior é recuperável e sua compatibilidade de schema foi avaliada. |

## Matriz de cobertura: inventário → auditoria

| Item(ns) | Evidência | Auditoria | Status |
|---|---|---|---|
| ARQ-01..04 | Inventário, workflow, deploy | Contexto e entrega | AUDITED |
| APP-01 | Dockerfile, manifest, CI | DIA-001..012 | PENDING |
| APP-02 | Workflow/Vite | Sem imagem de aplicação | NOT APPLICABLE |
| APP-03..04 | Manifests/pipeline | DIA-014 | PENDING |
| CNT-01 | Runtime target/deploy | DIA-001,004,005,009,010 | AUDITED |
| CNT-02 | Postgres oficial/deploy | Fora de build próprio | AUDITED |
| CNT-03 | Migration target/script/seed | DIA-006..008 | BLOCKED |
| PRC-01..08 | Runtime/health | Dependem da imagem runtime | AUDITED |
| PRC-09..11 | PM2 obsoleto | Sem target Docker | NOT APPLICABLE |
| DB-01..10 | Schema/Knex/migration | Integridade migration/seed | BLOCKED |
| DB-11 | Schema divergente | Bloqueia alteração migration | BLOCKED |
| VOL-01..07 | Mounts/baseline | Contexto não inclui dados/ENV | AUDITED |
| BLD-01..12 | Dockerfile/Buildx/GHA/deploy | DIA-001..012 | PENDING |
| CI-01..03 | Workflow | Build separado runtime | AUDITED |
| SVC-01..04 | Manifests/código | Dependências build/runtime | AUDITED |
| LOG-01..08 | Dockerfile/mounts | Permissões bind mount | PENDING |
| BKP-01..04 | Baseline/script | Condição migration segura | BLOCKED |
| RES-01..12 | Dockerfile/deploy/baseline | Limites e health | AUDITED |
| EXT-01..06 | GHCR/CI/DNS/TLS | Registry e rollback | PENDING |
| GAP-04a, GAP-10 | Baseline/inventário | Startup e tamanho sob carga | PENDING |

## Totais

| Status | Total |
|---|---:|
| AUDITED | **8** |
| PENDING | **6** |
| BLOCKED | **4** |
| NOT APPLICABLE | **2** |

Nenhuma redução de imagem ou camada é recomendada antes de testes separados de startup, banco,
migration e seed em ambiente descartável. Esta etapa termina aqui.
