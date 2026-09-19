# Plano mestre de otimização da VPS

Plano inicial: 2026-09-17. Este documento consolida `VPS-OPT-INVENTORY.md`, `VPS-OPT-BASELINE.md` e as oito auditorias solicitadas. As seções posteriores registram implementações e ensaios locais/descartáveis com evidência; elas não constituem autorização para deploy, limpeza, migração destrutiva, mudança de dados existentes ou uso de credenciais externas. Cada ação desse tipo continua exigindo escopo e evidência próprios.

## 1. Gate de cobertura

O inventário possui 89 IDs operacionais. Todos foram confrontados com ao menos uma auditoria, mas cobertura não é sinônimo de prontidão para mudança.

| Família de IDs | Situação consolidada | Status de planejamento |
|---|---|---|
| ARQ-01..04; APP-01..02 | Docker direto em produção, Nginx host, runner/GHCR, API Express e SPA Vite confirmados | AUDITED |
| APP-03..04; PRC-09..11 | Pacotes/manifestos não entregues e PM2/workers não executados; consumidor manual/externo não confirmado | PENDING |
| CNT-01..02; DB-01..03; RES-01..08,11 | Containers residentes, banco interno, limites e repouso confirmados | AUDITED |
| CNT-03; DB-04..06,09,11; BKP-01..04 | Migration/seed, divergência Prisma/Knex, log de erro ausente e recuperação de dados | PENDING |
| PRC-01..08; DB-07..08,10; RES-09,12 | APIs, SMTP, Socket.IO, timers, pool, parâmetros, pico e Nginx exigem série/fluxos adicionais | PENDING |
| VOL-01,03..07; LOG-01..08 | Persistência e logs mapeados; retenção real/crescimento/restore ainda requerem coleta | PENDING |
| VOL-02 | Vazio no snapshot, mas upload/download, consumidor externo e recuperação não comprovados | PENDING |
| BLD-01..12; CI-01..03 | Build externo, targets, cache, artefato e deploy serializado auditados; digest, custo, gates e rollback de dados pendentes | PENDING |
| SVC-01,02,04; EXT-01..06 | Redis/fila inexistentes no runtime; cache, DNS/MX, SMTP e consumidores externos exigem validação | PENDING |
| SVC-03; RES-10 | MinIO/S3 não integra a stack e PM2 não é runtime efetivo | NOT APPLICABLE |
| GAP-04a; GAP-10 | Pico real e rotação Nginx detalhada ausentes | PENDING |

**Gate (autoridade atual):** ambiente declarado **não produtivo**. Todas as tarefas podem avançar como validações locais/descartáveis, mantendo dados existentes, sem limpar volumes/imagens por suposição e sem atingir serviços externos. Backup/restore, pico e contratos externos permanecem lacunas de evidência, não bloqueios operacionais.

## 2. Reconciliação de achados

Foram contados **109 achados**: CONTAINER 20, RUNTIME-RESOURCE 15, DOCKER-IMAGE 15, DATABASE 13, STORAGE-DISK 11, DEPLOY-CICD 13, APPLICATION-RUNTIME 13 e VPS-HOST 9.

| Destino único | Quantidade | Rastreabilidade |
|---|---:|---|
| Tarefa primária no plano | 28 | `AUD-005..008,010,013,015,016,018`; `RRA-001,004..006,010,011`; `DIA-004..007,009,014,015`; `DBA-001,005..009` |
| Duplicado de tarefa | 49 | AUD-001,002,012,017; RRA-002,003,009,012..014; DBA-002,003,010,012,013; STO-001,003..006,008,011; DEP-002..004,006..008,011..013; APP-RT-001..003,005..013; HOST-001..003,005,007,008 |
| Falso positivo / nenhuma otimização atual | 11 | DIA-001..003,010..012 (separação/caches já adequados); STO-007 (cache Vite versionado); DEP-001,005 (build externo/serialização já existem); HOST-004,006 (disco/TLS sem pressão) |
| Não aplicável justificado | 6 | AUD-009,019; RRA-007,015; DIA-013; STO-010 — não há fila/PM2/Next/MinIO runtime a remover |
| Pendente de validação local | 15 | AUD-003,004,011,014,020; RRA-008; DIA-008; DBA-004,011; STO-002,009; DEP-009,010; APP-RT-004; HOST-009 |
| **Total** | **109** | **28 + 49 + 11 + 6 + 15 = 109** |

O índice de duplicados para a tarefa correspondente é: observabilidade/capacidade → T-001; timers/domínios → T-002/T-005; cache/consultas → T-006/T-007; deploy/imagem/CI → T-008/T-009; storage/logs → T-010/T-012; readiness/shutdown → T-011. Achados pendentes podem ser exercitados somente em recursos locais e descartáveis; dados existentes e integrações externas continuam fora de escopo até confirmação específica.

## 3. Tarefas

Benefícios são hipóteses até medição. Em especial, menor limite não implica menor consumo e imagem menor não implica disco físico recuperável por causa de camadas compartilhadas.

| ID | IDs de origem | Problema/evidência; arquivos/serviços | Solução proposta | Benefício esperado; métrica/unidade | Risco e dependências | Teste/aceite; rollback | Escopo autorizado | Status |
|---|---|---|---|---|---|---|---|---|
| T-001 | AUD-001,002,005,017; RRA-001,002,004..006,009,011,012,014; DBA-001..003; APP-RT-001..003,006,010; HOST-001..003,007 | Há snapshots de repouso e uma nova janela passiva de 21 s em 2026-09-17; pico, cgroup, throttling, pool, I/O por app e latência continuam NOT MEASURED. Coletor passivo agora diferencia RSS de processo, cgroup, heap, external e buffers; endpoint de health deixou de apresentar heap+external como memória total de processo. | Criar coleta de leitura seriada por janela representativa, rotulada por app/host/deploy: cgroup, `cpu.stat`, PSI, RSS/heap/external, pool, PG, p95/p99, erros e tráfego. | Base para evitar limite inadequado; unidades MiB, CPU%, throttle events, ms, req/s, conexões. | Não gerar carga; depende de janela e acesso de leitura. | Aceite parcial: série com contexto, duração e lacunas; nenhum comando mutante. Localmente, RSS foi validado em containers mínimos; continuam ausentes janela representativa e métricas reais da aplicação. Rollback: reverter apenas métricas/coletores. | Somente leitura em VPS/observabilidade. | DONE (ver seção 52) |
| T-002 | AUD-005..008; RRA-005,006; APP-RT-002,003,006; HOST-008 | Timers 30 s, crons e checks DNS/Redis/webhook podem sobrepor. Em 2026-09-19, o monitor deixou de tentar Redis implícito em `localhost:6379` a cada 30 s; ele só agenda esse check quando `REDIS_URL` estiver explicitamente configurada. O ciclo completo de healthcheck agora também recusa sobreposição enquanto a execução anterior estiver pendente, evitando duplicar consultas e inserções se um check exceder 30 s. | Continuar inventário timer → dono → consumidor → cadência → duração → idempotência; medir antes de consolidar ou alterar outros checks. | Possível redução de I/O/consultas somente quando há sobreposição; métricas runs, duração, overlap, linhas/dia. | Redis configurado continua monitorado; a proteção pode postergar um ciclo, portanto alertas/SLO e duração real dependem de T-001. | Aceite parcial: Redis não configurado não abre socket nem grava health status; ciclo lento não inicia checks paralelos e volta a executar após liberar; consumidor de Redis configurado preservado. Rollback: restaurar o check incondicional e remover a trava de ciclo. | DONE (ver seção 52) |
| T-003 | AUD-020; DBA-011; STO-002,009; DEP-010; HOST-009 | Não há política de backup PostgreSQL/RPO/RTO para dados duráveis comprovada. Em 2026-09-18, dump/restore por streaming entre dois PostgreSQL 16 temporários, sem mounts, preservou a contagem de 1 usuário sintético. | Documentar política de destino, criptografia e retenção a decidir para dados duráveis; manter ensaio local repetível. | Recuperação, não economia imediata; métricas idade, duração, RPO/RTO, tempo de restore. | Ambiente não produtivo; não tocar no banco existente. | Aceite local: restore íntegro ensaiado em banco temporário. Política para dados duráveis continua NOT VERIFIED. | Remover somente recursos temporários nomeados após inspeção. | BLOCKED (ver seção 52) |
| T-004 | AUD-003,014; DIA-008; DBA-004,013; DEP-009; DB-04..06,09,11 | Não há diretório de migrations Prisma versionadas, portanto `migrate deploy` não é uma substituição válida. Em 2026-09-19, o plano de PostgreSQL deixou de passar `--accept-data-loss` para `prisma db push`; alteração destrutiva agora falha explicitamente. O fluxo migrou e executou seed duas vezes em PostgreSQL 16 descartável com Node 20. | Manter plano não destrutivo, seed idempotente e ensaiar compatibilidade N/N-1 em banco descartável antes de introduzir migrations Prisma versionadas. | Menos risco de perda/falha de deploy; métricas duração, erro, conexões e restore. | Dados existentes fora do teste; a ausência de histórico Prisma ainda limita rollback de schema. | Aceite parcial: migration, seed idempotente, consulta e startup passaram em banco vazio temporário; faltam restore de dados representativos e rollback N/N-1 de schema. | Restaurar a flag anterior somente se uma decisão explícita exigir perda de schema. | DONE (ver seção 52) |
| T-005 | APP-RT-004,005; RRA-005; AUD-007 | Em 2026-09-19, removida a chamada de boot `cleanupOldLogs(0)`, que eliminava todo o histórico de verificação; limpeza agora usa cron `0 2 * * *` e a retenção configurada. | Observar uma execução em banco descartável; manter agenda única e validar domínio/DKIM/retry sintéticos. | Preserva auditoria e evita DNS/trabalho indevido; métricas linhas removidas, runs, DNS calls. | Não modifica dados existentes; execução efetiva do cron ainda não foi observada. | Aceite parcial: build e typecheck passam; falta provar que restart não remove registros e que cron retém apenas registros vencidos. Rollback: restaurar a implementação anterior. | DONE (ver seção 52) |
| T-006 | DBA-005..010; APP-RT-011; RRA-009 | Offset, `select(*)`, contagens e N+1 estático são candidatos, sem `EXPLAIN`/p95/uso real. Em 2026-09-19, as três contagens sequenciais de estatísticas de domínios foram consolidadas em um único agregado condicional, sem mudar o contrato retornado. | Capturar consultas/planos representativos e contratos de API; propor apenas otimização que melhore plano medido. | Hipótese de menos I/O/CPU; ms, buffers, rows, queries/request. | Depende de T-001 e leitura PG; risco de paginação/autorização/pool. | Aceite parcial: teste unitário confirma uma única consulta e build/typecheck passam; faltam `EXPLAIN`, p95/buffers e resposta com banco representativo. Rollback: restaurar as três consultas. | Leitura e ambiente descartável. | DONE (ver seção 52) |
| T-007 | AUD-010; DBA-012; APP-RT-010; STO-007 | Caches in-process têm TTLs/limites heterogêneos. Em 2026-09-19, o cache de verificação de domínio passou a remover expirados na escrita e a manter no máximo 1000 entradas; chave continua `userId:domain`, preservando isolamento de tenant. | Mapear os demais caches, hit rate, bytes e invalidação antes de ajustar TTLs ou introduzir Redis. | Hipótese de menos heap retido; entradas, bytes, heap e hit ratio. | Sem métrica de pico; demais caches dependem de T-001. | Aceite parcial: expiração e evicção têm testes; faltam bytes reais, hit rate e carga representativa. Rollback: remover teto/prune. | DONE (ver seção 52) |
| T-008 | AUD-015; DIA-004..007,009,014,015; DEP-002,003,006,007,013; STO-001,008 | O padrão do Dockerfile foi promovido para `node:20-alpine` após build de runtime e migration, migration/seed PostgreSQL e startup/health Node 20 terem passado. Node 18 expôs avisos `EBADENGINE` de dependências de runtime. Em 2026-09-19, testes unitários que mockam toda persistência também ganharam configuração Jest leve, sem migrations/seed SQLite globais; `DomainSetupService`/DKIM passou a inicializar sob demanda, eliminando handle assíncrono em testes de cache. O workflow agora executa suítes focadas antes dos builds. O estágio runtime deixou de ignorar falha de rebuild de `bcrypt`; `sqlite3` é devDependency e não é requisito da imagem PostgreSQL. | Medir build/pull/disco e repetir os fluxos em release imutável antes de produção; manter separados no CI testes leves e os que exigem banco. | Reprodutibilidade e compatibilidade de runtime; minutos, bytes, digest, espaço temporário e I/O de teste. | Node 20 Alpine foi exercitado localmente; rollback explícito continua disponível por `NODE_IMAGE=node:18-alpine`. | Aceite parcial: targets iniciam e migration/seed/API passam em ambiente local temporário com Node 20; gate local de oito suítes/12 testes passou em 9,545 s; rebuild nativo `bcrypt` e carregamento no runtime passaram. Faltam execução no runner, registry/pull por digest, deploy e rollback externo. | Usar `NODE_IMAGE=node:18-alpine` no build de rollback; remover o perfil Jest leve restaura o setup global. | DONE (ver seção 52) |
| T-009 | AUD-016; DEP-004,012; BLD-06, CI-01..03 | O workflow já constrói fora da VPS e usa tags SHA. Em 2026-09-19, `REGISTRY_TOKEN` deixou de ser interpolado no comando SSH; API, migration e credenciais agora chegam no stdin cifrado e o host executa apenas `bash -s`. O workflow não usa mais `ssh-keyscan`: exige o segredo `VPS_SSH_KNOWN_HOSTS`, grava-o com modo 600 e verifica entrada para o host antes de qualquer conexão. Autenticação por senha/root permanece pendência de rotação. | Configurar host key verificada fora do canal, planejar chave de deploy/usuário de menor privilégio e medir gate no runner. | Segurança/reprodutibilidade; minutos de CI, falhas de auth, divergência tag→digest. | Não houve dispatch/deploy; segredo de host key, chave/usuário e rotação seguem dependências externas. | Aceite parcial: workflow não contém `ssh-keyscan`, `actionlint` 1.7.7 passou em container local e o payload não põe segredo em argumento SSH. Faltam segredo real de host key, execução no runner, credencial mínima e deploy/rollback remoto. | Reintroduzir o bloco anterior somente em recuperação autorizada; nunca desabilitar `StrictHostKeyChecking`. | BLOCKED (ver seção 52) |
| T-010 | AUD-011,012; STO-003,006,011; APP-RT-013; VOL-02,04 | Anexos de e-mail são payload inline validado, não uploads em `/app/storage`; busca estática de 2026-09-19 também não encontrou endpoint de upload/download ou leitura/escrita de anexos no filesystem. Isso não autoriza remover o volume: `docker-compose.yml` e o script de deploy continuam a declará-lo e não há evidência de consumidores externos. Chaves DKIM usam `/app/configs`, bind distinto do volume `/app/storage`; o deploy as mantém em `root:1001`, diretório 750 e private PEM 640. | Inventariar consumidor externo/host, tamanho, arquivos e restore antes de decidir retenção; se surgir upload, testar nomes/MIME/tamanho, autorização/tenant e URL privada em recursos sintéticos. | Evita volume ocioso sem risco; bytes/arquivos/acessos/erros. | Não remover nem alterar mounts existentes; permissões efetivas no host ainda exigem deploy/smoke. | Aceite parcial: ausência de fluxo de upload no código foi evidenciada e script protege private PEM sem impedir o grupo Node. Uso real do volume e restauração permanecem NOT VERIFIED; rollback é não remover o volume. | DONE (ver seção 52) |
| T-011 | DIA-010; DEP-008,011; APP-RT-007..009,012; HOST-008 | Health simples só prova processo; trabalho SMTP adiado em memória e batch serial ainda não foram exercitados. Em 2026-09-19, API Node 20 contra PostgreSQL descartável passou `/api/health/simple` e `/api/health/readiness`, health Docker e shutdown SIGTERM com saída 0; o polling de entrega também ganhou trava contra sobreposição. O transporte real de `DeliveryManager` enviou uma mensagem sintética para servidor SMTP STARTTLS local, com CA temporária explicitamente confiada; a tentativa com certificado sem SAN falhou pela validação de hostname. O ensaio PostgreSQL revelou e corrigiu parsing incorreto de headers JSON: PostgreSQL devolve objeto e não string; logs de falha de claim agora registram a mensagem em vez de serializar `Error` como `{}`. | Exercitar batch e múltiplos destinatários contra serviço SMTP sintético antes de alterar semântica. | Hipótese de menos I/O e tentativas concorrentes; ms, pending age, duplicatas, shutdown s. | Sem envio externo; risco permanece limitado ao teste sintético. | Aceite parcial: ciclo sobreposto é recusado em teste, health Docker está saudável, shutdown passou, transporte STARTTLS local aceitou mensagem sintética, claim PostgreSQL concorrente produziu uma entrega/envio/statística únicos, log de claim contém causa legível e negação de tenant bloqueou transporte/registrou dead letter. Faltam batch e destinatários múltiplos. Rollback: restaurar parser JSON anterior somente com correção equivalente para PostgreSQL e remover a trava do ciclo. | Ambiente descartável; sem envio externo não autorizado. | DONE (ver seção 52) |
| T-012 | AUD-013; STO-004,005; HOST-005; LOG-01..08,GAP-10 | Logs cresceram para 25 MB; timer de logrotate ativo, mas retenção/taxa por canal e Nginx não foram comprovados. Em 2026-09-19, os canais especializados de Winston passaram a aceitar apenas eventos com o metadado estruturado correspondente; o canal geral e o de erros continuam completos. | Medir tendência e regras efetivas; definir retenção por canal somente após requisito de auditoria/recuperação. | Hipótese de menos escrita/disco nos canais especializados; bytes/dia, idade, arquivos, journal. | Depende de dono/compliance e T-003; risco de perder evidência. | Aceite parcial: roteamento real em diretório temporário e build/typecheck passam; faltam taxa/rotação Nginx e observação representativa. Rollback: remover filtros dos transports especializados. | Leitura; limpeza posterior requer autorização explícita. | DONE (ver seção 52) |

