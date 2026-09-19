# Auditoria de storage e disco — fase somente auditoria

Data: 2026-09-17. Escopo: repositório, documentos de inventário/baseline e medições históricas datadas de 2026-09-17. Esta fase não executou limpeza, `prune`, remoção de volume, alteração de permissões, cópia, backup, restore ou acesso à VPS.

## Critério, ambiente e limites

- **AUDITED**: evidência examinada; não significa corrigido. **PENDING**: depende de medição, fluxo ou consumidor ainda não confirmado. **BLOCKED**: há pré-requisito de segurança/recuperação ausente. **NOT APPLICABLE**: justificado no item.
- Tamanho, crescimento, idade, permissões e conteúdo atuais na VPS são **NOT MEASURED** nesta sessão. Onde indicado, os valores são o snapshot histórico de repouso, e não capacidade, pico ou retenção comprovada.
- O deploy real é o script `.github/scripts/deploy-production-remote.sh`; `docker-compose.yml` representa ambiente Compose e usa nomes de volumes diferentes. Não se deve transferir inferências entre eles sem reconciliação.

## Reconciliação de persistência e consumidores

| ID | Recurso; proprietário e consumidores | Evidência e estado conhecido | Classificação de dados | Status |
|---|---|---|---|---|
| VOL-01 | `ultrazend-postgres-data` → `/var/lib/postgresql/data`; proprietário operacional CNT-02; consumidores CNT-01 e CNT-03 pela rede | Deploy: linhas 25–28, 114–118, 491–529. Snapshot: banco 20 MB; persistência crítica. | Dado persistente crítico; nunca candidato a limpeza. | AUDITED |
| VOL-02 | `ultrazend-storage-data` → `/app/storage`; CNT-01 | Deploy: 26, 114–118, 493–494, 631–633. Busca atual não encontrou escrita direta em `backend/` (excluídos artefatos). Snapshot: 4 KB, vazio. | Uso desconhecido apesar de vazio: volume persistente declarado, sem política de upload, consumidor externo ou restore comprovados. Não limpar. | AUDITED |
| VOL-03 | Bind `/var/lib/ultrazend/logs` → `/app/logs`; host cria e atribui ao UID 1001; CNT-01 escreve | Deploy: 25, 132–139, 623, 631. `logger.ts:61-211` cria cinco canais. Snapshot: 8,5 MB. | Retenção configurada, não “descartável confirmado”. | AUDITED |
| VOL-04 | Bind `/var/lib/ultrazend/configs` → `/app/configs`; host/root; CNT-01 e job CNT-03 | Deploy: 24–25, 132–142, 225–229; inventário: 88 KB e material de DKIM/configuração. | Dado persistente crítico e sensível; não é cache nem candidato a limpeza. | AUDITED |
| VOL-05 | `/var/www/ultrazend-static`; Nginx (`www-data`) consome SPA Vite | Deploy: 19–22, 262, 401–419; `frontend/package.json`, `frontend/vite.config.ts`. Snapshot: 17 MB. | Artefato substituível por release, mas necessário ao rollback enquanto a release for retida. | AUDITED |
| VOL-06 | `/var/www/ultrazend`; deploy consome clone/release | Deploy: 19, 185 em diante; inventário: 29 MB. | Artefato/release de rollback; retenção e troca atômica reais exigem confirmação. | PENDING |
| VOL-07 | Nomes legados de volume | Deploy: 27–28, 114–118. `docker volume ls` histórico: legados inexistentes; reclaimable do conjunto de volumes = 0 B. | Ausente confirmado no snapshot; não há ação de limpeza. | AUDITED |
| LOG-06 | `json-file` dos containers API e PostgreSQL | Deploy: 520–522, 615–617: 10 MB × 3 por container. Uso e rotação efetivos após tempo de operação: NOT MEASURED. | Retenção configurada; necessário para diagnóstico/rollback operacional. | AUDITED |
| LOG-07 | `/var/log/nginx/tracking.log`; Nginx host | Deploy: 385–425 declara o canal; inventário GAP-10 não verificou `logrotate` efetivo. | Uso desconhecido quanto a retenção/crescimento; não limpar. | PENDING |
| BKP-01..04 | Script, dumps, snapshots e agenda | `backup-system.sh:11-15, 51-63, 186-194`; inventário: cron sem backup PostgreSQL e dumps/snapshots externos PENDING. O script legado aponta para SQLite, não para o PostgreSQL produtivo. | Backup/snapshot é dado necessário à recuperação até política, cópia externa e restore demonstrados. | BLOCKED |

