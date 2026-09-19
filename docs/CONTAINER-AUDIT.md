# Auditoria de containers e plataforma — somente análise

| Campo | Valor |
|---|---|
| Data | 2026-09-17 |
| Escopo | Auditoria documental e de evidências históricas; nenhuma modificação no host, código, configuração, dados ou serviços. |
| Fontes principais | `docs/VPS-OPT-INVENTORY.md`, `docs/VPS-OPT-BASELINE.md`, workflow e script de deploy, Dockerfile, Compose e código-fonte. |
| Limitação atual | O daemon Docker e as métricas da VPS não estão acessíveis nesta sessão. Valores de runtime citados abaixo são a amostra histórica de 2026-09-17, não leitura ao vivo. |

## Convenções

`Declarado` significa configurado no repositório; `efetivo` significa confirmado por inspeção no host
em 2026-09-17; `medido` é amostra com hora/método registrados no baseline. `NOT MEASURED` não é
substituído por estimativa. `AUDITED` quer dizer analisado, nunca corrigido. `BLOCKED` exige decisão
de produto/dono dos dados ou uma evidência que esta etapa não pode produzir. Não há autorização para
prune, remoção de volume, drop, truncate, carga em produção ou alteração de serviço.

## Contexto efetivamente auditado

O deploy de produção é GitHub Actions → GHCR → SSH → `docker run`; não é Compose e não compila na
VPS. Há dois containers residentes (`ultrazend-api`, `ultrazend-postgres`) e um job de migração
efêmero. O Nginx é serviço do host compartilhado. A amostra histórica registrou API em 94,91 MiB,
Postgres em 61,67 MiB, banco em 20 MB, logs em 8,5 MB e host sem pressão; isso é repouso, não pico.

## Itens de auditoria

Cada proposta abaixo é futura e não foi executada.