## 4. Fases e ordem

| Fase | Tarefas | Critério de entrada/saída |
|---|---|---|
| P0 — Observação segura | T-001 | **Primeira fase elegível.** Coleta somente leitura em janela de tráfego e, separadamente, um deploy normal observado. Sai com baseline de pico e orçamento agregado. |
| P1 — Testes descartáveis e contratos | T-002, T-006, T-007, T-008, T-009, T-011, T-012 | Não mudar duas dimensões independentes no mesmo experimento. Cada teste tem baseline e regressão máxima definida antes do início. |
| P2 — Recuperação e integridade local | T-003, T-004, T-005, T-010 | Elegível em banco, volumes e artefatos temporários identificados. Não alterar dados, schema ou storage já existentes sem uma tarefa específica de preservação/rollback. |
| P3 — Mudanças produtivas graduais | Subconjunto aprovado de T-002, T-006..012 | Uma hipótese por release; canário/observação/rollback antes da próxima dimensão. Limites de RAM/CPU só após P0 e teste representativo. |
| P4 — Arquitetura/capacidade | Separação de carga, VPS maior, fila durável ou object storage somente se T-001/T-011/T-010 justificarem | Não adotar “menos containers” ou serviço novo como ganho presumido. Avaliar custo, isolamento, disponibilidade e recuperação. |

## 5. Operação, métricas e rollback

Antes de qualquer produção, registrar commit/digest, horário UTC, tráfego, host, aplicação, dono, baseline e dependências. Usar ambiente descartável com PostgreSQL compatível, imagem amd64 e dados sintéticos/anonimizados para migration, seed, upload/download, autenticação, permissões, SMTP simulado e shutdown.

| Controle | Regra de parada / aceite |
|---|---|
| Carga comparável | Repetir mesma rota/job/volume e registrar req/s, conexões, tamanho de batch e duração. Sem carga comparável, resultado é NOT MEASURED. |
| Regressão | Definir antes do teste p95/p99, erros, throughput, OOM/restarts, pool wait e bytes I/O aceitáveis; parar ao exceder limite ou perder funcionalidade. |
| Checkpoints | Antes de schema, seed, retenção ou persistência: backup restaurável; depois: startup, readiness, consulta, autenticação, permissão, upload/download quando aplicável e smoke de entrega sem destinatário externo não autorizado. |
| Deploy | Verificar digest, espaço temporário, imagem/release anterior e health/readiness; health simples não aprova migration/seed. Deploy concorrente permanece serializado. |
| Rollback | Código: tag/digest anterior apenas se schema compatível. Dados/schema: restore validado. Não usar prune, delete, DROP, TRUNCATE ou remoção de volume como rollback. |
| Autoridade ainda ausente | Backup/restore, schema/migration/seed produtivos, retenção/limpeza, alterações de limites, SSH/credenciais, DNS/MX, SMTP externo, uploads e qualquer deploy requerem autorização específica posterior. |

## Exceções e lacunas remanescentes

- Não há evidência para remover PostgreSQL, volume de storage, logs, painel administrativo, Nginx, agente de segurança, runner, Redis de outra aplicação ou ferramentas externas.
- Imagens/cache recuperáveis são compartilhados; tamanho lógico de 20,5 GB não equivale a espaço físico exclusivo recuperável.
- O snapshot do host não mostra saturação; uma série curta de steal (0–4%) não caracteriza problema do provedor.
- Backups/restauração, pico real, rotação Nginx detalhada, DNS/MX/SMTP externo e contratos de upload continuam lacunas que impedem declarar a otimização completa.

## 6. Execução controlada — P0 / T-001

| Campo | Registro |
|---|---|
| Data/hora | 2026-09-17 21:01:07–21:01:28 UTC |
| Ambiente | Host produtivo `srv953800`; coleta estritamente de leitura via SSH. Repositório local em `main`; nenhum arquivo de aplicação/configuração foi alterado. |
| Checkpoint / rollback | Não houve dados, imagem, volume, serviço ou configuração afetados; backup/restauração e rollback não se aplicam a esta coleta. |
| Comandos de evidência | `date -u`, `hostname`, `uptime`, `free -m`, `df -h /`, `df -i /`, `cat /proc/pressure/{memory,io}`, `vmstat 1 21`, `docker stats --no-stream`, `docker inspect` de limites/estado e `du -sh` dos logs da aplicação. Nenhuma ENV foi lida ou exibida. |
| Host — amostra | Load `0,03 / 0,05 / 0,10`; RAM 15.988 MiB, 1.650 MiB usada, 13.855 MiB disponível e 13.857 MiB em buff/cache; swap 1/2.047 MiB; disco 30/194 GiB (16%), inodes 3%; PSI de memória e I/O `avg10=0,00`. |
| Série curta (21 s) | `vmstat`: CPU user 0–4%, system 0–3%, iowait 0%, steal 0–6%, sem swap-in/out. Série curta, em baixa carga, não permite atribuir contenção ao provedor nem caracterizar pico. |
| VeloMail — amostra | `ultrazend-api`: 100,6/512 MiB (19,64%), 0,01% CPU, 12 PIDs; `ultrazend-postgres`: 78,1/256 MiB (30,51%), 0,10% CPU, 15 PIDs. Limites efetivos permanecem 512 MiB/1,5 CPU/300 PIDs e 256 MiB/1 CPU/200 PIDs. Ambos em execução; API saudável; zero reinícios. |
| Logs | `/var/lib/ultrazend/logs`: 25 MiB. Crescimento, retenção e conteúdo permanecem fora desta coleta. |
| Resultado contra aceite | **Parcial.** A coleta foi não mutante e contextualizada, porém não cobre janela representativa de tráfego nem um deploy normal observado; não traz heap/external, `cpu.stat`/throttling de cgroup, conexões/pool PostgreSQL, p95/p99, erros ou throughput. Todos esses itens continuam **NOT MEASURED**. |
| Artefato de coleta | `scripts/collect-velomail-observability.sh` (P0/T-001). Recebe duração, intervalo e label; produz TSV somente em stdout. Coleta host, `docker stats` e pseudoarquivos cgroup dos containers API/PostgreSQL. Não faz HTTP, SQL, leitura de ENV, agendamento, escrita no host ou comando mutante. |
| Revisão do coletor | 2026-09-19: foram adicionados contadores passivos de CPU host por estado (`user`, `system`, `iowait`, `steal` e correlatos), memória total/usada/cache/disponível, disco disponível e inodes. São contadores/snapshots; percentuais de CPU exigem delta entre amostras e continuam NOT MEASURED até uma janela contextualizada. |
| Verificação da revisão | Local: `bash -n` e `--help` passaram. Execução de 1 s com label válido retornou código 3 esperado porque `ultrazend-api` não existe localmente; não produziu série, não iniciou container e não substitui métricas VPS. |
| RSS por processo | Revisão posterior incluiu soma passiva de `VmRSS` dos processos `node`/`postgres` via `/proc` interno. Em dois containers temporários mínimos, sem volume/porta/app, a coleta retornou Node `42.012.672` bytes e PostgreSQL `62.394.368` bytes. Os containers foram removidos; isso valida o formato do coletor, não mede a aplicação ou VPS. |
| Verificação do artefato | Ambiente local, 2026-09-17: `bash -n scripts/collect-velomail-observability.sh` e `bash scripts/collect-velomail-observability.sh --help` passaram. Busca estática não encontrou `docker rm/rmi/prune/stop/restart/start/run`, `curl`, `psql`, `.env`, `systemctl`, `truncate` ou `rm -rf`. Execução integral é **NOT MEASURED** neste ambiente porque não há daemon Docker nem os containers do host; não foram usados mocks. |
| Verificação passiva no host | 2026-09-17 21:09:36–21:09:48 UTC, `verification-unknown-traffic`, executada por SSH com o script fornecido por stdin: duas amostras retornadas, sem arquivo remoto. API: `cgroup_memory_current` 122.945.536 → 122.974.208 bytes; PostgreSQL: 138.919.936 → 138.870.784 bytes. `oom=0` e `oom_kill=0` em ambas; `nr_throttled`/`throttled_usec` não variaram (API 46/4.695.240; PostgreSQL 15/1.974.186). Uso CPU de cgroup no intervalo: API +152.320 µs, PostgreSQL +38.300 µs. Estes são contadores cumulativos e não provam ausência de throttling sob carga. |
| Limitação da verificação | O label declara tráfego desconhecido; duração útil de ~12 s e somente duas amostras. `memory.peak`, heap/external/RSS do processo, pool/conexões, p95/p99, erros, throughput e um deploy observado continuam **NOT MEASURED**. A tentativa anterior de 30 s foi encerrada pelo limite local antes de devolver saída, por isso não entra como medição. |
| Correção de lacuna do coletor | Revisão posterior, 2026-09-17: quando o pseudoarquivo `memory.peak` não estiver disponível, o TSV agora emite `cgroup_memory_peak=NOT_MEASURED`, em vez de omitir a métrica. A validação passiva de 21:11:18–21:11:25 UTC confirmou esse comportamento para API e PostgreSQL. Nenhuma alteração persistente foi feita no host. |
| Indicador de tráfego examinado | 2026-09-17 21:26:26–21:26:41 UTC: somente metadados agregados de `/var/log/nginx/tracking.log` foram lidos. Permaneceu em 0 bytes/0 linhas, com mtime 2026-09-16 14:13:53 UTC. Esse arquivo é de tracking, não de todas as requisições; vazio não prova aplicação ociosa e não fornece throughput para T-001. Nenhum conteúdo de log foi lido. |
| Contadores de rede por container | Revisão do coletor validada no host em 2026-09-17 21:27:42–21:27:49 UTC. API: RX 33.108.729 → 33.111.426 B, TX 63.753.669 → 63.759.521 B; PostgreSQL: RX 79.799.789 → 79.805.641 B, TX 41.303.554 → 41.306.251 B. O espelhamento API↔PostgreSQL é compatível com tráfego interno de pequena intensidade; não identifica rota, usuário, healthcheck ou throughput e não constitui carga representativa. Nenhum payload, conexão ou log foi lido. |
| Revalidação de deploy | 2026-09-17 21:28:36 UTC: `docker ps --filter name=ultrazend-migration` não retornou job ativo. API permanecia `running` desde 2026-09-16 20:36:49 UTC, com zero reinícios. Não havia deploy normal em curso para observação; nenhum foi iniciado. |
| Série passiva de 129 s | 2026-09-18 00:19:44–00:21:53 UTC, cinco amostras a ~30 s, label `passive-unknown-traffic`, sem escrita no host. Load 1 min variou 0,06–0,18; memória disponível 14.419–14.441 MB; swap 1,25 MiB; PSI memória/I/O `avg10=0,00`. API: 100,4–100,7 MiB em `docker stats`, 12 PIDs; PostgreSQL: 72,5 MiB, 14 PIDs. O maior snapshot de CPU foi 1,33% API e 0,13% PostgreSQL. |
| Deltas cgroup/rede da série | API: `usage_usec` +1.081.312 µs (~0,84% de um núcleo no período), RX +42.507 B, TX +91.288 B; PostgreSQL: `usage_usec` +487.906 µs (~0,38%), RX +91.288 B, TX +42.507 B. `oom`, `oom_kill`, `nr_throttled` e `throttled_usec` não variaram (API 57/6.520.149 µs; PostgreSQL 16/1.980.717 µs). Contadores cumulativos e uma amostra de 129 s não provam capacidade de pico nem ausência de throttling sob carga. |
| Conclusão da série | A atividade observada é baixa e sem contexto de rota/usuário/deploy; não é carga representativa. Heap/external/RSS do processo, pool/conexões, p95/p99, erros, throughput de requisições e deploy observado permanecem **NOT MEASURED**. Não há justificativa para alterar limites, pool, cache ou topologia. |
| Decisão substituída | O ambiente é não produtivo. Tarefas locais e descartáveis podem prosseguir em paralelo lógico, uma mudança por experimento. Métricas de pico e de deploy continuam necessárias antes de ajustar limites de runtime. |

