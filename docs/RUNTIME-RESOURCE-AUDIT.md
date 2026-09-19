# Auditoria de recursos de runtime

| Campo | Valor |
|---|---|
| Data | 2026-09-17 |
| Escopo | Auditoria estática e de evidência histórica. Nenhuma alteração em código, configuração, processos, containers ou dados. |
| Runtime encontrado | Node.js 18 Alpine na API; PostgreSQL 16 Alpine; frontend estático. |
| Fontes | Inventário, baseline, auditoria de containers, Dockerfile, workflow, deploy remoto e fonte do backend. |
| Limitação | Sem acesso ao daemon Docker ou VPS nesta sessão. A leitura de execução é a amostra de 2026-09-17 03:04–03:25 UTC. |

## Método

`Declarado` é o valor no repositório. `Efetivo` foi confirmado por `docker inspect` na coleta
histórica. `Medido` vem de `docker stats`, logs ou comandos do host daquela mesma coleta. Um snapshot
de repouso não é pico.

`NODE_OPTIONS=--max-old-space-size=384` limita o old space do V8, não o RSS. RSS inclui heap, código,
stack, buffers, objetos externos, bibliotecas nativas e alocações do runtime. A telemetria Node pode
registrar `heapUsed`, `heapTotal`, `external`, `arrayBuffers` e `rss`; o baseline só preserva heap e
RSS. A versão de patch do Node e os arquivos cgroup da imagem em execução não foram consultados. Assim,
o suporte efetivo a cgroups pelo Node 18 é **NOT VERIFIED**, embora o limite Docker de 512 MiB tenha
sido confirmado efetivo.

## Snapshot disponível

| Recurso | Declarado | Efetivo | Medido em repouso | Lacuna |
|---|---|---|---|---|
| API `CNT-01` | 512 MiB, 1,5 CPU, 300 PIDs, old space 384 MiB | Igual ao declarado | 94,91 MiB, 0,12% CPU, 12 PIDs; heap 69–70 MB; RSS de log ~143 MB | Pico, GC, external/arrayBuffers, native memory e throttling: NOT MEASURED. |
| Postgres `CNT-02` | 256 MiB, 1 CPU, 200 PIDs | Igual ao declarado | 61,67 MiB, 0,08% CPU, 14 PIDs; 9–14/50 conexões | Pico, wait events, I/O e throttling: NOT MEASURED. |
| Migração `CNT-03` | 512 MiB, 1 CPU, 200 PIDs | Declarado; job transitório não foi inspecionado | NOT MEASURED | Coexiste com API e Postgres no deploy. |
| Host compartilhado | 4 vCPU, ~16 GB | N/A | 1.657 MB usados, 13.857 MB disponíveis, swap 1/2.047 MB, load 0,32/0,15/0,15 | Não dimensiona picos das quatro aplicações. |

## Itens auditados

As propostas são futuras e não foram executadas.