| ID | Evidência / ambiente | Achado e impacto | Proposta, dependências e risco | Aceite, rollback e métrica esperada | Cobertura |
|---|---|---|---|---|---|
| AUD-001 | `CNT-01`; `.github/scripts/deploy-production-remote.sh:603-645`; `docker inspect` de 2026-09-17 | API, Socket.IO, SMTP e tarefas internas dividem o processo Node. Limites efetivos: 512 MiB, 1,5 CPU, 300 PIDs; repouso: 94,91 MiB/0,12% CPU/12 PIDs. | Manter o isolamento atual; não consolidar com Postgres nem criar worker só para “reduzir containers”. Separação exigiria prova de carga, fila e consumidores. Risco: concentrar falhas ou multiplicar RSS. | Aceite futuro: medir pico, latência e reinícios antes/depois de qualquer segregação. Rollback: restaurar a topologia de um único runtime via tag SHA. Métrica: NOT MEASURED para ganho potencial. | AUDITED |
| AUD-002 | `CNT-02`, `DB-01`, `RES-05..08`; deploy:512-535; baseline §§2-3 | Postgres é interno à rede, persistente e tem 256 MiB/1 CPU efetivos. Tuning efetivo: 64 MB shared_buffers, 50 conexões, 4 MB work_mem. | Não reduzir memória, CPU ou consolidar banco sem teste representativo. Pool máximo 5 já falhou no boot segundo `backend/knexfile.js:69-80`. Risco: indisponibilidade e corrupção/perda de isolamento. | Aceite: benchmark de workload real, conexões, p95 e checkpoints em réplica/staging. Rollback: parâmetros e imagem anteriores; nunca recriar volume. Métrica: NOT MEASURED. | AUDITED |
| AUD-003 | `CNT-03`, `DB-04`, `BKP-01..04`; `backend/scripts/run-db-migrations.js:36-47`; deploy:587-599 | Job efêmero evita Prisma CLI no runtime, mas executa `prisma db push --accept-data-loss` e seed a cada deploy. Não há backup agendado confirmado. | Preservar job efêmero; antes de qualquer otimização de imagem/frequência, definir política de backup/restauração e estratégia única de schema. Dependências: dono do banco, janela de manutenção e teste de restore. Risco alto de perda de dados. | Aceite: backup restaurável e migração ensaiada contra cópia; health/readiness pós-deploy. Rollback: tag anterior **somente** após compatibilidade de schema comprovada. Ganho de recurso: NOT MEASURED. | BLOCKED |
| AUD-004 | `PRC-03..04`; `backend/src/services/smtpServer.ts:82-126,491-503`; baseline §6.1 | SMTP 25/587 inicia dentro da API, mas só 3001 é publicado; 25/587 no host eram de outro projeto. O recebimento externo do VeloMail não foi comprovado; envio direto via MX continua distinto. | Não remover nem separar o listener por economia até produto confirmar se recebimento SMTP é requisito e consumidores/DNS/MX forem auditados. Risco: perda de recebimento, bounces ou integrações externas. | Aceite: teste de entrega SMTP externo autorizado, fluxo de inbound e métricas de conexões. Rollback: restaurar listeners/publicação anterior. Métrica de RAM/PIDs do listener: NOT MEASURED. | BLOCKED |
| AUD-005 | `PRC-05`; `backend/src/scheduler/healthCheckScheduler.ts:30-151`; `PRC-08`; `monitoringService.ts:30-118` | Há 8 crons de health e monitoramento a cada 30 s; este último grava quatro checks e métricas no banco por ciclo. É candidato a análise de I/O, não a remoção automática. | Medir frequência, linhas/dia, custo de query e consumidor do painel/alertas. Só então avaliar consolidar checks redundantes ou executar relatórios sob demanda. Dependências: alertas, painel admin e SLO. Risco: degradar detecção de falha. | Aceite: nenhum alerta/endpoint perde dados; p95 do banco e escrita/dia não pioram. Rollback: restaurar intervalos atuais. Métrica esperada: NOT MEASURED. | PENDING |
| AUD-006 | `PRC-06`; `AutoRollbackService.ts:132-174,373-396` | Cron de 10 min só age com feature flags; frequência e estado efetivo das flags não foram lidos para não expor ENV. | Confirmar, por observabilidade sem segredo, se está habilitado e se há execuções úteis. Não desativar apenas por parecer ocioso. Risco: perder proteção de rollout. | Aceite: histórico de execuções e flags mascaradas; falha de rollout continua detectada. Rollback: reativar configuração vigente. Métrica: NOT MEASURED. | PENDING |
| AUD-007 | `PRC-07`; `domainVerificationJob.ts:53,447-478`; inicialização em `index.ts:671` | Verificação de domínio é fluxo funcional; usa execução direta, sem Bull. Não há frequência/volume real disponível. | Medir taxa, DNS timeout e consumidor externo antes de torná-lo sob demanda ou separá-lo. Risco: domínios não verificados e envio bloqueado. | Aceite: setup de domínio e retries preservados; rollback para execução atual. Métrica: NOT MEASURED. | PENDING |
| AUD-008 | `SVC-01`; `routes/health.ts:74-85`; `monitoringService.ts:206-255` | Redis não é dependência runtime: não há cliente Redis/Bull, container ou serviço no deploy. Porém monitoramento tenta socket Redis a cada 30 s e persiste o resultado. | Auditar se o check alimenta painel/alertas; se não, futura remoção deve ser apenas do check/configuração obsoleta, nunca “remover Redis” inexistente. Risco baixo de I/O/ruído, mas risco de perder uma integração futura declarada. | Aceite: health, dashboard e alertas validados com contrato explícito. Rollback: reverter somente o check. Economia esperada: NOT MEASURED. | PENDING |
| AUD-009 | `SVC-02`; `index.ts:614-619`; `emailRoutes.ts:16-32`; `domainVerificationJob.ts:53` | Fila Bull/BullMQ não está instalada nem em execução; envio é direto. Tabelas de fila podem existir como dados de produto/telemetria, o que não prova worker. | Nenhum container/fila a remover. Confirmar rotas e consumidores antes de retirar tabelas, APIs ou modelos legados em futura etapa. Risco: quebrar compatibilidade e histórico. | Aceite: fluxos de envio, status e integrações sem dependência de fila; rollback por release. Ganho: NOT APPLICABLE para containers. | AUDITED |
| AUD-010 | `SVC-04`; `node-cache` em `backend/package.json`; autenticação em `authController.ts:122-164,731-855`; rate limit em `rateLimiter.ts` e `rateLimitBucketStore.ts` | Cache é in-process; sessões são JWT/cookies, não Redis. Rate limiting SMTP usa banco e buckets compartilhados usam Postgres, preservando comportamento entre reinícios. | Não adicionar Redis para “otimizar” nem remover persistência de rate limit. Medir tamanho do cache e contenção/índices antes de qualquer ajuste. Risco: enfraquecer rate limiting, sessões ou consistência. | Aceite: login, refresh, CSRF, limite SMTP/API e reinício preservados. Rollback: release anterior. Métrica: NOT MEASURED. | AUDITED |
| AUD-011 | `VOL-02`; baseline §4.2; deploy:638-644 | `ultrazend-storage-data` está vazio (4 KB) na amostra, mas é volume persistente declarado. Busca sem escrita não elimina possibilidade de consumidor futuro/externo. | Não remover. Exigir mapeamento de uploads, URLs assinadas, importações e retenção por um ciclo operacional antes de decidir. Risco: perda silenciosa de documentos. | Aceite: inventário de consumidor vazio, backup e restauração de teste; rollback: remount do volume preservado. Economia atual: 4 KB medidos. | BLOCKED |
| AUD-012 | `VOL-01,03..07`; baseline §4; deploy:512-535,638-644 | Banco/configs são críticos; logs medem 8,5 MB; volumes legados VeloMail não existem. Imagens e cache Docker são compartilhados entre quatro aplicações. | Não executar `volume prune`, `docker system prune` ou limpeza compartilhada. Qualquer retenção deve ter dono, backup e escopo por aplicação. Risco alto para persistência de terceiros. | Aceite: inventário de mounts, retenção e restore por dono. Rollback: não aplicável para deleção; por isso a ação permanece proibida. Métrica: não inventada. | AUDITED |
| AUD-013 | `LOG-01..08`; `logger.ts:159-192`; baseline §4.3 | Rotação de aplicação e json-file é configurada; 8,5 MB é medição jovem, não prova crescimento anual. Rotação efetiva de Nginx continua sem confirmação. | Medir crescimento por canal, retenção real e `logrotate` do host antes de reduzir. Risco: reduzir evidência de segurança/auditoria. | Aceite: retenção atende compliance e recuperação de incidente; rollback: retenção anterior. Métrica: NOT MEASURED para economia futura. | PENDING |
| AUD-014 | `DB-03,07..11`; `knexfile.js:69-80`; baseline §§3-5 | Runtime usa Knex; Prisma é ferramenta de deploy. Há 9–14 conexões de limite 50 e banco de 20 MB na amostra. `application_error_logs` ausente gera falha tratada e ruído. | Não reduzir pool. Priorizar, fora desta etapa, reconciliar schema/migrations e observabilidade antes de qualquer tuning de recursos. Risco alto de boot travado, deploy destrutivo e cegueira de logs. | Aceite: schema consistente, tabela existente e teste de restore/migração; rollback com schema compatível. Economia: NOT MEASURED. | BLOCKED |
| AUD-015 | `BLD-01..12`; workflow `deploy-production.yml`; Dockerfile; deploy:154-177 | Build ocorre no runner e VPS só faz pull, evitando CPU/I/O de build. API tem 310 MB; migration 868 MB e é efêmera. Tags compartilham camadas; tamanho lógico não equivale a disco recuperável. | Manter build remoto. Antes de ajustar retenção de tags/imagens, medir `docker system df -v`, referências GHCR e rollback mínimo. Script já evita builder prune compartilhado e limita sua limpeza. Risco: remover imagem necessária para rollback ou outra app. | Aceite: rollback por SHA mais antigo retido e deploy sem build na VPS. Rollback: reter/repuxar tag imutável. Métrica: espaço recuperável NOT MEASURED nesta sessão. | PENDING |
| AUD-016 | `CI-01..03`; `.github/workflows/quality.yml`; `deploy-production.yml` | PR valida typecheck/build/testes; `main` não bloqueia deploy nesses checks. Não é desperdício de VPS, pois executa em CI, mas pode afetar confiabilidade. | Decisão separada de capacidade: avaliar gate proporcional e duração real no runner. Risco: ampliar tempo/custo de CI ou promover regressão sem validação. | Aceite: duração, taxa de falha e deploy confiável observados. Rollback: workflow anterior. Métrica: NOT MEASURED. | AUDITED |
| AUD-017 | `RES-01..12`; deploy:512-535,603-645; baseline §§2-3 | Limites Docker, heap e tuning Postgres foram confirmados efetivos. Nginx ativo foi observado, mas sua rotação/configuração carregada não foi revalidada nesta sessão. | Manter limites até coleta de pico. Não tratar heap usado em repouso como reserva de RAM. Risco: OOM/latência em pico ao reduzir. | Aceite: janela de tráfego real com memória, CPU, swap, p95, conexões e OOM. Rollback: valores atuais. Métrica: pico NOT MEASURED. | AUDITED |
| AUD-018 | `EXT-01..06`; `index.ts:403,420-421`; frontend `super-admin`; `configs/prometheus.yml` e `configs/grafana/` | Painel super-admin é funcional e protegido por JWT/permissões; não é container separado. Prometheus/Grafana têm arquivos de configuração, mas nenhum serviço desses é criado pelo deploy VeloMail. DNS, MX e consumidores externos não foram rechecados. | Manter painel. Não classificar Prometheus/Grafana/MinIO como removíveis sem confirmar se são operados por outra pilha/host. Risco: perder administração, observabilidade ou integração externa. | Aceite: autenticação/permissões e consumidor de métricas documentados; rollback por release/configuração proprietária. Uso de recursos: NOT MEASURED. | PENDING |
| AUD-019 | `PRC-09..11`; `ecosystem.config.js:64-151`; `backend/src/workers/` vazio; deploy real | PM2 e dois workers descritos são arquitetura obsoleta, não processos do runtime Docker. | Não executar configuração PM2 nem apagar arquivo agora; registrá-lo como divergência operacional a tratar com revisão de documentação em etapa autorizada. Risco: operador seguir instrução errada. | Aceite: runbook aponta unicamente para Docker; rollback: arquivo histórico preservado em Git. Ganho de recursos: NOT APPLICABLE (não executa). | NOT APPLICABLE |
| AUD-020 | `BKP-01..04`; baseline §6.4; `backup-system.sh` | Não há backup agendado confirmado; dumps/snapshots fora do escopo do host continuam desconhecidos. Isso bloqueia toda remoção de dado e torna o `db push` mais arriscado. | Antes de qualquer limpeza/otimização de persistência, obter dono, RPO/RTO, cópia externa e teste de restauração. Risco crítico de perda de dados. | Aceite: restore documentado e testado; rollback de ação futura baseado em backup válido. Métrica de backup: NOT MEASURED. | BLOCKED |