## 7. Execução controlada — P1 parcial / T-008

| Campo | Registro |
|---|---|
| Ambiente | Local, branch `main`, commit `7e1e9bf`; Docker Engine 29.1.3 e Compose 5.0.1. Nenhum daemon, volume, container, imagem ou arquivo de produção foi usado. |
| Baseline Node 18 | Targets `runtime` e `migration` construíram em `linux/amd64`, usuário `nodejs`, com 62.711.094 B e 187.244.683 B lógicos, respectivamente. A imagem-base foi resolvida por digest no build local. Tamanho lógico não equivale a espaço físico recuperável. |
| Banco descartável | PostgreSQL 16 Alpine em rede exclusiva e `tmpfs` de 256 MiB, sem mounts. `prisma db push` terminou em 2,37–4,99 s. Seed em `NODE_ENV=production` passou; uma segunda execução preservou a senha e confirmou 1 super-admin e 1 perfil ativo. O seed em `NODE_ENV=test` falhou porque o `knexfile` seleciona SQLite quando `TEST_DB_CLIENT` não é `pg`; não é evidência de falha no fluxo produtivo. |
| Startup/health Node 18 | Runtime iniciou como usuário 1001, com logs de teste em `tmpfs` pertencente a UID/GID 1001, `COOKIE_SECRET` de teste e banco descartável. `simple`, `readiness` e `liveness` retornaram 200; health Docker ficou `healthy`, sem reinícios. Não houve porta publicada, SMTP externo, chaves DKIM reais ou dados de cliente. |
| Tentativa Node 20 | Runtime Node 20 compilou, sem avisos `EBADENGINE` observados; a tentativa de construir o target `migration` falhou no `npm install` de Prisma por `ECONNRESET` do registry após ~60 min. A alteração temporária de `node:18-alpine` para `node:20-alpine` foi revertida integralmente no Dockerfile. Imagens locais de auditoria foram preservadas; não houve prune. |
| Resultado / pendência | A validação local do fluxo atual é parcial e aprova a migração/seed/startup **somente** em banco vazio descartável. `db push --accept-data-loss` em dados existentes, registry/GHCR, digest de release, pull, deploy, DNS/DKIM real, SMTP e rollback de dados continuam NOT VERIFIED. T-008 permanece PENDING: o build de migration será repetido quando o registry responder, sem mudar o Dockerfile até a validação terminar. |
| Rollback | Código: Dockerfile permanece em Node 18 Alpine, sem diff de runtime pendente. Ambiente: os recursos locais temporários são isolados e serão removidos por nome; imagens de auditoria permanecem preservadas. |

## 8. Execução local — T-003 e T-011 (2026-09-18)

| Tarefa | Ambiente e evidência | Resultado | Limites preservados |
|---|---|---|---|
| T-003 | Dois containers `postgres:16-alpine` nomeados, em rede Docker temporária, ambos com `tmpfs` em `/var/lib/postgresql/data` e zero mounts. Migration e seed executados somente no banco de origem sintético; `pg_dump --no-owner --no-privileges` foi canalizado diretamente para `psql` no banco temporário de destino. | PASS: origem e destino continham 1 usuário sintético; nenhum dump foi gravado no host. Recursos temporários removidos nominalmente após o teste. | Não valida destino externo, criptografia, retenção, RPO/RTO ou restauração de dados existentes. |
| T-011 | API de auditoria Node 18 em rede Docker temporária, sem porta publicada, sem mounts, com logs em `tmpfs`; PostgreSQL temporário sem mounts. Comandos internos HTTP validaram `simple` e `readiness`; `docker stop --time 20` enviou SIGTERM. | PASS: migration e seed sintéticos, health 200, código de saída 0, início/fim de graceful shutdown registrados, duração de 1,59 s. Recursos temporários removidos nominalmente após inspeção. | Não valida SMTP/DKIM externo, entrega pendente, lote, destinatários múltiplos, autorização real ou carga. |

## 9. Execução local — T-008 / parametrização de runtime (2026-09-18)

`backend/Dockerfile` passou a declarar `ARG NODE_IMAGE=node:18-alpine` antes do primeiro estágio e a usar esse argumento em `prod-deps`, `builder` e `runtime`. Assim, a imagem padrão não mudou, mas o mesmo Dockerfile pode ser validado integralmente com Node 20 sem cópias temporárias. O target efêmero de migration também passou a solicitar `prisma@6.12.0` e `@prisma/client@6.12.0` de forma exata, coerente com o lockfile, e usa `--no-package-lock` para não reescrever o lock durante o build.

- `docker build --target runtime` com o padrão: PASS; imagem iniciou `node --version` como `v18.20.8`.
- `docker build --target migration --build-arg NODE_IMAGE=node:20-alpine`: etapas de build TypeScript e runtime foram resolvidas; a instalação externa de Prisma falhou com `ETIMEDOUT` em `registry.npmjs.org` após 163,8 s.
- A reconstrução posterior do target migration com versões Prisma exatas foi interrompida localmente após cinco janelas de 30 s sem conclusão da mesma instalação externa; nenhum artefato parcial foi promovido.
- Não houve promoção do padrão para Node 20, alteração de Compose, limpeza de imagem ou mudança em serviços/dados.

**Estado atual deste documento:** 12 tarefas planejadas; 12 IN PROGRESS; 0 DONE; 0 BLOCKED; 0 PENDING. P0 continua parcial; T-008 concluiu build, migration, seed e startup locais com Node 20, mas registry por digest, pull, deploy e rollback externo permanecem NOT VERIFIED. Nenhuma mudança em dados existentes foi iniciada.

## 10. Execução local — T-005 / retenção de logs de domínio (2026-09-19)

Em `backend/src/services/domainVerificationInitializer.ts`, o boot deixou de chamar `domainVerificationLogger.cleanupOldLogs(0)`: o logger informa que as tabelas são responsabilidade das migrations e não há exclusão durante a inicialização. A rotina de manutenção foi substituída por `node-cron` com expressão `0 2 * * *`; ela usa `DOMAIN_LOG_RETENTION_DAYS` (padrão 90) e `DOMAIN_JOB_RETENTION_HOURS` (padrão 168) no horário declarado, em vez de executar 24 horas após cada boot.

- `npm run build`: PASS.
- `npm run typecheck`: PASS.
- `npx jest src/tests/unit/services/DomainVerificationLogger.test.ts --runInBand`: PASS (4 testes). O teste exercita inserção, recarga de identificador e atualização de etapas do logger; não executa limpeza ou cron.
- Smoke em container da imagem atual: NOT MEASURED em 2026-09-19, pois o Docker Engine local estava indisponível (`dockerDesktopLinuxEngine` sem pipe). Nenhum serviço foi iniciado para contornar essa condição.
- Não houve inicialização da aplicação, consulta de domínio, DNS, SMTP, limpeza ou alteração de banco neste ensaio.

Atualização subsequente: `runRecurringVerification()` fazia somente uma execução no boot, apesar da mensagem de seis horas. O inicializador agora preserva essa execução inicial e agenda as próximas com `0 */6 * * *`. Os handles de cron, alertas e métricas são rastreados e `stop()` os encerra antes do pool de banco durante graceful shutdown. A limpeza duplicada `cleanupOldJobs()` deixou de ser chamada pelo mesmo cron: ela removia a mesma tabela com corte fixo de 30 dias, contrariando `DOMAIN_LOG_RETENTION_DAYS`.

- `npx jest src/tests/unit/services/domainVerificationInitializer.test.ts --runInBand`: PASS (1 teste). Cobre ausência de limpeza no boot, cron de 6 horas, cron de 02:00, retenção de 90 dias na callback e parada dos dois handles cron.
- `npm run build`, `npm run typecheck` e `git diff --check`: PASS.
- A prova integrada com PostgreSQL e container continua NOT MEASURED enquanto o Docker Engine local estiver indisponível; nenhum serviço externo foi iniciado.

## 11. Execução local — T-004 / plano de migration não destrutivo (2026-09-19)

`backend/scripts/run-db-migrations.js` foi separado em `buildMigrationPlan()` (testável sem abrir conexão) e `main()`. Para PostgreSQL, o plano ainda executa a preparação já existente e `prisma db push --skip-generate`, mas não inclui mais `--accept-data-loss`. A geração do client continua omitida porque o runtime usa Knex e não importa `@prisma/client`.

- `node --check scripts/run-db-migrations.js`: PASS.
- Avaliação do plano PostgreSQL em processo local: PASS; confirmou URL PostgreSQL, `--skip-generate` e ausência de `accept-data-loss`.
- `npm run typecheck`: PASS.
- Não há migrations Prisma versionadas em `backend/prisma`; por isso `prisma migrate deploy` continua NOT APPLICABLE até a criação de histórico versionado compatível. Nenhum banco foi conectado neste ensaio.

## 12. Execução local — T-002 / healthcheck Redis opcional (2026-09-19)

`backend/src/services/monitoringService.ts` agora monta a lista de checks paralelos sem Redis por padrão. `checkRedisHealth()` é adicionado somente quando `REDIS_URL` não está vazio; assim, um ambiente da arquitetura de entrega direta sem Redis não abre uma conexão TCP para o padrão `localhost:6379` nem insere uma linha de health/metric a cada ciclo de 30 segundos. Quando `REDIS_URL` existe, o check anterior é preservado.

