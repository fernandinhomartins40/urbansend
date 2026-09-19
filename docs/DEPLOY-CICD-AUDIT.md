# Auditoria de deploy e CI/CD — fase somente auditoria

Data: 2026-09-17. Escopo: workflows, scripts de deploy, código de migration/healthcheck e os documentos de inventário/baseline. Nenhum deploy, acesso SSH, pull, migration, seed, restart ou mudança de credencial foi executado nesta etapa.

## Fluxo confirmado e medições disponíveis

```text
commit em main / workflow_dispatch(rollback_sha)
  → GitHub runner ubuntu-latest: política de arquivos, imagens runtime+migration, build Vite
  → GHCR: tags sha-<commit> e artefato frontend (retenção 7 d)
  → runner: SSH autenticado, SCP do tarball
  → VPS: espaço/release estático/rede/volumes/PostgreSQL preservado
  → docker pull → job migration + seed → API → nginx reload → /api/health/simple
```

| Medição | Valor/evidência | Limite de interpretação |
|---|---|---|
| Duração de deploy | 3m20s, run `35147306986`, sucesso em 2026-09-16 20:33Z; `docs/VPS-OPT-BASELINE.md:303-334` | Tempo por etapa, downtime e custo de runner: NOT MEASURED. |
| Build na VPS | Não ocorre; `deploy-production.yml` e remote script:540-584 usam runner/GHCR | CPU/RAM/disco temporário do runner e bytes de pull: NOT MEASURED. |
| Histórico anterior | Builds na VPS falhavam após ~55 min; depois da mudança, 3–4 min | Não prova disponibilidade sob carga ou em falha de registry/rede. |
| Capacidade de host no snapshot | 165 GB livres; API 310 MB, migration 868 MB; imagens/caches são compartilhados | Espaço temporário do próximo pull, extração e coexistência de releases: NOT MEASURED. |
| Disponibilidade | Health interno da API respondia 1–2 ms no snapshot histórico | O endpoint usado no deploy é `/api/health/simple`, que não testa banco, migration, seed, SMTP ou tráfego externo. |

## Achados e propostas, sem implementação

