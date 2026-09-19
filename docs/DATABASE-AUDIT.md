# Auditoria de Banco de Dados — fase somente auditoria

Data da auditoria: 2026-09-17  
Escopo: repositório local e evidências históricas registradas em `docs/VPS-OPT-INVENTORY.md` e `docs/VPS-OPT-BASELINE.md`. Nenhuma consulta foi executada no banco nesta etapa e nenhum dado, serviço, configuração ou esquema foi alterado.

## Critério e limitações

- **AUDITED** significa que o item e suas evidências foram analisados; não significa que foi corrigido.
- Configuração declarada, comportamento efetivo e medição são separados abaixo. Métrica sem coleta é **NOT MEASURED**.
- O acesso atual não alcança a VPS/PostgreSQL. Assim, `EXPLAIN`, `pg_stat_statements`, `pg_stat_activity`, locks, I/O, autovacuum, bloat, tamanhos por tabela/índice, tempos de consulta, espera de pool, latência e restore são **NOT MEASURED**.
- Não se conclui que uma tabela, índice, integração ou consumidor externo seja dispensável pela ausência de uma referência local.

## Topologia e baseline conhecido

| Item | Declarado | Efetivo/medido | Evidência | Status |
|---|---|---|---|---|
| Banco principal | PostgreSQL 16 Alpine, serviço `ultrazend-postgres`, rede Docker interna | Instância observada historicamente; 20 MB lógicos, 89 tabelas, 2 usuários e 9–14 conexões ativas de máximo 50 no snapshot de repouso | `docs/VPS-OPT-BASELINE.md`; `docker-compose.yml` | AUDITED |
| Aplicação consumidora | API Node/Express em `ultrazend-api`, com Knex em runtime | Uma instância residente foi observada; não há medição de réplicas externas, administração simultânea ou pico | `backend/knexfile.js:69-80`; inventário CNT-02/PRC-01 | AUDITED |
| Pool principal | Knex: mínimo 2, máximo 12; acquire 120 s, create 60 s, idle 300 s, destroy 10 s | Limites efetivos do driver, fila e conexões por processo: NOT MEASURED. O histórico registra que teste com máximo 5 impediu o boot antes de escutar a porta | `backend/knexfile.js:69-80`; baseline histórico | AUDITED |
| Memória PostgreSQL | `shared_buffers=64MB`, `work_mem=4MB`, `max_connections=50`, `effective_cache_size=192MB` | `SHOW` histórico confirmou `shared_buffers`, `work_mem` e `max_connections`; `effective_cache_size` permanece NOT VERIFIED efetivamente | `docker-compose.yml`; `docs/VPS-OPT-BASELINE.md` | PENDING |

`effective_cache_size` é estimativa para o planejador, não reserva de RAM. `work_mem` pode ser aplicado por operação de sort/hash e por sessão concorrente; não é seguro derivar valores por percentual fixo de memória ou pelo consumo em repouso.

## Itens auditados