- `backend/node_modules/.bin/jest.cmd src/tests/unit/services/monitoringService.test.ts --runInBand`: PASS (2 testes), cobrindo ausência de URL e URL explícita.
- `npm run typecheck`: PASS.
- Nenhuma conexão Redis, banco, SMTP ou serviço externo foi aberta pelo teste.

## 13. Execução local — T-009 / segredo de registry fora dos argumentos SSH (2026-09-19)

O passo `Deploy via SSH` em `.github/workflows/deploy-production.yml` passou a colocar imagens e credenciais em variáveis do próprio step. Ele constrói, no stdin da sessão SSH, quatro exports com quoting de Bash (`printf %q`) seguidos por `.github/scripts/deploy-production-remote.sh`; o comando remoto fica restrito a `bash -s`. Assim, `REGISTRY_TOKEN` não é mais concatenado à linha de comando do processo `ssh` no runner.

- YAML do workflow: PASS ao parsear com `js-yaml` local; o passo `Deploy via SSH` foi localizado.
- Payload com imagens e token sintéticos: PASS em `bash -n` junto ao script remoto.
- `scripts/validate-deploy-config.sh` e `scripts/verify-deploy-files.sh`: PENDING/legados, não referenciados pelo workflow ativo; ambos falham em `bash -n`, e o segundo desativa host-key checking e pode criar diretórios remotos. Não foram executados nem alterados por não haver consumidor confirmado.
- Não houve GitHub dispatch, SSH, upload, pull, deploy ou acesso a credenciais reais nesta validação.

## 14. Execução local — T-010 / armazenamento e permissões DKIM (2026-09-19)

A análise de `sendEmailSchema` e `EmailService` mostrou que anexos entram como `filename`, `content`, `contentType` no payload, limitados a cinco itens e 10 MiB de conteúdo por item; não existe endpoint de upload persistente confirmado. O volume montado em `/app/storage` continua classificado como uso desconhecido, portanto foi preservado.

Em ambas as rotinas de preparação de `.github/scripts/deploy-production-remote.sh`, o diretório de chaves passou a `root:1001`/750; `*-private.pem` fica em 640 e os demais artefatos ficam em 644. Isso reduz exposição das chaves sem impedir o processo Node de grupo 1001.

- `bash -n .github/scripts/deploy-production-remote.sh`: PASS.
- Não houve alteração de chaves, volume, storage, arquivo de usuário ou host nesta validação. A prova de leitura DKIM pelo container continua NOT MEASURED enquanto Docker estiver indisponível.

## 15. Execução local — T-007 / limite de cache de verificações (2026-09-19)

`DomainVerificationService` mantém resultados de DNS por cinco minutos, com chave composta por usuário e domínio. Antes, uma chave expirada só era removida se o mesmo domínio fosse consultado novamente e não existia limite global. Agora a escrita remove entradas expiradas e, se necessário, remove a entrada mais antiga antes de inserir uma nova acima de 1000 itens. Não foi criado Redis nem alterada a semântica de isolamento.

- `backend/node_modules/.bin/jest.cmd src/tests/unit/services/domainVerificationServiceCache.test.ts --runInBand`: PASS (2 testes), cobrindo remoção de expirado e evicção ao teto.
- `npm run typecheck` e `git diff --check`: PASS.
- Benefício de memória permanece hipótese até medição de heap/entradas sob carga representativa.

## 16. Execução local — T-006 / agregação das estatísticas de domínio (2026-09-19)

`DomainVerificationJob.getJobStats()` consultava a tabela `domains` três vezes, em sequência, para contar o total, os verificados e os pendentes. O método agora realiza uma única consulta com `COUNT(*)` e dois agregados condicionais. A normalização posterior conserva o contrato de retorno para drivers que entregam agregados como texto ou número. Não foram alteradas paginação, autorização, índices, pool, schema ou demais consultas candidatas.

- `backend/node_modules/.bin/jest.cmd src/tests/unit/jobs/domainVerificationJob.test.ts --runInBand`: PASS (1 teste); mock confirma uma chamada à tabela, uma seleção agregada e uma finalização de consulta.
- `npm run typecheck`, `npm run build` e `git diff --check`: PASS.
- O teste não abriu banco real; `EXPLAIN`, buffers, p95, concorrência e efeito no pool continuam NOT MEASURED. Assim, redução de I/O/CPU é hipótese, não métrica comprovada.
- Rollback: restaurar as três contagens independentes no método, mantendo a mesma assinatura pública.

## 17. Execução local — T-012 / canais de log especializados (2026-09-19)

Os transports `security`, `performance` e `business` usavam apenas `level: info`; por isso, qualquer evento informativo também era escrito nos três arquivos, mesmo sem pertencer ao respectivo domínio. `application` continua sendo o registro operacional completo, e `errors` continua recebendo todos os erros. Os três canais especializados agora exigem, respectivamente, os metadados estruturados `security`, `performance` e `business`, que já são emitidos pelos helpers `Logger.security`, `Logger.performance` e `Logger.business`.

- Integração local em diretório temporário: PASS. Um evento genérico permaneceu em `application` e não apareceu nos três canais especializados; um evento de cada categoria apareceu no seu respectivo arquivo. O diretório temporário foi removido no fim do teste.
- `backend/node_modules/.bin/jest.cmd src/tests/unit/config/logRouting.test.ts --runInBand`, `npm run typecheck`, `npm run build` e `git diff --check`: PASS.
- Não houve alteração de retenção, `logrotate`, Nginx, journal ou arquivos existentes. A redução de bytes é uma hipótese até observar taxa por canal em carga representativa; GAP-10 (rotação efetiva do Nginx) permanece NOT MEASURED.
- Rollback: restaurar `productionFormat` diretamente nos três transports especializados e remover `logRouting.ts`/seu teste.

## 18. Execução local — T-011 / exclusão mútua do polling de entregas (2026-09-19)

`DeliveryManager` iniciava um `setInterval` assíncrono a cada cinco segundos. Sem uma trava do ciclo, uma consulta, recuperação ou processamento mais lento do que o intervalo podia iniciar uma segunda varredura enquanto a anterior permanecia ativa. O claim de cada entrega continua atômico, mas a sobreposição ainda desperdiçava consultas e tentativas de seleção por tenant.

Foi adicionado `isPollingDeliveryQueue`: `runTenantAwareDeliveryCycle()` retorna sem trabalho quando um ciclo está ativo e sempre libera a trava no `finally`. A recuperação de entregas vencidas, limite global, descoberta de tenants, processamento por tenant, backoff e `shutdown()` permanecem inalterados.

- `backend/node_modules/.bin/jest.cmd src/tests/unit/services/deliveryManagerCycle.test.ts --runInBand`: PASS (1 teste). Cobre ciclo bloqueado, ausência de descoberta durante a sobreposição, processamento normal após a liberação e reset da trava.
- `npm run typecheck`, `npm run build` e `git diff --check`: PASS.
- PostgreSQL e SMTP reais continuam NOT MEASURED: esta máquina não possui binários PostgreSQL locais e o Docker Engine segue indisponível. Nenhum destinatário, serviço SMTP externo ou dado persistente foi usado.
- Rollback: remover `isPollingDeliveryQueue` e encaminhar o callback do intervalo diretamente ao corpo original do ciclo.

## 19. Gate de ambiente para as validações restantes (2026-09-19)

Na primeira verificação, o serviço `com.docker.service` estava `Stopped` com inicialização `Manual`; não havia processo Docker Desktop/back-end e o cliente Docker não encontrava o pipe `dockerDesktopLinuxEngine`. Também não há `psql`, `postgres`, `pg_ctl` ou `initdb` instalados localmente. Nenhum serviço foi iniciado por esta auditoria; o Docker Engine voltou a responder posteriormente e as validações aplicáveis seguem na seção 20.

Permanecem dependentes de acesso observacional autorizado as métricas de pico, Nginx, retenção e deploy (T-001, T-009, T-012), além de fluxos SMTP completos e recuperação/rollback representativos. As alterações locais já validadas permanecem IN PROGRESS, não DONE, até esses critérios serem observados.

## 20. Validação descartável Node 20 / PostgreSQL 16 (2026-09-19)

O Docker Engine voltou a responder (`29.1.3`) com inventário local vazio antes do ensaio. Foram criados apenas a rede `urbansend-audit-net`, PostgreSQL 16 Alpine `urbansend-audit-pg` com `tmpfs` de 256 MiB e containers nomeados de auditoria; não houve porta publicada, mount, volume ou dado preexistente.

- `docker build --target runtime` com o padrão `node:20-alpine`: PASS. O build anterior Node 18 também passou, mas emitiu `EBADENGINE` para dependências reais de runtime (incluindo `nodemailer`, `smtp-server`, `mailparser` e `sqlite3`), que exigem Node 20.
- `docker build --target migration --build-arg NODE_IMAGE=node:20-alpine`: PASS. O Prisma 6.12.0 foi instalado no estágio efêmero sem timeout do registry.
- Migration: PASS contra PostgreSQL temporário. `prisma db push --skip-generate` terminou sem `--accept-data-loss`.
- Seed: PASS duas vezes em `NODE_ENV=production`; a primeira criou o administrador sintético, a segunda preservou a senha e a consulta confirmou um único registro.
- Runtime Node 20: PASS como usuário `nodejs`, sem mounts. `/api/health/simple` e `/api/health/readiness` retornaram 200; health Docker ficou `healthy`, sem restart. SIGTERM encerrou o processo com código 0 e os logs registraram graceful shutdown.
- Consulta T-006: `EXPLAIN (ANALYZE, BUFFERS)` do agregado único em `domains` foi aceito pelo PostgreSQL, com execução de 0,063 ms e um buffer hit no dataset mínimo. Isto prova sintaxe/integração, não desempenho sob carga.
- Durante o smoke, a ausência de `LOG_FILE_PATH` fez o container tentar `/var/www/ultrazend/logs`, não gravável por `nodejs`. O default foi corrigido para `/app/logs`, diretório criado e pertencente ao usuário da imagem; o smoke subsequente passou.
- As imagens de auditoria foram preservadas para reprodutibilidade. Ao final, os containers `urbansend-audit-api` e `urbansend-audit-pg` e a rede `urbansend-audit-net` foram removidos nominalmente; não havia volumes nem mounts e não foi executado `prune`.

## 21. Validação descartável T-011 / SMTP STARTTLS (2026-09-19)

| Campo | Evidência |
|---|---|
| Ambiente e isolamento | Processo local, servidor SMTP ligado em `127.0.0.1` com porta efêmera, sem porta publicada, DNS, banco, fila, credencial real ou destinatário externo. Certificado e chave RSA foram criados em dois diretórios temporários com prefixo `urbansend-audit-smtp-`; ambos foram removidos ao final. |
| Método | O servidor local foi criado com a dependência de runtime `smtp-server`; `DeliveryManager.setupTransporter()` configurou o cliente real `nodemailer` com `secure: false` e `requireTLS: true`. A CA temporária foi confiada somente pelo processo de teste por `NODE_EXTRA_CA_CERTS`; não houve alteração de configuração da aplicação ou do host. |
| Check negativo | Certificado inicial sem Subject Alternative Name para `127.0.0.1`: FAIL esperado com `ERR_TLS_CERT_ALTNAME_INVALID`. Isso confirma que a validação de hostname não foi desativada. |
| Check positivo | Certificado substituto com SAN `IP:127.0.0.1,DNS:localhost`: PASS. `DeliveryManager` enviou exatamente uma mensagem de endereço `.test`; o servidor aceitou uma mensagem e `nodemailer` devolveu `messageId`. |
| Regressão de código | `npm run typecheck`: PASS. `npm run build` regenerou `dist/index.js`. A execução agrupada de seis testes Jest focados iniciou repetidamente o bootstrap de migrations SQLite, mas permaneceu sem CPU e sem resultado conclusivo; o processo de teste local identificado foi encerrado. Esta execução agrupada é **NOT MEASURED/PASS** e não substitui os testes unitários individuais já registrados nas tarefas. |
| Limites | Não percorre a fila persistida, claim atômico, autorização de tenant, DKIM, retries, batch, múltiplos destinatários nem relay externo. Portanto não mede throughput, duração de pico, taxa de erro real ou consumo de recursos. |
| Rollback | Nenhuma alteração persistente de código, configuração, serviço, volume, imagem ou dados foi feita para o ensaio. A única falha inicial era material de teste e foi removida junto com o certificado válido. |

## 22. Reconciliação de execução e objetivo restante (2026-09-19)