## Matriz de reconciliação: inventário → auditoria

Esta matriz cobre todos os IDs operacionais do inventário. Agrupamentos de IDs homogêneos não ocultam
exceções: cada exceção tem linha própria nos itens AUD acima. O total abaixo conta linhas de cobertura,
não quantidade de containers.

| Item(ns) do inventário | Evidência examinada | Auditoria | Status |
|---|---|---|---|
| ARQ-01..04 | Inventário §§1-3; workflow e deploy remoto | Topologia real e build remoto | AUDITED |
| APP-01 | `backend/`, Dockerfile e workflow | Runtime API | AUDITED |
| APP-02 | `frontend/`, Vite e workflow | SPA estática | AUDITED |
| APP-03..04 | package manifests; nenhuma referência no pipeline | Uso externo/desacoplado não provado | PENDING |
| CNT-01 | deploy:603-645; baseline §§2-3 | AUD-001 | AUDITED |
| CNT-02 | deploy:512-535; baseline §§2-3 | AUD-002 | AUDITED |
| CNT-03 | deploy:587-599; migration runner | AUD-003 | BLOCKED |
| PRC-01 | `index.ts:773` | HTTP | AUDITED |
| PRC-02 | `index.ts:516-521` | WebSocket | AUDITED |
| PRC-03..04 | `smtpServer.ts:491-503`; baseline §6.1 | AUD-004 | BLOCKED |
| PRC-05 | scheduler | AUD-005 | PENDING |
| PRC-06 | AutoRollbackService | AUD-006 | PENDING |
| PRC-07 | domain verification | AUD-007 | PENDING |
| PRC-08 | monitoring service | AUD-005 | PENDING |
| PRC-09..11 | PM2 manifest, deploy e diretório workers | AUD-019 | NOT APPLICABLE |
| DB-01..09 | Knex, Prisma runner, deploy e baseline | Banco, pool, schema e seed | AUDITED |
| DB-10 | baseline §§3-5 | Medições históricas | AUDITED |
| DB-11 | schema e baseline §6.2 | AUD-014 | BLOCKED |
| VOL-01 | mounts e baseline §4.2 | Dados PostgreSQL | AUDITED |
| VOL-02 | baseline §4.2 | AUD-011 | BLOCKED |
| VOL-03..06 | mounts e baseline §4.2 | Logs/configs/artefato/repo | AUDITED |
| VOL-07 | `docker volume ls` histórico | Sem volumes legados VeloMail | AUDITED |
| BLD-01..12 | workflow, Dockerfile, deploy e baseline | AUD-015 | PENDING |
| CI-01..03 | workflows | AUD-016 | AUDITED |
| SVC-01 | health/monitoring/package manifests | AUD-008 | PENDING |
| SVC-02 | index, rotas e manifests | AUD-009 | AUDITED |
| SVC-03 | manifests e `src/` sem SDK S3 | Sem object storage na stack auditada | NOT APPLICABLE |
| SVC-04 | Node cache, JWT/cookies e rate limiting | AUD-010 | AUDITED |
| LOG-01..08 | logger, Docker options e baseline | AUD-013 | PENDING |
| BKP-01..04 | script e coleta histórica de cron | AUD-020 | BLOCKED |
| RES-01..11 | deploy e `docker inspect` histórico | AUD-017 | AUDITED |
| RES-12 | config Nginx e lacuna de host | Configuração carregada/rotação não confirmadas | PENDING |
| EXT-01..03 | workflows, deploy e TLS | CI/registry/TLS | AUDITED |
| EXT-04 | DNS/MX não rechecado | Consumidor externo | PENDING |
| EXT-05 | deploy e serviço de entrega | Entrega direta configurada; volume real não medido | PENDING |
| EXT-06 | rota AI e pacote | Integração de aplicação | AUDITED |
| GAP-04a | baseline §5 | Pico de recursos/throughput | PENDING |
| GAP-10 | inventário §13 | rotação Nginx no host | PENDING |

## Totais e limite da conclusão

| Status de cobertura | Total |
|---|---:|
| AUDITED | **17** |
| PENDING | **13** |
| BLOCKED | **5** |
| NOT APPLICABLE | **2** |

Principais conclusões: não há evidência para remover Redis, fila, painel administrativo, MinIO/S3 de
outra pilha, volume vazio ou banco. A economia de build na VPS já foi eliminada pelo pipeline atual.
O próximo trabalho, se autorizado, deve começar por coleta de pico e prova de backup/restauração — não
por limpeza. Esta etapa termina aqui.