## Achados e propostas, sem implementação

| ID | Ambiente e evidência; achado | Impacto | Proposta; risco e dependências | Aceite; rollback; métrica esperada | Cobertura |
|---|---|---|---|---|---|
| STO-001 | Produção. O deploy direto cria/seleciona `ultrazend-postgres-data` e `ultrazend-storage-data`; o Compose declara `postgres-data` e `ultrazend-storage` (`docker-compose.yml:46, 139–161`). | Confundir os ambientes pode montar outro volume, perder visibilidade de dados ou levar a limpeza indevida. | Manter uma tabela de equivalência por ambiente e exigir inspeção read-only antes de qualquer mudança. Risco: erro de alvo. Depende de acesso à VPS. | Aceite: cada mount do container ativo mapeia para um ID e proprietário. Rollback: nenhuma alteração nesta proposta. Métrica: mounts/volumes sem dono = 0 — NOT MEASURED atualmente. | AUDITED |
| STO-002 | Produção, VOL-01. PostgreSQL é persistência interna crítica; volume mediu 20 MB no snapshot e o banco não possui backup/restore comprovado. | Qualquer redução de disco, alteração de mount ou ação em imagens/volumes pode impedir rollback ou causar perda de dados. | Excluir VOL-01 de toda limpeza. Definir backup consistente com PostgreSQL e restore isolado antes de otimizações estruturais. Risco crítico; depende de dono, RPO/RTO e armazenamento externo. | Aceite: backup e restore testados, com integridade de schema/dados. Rollback: restore validado. Métricas: idade, duração e RPO/RTO — NOT MEASURED. | BLOCKED |
| STO-003 | Produção, VOL-02. Snapshot confirmou diretório vazio (4 KB); busca atual não confirmou implementação de upload, URL assinada, importação ou consumidor externo. `TenantContextService.ts:395-473` contém apenas contrato/limites de storage, não uma escrita de arquivo. | A economia mensurável é desprezível; remover o mount pode quebrar fluxo futuro, integração fora do repositório ou rollback. | Classificar como **uso desconhecido**, não como descartável, até observar um ciclo operacional, confirmar uploads e restaurar em ambiente isolado. Risco: perda silenciosa de documentos. | Aceite: mapa de fluxos upload/download, autorização e restore; se permanecer vazio após ciclo acordado, decisão explícita de produto. Rollback: remount do volume preservado. Métrica: arquivos, bytes, crescimento e acessos — NOT MEASURED. | PENDING |
| STO-004 | Produção, VOL-03/LOG-01..06. `logger.ts:159-211` declara rotação: application 30 d, errors 90 d, security 180 d, performance 7 d e business 365 d; snapshot jovem totalizou 8,5 MB. | Teto configurado não equivale a crescimento real. Reduzir retenção pode remover evidência de segurança, incidente ou negócio. | Medir bytes/dia por canal, arquivos rotacionados e necessidade de auditoria antes de alterar retenção. Risco: perda de evidência/compliance. | Aceite: retenção atende incidente e requisito de negócio, sem crescimento não controlado. Rollback: política anterior. Métrica: bytes/dia, idade e ocupação por canal — NOT MEASURED. | AUDITED |
| STO-005 | Produção, LOG-07. O bloco Nginx cria `tracking.log` para tracking e desabilita cache desse endpoint (`deploy-production-remote.sh:385-403`); rotação efetiva do host é lacuna GAP-10. | Um log sem rotação pode crescer indefinidamente e expor metadados de acesso. | Inspecionar somente leitura a configuração/estado de `logrotate`, tamanho e retenção; preservar requisitos de investigação. Risco: ajustar sem retenção aprovada reduz rastreabilidade. | Aceite: rotação, compressão, retenção e permissões observadas/documentadas. Rollback: configuração anterior versionada. Métrica: tamanho, idade, taxa — NOT MEASURED. | PENDING |
| STO-006 | Produção, VOL-04. O deploy aplica `root:root`, diretório DKIM `755` e arquivos `644` (`deploy-production-remote.sh:132-139, 225-229`), permitindo que o processo Node leia a chave montada. Não foi aferido usuário/grupo efetivo e exposição no host. | Diminuir permissões sem teste pode impedir DKIM; permissões amplas podem elevar exposição local. | Validar o UID/GID real e o modelo de acesso mínimo em staging, sem registrar chaves. Risco: quebra de assinatura ou leitura indevida. | Aceite: assinatura DKIM e startup aprovados com leitura mínima necessária. Rollback: permissões atuais, previamente registradas. Métrica: modo/proprietário efetivos — NOT MEASURED nesta sessão. | AUDITED |
| STO-007 | Produção, VOL-05. Frontend é Vite, não Next.js (`frontend/package.json`, `vite.config.ts`); assets observados usam nomes com hash em `frontend/dist/assets`. Nginx aplica `public, immutable` por um ano para extensões estáticas (`deploy...:405-419`). | Cache immutable é compatível apenas com conteúdo versionado. HTML usa `must-revalidate`; um asset não versionado servido na mesma URL pode ficar obsoleto. | Manter a divisão atual e, antes de ampliar o cache, comprovar hash/imutabilidade de cada classe de arquivo, inclusive imagens públicas. Risco: clientes receberem conteúdo antigo. | Aceite: release nova referencia novos assets e HTML revalida; teste de atualização em navegador/proxy. Rollback: headers anteriores. Métrica: hit ratio e bytes servidos — NOT MEASURED. | AUDITED |
| STO-008 | Produção, VOL-05/06 e CI. Build ocorre no GitHub Actions; VPS recebe artefato estático e imagens. Snapshot: imagens 19,79 GB lógicos, 9,22 GB recuperáveis; build cache 5,73 GB, 1,99 GB recuperáveis, todos compartilhados. | Tamanho lógico não é disco efetivo. Limpeza global ameaça outras quatro aplicações e imagens de rollback. | Não executar prune. Aplicar somente futura retenção por proprietário, mantendo tags de rollback, após inventário de camadas e acordo dos donos. Risco: indisponibilidade/rollback impossível de terceiros. | Aceite: alvo pertence à app, não está em uso e rollback continua possível. Rollback: re-pull da tag imutável, se registry disponível. Métrica: espaço exclusivo/reclamável por proprietário — NOT MEASURED. | PENDING |
| STO-009 | Produção, BKP-01..04. `backup-system.sh` tem retenção destrutiva (`find ... -delete` e `rm -f`) mas é legado SQLite e não está instalado/agendado conforme inventário. | Não protege PostgreSQL e não autoriza apagar cópias existentes; backups/snapshots externos continuam desconhecidos. | Não reutilizar nem reduzir esse mecanismo sem desenho PostgreSQL, criptografia, destino externo, política e restore testado. Risco crítico de falsa sensação de recuperação. | Aceite: backup consistente, restore isolado, RPO/RTO e retenção documentados. Rollback: conservar backups anteriores até validação. Métrica: sucesso, idade, duração, restore — NOT MEASURED. | BLOCKED |
| STO-010 | Produção, SVC-03. Não há SDK/referência de MinIO/S3 no `package.json`/`src`; não há fluxo de URLs assinadas comprovado. | Não existe base para migrar storage local ou remover compatibilidade de object storage por “economia”. | Tratar MinIO/S3 como **NOT APPLICABLE à stack atual**, sem inferir que serviços externos não possam existir. Se surgir requisito de múltiplas instâncias, privado/URLs assinadas, portabilidade ou recuperação, comparar local, proxy e object storage pelo fluxo inteiro. | Aceite futuro: autenticação por objeto, nomes seguros, validação de upload, backup/restore e teste multi-instância. Rollback: storage atual preservado. Métrica: custo/disponibilidade/acessos — NOT MEASURED. | NOT APPLICABLE — ausência de integração no escopo auditado |
| STO-011 | Repositório. `backend/package.json.new` referencia Multer, mas não é o `backend/package.json` efetivo nem prova de runtime; arquivos de lock também podem conter dependências transitivas. | Um artefato isolado não prova upload nem justifica remoção de volume ou dependência. | Registrar como evidência inconclusiva; confirmar origem/uso no fluxo de release antes de qualquer decisão. Risco: concluir ausência de upload indevidamente. | Aceite: artefatos de build/deploy e rota de upload reconciliados. Rollback: não aplicável, sem alteração. Métrica: uploads reais — NOT MEASURED. | PENDING |