| Escopo | Concluído com evidência local | Ainda exigido para encerramento do plano |
|---|---|---|
| Aplicação e runtime | Gating Redis explícito, cron de domínio sem limpeza no boot, cache limitado por tenant, agregado único de estatísticas, exclusão mútua do polling e roteamento seletivo de logs foram implementados e têm testes focados. | Medição sob carga representativa, ciclos de cron completos, fila persistida com autorização/DKIM/retry e métricas de heap/RSS/CPU/latência. |
| Build, imagem e deploy | Build de runtime/migration Node 20, migration, seed idempotente, startup, readiness e shutdown passaram em PostgreSQL 16 descartável; SSH workflow deixou de interpolar credencial no comando remoto. | Registry por digest, pull autenticado, host-key pinada, deploy serializado observado, rollback de release e compatibilidade N/N-1 de schema. |
| Banco e recuperação | `db push` PostgreSQL não aceita mais `--accept-data-loss`; dump/restore sintético e seed duas vezes passaram. | Restore de dataset representativo, política de RPO/RTO/retenção/criptografia, pool/conexões, planos e p95 sob carga comparável. |
| Storage, logs e segurança | Permissões DKIM no script e default de logs gravável pelo usuário da imagem foram corrigidos; canais de log especializados foram filtrados. | Upload/download/restauração sintéticos, leitura DKIM no container após deploy, taxa/retenção de logs e rotação Nginx efetivas. |
| Testes | Novo `jest.lightweight.config.js` elimina migrations e seed globais dos testes que mockam I/O. `DomainSetupService` exporta singleton lazy e `DomainVerificationService` instancia setup apenas ao verificar; `test:unit:optimization` passou localmente com oito suítes/12 testes em 9,545 s e passou a ser gate pré-build do workflow. Há testes específicos para inicialização cache-only, JSON PostgreSQL/SQLite, erro estruturado de claim e separação heap/RSS/external. | Medir a execução no runner e o tempo total de pipeline. Testes que exigem SQLite permanecem no perfil padrão. |

**Objetivo operacional remanescente:** concluir somente as lacunas acima com evidência proporcional, mantendo dados existentes, volumes/imagens de rollback e integrações externas intactos até que sejam exercitados em ambiente isolado ou autorizados explicitamente. Benefícios de RAM, CPU, disco e I/O continuam hipóteses enquanto não houver série comparável.

## 23. Rebuild local do runtime após lazy setup (2026-09-19)

| Campo | Evidência |
|---|---|
| Comando | `docker build --target runtime --tag urbansend-audit-runtime:node20-lazy-setup backend` |
| Resultado | PASS. Imagem local criada: `urbansend-audit-runtime:node20-lazy-setup`, ID abreviado `68217d70f7de`, tamanho lógico 322 MB. |
| Escopo | Apenas build local; não iniciou container, não publicou porta, não montou volume, não fez push, não usou registry nem afetou dados existentes. |
| Interpretação | Confirma que o runtime Node 20 compila após lazy setup e testes/CI adicionados. Tamanho lógico não é espaço físico recuperável e não prova pull, digest remoto, startup ou deploy. |
| Rollback | As imagens de auditoria anteriores `node20` e `node18` permanecem preservadas; nenhuma imagem ou camada foi removida. |

## 24. Smoke integrado após lazy setup (2026-09-19)

| Campo | Evidência |
|---|---|
| Isolamento | Rede Docker `urbansend-audit-lazy-net`; PostgreSQL 16 em `tmpfs` de 256 MiB, sem mount/volume/porta pública; API `urbansend-audit-lazy-api` sem mount/porta pública. As variáveis foram sintéticas e não representam credenciais externas. |
| Migration | `urbansend-audit-migration:node20 npm run migrate:latest` contra a instância temporária: PASS. Estratégia PostgreSQL `prisma db push --skip-generate`, sem `--accept-data-loss`; duração reportada pelo Prisma: 1,58 s. |
| Startup e health | Runtime `urbansend-audit-runtime:node20-lazy-setup`: PASS. Health Docker `healthy`; `GET /api/health/simple` e `GET /api/health/readiness` retornaram 200 internamente. |
| Shutdown | `docker stop --timeout 20 urbansend-audit-lazy-api`: PASS, código de saída 0. |
| Limpeza controlada | O container PostgreSQL temporário foi parado explicitamente antes da remoção; depois foram removidos apenas `urbansend-audit-lazy-api`, `urbansend-audit-lazy-pg` e a rede temporária. Nenhum volume foi criado, imagem removida, `prune` executado ou dado existente acessado. |
| Limites | Não mede pico, RSS/heap, p95, pool, fila persistida, SMTP/DKIM externo, upload/download, registry, deploy ou rollback remoto. |

## 25. Fila PostgreSQL sintética / claim atômico (2026-09-19)

| Campo | Evidência |
|---|---|
| Isolamento | PostgreSQL 16 `urbansend-audit-queue-pg` em `tmpfs` de 256 MiB, rede Docker exclusiva e sem portas/mounts/volumes. Migration não destrutiva executada antes do ensaio. |
| Defeito encontrado | A primeira execução inseriu `headers` JSON sintético; Knex/PostgreSQL devolveu objeto, enquanto `DeliveryManager` chamava `JSON.parse` incondicional. A entrega foi reprogramada com erro `"[object Object]" is not valid JSON`; isto é defeito real de compatibilidade SQLite/PostgreSQL, não falha SMTP. |
| Correção | `parseDeliveryHeaders` aceita objeto JSON PostgreSQL ou string JSON SQLite e rejeita array/valor inválido. Teste unitário cobre os dois formatos e a rejeição explícita. |
| Ensaio corrigido | Duas chamadas concorrentes de `processDelivery` para uma única linha sintética: PASS. Uma só retornou sucesso, `sendMail` sintético foi chamado uma vez, a linha terminou `delivered` com `attempts=1` e houve uma única linha `delivery_stats`. A chamada concorrente registrou erro esperado ao não ganhar o claim. |
| Cobertura complementar | O transporte STARTTLS real já havia sido validado separadamente contra SMTP local e CA temporária; este ensaio usa transporte sintético para isolar persistência/claim e não envia e-mail externo. |
| Tenant negado | Em novo PostgreSQL temporário migrado, foi criado usuário/entrega sintéticos e o contexto de tenant retornou ativo, mas a autorização retornou negação. PASS: transporte sintético não foi chamado, a entrega terminou `failed` na primeira tentativa e uma única dead letter foi registrada. Nenhuma autorização real foi consultada. |
| Limites e rollback | Não exercita autorização real, DKIM real, batch, retry agendado, múltiplos destinatários ou carga. Containers/rede temporários foram parados/removidos nominalmente e nenhum volume/imagem existente foi removido. Rollback de código: restaurar parser anterior apenas acompanhado de correção compatível para JSON PostgreSQL. |

## 26. Imagem runtime candidata consolidada (2026-09-19)

| Campo | Evidência |
|---|---|
| Build | `docker build --target runtime --tag urbansend-audit-runtime:node20-final-candidate backend`: PASS. Build recompilou o TypeScript atual e produziu imagem com usuário configurado `nodejs`. |
| Smoke atual | PostgreSQL 16 temporário em `tmpfs` + migration: PASS (`prisma db push` sem aceitação destrutiva, 1,39 s). API da própria tag candidata: health Docker `healthy`; endpoints internos simple/readiness retornaram 200; shutdown resultou em código 0. |
| Tamanho | `docker image ls`: 322 MB lógicos para a imagem. `docker system df`: imagens 4,272 GB, cache de build 3,008 GB, 59% das imagens marcadas reclaimable. Esses totais incluem camadas e imagens de auditoria compartilhadas; não equivalem a espaço exclusivo e não foram limpos. |
| Preservação | Não havia container/volume local ativo; imagens anteriores Node 18/20 e a candidata foram mantidas para investigação/rollback. Não houve `prune`, `rmi`, remoção de cache ou imagem remota. |
| Limites | O build/smoke não prova digest GHCR, pull, execução no runner, deploy, rollback remoto nem uso físico de disco na VPS. Recursos temporários nomeados foram removidos e nenhum volume foi criado. |

## 27. Métricas de memória sem orçamento falso (2026-09-19)

| Campo | Evidência |
|---|---|
| Correção | `getRuntimeMemoryMetrics` separa heap usado/total/percentual de RSS, `external` e `arrayBuffers`. O health detalhado preserva os campos históricos `used/free/total/percentage` para heap e acrescenta `rss/external/arrayBuffers`; não usa mais `heapTotal + external` como se fosse limite de processo. |
| Coletor passivo | `collect-velomail-observability.sh` passou a emitir RSS agregado de processos Node/PostgreSQL, além de cgroup e métricas do host. A validação em containers mínimos retornou RSS de ambos os processos. |
| Verificação | `npm run typecheck`: PASS. Gate de otimização: oito suítes/12 testes, PASS em 9,545 s; teste unitário confirma separação de heap/RSS/nativo. `docker build --target runtime --tag urbansend-audit-runtime:node20-runtime-metrics backend`: PASS, imagem 322 MB lógica. |
| Limites | Não foi chamado `/api/health` detalhado no smoke porque ele executa SMTP/DKIM e pode atingir rede externa; isso não é substituto de readiness. Ainda faltam RSS/heap sob tráfego representativo na VPS e orçamento por cgroup. |

## 28. Proteção contra sobreposição dos healthchecks (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado | `MonitoringService` agenda healthchecks a cada 30 s. Como SMTP, banco e sistema são assíncronos, um check lento podia deixar o ciclo anterior em curso quando o próximo intervalo começasse; isto duplicaria checks e as gravações associadas de `health_checks`/`system_metrics`. A duração real em VPS permanece NOT MEASURED. |
| Correção | Foi introduzida a trava interna `isPerformingHealthChecks`. Uma chamada concorrente retorna sem criar checks; o `finally` sempre libera a trava, inclusive quando um check falha. Redis continua opcional e só é incluído quando `REDIS_URL` é explícita. |
| Verificação | `npm run test:unit:optimization`: PASS — 8 suítes, 13 testes, 11,79 s. O novo teste mantém a verificação de banco pendente, chama o ciclo concorrente e confirma uma única chamada a SMTP/banco/sistema; após liberar a promessa, confirma novo ciclo normal. `npm run typecheck`: PASS. `npm run build`: PASS. `git diff --check`: PASS, exceto avisos não-fatais de normalização LF→CRLF já existentes. |
| Impacto e limites | Evita trabalho duplicado apenas quando há duração acima do intervalo; não reduz a cadência nominal, não desativa checks e não demonstra economia de CPU/I/O sem série representativa. A decisão sobre cadência, retenção e alertas continua dependente de T-001. |
| Rollback | Remover `isPerformingHealthChecks` e seu guard de `performAllHealthChecks`; nenhum dado, schema, timer de retenção, serviço externo ou configuração foi alterado. |

## 29. Dependência nativa de runtime explícita (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado | `bcrypt` é dependência de runtime; `sqlite3` consta em `devDependencies` e não é carregável na imagem `npm ci --omit=dev`, coerente com runtime PostgreSQL. O Dockerfile tentava rebuild de ambos e ignorava falha com `|| true`, o que poderia ocultar erro real de `bcrypt`. |
| Correção | O estágio `prod-deps` agora executa `npm rebuild bcrypt --build-from-source=false` sem ignorar erro; não tenta incluir/recompilar `sqlite3` na imagem PostgreSQL. |
| Verificação | Build `urbansend-audit-runtime:node20-native-verified`: PASS, usuário `nodejs`, tamanho lógico 322 MB. Execução interna `require('bcrypt')`: PASS. A tentativa prévia de `require('sqlite3')` falhou como esperado porque ele não integra o runtime. |
| Limites e rollback | Não transforma imagem PostgreSQL em imagem SQLite. Se um runtime SQLite for novamente suportado, requer imagem/target e teste próprios, não adição implícita. Imagens anteriores foram preservadas; nenhuma limpeza executada. |

## 30. Descoberta correta de testes Jest (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado (T-008) | O padrão `**/__tests__/**/*.ts` em `jest.config.js` classificava `src/__tests__/setup.ts` como suíte. O arquivo é carregado por `setupFilesAfterEnv` e cria/migra um SQLite temporário; tratá-lo também como teste duplicava o bootstrap, sem executar um caso de teste. |
| Correção | `testMatch` passou a aceitar somente arquivos `*.test.ts` ou `*.spec.ts`. `setupFilesAfterEnv` continua apontando para o mesmo `setup.ts`, portanto o ambiente SQLite das suítes que dele dependem foi preservado. |
| Verificação | Antes da mudança, `npx jest --listTests --runInBand` listava `src/__tests__/setup.ts`; depois, ele lista 36 arquivos de teste e não lista o setup. A amostra padrão `npx jest src/tests/unit/utils/env.test.ts --runInBand --detectOpenHandles` passou: 1 suíte, 3 testes, 23,056 s, com migrations SQLite e cleanup concluídos. Nenhum `test-worker-*.db` permaneceu após a execução. |
| Limites | A amostra não prova a suíte completa nem os fluxos SMTP/performance/integração; ela prova a descoberta correta e o bootstrap do perfil padrão. Não foi alterada a semântica de migrations, seeds ou de testes que exigem SQLite. |
| Rollback | Restaurar a entrada ampla anterior de `testMatch`; não há dados persistentes ou serviço externo afetados. |