| ID | Evidência, ambiente e achado | Impacto | Proposta, dependências e risco | Aceite, rollback e métrica esperada | Status |
|---|---|---|---|---|---|
| RRA-001 | `CNT-01`; deploy:603–645; baseline §§2–3. API Node agrega HTTP, Socket.IO, SMTP e tarefas internas. Repouso: 94,91 MiB no cgroup; heap 69–70 MB; RSS ~143 MB. | Há folga ociosa, mas heap e RSS já divergem. Não há base para reduzir limite. | Coletar RSS, heap, external, arrayBuffers, PIDs, sockets e GC em carga representativa. Depende de acesso de leitura e janela de observação. Risco: OOM ou GC excessivo se reduzir pelo repouso. | Aceite: pico sustentado com folga, sem OOM/restart e p95 estável. Rollback: limites atuais. Economia: NOT MEASURED. | PENDING |
| RRA-002 | `RES-01..04`; Dockerfile:42–80; deploy:603–645. Docker limita memória a 512 MiB; `NODE_OPTIONS` fixa old space em 384 MiB. Patch do Node e `/sys/fs/cgroup` não foram coletados. | Não é possível afirmar dimensionamento correto por autodetecção de cgroup. Flag explícita controla apenas parte da memória. | Registrar versão, `v8.getHeapStatistics()`, cgroup v1/v2, `memory.max`, `memory.current` e `memory.events` em futura coleta. Risco: confundir heap e RSS. | Aceite: V8/cgroup documentados e correlacionados em carga. Rollback: flag vigente. Economia: NOT MEASURED. | PENDING |
| RRA-003 | `backend/package.json`; Dockerfile:18–19. Runtime contém `bcrypt` e `sqlite3`; `sharp` só aparece em `package.json.new` e scripts, não no manifest runtime. Não há `worker_threads`, browser headless, FFmpeg, Canvas ou filhos de processo no runtime declarado. | Bindings nativos podem elevar RSS fora do heap. Não há razão comprovada para orçamento de browser ou mídia residente. | Medir memória externa/RSS durante autenticação, SMTP e anexos autorizados. Não remover pacote por busca estática. Risco: quebrar binding ou fluxo legado. | Aceite: autenticação e envio preservados; RSS nativo conhecido. Rollback: imagem SHA anterior. Métrica: NOT MEASURED. | AUDITED |
| RRA-004 | `performanceMonitoring.ts:34–40,176–212,533–569`. Monitor mantém até 1.000 métricas, NodeCache e pools genéricos; expõe heap, external e RSS. | O instrumento pode medir o problema, mas tamanho real de cache, histórico e pools não foi preservado. | Confirmar autenticação do endpoint e consultar estatísticas existentes em modo leitura. Risco: remover telemetria necessária ou subestimar seu overhead. | Aceite: health e métricas preservados com tamanho/hit rate conhecidos. Rollback: configuração atual. Economia: NOT MEASURED. | PENDING |
| RRA-005 | `PRC-05..08`; `monitoringService.ts:30–118`; `healthCheckScheduler.ts:30–151`; `domainVerificationInitializer.ts:75–170`; `webhookService.ts:43–52`; `optimizedLogger.ts:60–69`; `deliveryManager.ts:554–608`. | Além de nove crons há timers de 5 s, 30 s, 1 min, 5 min, 15 min, 24 h e por ENV. Eles fazem Postgres, DNS, socket, webhooks e logs. | Inventariar em produção quais singletons foram carregados, cadência, duração, erro e sobreposição; então consolidar somente tarefas com mesmo consumidor e SLO. Risco: atrasar webhooks, retries, alertas ou entrega. | Aceite: todo timer tem dono, custo e teste funcional; filas não crescem. Rollback: cadências atuais. Economia: NOT MEASURED. | PENDING |
| RRA-006 | `webhookService.ts:51–52` usa trava; `deliveryManager.ts:554–608` e `monitoringService.ts:93–118` usam intervalos assíncronos sem trava de sobreposição visível. | Sob latência de banco/DNS, concorrência real pode exceder a cadência e elevar CPU, conexões e I/O. | Medir duração, execuções simultâneas, erros e conexões por timer antes de alterar. Risco: duplicar entrega, travar processamento ou perder observação. | Aceite: concorrência máxima conhecida e sem duplicação; throughput/p95 preservados. Rollback: release anterior. Métrica: NOT MEASURED. | PENDING |
| RRA-007 | `index.ts:679–695`. Auto rollback depende de flags; `CampaignScheduler` está comentado. PM2 aponta para workers inexistentes. | Não há worker de campanha residente comprovado. | Não alocar orçamento para PM2/workers inativos. Tratar ativação futura como serviço novo. | Aceite: `docker top` e logs confirmam processos ativos. Rollback: N/A. Métrica: NOT APPLICABLE. | NOT APPLICABLE |
| RRA-008 | `PRC-03..04`; `smtpServer.ts:82–126,491–503`. SMTP aceita até 100 clientes por ENV e mantém sockets 60 s; suas portas não eram publicadas na coleta histórica. | Se inbound for ativado, conexões ociosas e buffers podem ampliar RSS/PIDs. | Confirmar requisito de inbound e consumidores antes de alterar concorrência. Medir conexões, mensagens, external e falhas. Risco: rejeitar e-mail legítimo ou ampliar exaustão. | Aceite: teste SMTP externo autorizado. Rollback: publicação/configuração anterior. Métrica: NOT MEASURED. | BLOCKED |
| RRA-009 | `DB-07..10`; `knexfile.js:69–80`; baseline §§3–5. Knex 2–12, Postgres máximo 50; pool máximo 5 já falhou no boot. | API, jobs e endpoints competem pelo mesmo banco. Redução por média pode criar fila de aquisição. | Medir origem/conexão, espera de pool, query p95, locks e migração. Risco: boot indisponível e latência. | Aceite: boot completo, p95 e erros de pool preservados. Rollback: valores atuais. Métrica: NOT MEASURED. | AUDITED |
| RRA-010 | `index.ts:817–960`; `deliveryManager.ts:610–616`; `performanceMonitoring.ts:574–602`; `webhookService.ts:51–52`. Shutdown fecha HTTP, Socket.IO e Knex; `DeliveryManager` tem shutdown, mas a chamada principal não foi localizada; `WebhookService` cria timer com `unref`. | Reinício pode interromper trabalho ou encerrar após grace period sem medição. | Ensaiar SIGTERM em staging e registrar handles, conexões, jobs, timeout e exit code. Risco: entrega/webhook duplicado, abortado ou deploy lento. | Aceite: shutdown dentro do grace period sem handles ou trabalho órfão. Rollback: handler atual. Métrica: restart duration NOT MEASURED. | PENDING |
| RRA-011 | `RES-01..06`; baseline §3. Inspect confirmou limites; CPU baixa em repouso. Não há `cpu.stat`, PSI, throttled periods ou `memory.events`. | Limite de CPU não prova ausência de throttling. | Coletar `cpu.stat`, `cpu.max`, `memory.current`, `memory.events`, `pids.current`, PSI e stats seriados. Risco: usar média baixa como capacidade disponível. | Aceite: throttling e pressure conhecidos em carga/deploy. Rollback: limites atuais. Métrica: NOT MEASURED. | PENDING |
| RRA-012 | `CNT-01..03`; baseline §§1–3. Tetos residentes somam 768 MiB; com migração, 1.280 MiB. Limites são máximos independentes, não reserva ou consumo. | Orçamento deve incluir API, banco, job, Nginx e outras aplicações sem supor consumo simultâneo. | Definir orçamento por repouso, pico, deploy e recuperação, com margem baseada em observação. Risco: OOM host ou falha de deploy. | Aceite: cada cenário tem pico, p95, margem e política de abortar deploy; sem OOM/restart. Rollback: limites atuais e deploy serializado. Métrica: simultaneidade NOT MEASURED. | AUDITED |
| RRA-013 | `BLD-01,04,08,12`; workflow:42–166; deploy:232–250,554–585. Backend/frontend compilam em runner GitHub; VPS só recebe artefato/imagem. | `npm ci`, TypeScript e BuildKit não compõem orçamento runtime da VPS. Migração é custo de deploy separado. | Preservar separação e medir runner/deploy em coleta futura. Risco: mover build à VPS restaura contenção histórica. | Aceite: deploy sem build local e rollback SHA funcional. Rollback: pipeline atual. Métrica: build VPS = 0 pelo fluxo declarado; runner NOT MEASURED. | AUDITED |
| RRA-014 | baseline §§3.1 e 5. OOMKilled=false e RestartCount=0; health externo 51–65 ms e interno 1–2 ms em repouso. | Estabilidade observada não garante comportamento em pico. | Coletar séries de OOM, restart, p50/p95/p99, erros e throughput. Risco: dimensionar para healthcheck. | Aceite: SLO e pico definidos por amostra suficiente. Rollback: N/A. Métrica: pico NOT MEASURED. | AUDITED |
| RRA-015 | `APP-03..04`, `PRC-09..11`, `SVC-03`; inventário §§3–4,8,11. Pacotes SMTP separados, PM2 e arquivos de Prometheus/Grafana não pertencem ao runtime VeloMail comprovado. | Não entram no orçamento de RSS/CPU desta aplicação. Consumidor externo ainda precisa confirmação antes de remoção. | Manter investigação de consumidor em ciclo separado. Risco: apagar ferramenta ou integração de desenvolvimento. | Aceite: pipeline, registry e consumidores mapeados. Rollback: Git/release. Métrica: NOT APPLICABLE. | NOT APPLICABLE |