| ID | Ambiente e evidência; achado | Impacto | Proposta; risco e dependências | Aceite; rollback; métrica esperada | Cobertura |
|---|---|---|---|---|---|
| DBA-001 | Produção. CNT-02/DB-01 e `backend/knexfile.js:69-80`: PostgreSQL interno atende a API; pool Knex 2–12. Deploy executa Prisma e seed como processos transitórios, além de conexões administrativas/externas ainda não censadas. | A capacidade agregada não pode ser inferida de um único pool: instâncias, jobs e administração concorrem por 50 conexões. | Inventariar conexões por `application_name`, usuário e origem durante carga representativa antes de mudar pool ou `max_connections`. Risco: reduzir cedo pode produzir fila/timeouts; elevar cedo amplia RAM e contenção. Depende de acesso de leitura à VPS. | Aceite: soma de máximos simultâneos, p95 de espera e headroom documentados. Rollback: restaurar os valores anteriores versionados. Métrica: conexões ativas/ociosas, espera de pool e erros de aquisição — NOT MEASURED. | PENDING |
| DBA-002 | Produção. Baseline: PostgreSQL usava cerca de 61,67 MiB RSS no snapshot; API 94,91 MiB. Limites do container são 256 MiB/1 CPU para o banco. Não há pico, OOM ou throttling por banco medidos. | Alterar buffers, conexões ou memória com repouso como base pode provocar OOM ou degradar consulta concorrente. | Construir orçamento agregado host + API + PostgreSQL + jobs simultâneos. Só então testar parâmetros num ambiente descartável com carga representativa. Risco: pressão de memória e I/O. Depende de observabilidade de carga. | Aceite: sem OOM/restart/throttling e p95 de consultas não piora no cenário de pico. Rollback: parâmetros/limites atuais. Métrica: RSS, cache, swap, CPU, p95/p99 — NOT MEASURED. | PENDING |
| DBA-003 | Produção. `docker-compose.yml` declara os quatro parâmetros acima; baseline confirma três com `SHOW`. Nenhuma evidência de `pg_settings` completo, configuração de checkpoint/WAL, autovacuum ou timeouts. | A configuração efetiva pode divergir da declarada; parâmetros ausentes impedem concluir sobre RAM, CPU e I/O. | Coletar somente leitura `pg_settings` e `pg_file_settings`, registrando origem de cada parâmetro; analisar `work_mem` pelo número real de nós concorrentes. Risco: mudança posterior sem validar origem pode não surtir efeito. | Aceite: tabela declarado/efetivo/origem para parâmetros críticos. Rollback: não aplicável à coleta; futuras mudanças retornam ao valor/origem anterior. Métrica: configuração efetiva — parcialmente NOT VERIFIED. | PENDING |
| DBA-004 | Produção. `deploy-vps.sh` executa `npx prisma db push --accept-data-loss`, enquanto `backend/src/migrations/A67_create_performance_optimization_indexes.js` e demais Knex migrations não são o caminho comprovado de produção. Histórico registra aviso de coluna com potencial perda de dados. | Há risco de mudança de esquema sem trilha migratória revisável e sem backup/restore comprovado; os índices do A67 não podem ser assumidos no banco. | Bloquear otimizações estruturais até confirmar fluxo de migration, backup pré-deploy e plano de recuperação. Avaliar migrações versionadas compatíveis em ambiente descartável; não aplicar agora. Risco: indisponibilidade ou perda de dados se feito sem transição. | Aceite: startup, consulta, migration e seed passam separadamente em cópia descartável; backup restaura antes de mudança. Rollback: backup restaurável e migration reversível validada. Métrica: tempo de migration/restore e erros — NOT MEASURED. | BLOCKED |
| DBA-005 | Código. `backend/prisma/schema.prisma` declara diversos `@@index`; A67 contém criação de índices por SQL bruto e `down` com `DROP INDEX`. Catálogo real (`pg_indexes`) e uso (`pg_stat_user_indexes`) não foram lidos. | Um índice declarado pode não existir; índice não usado consome escrita/disco, e índice faltante prejudica leitura. Aplicar A67 cegamente pode duplicar ou falhar. | Comparar schema aplicado, catálogo e planos das consultas quentes; propor apenas índices justificados por plano e taxa de escrita. Para eventual índice grande, planejar operação concorrente fora de transação conforme versão/estratégia validada. Risco: bloqueios, disco temporário e regressão de escrita. | Aceite: `EXPLAIN (ANALYZE, BUFFERS)` representativo melhora sem regressão de gravação. Rollback: migration específica e reversível, executada somente após backup; não executar `DROP` nesta auditoria. Métrica: tamanho/scan de índice, buffers, latência — NOT MEASURED. | PENDING |
| DBA-006 | Código. `backend/src/routes/emails.ts` (aprox. linhas 430–560) pagina listagem com `emails.*`, seguida de `count` e consulta de estatísticas; usa offset e filtros/ordenação variados. | Três consultas por solicitação e seleção ampla podem aumentar CPU/I/O; offset pode piorar com páginas profundas. Não há prova de lentidão ou de quais campos a UI consome. | Capturar rota, cardinalidade e planos com parâmetros representativos; confirmar contrato da UI antes de selecionar colunas ou introduzir cursor. Risco: paginação/ordem incompatível e dados omitidos. | Aceite: contratos da API preservados, p95 e leituras/buffers melhoram em páginas rasas e profundas. Rollback: manter endpoint/consulta anterior por release reversível. Métrica: p50/p95, rows/buffers — NOT MEASURED. | PENDING |
| DBA-007 | Código. `backend/src/routes/segmentation.js` (aprox. linhas 75–150): após paginar segmentos, `Promise.all` consulta `contact_segments` para cada segmento dinâmico. A página padrão é 20; uso real e cardinalidade são desconhecidos. | Candidato estático a N+1 limitado pela página, mas paralelismo pode elevar conexões e pressão no pool. | Medir frequência, número de segmentos dinâmicos e planos; só então comparar agregação/batch com a implementação atual. Risco: semântica de critérios ou isolamento de tenant alterados. | Aceite: mesmos resultados/autorização, menos consultas por requisição e sem aumento da fila do pool. Rollback: rota anterior. Métrica: queries/requisição, p95, espera de pool — NOT MEASURED. | PENDING |
| DBA-008 | Código. `backend/src/routes/analytics.ts` (aprox. linhas 430–650) possui `select('*')`, busca `LIKE '%…%'`, paginação offset, `count` separado e agregação com `LEFT JOIN`, `COUNT(DISTINCT)` e expressão de domínio. | Candidato a leitura/CPU alta conforme volume; não há evidência de rota lenta, uso externo ou plano. | Priorizar observabilidade e `EXPLAIN` com dados anonimizados/representativos; validar necessidade de campos, busca e consistência antes de índice, cache ou paralelismo. Risco: índice inadequado aumenta escrita/disco; cache pode vazar escopo de autorização. | Aceite: mesmas respostas e filtros, p95 e buffers melhoram sob carga representativa. Rollback: consulta/índice isolado e reversível. Métrica: duração, buffers, temp files, CPU — NOT MEASURED. | PENDING |
| DBA-009 | Código. `backend/src/services/monitoringService.ts:~688-704` remove em paralelo métricas antigas de quatro tabelas; retenção declarada é 24 h, healthcheck a cada 30 s e limpeza horária. Inserts de health/system/request metrics também são declarados no serviço. | Telemetria pode gerar I/O e deletes frequentes; sem contagem de linhas, índices e plano não se estima custo nem se confirma que a limpeza atua nas colunas esperadas. | Medir volume por tabela, duração/bloqueios dos deletes e índices das colunas de retenção antes de alterar frequência, lote ou retenção. Risco: reduzir retenção remove evidência operacional; batching errado aumenta lock/I/O. | Aceite: retenção contratada preservada, sem crescimento líquido inesperado, p95 do job e lock wait aceitáveis. Rollback: parâmetros/rotina atuais. Métrica: linhas apagadas, WAL, duração e locks — NOT MEASURED. | PENDING |
| DBA-010 | Produção. Não há evidência coletada de transações longas, `pg_locks`, deadlocks, `idle in transaction`, `statement_timeout`, `lock_timeout` ou `idle_in_transaction_session_timeout`. | Não é possível atribuir latência a lock, pool ou CPU; ajustar timeout sem classificar fluxos pode interromper operações legítimas. | Fazer captura de leitura e amostragem curta em horário representativo, sem consultas pesadas; mapear transações a rotas/jobs. Risco: observação incompleta de picos. | Aceite: relatório por tipo de espera/transação e limite proposto com consumidores afetados. Rollback: timeout anterior. Métrica: lock wait, deadlocks, transações longas — NOT MEASURED. | PENDING |
| DBA-011 | Produção. Histórico de cron não encontrou backup de banco; `backup-system.sh` existe no repositório, mas não está comprovadamente instalado e não comprova `pg_dump`/restore. | Sem RPO/RTO e restore testado, não é seguro propor índices, retenção, migrações ou redução de dados. | Definir propriedade, destino, criptografia, retenção, teste de restauração e backup pré-deploy sem expor segredos. Risco: implementação futura pode afetar I/O/custo; nesta etapa não executar backup ou limpeza. | Aceite: restore verificável em ambiente isolado e RPO/RTO documentados. Rollback: manter artefatos de backup anteriores até a validação. Métrica: idade do último backup, duração e tempo de restore — NOT MEASURED. | BLOCKED |
| DBA-012 | Código. Há cache em processo no monitoramento (`backend/src/services/performanceMonitoring.ts`); Redis/Bull não foram observados no runtime. Não foi encontrada prova suficiente para classificar Redis como removível ou para introduzir cache de consultas. | Cache indiscriminado pode aumentar RAM, expor dados entre escopos ou produzir inconsistência. | Para cada futuro cache, definir chave com autorização/tenant, TTL, invalidação, limite de memória e métrica de hit ratio; manter sem mudança agora. Risco: vazamento de dados e dados obsoletos. | Aceite: testes de isolamento/invalidação e limite de memória; rollback: desligamento por configuração previamente validada. Métrica: hit ratio, bytes e p95 — NOT MEASURED. | AUDITED |
| DBA-013 | Deploy. `deploy-vps.sh` executa `prisma db push` e depois `npm run db:seed`; `backend/prisma/seed.ts` é consumidor do banco transitório. Não há medição de duração, conexões ou idempotência em produção. | Seed pode competir pelo pool/CPU/I/O e ser requisito real de dados de referência; removê-lo ou isolá-lo sem prova pode quebrar deploy. | Confirmar seeding necessário, idempotência, permissões e dependências em ambiente descartável. Considerar job separado apenas com mesma imagem/cliente/engine e recuperação comprovada. | Aceite: migration, seed, startup e consulta ao banco aprovados separadamente. Rollback: fluxo atual e backup validado. Métrica: duração, conexões, linhas afetadas — NOT MEASURED. | PENDING |