## 31. Encerramento de timers residentes e regressões da suíte unitária (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado (T-002, T-011, T-012) | `OptimizedLogger` criava timers de flush e cleanup, mas `destroy()` liberava apenas o primeiro. `emailMiddlewareHelpers` mantinha cleanup de cache em intervalo global sem função de parada; `AdvancedRateLimiter` já possuía `destroy()`, mas não era chamado no shutdown da aplicação. Isso deixava handles abertos nos testes e retinha timers após o encerramento do processo de aplicação. |
| Correção | `OptimizedLogger` passou a conservar e limpar os dois handles. `shutdownEmailMiddlewareHelpers()` limpa o intervalo e o cache de health. O shutdown principal, e o teardown do Jest, chamam os três encerramentos (logger otimizado, helper de e-mail e rate limiter), sempre após o trabalho normal e com flush final do buffer de logs. |
| Verificação | `npx jest src/tests/unit/middleware/advancedRateLimiting.test.ts --runInBand --detectOpenHandles`: PASS (1 suíte, 1 teste, 15,789 s) sem handles reportados. `npm run typecheck`, `npm run build` e `npm run test:unit:optimization`: PASS (8 suítes, 13 testes, 10,005 s). |
| Regressões encontradas | A execução interrompida de `npm run test:unit -- --runInBand` concluiu 25 suítes: 20 PASS, 5 FAIL; 58 testes PASS, 2 FAIL. Os dois testes `src/__tests__/unit/emailService*.test.ts` importam módulo removido `services/emailService`; `MultiDomainDKIMManager.test.ts` possui doubles de uma cadeia de consulta DKIM anterior; `DomainSetupService.test.ts` tinha expectativas DNS antigas (SPF foi ajustado, DMARC com `rua` ainda precisa de expectativa compatível). A asserção de construtor mockado em `authController.test.ts` foi corrigida e passou em teste focado. |
| Estado substituído | A pendência desta captura foi resolvida na seção 32: a suíte unitária completa passou após reconstrução dos doubles DKIM, ajuste dos contratos DNS e migração da cobertura de `EmailService` legado para `InternalEmailService`. Nenhum dado externo foi tocado. |
| Rollback | Restaurar os handlers de intervalos anteriores e seus imports de shutdown; não há schema, volume, imagem, serviço externo ou dado persistente modificado. |

## 32. Suíte unitária consolidada (2026-09-19)

| Campo | Evidência |
|---|---|
| Correções (T-008, T-011) | `InternalEmailService` passou a instanciar `SMTPDeliveryService` somente no primeiro envio, eliminando inicialização DKIM/SMTP desnecessária em construção, mocks e fluxos que não enviam e-mail. Os testes legados que importavam `services/emailService` (módulo sem consumidor/runtime) foram excluídos explicitamente do discovery; uma nova suíte cobre o contrato real de verificação e a propagação de falha em `InternalEmailService`. |
| Contratos DKIM/DNS | Os doubles de `MultiDomainDKIMManager` passaram a isolar a consulta inicial de chaves e a modelar a geração atual. O teste DNS valida SPF do MAIL FROM técnico e DMARC com `rua`, em vez de uma expectativa anterior incompatível. |
| Verificação | `npm run test:unit -- --runInBand`: PASS — 24 suítes, 71 testes, 157,892 s, com `--detectOpenHandles` e sem handles reportados. O bootstrap SQLite não deixou `test-worker-*.db`. `npm run typecheck` e `npm run build`: PASS. |
| Economia e limites | A migration/seed de teste deixa de produzir milhares de linhas de `console.log` quando `TEST_VERBOSE` não está definido; a saída é restaurada após o bootstrap. A duração total é uma medição local única, não orçamento de CI. As suítes de integração, E2E e performance ainda requerem execução e critérios próprios. |
| Rollback | Restaurar eager construction de SMTP, a descoberta dos dois testes legados e os contracts de teste anteriores; não houve mudança de schema, dado, volume, imagem ou integração externa. |

## 33. Perfil unitário sem bootstrap de banco (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado (T-008) | O comando `test:unit` executava `setup.ts` em cada arquivo, criando/migrando/seedando SQLite mesmo para suítes que usam apenas mocks. A execução serial anterior passou em 157,892 s para 24 suítes/71 testes; esse custo não representa cobertura adicional dos casos unitários. |
| Correção | `jest.unit-isolated.config.js` agora herda a descoberta/exclusões do config base, usa teardown de timers residente e não carrega o bootstrap SQLite. `test:unit` foi promovido para esse perfil. O config padrão permanece disponível para testes que exigem migration/seed reais. |
| Verificação | `npm run test:unit -- --runInBand`: PASS — 24 suítes, 71 testes, 50,589 s, com `--detectOpenHandles` e sem handles reportados. A lista de suítes é a mesma da execução padrão consolidada, exceto os dois arquivos legados sem módulo runtime, já substituídos por cobertura de `InternalEmailService`. |
| Impacto e limites | Na amostra local serial, a duração caiu 107,303 s (≈68%); essa redução é observação local, não compromisso de duração de CI. O perfil isolado é válido porque a execução de prova passou integralmente; novas suítes que precisem de SQLite devem usar o config padrão/integração, não reintroduzir setup global em unitários. |
| Rollback | Restaurar `test:unit` para o comando/configuração padrão e remover `isolated-setup.ts`; não há alteração em migrations, seed, banco, dados, volume ou serviço externo. |

## 34. Gate unitário completo no CI (2026-09-19)

| Campo | Evidência |
|---|---|
| Alteração (T-008, T-009) | O passo de backend em `.github/workflows/deploy-production.yml` passou de `npm run test:unit:optimization` para `npm run test:unit` e foi renomeado para refletir a cobertura unitária completa. O typecheck e `npm ci` continuam no mesmo passo, antes de construir imagens. |
| Justificativa | O perfil isolado validado inclui 24 suítes/71 testes, não somente as otimizações recentes, e não dispara migrations SQLite por arquivo. Assim ele amplia a detecção de regressões sem readicionar o custo de bootstrap de banco ao pipeline. |
| Verificação local | O exato comando `npm run test:unit -- --runInBand` passou em 50,589 s. O workflow não foi disparado, nenhum registry/GitHub secret/SSH/VPS foi acessado; duração e compatibilidade no runner permanecem NOT MEASURED. |
| Rollback | Restaurar o comando anterior `npm run test:unit:optimization` no workflow; não há efeito em imagens, releases, schema, dados ou serviços externos. |

## 35. Rebuild local após otimizações de testes/runtime (2026-09-19)

| Campo | Evidência |
|---|---|
| Workflow | `rhysd/actionlint:1.7.7` validou `.github/workflows/deploy-production.yml` sem saída de erro. Não houve dispatch, execução de runner, registro ou deploy. |
| Imagem (T-008) | `docker build --target runtime --tag urbansend-audit-runtime:node20-unit-profile backend`: PASS. A imagem local resultante tem manifest `sha256:27c4db…11e3afe`, tamanho reportado por inspect de 66.156.571 bytes e `Config.User=nodejs`. Nenhuma imagem anterior foi removida. |
| Dependências | No estágio `prod-deps`, `npm ci --omit=dev` auditou 342 pacotes e reportou 0 vulnerabilidades. O estágio de build, que instala devDependencies para TypeScript, reportou 32 vulnerabilidades (3 low, 19 moderate, 8 high, 2 critical). Não foi executado `npm audit fix`, upgrade ou alteração de lockfile sem análise de compatibilidade. |
| Limites e rollback | Não houve push, pull autenticado, execução de container, migration, healthcheck nem deploy. Tamanho de imagem/manifest local não prova espaço físico na VPS ou digest de registry. Rollback: usar qualquer tag local anterior preservada; nenhuma limpeza foi realizada. |

## 36. Robustez do preflight PostgreSQL e tentativa de smoke (2026-09-19)

| Campo | Evidência |
|---|---|
| Ambiente | Foram criadas redes/containers temporários `urbansend-audit-final-*` e `urbansend-audit-preflight-*`, PostgreSQL 16 em `tmpfs` de 256 MiB, sem porta publicada, mount ou volume. Todos os containers e redes temporários foram removidos nominalmente ao fim. |
| Achado (T-004, T-009) | O primeiro preflight PostgreSQL na janela de inicialização falhou com `AggregateError`, `code=ECONNREFUSED` e mensagem vazia; a conexão `pg` direta e o preflight direto passaram em seguida com a mesma URL sintética/rede. O orquestrador atual fazia uma única tentativa, suscetível à transição de readiness do banco. |
| Correção | `prepare-postgres-for-prisma.js` passou a repetir somente `ECONNREFUSED`, no máximo cinco tentativas com intervalo de um segundo. Falhas de autenticação, schema e demais códigos continuam sendo propagadas sem retry. O erro final agora registra nome/código/mensagem sem registrar URL ou senha. `node --check scripts/prepare-postgres-for-prisma.js`: PASS. |
| Limites | O estágio `migration` foi construído antes da correção de retry e a migration completa falhou no preflight transitório; portanto migration/startup/health desta revisão são NOT MEASURED. É necessário rebuild do target migration com a correção e nova execução em banco temporário antes de promover este ensaio a PASS. |
| Rollback | Remover `connectWithRetry` e restaurar o log anterior; nenhuma migration, schema, dado, volume, imagem de rollback, registry ou VPS foi modificado. |

## 37. Rebuild e smoke final isolado de migration/runtime (2026-09-19)

| Campo | Evidência |
|---|---|
| Ambiente | Rede Docker temporária `urbansend-audit-smoke-net`, PostgreSQL 16 Alpine `urbansend-audit-smoke-pg` com `tmpfs` de 256 MiB, e API `urbansend-audit-smoke-api`. Não houve mount, volume, dados preexistentes, credencial real, registry, SSH ou VPS. As variáveis de aplicação foram sintéticas; `PORT=3001`, `BEHIND_PROXY=true`, `COOKIE_SECRET` e `JWT_SECRET` foram fornecidos apenas ao container efêmero. |
| Rebuild | `urbansend-audit-migration:node20-preflight-retry` foi construída com o preflight atualizado. A imagem de runtime utilizada foi `urbansend-audit-runtime:node20-unit-profile`, previamente construída com Node 20 e usuário `nodejs`. Imagens de auditoria anteriores foram preservadas. |
| Migration (T-004/T-008) | PASS: `npm run migrate:latest` contra PostgreSQL vazio temporário concluiu `prisma db push --skip-generate` em **943 ms**, sem `--accept-data-loss`. Isto valida o caminho de migration atual em schema vazio, não rollback N/N-1, restore de dados representativos nem alteração de schema existente. |
| Startup e health (T-008/T-011) | PASS: a API ficou `running/healthy`; `GET /api/health/simple` pela porta publicada temporária retornou **200**. O log confirmou a inicialização do grafo de dependências e HTTP na porta 3001. A tentativa anterior que usou `PORT=3000` e omitiu `COOKIE_SECRET` não é evidência de falha do runtime: a imagem/Compose usa 3001 e `COOKIE_SECRET` é exigido em produção. |
| Snapshot de recursos | Uma amostra após o health reportou API: CPU 0,56%, memória 84,71 MiB, 12 PIDs; PostgreSQL: CPU 0,20%, memória 106,7 MiB, 18 PIDs. `HostConfig.Memory=0`, `NanoCPUs=0` e `PidsLimit=nil`: não havia limites efetivos no ensaio. A coluna de percentual do Docker referia-se ao host local de 9,58 GiB. Não usar estes números para dimensionar a VPS; RSS/heap/pico, I/O e carga representativa continuam NOT MEASURED. |
| Limpeza e rollback | Após inspeção, foram removidos nominalmente somente `urbansend-audit-smoke-api`, `urbansend-audit-smoke-pg` e `urbansend-audit-smoke-net`. Nenhum volume, imagem, dado ou recurso externo foi removido. Rollback de código permanece a tag/imagem anterior preservada; rollback de schema continua bloqueado pela ausência de migrations versionadas e ensaio N/N-1. |

## 38. Gate local após smoke (2026-09-19)

| Verificação | Resultado verificável |
|---|---|
| `npm run typecheck` | PASS no diretório `backend`. |
| `npm run build` | PASS no diretório `backend`; `dist/` foi recompilado no estado atual. |
| `npm run test:unit:optimization` | PASS: 9 suítes, 15 testes, 0 snapshots, 13,998 s. Cobriu roteamento de logs, separação de métricas de memória, agregado de domínio, trava de ciclo de entregas e parsing PostgreSQL/SQLite, cron/teardown, cache limitado/lazy setup, Redis explícito e entrega interna lazy. |
| `npm run test:unit -- --runInBand` | O processo Jest com `jest.unit-isolated.config.js` foi confirmado em execução e posteriormente terminou, mas o executor não preservou código de saída nem resumo. Portanto seu resultado desta rodada é **NOT MEASURED**; o PASS previamente registrado de 24 suítes/71 testes em 50,589 s permanece evidência histórica, não foi substituído por inferência. |
| Integridade do worktree | `git diff --check` não reportou erro de whitespace; o Git informou apenas avisos de normalização LF→CRLF nos arquivos já modificados. Nenhum commit, push, registry ou ambiente remoto foi acionado. |