| ID | Ambiente e evidência; achado | Impacto | Proposta; risco e dependências | Aceite; rollback; métrica esperada | Cobertura |
|---|---|---|---|---|---|
| DEP-001 | CI. `.github/workflows/deploy-production.yml:1-164` constrói runtime/migration no runner GitHub, envia ao GHCR e compila a SPA Vite; remote script:550-584 apenas baixa imagens. | A principal fonte anterior de CPU/I/O/BuildKit órfão na VPS foi eliminada. Runner ainda tem custo/limite e depende de GitHub/GHCR. | Manter build externo em runner compatível com `linux/amd64`, arquitetura confirmada do host. Medir custo/duração/bytes antes de alterar cache ou runner; não presumir CI gratuito ou instantâneo. | Aceite: imagem executa no host amd64, build/pull/disk temporário registrados por release. Rollback: usar artefato/imagem já publicada. Métricas: CPU/RAM/disco do runner e pull — NOT MEASURED. | AUDITED |
| DEP-002 | CI. `docker/build-push-action` usa cache GHA `mode=max`; frontend usa cache npm; artefato `frontend-dist` retém 7 d (`deploy-production.yml:91-137`). | Cache reduz rebuild, mas ocupa quota/custo externo; artefato pode não estar disponível após retenção. | Medir hit ratio, tamanho e duração por camada antes de mudar `mode=max` ou retenção. Risco: reduzir cache aumenta duração; reduzir artefato enfraquece recuperação curta. | Aceite: tempo e quota documentados, rollback de frontend ainda reproduzível. Rollback: valores de cache/retenção anteriores. Métricas: cache hit, GB, duração — NOT MEASURED. | PENDING |
| DEP-003 | CI/registry. Tags `sha-<commit>` são imutáveis por convenção e o workflow verifica manifest antes de rebuild (`deploy-production.yml:60-115`). Na VPS, o script faz pull por tag e marca `:latest` local (`remote:561-580`); digest não é fixado nem registrado no deploy. | Uma tag pode ser sobrescrita no registry; `:latest` local reduz rastreabilidade. | Após confirmar política do GHCR, publicar/capturar digest e passar referência `imagem@sha256:...` ao deploy, mantendo a tag SHA como referência humana. Risco: digest/arquitetura incompatível se não validado. | Aceite: digest de runtime e migration no log/metadado da release, pull reproduzível e arquitetura validada. Rollback: digest anterior conhecido. Métrica: divergências tag→digest = 0 — NOT MEASURED. | PENDING |
| DEP-004 | CI/SSH. O workflow usa `sshpass -e`, portanto a senha não aparece como argumento; mantém `StrictHostKeyChecking=yes` e, desde 2026-09-19, exige `VPS_SSH_KNOWN_HOSTS` previamente validado em vez de `ssh-keyscan` no momento do deploy. O arquivo recebe modo 600 e o workflow falha se não houver entrada para o host. Há fallback de host/usuário no script. | Password auth/root continuam aumentando superfície de comprometimento; a aceitação TOFU por chave descoberta em rede foi removida. O token GHCR chega por stdin ao script remoto; valores não foram expostos nesta auditoria. | Migrar mediante plano para chave de deploy de menor privilégio e credencial GHCR de leitura mínima/curta duração. Risco: o primeiro deploy falha até que a chave do host seja instalada no segredo após validação fora do canal. | Aceite parcial: host key pinada pelo segredo e logs sem segredos; faltam execução real, deploy sem senha/root quando possível e pull autenticado observado. Rollback: credencial/caminho SSH anterior mantido somente para recuperação autorizada; nunca desabilitar `StrictHostKeyChecking`. Métrica: falhas de auth e exposição em logs/process list — NOT MEASURED. | AUDITED |
| DEP-005 | CI. `concurrency.group=deploy-production` e `cancel-in-progress=false` serializam deploys (`deploy-production.yml:17-23`). | Evita competição por porta, volumes, migration e disco. Fila pode atrasar release; duração e espera não são medidas. | Manter exclusão mútua; registrar início/fim, SHA e motivo de espera. Não cancelar deploy em progresso sem recuperação definida. | Aceite: dois dispatches não coexistem na VPS; cada release tem SHA/digest e resultado. Rollback: não aplicável à observação. Métrica: tempo em fila, concorrência = 1 — NOT MEASURED. | AUDITED |
| DEP-006 | VPS. Remote script remove containers de aplicação antes de pulls/migration/subida (`remote:120-130`) e só depois inicia a API (`remote:586-645`). Não há blue/green, porta alternativa ou switch atômico de upstream. | Há janela potencial de indisponibilidade entre remoção e readiness; seu tamanho é NOT MEASURED. | Medir downtime externo e etapas antes de propor coexistência. Qualquer estratégia blue/green deve preservar portas, conexões WebSocket, volumes e schema compatível. | Aceite: p95 downtime e requests falhas definidos; nova API é readiness-validada antes de receber tráfego. Rollback: manter release anterior executável e upstream anterior. Métrica: janela sem 2xx/conexões interrompidas — NOT MEASURED. | PENDING |
| DEP-007 | VPS. Antes de operações, script mede `/` e, abaixo de 1,5 GB, limita remoção a imagens desta app mantendo três tags (`remote:149-180`); não toca build cache compartilhado. Snapshot tinha 165 GB livres. | Protege outras apps e rollback, mas o limiar não prova espaço para dois pulls, tarball, extração e releases coexistentes. | Medir espaço livre antes/depois de pull, extração e troca de release; calcular orçamento pelo maior artefato e rollback, não pelo consumo em repouso. Risco: disco cheio durante deploy deixa estado parcial. | Aceite: orçamento explícito para imagem runtime+migration, tarball, release antiga/nova e logs. Rollback: não apagar tag/release anterior até health/readiness aprovados. Métrica: bytes temporários e mínimo livre — NOT MEASURED. | PENDING |
| DEP-008 | VPS. PostgreSQL existente é preservado e aguardado com até 30×2 s `pg_isready` (`remote:491-545`). | `pg_isready` prova aceitação de conexão, não schema, permissões, query de aplicação ou recuperação de dados. | Manter como pré-condição de disponibilidade e acrescentar somente futuramente smoke query/versionamento aprovado, sem expor URL/segredos. Risco: teste insuficiente aprova banco incompatível. | Aceite: banco pronto, schema esperado e consulta da aplicação aprovados em ambiente descartável. Rollback: não recriar volume; recuperar por backup validado se necessário. Métrica: tempo de prontidão/erros — NOT MEASURED. | AUDITED |
| DEP-009 | VPS/DB. Job efêmero executa `npm run migrate:latest && npm run seed:super-admin` sob 512 MiB/1 CPU (`remote:586-600`); em PostgreSQL, `backend/scripts/run-db-migrations.js:20-43` executa `prisma db push --accept-data-loss`. | O job é isolado do runtime, mas schema pode ficar incompatível com código anterior; seed sempre executa e sua idempotência/efeito real não foi demonstrada. | Não tornar seed condicional, remover ou separar por economia sem mapear seus dados. Definir job controlado, lock, timeout, versão de schema, compatibilidade N/N-1 e confirmação de idempotência em cópia descartável. | Aceite: migration, seed, startup e consulta passam separadamente; dois seeds não alteram resultado indevidamente. Rollback: versão anterior somente se schema compatível; caso contrário backup/recuperação validada. Métricas: duração, conexões, linhas afetadas/erros — NOT MEASURED. | BLOCKED |
| DEP-010 | VPS/DB. Não há backup pré-deploy, backup PostgreSQL agendado ou restore testado; `--accept-data-loss` alterou coluna com dados no deploy histórico. | Rollback de imagem/código é insuficiente após mudança de schema/dados. | Bloquear otimizações e automações de schema até definir backup consistente, retenção, RPO/RTO e restore ensaiado. Risco crítico de perda de dados. | Aceite: backup pré-migration e restore isolado documentados; migration tem estratégia de compatibilidade/reversão. Rollback: recuperação de dados, não apenas pull da tag anterior. Métricas: idade/duração de backup e RTO — NOT MEASURED. | BLOCKED |
| DEP-011 | VPS. Após iniciar API, script valida processo, `nginx -t` e repete até 36×5 s uma chamada interna de `/api/health/simple` com timeout de 4 s (`remote:669-712`). `health.ts:360-380` retorna somente processo/uptime; `/readiness` testa `SELECT 1` (`health.ts:403-420`) mas não é usado. | “Healthy” não prova migration/seed semântico, banco disponível ao tráfego, SMTP/DKIM, UI estática nem acesso externo/TLS. | Preservar liveness simples e, em etapa posterior, desenhar readiness de dependências críticas e smoke tests de baixo impacto, separados de migration/seed. Risco: readiness pesado vira carga/causa falso negativo. | Aceite: liveness, readiness de banco e smoke autenticado/não sensível possuem escopo, timeout e dono; teste externo/TLS registrado. Rollback: critérios de health atuais até a nova prova. Métrica: sucesso/latência por teste e falso positivo — NOT MEASURED. | PENDING |
| DEP-012 | CI. `quality.yml` roda typecheck/build/testes em pull request, mas push em `main` executa apenas política de arquivos antes do build (`quality.yml:1-55`; `deploy-production.yml:45-57`). | Código que entra direto em main pode atingir deploy sem typecheck/testes; corrigir isso aumenta duração/custo do runner e precisa de baseline. | Medir duração/falha dos checks e definir gate proporcional ao risco antes de torná-los bloqueantes. Risco: deploy mais lento ou bloqueio de hotfix sem exceção governada. | Aceite: checks escolhidos, timeout e caminho de exceção documentados; não duplicar builds sem necessidade. Rollback: restaurar gate anterior. Métricas: minutos de runner, taxa de falha e tempo total — NOT MEASURED. | AUDITED |
| DEP-013 | Repositório. Scripts antigos (`scripts/deploy-professional.sh`, scripts de Nginx) usam build/migrations de SQLite ou `StrictHostKeyChecking=no`; inventário confirma que não são chamados pelo workflow ativo. | Executá-los manualmente pode reintroduzir build na VPS, host-key insegura ou fluxo de banco errado. A simples existência não prova uso externo. | Marcar caminho operacional canônico e, antes de arquivar/remover scripts, confirmar runbooks, usuários e automações externas. Risco: quebrar recuperação manual ou outro ambiente. | Aceite: runbook aponta apenas workflow/script canônico; uso de scripts residuais mapeado. Rollback: manter arquivos até transição comprovada. Métrica: execuções reais — NOT MEASURED. | PENDING |