## Orçamento para coleta futura

Nenhum limite numérico novo é recomendado. O orçamento deve usar carga e folga observadas nos cenários:

| Cenário | Componentes | Medições mínimas |
|---|---|---|
| Tráfego normal | API, Postgres, Nginx | RSS/heap/external/arrayBuffers, CPU, throttling, conexões, p95/p99, erro e I/O. |
| Pico | API, SMTP, Socket.IO, cache, Postgres | Mesmas métricas, conexões simultâneas, filas webhook/entrega e pausas GC. |
| Deploy | API, Postgres, migração, Nginx | Máximo simultâneo, duração, memory events, PIDs, conexões e healthcheck. |
| Encerramento | API e jobs | SIGTERM até exit, handles, tarefas retomadas, conexões fechadas e reinício. |

Coleta somente leitura quando houver acesso: `docker stats --no-stream`, `docker inspect`, cgroup,
`/proc/<pid>/status`, `ps`, `ss`, `free`, `uptime`, `df`, estatísticas Postgres e endpoints internos
autenticados. Nunca incluir ENV ou segredos.

## Matriz de cobertura: inventário → auditoria

| Item(ns) | Evidência | Auditoria | Status |
|---|---|---|---|
| ARQ-01..04 | Inventário, workflow e deploy | Separação runtime/build/host | AUDITED |
| APP-01 | Dockerfile, `index.ts`, baseline | Runtime Node | AUDITED |
| APP-02 | workflow e SPA estática | Sem processo residente VeloMail | AUDITED |
| APP-03..04 | manifests e pipeline | Consumidor externo não confirmado | PENDING |
| CNT-01 | deploy e baseline | RRA-001..006,010–011 | PENDING |
| CNT-02 | deploy e baseline | RRA-009,011 | AUDITED |
| CNT-03 | deploy | RRA-012–013 | PENDING |
| PRC-01..02 | `index.ts`, Socket.IO | HTTP/WebSocket | AUDITED |
| PRC-03..04 | SMTP e baseline | RRA-008 | BLOCKED |
| PRC-05..08 | schedulers e services | RRA-004–006 | PENDING |
| PRC-09..11 | PM2/workers | RRA-007,015 | NOT APPLICABLE |
| DB-01..10 | Knex, Postgres, baseline | RRA-009,012 | AUDITED |
| DB-11 | schema divergente | Deploy seguro | BLOCKED |
| VOL-01..07 | mounts e baseline | Persistência fora do RSS | AUDITED |
| BLD-01..12 | workflow, Dockerfile, deploy | RRA-013 | AUDITED |
| CI-01..03 | workflows | Runner separado | AUDITED |
| SVC-01 | health/monitoring | Redis check/I-O periódico | PENDING |
| SVC-02 | rotas/services | Sem Bull residente | AUDITED |
| SVC-03 | manifests/fonte | Sem object storage no runtime auditado | NOT APPLICABLE |
| SVC-04 | cache/JWT/rate limit | Cache e persistência precisam medição | PENDING |
| LOG-01..08 | logger/baseline | Buffer, retenção e I/O | PENDING |
| BKP-01..04 | baseline/script | Bloqueia mudança de dado | BLOCKED |
| RES-01..08 | inspect/baseline | Limites e pool | AUDITED |
| RES-09 | NODE_OPTIONS/logs | Heap/cgroup/RSS | PENDING |
| RES-10 | PM2 inativo | Não aplicado | NOT APPLICABLE |
| RES-11 | Docker health/logs | Liveness em repouso | AUDITED |
| RES-12 | Nginx/host | Pressão agregada não medida | PENDING |
| EXT-01..03 | workflow/registry/TLS | Build separado | AUDITED |
| EXT-04..05 | DNS/MX/SMTP | Carga e consumidores externos | PENDING |
| EXT-06 | rota AI/pacote | Processo em CNT-01 | AUDITED |
| GAP-04a, GAP-10 | baseline/inventário | Pico e rotação Nginx | PENDING |

## Totais

| Status | Total |
|---|---:|
| AUDITED | **14** |
| PENDING | **11** |
| BLOCKED | **3** |
| NOT APPLICABLE | **3** |

Não há recomendação de novo limite de RAM, CPU, heap ou pool. Pico, GC, memória nativa, throttling e
simultaneidade de deploy precisam ser medidos antes de estabelecer um orçamento seguro. Esta etapa
termina aqui.