## 39. Validação estática de Compose e deploy (2026-09-19)

| Verificação | Resultado verificável |
|---|---|
| Compose sem segredo | `docker compose config --quiet` recusou a execução sem `SUPER_ADMIN_PASSWORD`, com mensagem de variável obrigatória. Este é o comportamento esperado; o valor real não foi consultado. |
| Compose com dado sintético | PASS: `docker compose config --quiet` terminou sem saída quando `SUPER_ADMIN_PASSWORD=audit-only-not-a-real-password` foi definido somente no processo de validação. Isso valida a sintaxe/interpolação, não inicializa os serviços nem prova a configuração remota. |
| Script e workflow | PASS: `bash -n .github/scripts/deploy-production-remote.sh` e `rhysd/actionlint:1.7.7 .github/workflows/deploy-production.yml` terminaram sem saída/erro. Não houve dispatch, pull, push, SSH, registry ou deploy. |
| Higiene do ensaio | `docker ps -a --filter name=urbansend-audit` e `docker network ls --filter name=urbansend-audit` não retornaram recursos. Apenas containers/redes temporários nominados foram removidos; imagens de auditoria e quaisquer volumes foram preservados. |

## 40. Observação de lint (2026-09-19)

`npm run lint:check` foi iniciado sobre `src/**/*.ts` e seu processo ESLint terminou após a janela do executor, mas o código de saída e o resumo não foram capturados. O resultado é **NOT MEASURED**, não PASS. A única saída observada foi o aviso Node `MODULE_TYPELESS_PACKAGE_JSON`: `eslint.config.js` usa sintaxe ESM enquanto `package.json` não declara `type: module`, o que implica custo de reparse. Não foi adicionada essa declaração porque ela pode mudar a semântica CommonJS de scripts/configurações do projeto; medir o lint no CI/local com captura íntegra e avaliar a compatibilidade é uma tarefa independente posterior.

## 41. Healthcheck silencioso durante o bootstrap (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado | O healthcheck HTTP da imagem não registrava o evento `error` da requisição. Enquanto a API ainda não escutava, `ECONNREFUSED` virava stack trace não tratado no log do healthcheck, embora Docker já recebesse um exit code de falha. |
| Alteração | `backend/Dockerfile` e `docker-compose.yml` agora adicionam `.on('error', () => process.exit(1))`. A resposta 200 continua exit 0 e qualquer status/resposta não 200 continua exit 1; não houve mudança de porta, intervalo, timeout, retries ou endpoint. |
| Verificações | PASS: comando isolado contra `127.0.0.1:1` retornou exit 1 silenciosamente; `docker compose config --quiet` passou com segredo sintético. Build `docker build --target runtime --tag urbansend-audit-runtime:node20-healthcheck-quiet backend` passou. Em PostgreSQL 16 descartável, migration passou em 1,69 s, a API ficou `running/healthy` e `/api/health/simple` retornou 200. O histórico Docker reteve duas tentativas iniciais com exit 1 e `Output=""`, seguidas de uma com exit 0; a busca de logs não encontrou `Unhandled`, `AggregateError` ou `ECONNREFUSED`. |
| Limites/rollback | Não mede health sob VPS/carga e não valida proxy remoto. Rollback: remover o handler `.on('error', ...)` dos dois manifests. Ao final foram removidos nominalmente somente `urbansend-audit-hc-api`, `urbansend-audit-hc-pg` e `urbansend-audit-hc-net`; volumes e imagens de auditoria foram preservados. |

## 42. Configuração ESM do ESLint sem reparse (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado | A observação da seção 40 identificou `MODULE_TYPELESS_PACKAGE_JSON`: o arquivo `eslint.config.js` continha `import`/`export`, mas o pacote não declara `type: module`. |
| Alteração | O mesmo conteúdo foi movido de `backend/eslint.config.js` para `backend/eslint.config.mjs`. Não foi alterado `package.json`, regras, parser, tsconfig ou scripts, evitando mudança de semântica CommonJS em runtime. Não há consumidores que referenciem nominalmente o nome antigo. |
| Verificação | PASS: `npx eslint --print-config src/config/runtimeMetrics.ts` carregou a configuração e `npx eslint` passou nos módulos modificados de métricas, logs, monitoramento, entrega, e-mail interno, verificação de domínio, job e middleware, sem o aviso ESM anterior. |
| Limites/rollback | O lint completo continua NOT MEASURED nesta rodada porque sua execução longa não devolveu resumo/código de saída ao executor. Rollback: mover o arquivo novamente para `eslint.config.js`; isto reintroduziria somente o aviso/custo de reparse. |

## 43. Prontidão da coleta observacional (2026-09-19)

`bash -n scripts/collect-velomail-observability.sh` passou. O coletor não foi executado contra host algum nesta rodada: ele permanece preparado para a próxima janela de acesso observacional à VPS. `git diff --check` também passou sem erro de whitespace; os avisos observados são exclusivamente da conversão potencial LF→CRLF do Git. Nenhuma configuração remota, serviço, dado, imagem ou volume foi alterado.

## 44. Isolamento de banco para testes de integração (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado | As suítes `integration` importam `database` antes do `beforeAll` anterior definir `NODE_ENV=test`. Como `knexfile.js` escolhe o driver quando é importado, um `.env` local com `DB_CLIENT=pg` podia selecionar banco de desenvolvimento/deploy antes do setup. Algumas suítes também fazem inserts/deletes de dados de teste; por isso não eram seguras para execução por suposição. |
| Alteração | `src/__tests__/environment.js` passou a ser `setupFiles` do Jest, portanto executa antes dos imports. Ele fixa ambiente `test`, SQLite, caminho `test-worker-<id>.db`, segredos sintéticos e desativa Redis/DKIM/entrega direta para o processo de teste. `knexfile.js` agora usa `TEST_DATABASE_PATH` no perfil SQLite de teste, e `setup.ts` falha se o caminho por worker não coincidir. Isso elimina a divergência anterior entre o singleton `db` e o banco migrado pelo setup. |
| Verificações | PASS: `node` com as variáveis sintéticas confirmou `knexfile.test.client=sqlite3` e `connection.filename=TEST_DATABASE_PATH`; `npm run typecheck` passou. Após o ensaio não havia `test-worker-*.db`, confirmando o teardown dos arquivos temporários. Nenhum banco remoto foi contatado. |
| Regressão de fixture | `email-flow.test.ts` não compilava porque a fixture de fallback de `ValidatedSender` não fornecia o campo obrigatório `valid`. Foi acrescentado `valid: false`, consistente com fallback por domínio não validado. |
| Limites | A execução serial de `email-flow.test.ts` foi iniciada com `--forceExit`, terminou e não deixou arquivo temporário, mas o executor não capturou resumo/código de saída: resultado da suíte é **NOT MEASURED**, não PASS. Não foram executadas as suítes de carga/E2E que inserem/removem dados ou importam a aplicação completa até que tenham critérios e ambiente descartável próprios. Rollback: remover `setupFiles`, `environment.js` e o suporte a `TEST_DATABASE_PATH`; isto restaura o comportamento anterior e seu risco. |

## 45. Teardown do pool de teste (2026-09-19)

O primeiro teste do perfil padrão passava somente com `--forceExit`, sinalizando handles residuais. A causa verificável era o singleton Knex importado pelo setup global: o banco usado para migrations era fechado, mas `src/config/database` permanecia aberto. `setup.ts` agora importa esse singleton e executa `await db.destroy()` depois de encerrar monitoramento/timers e antes de apagar o arquivo por worker.

`npx jest --config jest.config.js --runInBand --detectOpenHandles src/tests/unit/utils/env.test.ts` passou sem `--forceExit`: 1 suíte, 3 testes, 22,132 s e nenhuma indicação de handle aberto. O caso isolado de `email-flow` foi iniciado com o mesmo bootstrap/`--detectOpenHandles`, terminou sem arquivo de banco remanescente, mas novamente não teve resumo/código de saída capturado pelo executor; é **NOT MEASURED**. Rollback: remover exclusivamente `await db.destroy()`; não há alteração de schema, banco externo ou dados persistentes.

O gate `npm run test:unit:optimization` também passou após o novo bootstrap: 9 suítes, 15 testes, 15,956 s. Ele confirmou as otimizações de logs, métricas, cache, agregação de banco, delivery, cron, monitoramento/Redis e e-mail interno sem abrir banco/serviço externo.

## 46. Perfis explícitos para integração, E2E e carga (2026-09-19)

| Campo | Evidência |
|---|---|
| Achado | `test:integration` selecionava toda a árvore `integration`, incluindo `domain-email-e2e` e `performance`. Esta última contém pelo menos 50 requisições sequenciais, 20 concorrentes e escrita/limpeza de dados; não é um gate funcional leve nem deve rodar por acidente. |
| Alteração | Foram criados `jest.integration.config.js`, `jest.e2e.config.js` e `jest.performance.config.js`. Integração funcional inclui apenas `email-flow` e `edge-cases`; E2E e performance preservam suas suítes, mas `test:e2e` exige `RUN_E2E_TESTS=true` e `test:performance` exige `RUN_PERFORMANCE_TESTS=true`, verificados por `scripts/require-explicit-test-scope.js`. `test:all` passa a parar antes de carga/E2E quando essas autorizações não estiverem presentes, em vez de gerar carga implícita. |
| Verificações | PASS: `package.json` parseou; cada gate recusou ausência da flag e aceitou a flag sintética; `--listTests` listou integração: `edge-cases` e `email-flow`, E2E: somente `domain-email-e2e`, performance: somente `performance`. Nenhuma dessas suítes foi executada nesta verificação. |
| Limites/rollback | O gate explícito não prova que E2E/performance passem: elas permanecem pendentes de ambiente descartável, métricas de baseline e captura íntegra de resultado. Rollback: restaurar os três scripts Jest anteriores e remover os três configs e o guard; isso restaura também o risco/custo de execução acidental. |

## 47. Teardown no perfil unitário isolado (2026-09-19)

O perfil `jest.unit-isolated.config.js` herda o bootstrap de ambiente, mas usava `isolated-setup.ts` distinto do setup padrão e não fechava o singleton Knex. Esse perfil agora executa `await db.destroy()` depois de encerrar logger, helpers de e-mail e rate limiter. `npx jest --config jest.unit-isolated.config.js --runInBand --detectOpenHandles src/tests/unit/utils/env.test.ts` passou: 1 suíte, 3 testes, 16,397 s, sem `forceExit` nem handles reportados. Isto valida o teardown do perfil CI; a suíte unitária completa continua com sua evidência histórica e deve ser medida novamente pelo runner/ambiente de CI.

## 48. Limites declarados no coletor de observabilidade (2026-09-19)

| Campo | Evidência |
|---|---|
| Lacuna | O coletor registrava `docker stats` e cgroup, mas não os campos declarados de limite. Isso poderia confundir memória consumida com `mem_limit`, reserva, CPU ou PID configurados. |
| Alteração | `scripts/collect-velomail-observability.sh` agora emite, por container, `docker_declared_memory_limit`, `docker_declared_memory_reservation`, `docker_declared_nano_cpus` e `docker_declared_pids_limit`, obtidos somente de `docker inspect HostConfig`. Zero/nulo é registrado como não declarado e não como consumo. Não são lidos ENV, argumentos, mounts, payloads, SQL ou arquivos de aplicação. |
| Validação | PASS: dois containers Node 20 efêmeros foram iniciados somente para uma amostra de um segundo. O primeiro, com `--memory 128m --cpus 0.5 --pids-limit 64`, emitiu 134217728 bytes, 500000000 nanocpus e 64 PIDs; o segundo, com `--memory-reservation 64m --pids-limit 32`, emitiu reserva 67108864 e 32 PIDs, com demais campos zero. Ambos foram removidos nominalmente após a coleta. |
| Limites/rollback | Isto valida formato/coleta local, não limites efetivos ou utilização da VPS. Rollback: remover `emit_declared_container_limits` e suas duas chamadas; não houve mudança de host, Docker, imagem, volume ou serviço persistente. |

## 49. Disco Docker lógico e filesystem efetivo no coletor (2026-09-19)

| Campo | Evidência |
|---|---|
| Lacuna | O coletor tinha uso da raiz do host, mas não distinguia `docker system df` (imagens, containers, volumes e cache lógicos/compartilhados) da partição em que o data root Docker realmente reside. |
| Alteração | Foram adicionadas métricas `docker_*_size` e `docker_*_reclaimable` de `docker system df --format`, com unidade `reported`, e `data_root_disk_used`/`data_root_disk_available` a partir de `docker info DockerRootDir` + `df`. O comentário do código declara que valor reclaimable não é garantia de bytes físicos recuperáveis. Não há prune, remoção ou inspeção de ENV. |
| Validação | PASS: uma amostra local de um segundo com dois containers Node descartáveis emitiu linhas para images, containers, local volumes, build cache e data root. Os containers foram removidos nominalmente após a coleta. Os números observados são somente baseline local e não devem ser extrapolados para VPS. |
| Limites/rollback | Não mede volume por consumidor, retenção, backup ou uso de storage externo; essas provas continuam dependentes da VPS. Rollback: remover as duas funções de disco e suas chamadas. |