## Candidatos de limpeza — classificação obrigatória

| Candidato | Classificação | Evidência | Decisão nesta etapa |
|---|---|---|---|
| `ultrazend-postgres-data` | Dado persistente | VOL-01 | Proibido limpar/remover. |
| `ultrazend-storage-data` vazio | Uso desconhecido | 4 KB vazio no snapshot; mount declarado | Não limpar nem remover. |
| Logs de aplicação e Docker | Retenção configurada | VOL-03, LOG-06 | Não limpar; medir crescimento/retenção. |
| `tracking.log` Nginx | Uso desconhecido | GAP-10 | Não limpar; verificar rotação. |
| Static/repositório de release | Necessário ao rollback | VOL-05/06 | Não limpar fora de política de releases. |
| Imagens e build cache do host | Necessário ao rollback / compartilhado | baseline §4.1 | Não aplicar prune; não é recurso exclusivo. |
| Backups, dumps e snapshots | Dado persistente | BKP-01..04 | Não reduzir ou apagar antes de política e restore. |
| Volumes legados inexistentes | Descartável confirmado como ausente | VOL-07 | Nenhuma ação existe a executar. |

## Matriz de cobertura: inventário → evidência → auditoria

| Item do inventário | Evidência examinada | Status |
|---|---|---|
| CNT-01 | Mounts do deploy, logs e `/app/storage` | AUDITED |
| CNT-02 | Mount PostgreSQL, volume e baseline | AUDITED |
| CNT-03 | Mount de configs e escrita no banco pelo job | AUDITED |
| VOL-01 | Deploy e baseline de tamanho/criticidade | AUDITED |
| VOL-02 | Deploy, busca de escrita e snapshot vazio | PENDING |
| VOL-03 | Deploy, logger e snapshot | AUDITED |
| VOL-04 | Deploy, permissões declaradas e consumidor | AUDITED |
| VOL-05 | Deploy Nginx, Vite e cache HTTP | AUDITED |
| VOL-06 | Fluxo de release/rollback | PENDING |
| VOL-07 | Inventário de volumes histórico | AUDITED |
| LOG-01..05 | `logger.ts` e snapshot | AUDITED |
| LOG-06 | Opções `json-file` no deploy | AUDITED |
| LOG-07 | Configuração Nginx; rotação real ausente | PENDING |
| LOG-08 | `du` histórico de 8,5 MB | AUDITED |
| BKP-01..02 | Script legado e deploy | BLOCKED |
| BKP-03 | Dumps/snapshots externos não observados | PENDING |
| BKP-04 | Cron histórico sem agendamento | BLOCKED |
| SVC-03 | Dependências e referências de object storage ausentes | NOT APPLICABLE — nenhuma integração na stack auditada |
| SVC-04 | Cache in-process, sem cache de imagem/objeto comprovado | PENDING |
| BLD-04, BLD-11 | Cache GHA e imagens/camadas compartilhadas | PENDING |
| CI-01..03 | Artefato estático e deploy remoto | AUDITED |
| RES-09 | Crescimento de disco/I/O em pico | PENDING |
| RES-12 | Nginx in loco e rotação de tracking | PENDING |
| GAP-03, GAP-05, GAP-06, GAP-08 | Medições históricas de tamanho, vazio, legados e agenda | AUDITED |
| GAP-10 | Rotação efetiva Nginx | PENDING |

## Resultado da etapa

Cobertura da matriz (linhas): **16 AUDITED**, **9 PENDING**, **2 BLOCKED** e **1 NOT APPLICABLE**.

Não há autorização nem evidência suficiente para limpeza. A única economia de volume observada é o storage vazio de 4 KB, que não justifica risco. Os pontos que bloqueiam qualquer redução de persistência são backup/restore PostgreSQL não demonstrado, consumidor de uploads ainda não mapeado e retenção real do Nginx não medida.