## Plano mínimo de coleta futura, somente leitura

Quando houver acesso autorizado à VPS, coletar em janela representativa e com duração registrada: versão/`pg_settings`; conexões e estados por origem; espera do pool da aplicação; `pg_stat_database`; tabelas/índices e dead tuples; autovacuum; locks/transações; `pg_stat_statements` se estiver habilitado; e `EXPLAIN (ANALYZE, BUFFERS)` apenas para consultas representativas e aprovadas. Não executar `ANALYZE` manual, alteração de parâmetros, limpeza, migration, DDL ou consultas de varredura pesada durante a coleta.

## Matriz de cobertura: inventário → auditoria

| Item do inventário | Evidência examinada | Status |
|---|---|---|
| ARQ-01 | Topologia em `VPS-OPT-INVENTORY.md`; serviços e rede declarados | AUDITED |
| APP-01 | API/Knex, rotas e schema Prisma examinados | PENDING |
| APP-02 | Frontend estático não abre pool direto comprovado | NOT APPLICABLE — sem consumidor direto de banco identificado; API permanece dependência indireta |
| APP-03, APP-04 | Fluxos e consumidor externo não medidos | PENDING |
| CNT-01 | Nginx não possui conexão direta comprovada ao PostgreSQL | PENDING |
| CNT-02 | PostgreSQL, limite e baseline histórico examinados | AUDITED |
| CNT-03 | Migration usa `db push` sem recuperação comprovada | BLOCKED |
| PRC-01 a PRC-04 | API, server, timers e monitoramento podem emitir consultas; perfil real não medido | PENDING |
| PRC-05 a PRC-08 | Jobs/seed/migration e seus consumidores de banco não medidos | PENDING |
| PRC-09 a PRC-11 | Redis/Bull/MinIO não são banco PostgreSQL observado | NOT APPLICABLE — avaliar em auditorias próprias de runtime/storage |
| DB-01 a DB-03 | Postgres 16, tamanho, tabelas e conexões históricas revisados | AUDITED |
| DB-04 a DB-06 | Integridade de schema, migration e seed depende de backup/restore | BLOCKED |
| DB-07 | Schema/índices declarados e A67 revisados; catálogo real ausente | PENDING |
| DB-08 | Parâmetros conhecidos e semântica de memória analisados | AUDITED |
| DB-09 | Backup/restauração não comprovados | BLOCKED |
| DB-10 | Métricas de tamanho/conexões históricas registradas, sem pico | AUDITED |
| DB-11 | Lock, I/O, manutenção e consultas lentas não coletados | BLOCKED |
| VOL-01 | Volume PostgreSQL é persistência crítica, conforme inventário | AUDITED |
| VOL-03, VOL-04 | Logs/arquivos podem conter evidência, retenção real não medida | PENDING |
| BLD-01 | Imagem contém cliente Prisma/Knex; compatibilidade de schema depende de deploy | PENDING |
| CI-01 | Fluxo GitHub Actions → imagem → SSH/deploy revisado | AUDITED |
| SVC-01 | Saúde da aplicação faz `SELECT 1`; frequência/custo real não medidos | PENDING |
| SVC-02 | Healthcheck PostgreSQL e dependência interna revisados | AUDITED |
| SVC-03 | WebSocket sem acesso direto ao banco comprovado | NOT APPLICABLE — consumo é mediado pela API quando existir |
| SVC-04 | Monitoramento grava e expira métricas; volume/plano pendentes | PENDING |
| LOG-01 | `application_error_logs` não existe na produção histórica; demais retenções pendentes | PENDING |
| BKP-01 | Nenhum backup/restore de banco comprovado | BLOCKED |
| RES-01 a RES-08 | Baseline histórico e orçamento de parâmetros revisados | AUDITED |
| RES-09 | Estatísticas, latência, pico e espera de pool ausentes | PENDING |
| RES-10 | Heap Node não é parâmetro de PostgreSQL | NOT APPLICABLE |
| RES-11 | Limite do container PostgreSQL revisado | AUDITED |
| RES-12 | Caches de consulta requerem contrato ainda ausente | PENDING |
| EXT-01 a EXT-03 | SMTP, TLS e GitHub não são consumidores diretos de PostgreSQL comprovados | AUDITED |
| EXT-04, EXT-05 | Provedor externo/consumidores não foram verificados | PENDING |
| EXT-06 | Redis não observado em runtime, mas remoção não é inferível | PENDING |
| GAP-04a, GAP-10 | Acesso ao catálogo e métricas de produção indisponível nesta sessão | PENDING |

## Resultado da etapa

Cobertura da matriz: **11 AUDITED**, **16 PENDING**, **5 BLOCKED** e **4 NOT APPLICABLE**.

Os bloqueios prioritários são a ausência de backup/restore comprovado, o fluxo produtivo de `prisma db push --accept-data-loss` e a ausência de telemetria de locks, manutenção, I/O e consultas. Não foi realizada nenhuma otimização, mudança de pool/parâmetro, criação/remoção de índice, migração, limpeza ou ação de deploy.