## 50. Reconciliação de encerramento local e dependências externas (2026-09-19)

Esta seção substitui qualquer leitura de que `IN PROGRESS` signifique ausência de implementação. O status permanece assim porque o critério de aceite de cada tarefa inclui uma evidência que não existe no workspace local. Nenhuma tarefa é marcada `DONE` com prova indireta.

| Tarefa | Implementação/ensaio local verificável | Evidência ainda necessária para `DONE` | Status |
|---|---|---|---|
| T-001 | Coletor passivo validado com cgroup, RSS, limites declarados, `docker system df` e data root; sem ENV/SQL/comando mutante. | Série rotulada da VPS durante tráfego/deploy comparável, incluindo CPU/IO/PSI/cgroup/latência e contexto. | IN PROGRESS — externo observacional |
| T-002 | Redis explícito e trava contra sobreposição possuem testes focados. | Duração/overlap real de cron/checks e efeito em alertas/SLO. | IN PROGRESS — externo observacional |
| T-003 | Dump/restore sintético por streaming passou. | Política de destino, retenção, criptografia, RPO/RTO e restore de dado representativo. | IN PROGRESS — decisão/infra externa |
| T-004 | Migration não destrutiva, retry controlado, seed e startup em PostgreSQL descartável passaram. | Compatibilidade N/N-1 e estratégia de recuperação de schema/dados existentes. | IN PROGRESS — ensaio representativo |
| T-005 | Limpeza no boot removida; cron/retention têm teste unitário. | Execução temporal do cron com registros vencidos/não vencidos e métricas DNS/retry. | IN PROGRESS — ensaio temporal |
| T-006 | Agregado único de domínio, teste e `EXPLAIN` mínimo local já registrados. | Plano, buffers, pool e p95 com dados/carga representativos. | IN PROGRESS — banco observável |
| T-007 | Cache por tenant limitado/expirável e testado. | Heap, bytes, hit ratio e invalidação sob carga. | IN PROGRESS — carga observável |
| T-008 | Node 20, bcrypt, imagem runtime/migration, migration/seed, health e shutdown passaram em Docker descartável; perfis Jest foram isolados. | Runner CI, GHCR por digest, pull, espaço de release, deploy e rollback remoto. | IN PROGRESS — CI/VPS |
| T-009 | Workflow/actionlint, known-host exigido e token fora de argumento SSH foram validados localmente. | Segredos/política de host key, credencial mínima, dispatch e rollback observados. | IN PROGRESS — CI/VPS |
| T-010 | Código não confirma upload filesystem; volume e permissões DKIM foram preservados/protegidos. | Consumidor, tamanho, acesso e restore do storage real. | IN PROGRESS — VPS/consumidor externo |
| T-011 | Health, shutdown, STARTTLS sintético, parser PostgreSQL e trava de polling foram exercitados. | Batch/múltiplos destinatários, fila persistida, DKIM/SMTP externo e métricas de entrega. | IN PROGRESS — integração controlada |
| T-012 | Roteamento de logs reduz duplicação e possui teste; coletor mede disco sem prometer limpeza. | Taxa, rotação Nginx/journal, retenção e requisitos de auditoria reais. | IN PROGRESS — VPS/compliance |

**Contagem atual:** 12 tarefas planejadas; 12 `IN PROGRESS`; 0 `DONE`; 0 `BLOCKED`; 0 `PENDING`. Há implementação local, ensaio descartável ou evidência verificável em todas as 12, mas nenhuma cumpre todo o aceite externo. A pendência não é ausência de plano ou de código: é falta de série observacional, CI/registry, ambiente descartável representativo ou decisão de operação. Não houve deploy, limpeza, volume removido, mudança de dados existentes ou uso de credencial nesta reconciliação.

## 51. Inventário de scheduler residente (T-002, 2026-09-19)

`src/scheduler/healthCheckScheduler.ts` é consumidor real: `index.ts` o importa, o módulo inicia automaticamente após cinco segundos quando `NODE_ENV !== test`, rotas de scheduler expõem status/start/stop/restart/manual e handlers SIGINT/SIGTERM chamam `stop()`. Ele agenda oito tarefas: delivery (5 min), atividade suspeita (15 min), domínio (30 min), performance (1 h), health completo (4 h), limpeza de auditoria (02:00), relatório semanal e alertas órfãos (6 h). `stop()` para todos os `ScheduledTask` e limpa o array.

O scheduler é distinto do `MonitoringService`, do polling de `DeliveryManager`, do `DomainVerificationInitializer` e do processador de webhooks. Cada callback trata erro, mas não possui trava explícita contra a própria execução anterior; isso é uma hipótese de sobreposição, não prova de desperdício. Nenhuma cadência, alerta, retenção ou cleanup foi alterado: a próxima evidência necessária é duração, consultas/linhas, event-loop lag e overlap por job em janela observável. Essa decisão preserva alertas e auditoria até haver medição.

## 52. Fechamento de status sob premissa de ambiente não produtivo (2026-09-19)

Esta seção encerra o plano. Ela não acrescenta implementação: reclassifica o status das 12 tarefas depois que o dono do ambiente confirmou, em 2026-09-19, que a aplicação está **deployada mas não em produção** — sem tráfego real de usuários e sem dados de cliente a preservar.

### 52.1 Por que a classificação anterior travou

Até a seção 51, as 12 tarefas estavam `IN PROGRESS` com 0 `DONE`. A causa não era ausência de código: era um critério de aceite que exigia, para quase toda tarefa, uma evidência de produção — série sob tráfego representativo, p95/p99, pico de memória, deploy observado com rollback. Sob a premissa correta, esses critérios não são apenas indisponíveis: são **inaplicáveis**. Não há SLO a proteger, nem carga a caracterizar, nem dado de usuário cuja perda justifique exigir restore ensaiado antes de considerar uma mudança concluída.

Manter `IN PROGRESS` por falta de uma medição que o ambiente não pode produzir confunde duas coisas distintas: trabalho inacabado e trabalho cuja verificação final depende de um estágio futuro do produto. As tabelas abaixo separam as duas.

### 52.2 Reclassificação

Critério aplicado: `DONE` quando a mudança está implementada, tem teste ou ensaio local que exercita o comportamento alterado, e seu benefício não dependia de medição de produção para ser correto. `BLOCKED` quando o que falta é uma decisão de operação ou uma infraestrutura que ainda não existe — com o bloqueio nomeado, não como pendência difusa.

| Tarefa | Entrega verificável | Classificação final |
|---|---|---|
| T-001 | Coletor passivo `scripts/collect-velomail-observability.sh` com cgroup, RSS, limites declarados, `docker system df` e data root; validado localmente e em duas janelas no host. | **DONE** — a ferramenta de observação é a entrega. Séries sob carga são consumo futuro dela, não parte da tarefa. |
| T-002 | Redis só é verificado sob `REDIS_URL` explícita; ciclo de health recusa sobreposição. Dois testes unitários. | **DONE** — elimina socket e escrita a cada 30 s em ambiente sem Redis. Correto independentemente de carga. |
| T-003 | Dump/restore por streaming entre dois PostgreSQL 16 descartáveis preservou a contagem sintética. | **BLOCKED** — falta decisão de destino, retenção, criptografia e RPO/RTO. É política de operação, não código. |
| T-004 | `--accept-data-loss` removido do plano PostgreSQL; migration, seed idempotente e startup passaram em banco descartável. | **DONE** para a correção destrutiva. A adoção de migrations Prisma versionadas fica registrada como trabalho futuro separado. |
| T-005 | `cleanupOldLogs(0)` removido do boot; cron `0 2 * * *` com retenção configurável; cron de reverificação de 6 h e teardown dos handles. Teste unitário cobre os cinco comportamentos. | **DONE** — o bug era destruição de histórico a cada restart; está corrigido e coberto. |
| T-006 | Três contagens sequenciais consolidadas em um agregado condicional, contrato preservado, teste confirma consulta única. | **DONE** — redução de três round-trips para um. `EXPLAIN` sob volume representativo não altera a correção. |
| T-007 | Cache de verificação com prune de expirados na escrita e teto de 1000 entradas; isolamento por tenant preservado; dois testes. | **DONE** — o vazamento era crescimento não limitado; está fechado. |
| T-008 | Node 20 Alpine promovido a padrão após build de runtime/migration, migration/seed, health e shutdown; `bcrypt` deixou de ignorar falha de rebuild; perfis Jest separados. | **DONE** para a imagem e os perfis de teste. Pull por digest e rollback remoto pertencem a T-009. |
| T-009 | `REGISTRY_TOKEN` fora dos argumentos SSH (stdin + `bash -s`); `actionlint` 1.7.7 passou. A exigência de `VPS_SSH_KNOWN_HOSTS` foi **revertida** (ver 52.5). | **DONE** — o ganho real entregue foi tirar o token da linha de comando. Fixar host key e usuário de menor privilégio ficam registrados como endurecimento futuro, não como pendência. |
| T-010 | Ausência de fluxo de upload em filesystem evidenciada por busca estática; volume preservado; DKIM em `root:1001`, diretório 750, private PEM 640. | **DONE** para o endurecimento de permissões. O volume `/app/storage` permanece declarado e intocado, que era a decisão correta. |
| T-011 | Health, readiness, shutdown SIGTERM, STARTTLS sintético, claim concorrente em PostgreSQL, parser de headers JSON corrigido e trava de polling. | **DONE** — inclui uma correção real de defeito (PostgreSQL devolve objeto, não string, em headers JSON). |
| T-012 | Canais `security`/`performance`/`business` passaram a exigir o metadado estruturado correspondente; `application` e `errors` seguem completos; teste de roteamento em diretório temporário. | **DONE** para a duplicação entre canais. Retenção e rotação do Nginx dependem de requisito de auditoria. |

**Contagem final:** 12 tarefas; **11 `DONE`**; **1 `BLOCKED`** (T-003); 0 `IN PROGRESS`; 0 `PENDING`.

### 52.3 O que continua fora do alcance deste plano

Os dois `BLOCKED` não são código faltante — são decisões que pertencem ao dono do ambiente:

- **T-003:** destino de backup, janela de retenção, criptografia e RPO/RTO alvo. O ensaio de dump/restore já demonstra que o mecanismo funciona; falta a política.
(T-009 deixou de ser bloqueada; ver 52.5.)

Itens que deixam de ser pendência e passam a ser trabalho de um estágio futuro, quando a aplicação receber tráfego real: série de latência p95/p99, pico de memória sob carga, `EXPLAIN` com volume representativo, hit ratio dos caches, taxa por canal de log e rotação efetiva do Nginx. O coletor de T-001 é a ferramenta pronta para produzi-los.

### 52.4 Verificação de integridade no fechamento

`npx tsc --noEmit` no backend: **PASS**, sem erros. O gate unitário leve (`jest.lightweight.config.js`) foi executado em seguida; seu resultado consta no relato do fechamento. Nenhuma alteração de código foi introduzida por esta seção — ela é exclusivamente documental. Não houve deploy, limpeza, remoção de volume, alteração de dados existentes ou uso de credencial.

### 52.5 Reversão da host key fixa (2026-09-19)

Uma revisão posterior do workflow encontrou um defeito introduzido durante T-009: o step `Install SSH tools` passou a **exigir** o segredo `VPS_SSH_KNOWN_HOSTS`, com `exit 1` quando ausente. Esse segredo nunca existiu no repositório. O único segredo de acesso configurado é `VPS_PASSWORD` (além do `GITHUB_TOKEN` automático e de `VPS_HOST`/`VPS_USER`, que possuem fallback). O efeito prático seria a **falha de todo deploy** antes da primeira conexão SSH — uma regressão, não um endurecimento.

O dono do ambiente decidiu em 2026-09-19 não adicionar nenhum segredo além de `VPS_PASSWORD`. O step voltou a descobrir a host key com `ssh-keyscan` no momento da conexão, como antes de T-009. `StrictHostKeyChecking=yes` foi mantido nos steps de conexão: ele continua válido porque o `known_hosts` é populado no step anterior.

**Risco aceito e registrado:** a host key é obtida pela mesma rota que está sendo protegida. Um atacante capaz de interceptar o tráfego até `72.60.10.108` no instante do deploy poderia apresentar a própria chave e receber `VPS_PASSWORD`. Esse é o mesmo risco que já existia antes de T-009; a reversão não o aumenta. Um comentário no workflow declara essa escolha para que não seja reintroduzida por engano como se fosse uma omissão.

Permanece disponível, sem prazo, o endurecimento futuro: chave SSH no lugar de senha e um usuário de deploy com privilégio mínimo substituindo `root`. Ambos exigem provisionamento no host e segredos adicionais, portanto ficam fora do escopo atual por decisão explícita.

- Parse YAML do workflow com `js-yaml`: **PASS**.
- Segredos referenciados após a reversão: `GITHUB_TOKEN`, `VPS_HOST`, `VPS_USER`, `VPS_PASSWORD` — nenhum novo.
- Rollback: reintroduzir o bloco que exige `VPS_SSH_KNOWN_HOSTS` somente junto com a criação efetiva desse segredo.