## Matriz de cobertura: inventário → evidência → status

| Item do inventário | Evidência examinada | Status |
|---|---|---|
| ARQ-01..04 | Fluxo runner → GHCR → SSH → Docker/Nginx | AUDITED |
| APP-01, APP-02 | Imagem API e artefato Vite no fluxo | AUDITED |
| CNT-01 | Remoção/subida, limites e healthcheck | AUDITED |
| CNT-02 | Preservação e `pg_isready` | AUDITED |
| CNT-03 | Job efêmero de migration/seed | BLOCKED |
| DB-04..06, DB-09 | `db push`, seed e compatibilidade | BLOCKED |
| BKP-01..04 | Ausência de backup/restore para rollback de dados | BLOCKED |
| BLD-01, BLD-02, BLD-05, BLD-08 | Runner externo, Dockerfile, amd64, sem build VPS | AUDITED |
| BLD-03, BLD-07 | Tag SHA/rollback, sem digest fixado | PENDING |
| BLD-04 | Cache GHA externo | PENDING |
| BLD-06 | GHCR e SSH por senha/host key | PENDING |
| BLD-11, BLD-12 | Tamanhos históricos e duração de 3m20s | AUDITED |
| CI-01 | Workflow, permissões, artefato e concorrência | AUDITED |
| CI-02 | Política de arquivos rastreados | AUDITED |
| CI-03 | Quality checks fora do push main | AUDITED |
| RES-01..08 | Limites e preservação de recursos durante job/runtime | AUDITED |
| RES-09 | CPU/RAM/duração por etapa, disco temporário e downtime | PENDING |
| RES-11 | Healthcheck atual versus readiness real | PENDING |
| VOL-01, VOL-04..06 | Dados, configs, artefato e espaço de coexistência | PENDING |
| EXT-01 | GitHub Actions e permissões | AUDITED |
| EXT-02 | GHCR, pull autenticado e disponibilidade não medida | PENDING |
| EXT-03 | Nginx/Certbot/TLS após deploy | PENDING |
| GAP-04a | Pico e impacto de deploy em tráfego real | PENDING |

## Resultado da etapa

Cobertura da matriz (linhas): **12 AUDITED**, **9 PENDING**, **3 BLOCKED** e **0 NOT APPLICABLE**.

O pipeline já evita builds na VPS e serializa deploys; isso é melhoria confirmada, não uma proposta. Os bloqueios que impedem tratar rollback como confiável são migration `db push --accept-data-loss`, seed automático sem comportamento confirmado e ausência de backup/restore validado. Não houve avanço para implementação.
