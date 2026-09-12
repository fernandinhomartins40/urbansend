# Auditoria técnica — VeloMail / UrbanSend

Data: 12 de setembro de 2026  
Escopo: backend Node/Express, frontend React/Vite, banco/migrações, autenticação, envio SMTP, filas, webhooks, observabilidade, deploy e qualidade.

## Método e limites

Foram inspecionados os arquivos efetivamente versionados, a composição de deploy, as rotas registradas em `backend/src/index.ts`, autenticação/autorização, fluxo de e-mail, SMTP, webhooks, schemas e testes. Não houve alteração de regra de negócio durante a auditoria.

O baseline executável do backend não pôde ser concluído: `backend/node_modules` está ausente. `npm run typecheck` falha por módulos ausentes e `npm run test:unit` não encontra o Jest. Isso é em si um achado de engenharia; após `npm ci`, os comandos devem ser repetidos antes de qualquer release.

## Resumo executivo

O produto contém boas bases — Helmet, JWT com validação de usuário ativo/verificado, permissões por workspace, validação Zod nas rotas principais e defesa SSRF para webhooks. Porém, não está pronto para operação profissional sem corrigir o manejo de segredos, estabilizar a cadeia de entrega assíncrona e recuperar um pipeline de build/testes reproduzível.

| Prioridade | Achados |
| --- | ---: |
| Crítico | 2 |
| Alto | 4 |
| Médio | 6 |
| Baixo | 3 |

## Achados críticos

### C-01 — Segredos e chaves privadas estão versionados

- Evidência: `git ls-files` lista arquivos `.env`, `cookies*.txt`, backups e chaves `backend/configs/dkim-keys/*-private.pem` e `configs/dkim-keys/*-private.pem`.
- Impacto: exposição de JWT, SMTP, banco, cookies e DKIM; um invasor pode assinar mensagens, acessar serviços ou manter acesso mesmo após correções locais.
- Correção: revogar/rotacionar imediatamente todos os segredos potencialmente expostos; remover arquivos do índice e do histórico com procedimento controlado; manter apenas `.env.example` sem valores reais; guardar DKIM em cofre/secret manager ou volume fora do Git.
- Arquivos afetados: `.gitignore`, compose/deploy, carregamento de DKIM e todos os arquivos sensíveis listados.
- Regressão: alta se a rotação não for coordenada. Deve haver janela de dupla chave para DKIM e rollout com secrets novos antes da revogação.

### C-02 — Segredo de criptografia reutiliza JWT como fallback

- Evidência: `backend/src/utils/env.ts`, `Env.appEncryptionKey`, aceita `JWT_SECRET` quando `APP_ENCRYPTION_KEY` não existe.
- Impacto: quebra a separação de propósito; vazamento/rotação de JWT pode comprometer dados cifrados e vice-versa.
- Correção: tornar `APP_ENCRYPTION_KEY` obrigatório em produção, criar migração de recriptografia/versionamento de chave e remover o fallback.
- Regressão: média; exige plano de rotação para valores já cifrados.

## Achados altos

### A-01 — Autenticação de API key é O(n) e executa bcrypt repetidamente

- Evidência: `backend/src/middleware/auth.ts`, `authenticateApiKey` consulta todas as chaves ativas e percorre `for (const key of apiKeys)` chamando `verifyApiKey`.
- Impacto: latência e CPU aumentam linearmente com a base de chaves; pode provocar exaustão de CPU sob tráfego ou tentativas inválidas.
- Correção: armazenar identificador público/prefixo único indexado, buscar uma única chave pelo prefixo e aplicar bcrypt uma vez. Preservar hash bcrypt e migração de hashes legados de forma síncrona/observável.
- Regressão: média; requer compatibilidade para chaves existentes e teste de autenticação API.

### A-02 — Fila de entrega não é uma unidade durável/concorrente

- Evidência: `backend/src/index.ts` inicia `SMTPDeliveryService` e chama `processQueue` por `setInterval(..., 30000)`; coexistem `deliveryManager.ts`, `emailProcessor.ts`, workers em backup e referências a Redis/filas removidas.
- Impacto: em múltiplas réplicas, o polling pode disputar as mesmas mensagens; não há evidência de lock distribuído, lease, idempotência por provedor ou política única de retry/DLQ.
- Correção: eleger uma implementação de fila. No mínimo, usar claim atômico no banco (`FOR UPDATE SKIP LOCKED`/lease com expiração), idempotency key, tentativas persistidas, backoff exponencial, DLQ e worker separado do processo HTTP.
- Regressão: alta; mudança deve ser acompanhada por testes de concorrência e replay controlado.

### A-03 — Pipeline de build/teste backend não é reproduzível no workspace

- Evidência: `backend/package.json` declara TypeScript/Jest, mas as dependências não estão instaladas. `npm run typecheck` e `npm run test:unit` falharam antes de executar testes.
- Impacto: regressões de segurança e entrega podem chegar a produção sem validação.
- Correção: CI deve executar `npm ci`, typecheck, lint, testes unitários/integração e build em ambiente limpo; corrigir quaisquer erros reais revelados após a instalação.
- Regressão: baixa; é uma melhoria de pipeline.

### A-04 — Material legado e duplicado torna o runtime ambíguo

- Evidência: arquivos `*.backup`, `*.original`, `*.vps`, rotas JS desativadas, Prisma + Knex + SQLite/PostgreSQL e múltiplos serviços SMTP.
- Impacto: risco de corrigir código não executado, divergência de schema e reintrodução acidental de comportamento antigo.
- Correção: inventário de runtime, decisão de fonte única para schema/migração e remoção planejada de artefatos do código-fonte após backup externo verificável.
- Regressão: média; remover em lotes pequenos após comprovar referências zero.

## Achados médios

### M-01 — Rate limits de produção foram afrouxados para testes

- Evidência: `backend/src/middleware/rateLimiting.ts` documenta limites elevados “para testes” (ex.: 50 logins/15 min e 15 resets/hora).
- Impacto: aumenta superfície para credential stuffing, enumeração e abuso de envio.
- Correção: limites específicos por endpoint e conta/IP, armazenamento compartilhado (Redis ou banco) e valores de produção configuráveis por ambiente.

### M-02 — CORS permite requisições sem `Origin` em produção

- Evidência: `backend/src/index.ts` aceita `!origin` quando `Env.isProduction`.
- Impacto: reduz defesa em profundidade; clientes não-browser legítimos devem ser autenticados, mas a permissão geral é ampla.
- Correção: permitir sem Origin somente em health checks internos explicitamente segregados; manter APIs autenticadas e monitorar rejeições.

### M-03 — Logs podem reter dados operacionais sensíveis

- Evidência: `backend/src/index.ts` registra URL, IP e user-agent de toda requisição; controlador de autenticação registra eventos de token; existem arquivos de cookies no repositório.
- Impacto: PII e metadados de autenticação em logs/backups.
- Correção: redator central de campos sensíveis, retenção e acesso mínimos, IDs correlacionáveis sem payload/cookie/token.

### M-04 — Webhook é protegido contra SSRF, mas não há entrega assíncrona completa

- Evidência positiva: `backend/src/utils/urlSecurity.ts` exige HTTPS, bloqueia redes privadas e resolve DNS. `backend/src/routes/webhooks.ts` revalida URL antes de teste.
- Lacuna: teste faz `axios.post` síncrono com timeout de 10s; logs usam `attempt: 1` e `next_retry_at: null`.
- Impacto: request preso, sem retry durável, sem DLQ e sem rastreabilidade de tentativas reais.
- Correção: enfileirar entrega/teste, registrar tentativas e implementar retry/backoff/DLQ.

### M-05 — Endpoints internos/de depuração requerem revisão de configuração

- Evidência: `backend/src/index.ts` monta várias rotas internas conforme `ENABLE_INTERNAL_ROUTES`; `backend/src/routes/auth.ts` contém rota de debug de tokens condicionada por flag.
- Impacto: configuração errada pode expor diagnóstico sensível.
- Correção: defaults fail-closed, validação de ambiente no boot e teste CI assegurando que produção não habilita debug/internal.

### M-06 — Frontend e backend mantêm nomenclatura e artefatos UltraZend

- Evidência: nomes de pacote, comentários, URLs e múltiplos textos antigos coexistem com VeloMail.
- Impacto: confusão operacional, documentação e suporte inconsistentes.
- Correção: migração de nomes em inventário separado, sem trocar contratos/API de uma vez.

## Achados baixos

- Dependências devem passar por `npm audit --omit=dev` depois de `npm ci`; o inventário local não permitiu executar a auditoria de CVEs.
- Há muitos testes manuais e scripts de fase; consolidar os fluxos suportados em poucos comandos documentados reduzirá manutenção.
- O painel recebeu melhorias recentes de responsividade; faltam testes Playwright por breakpoints de notebook/tablet e páginas críticas.

## Pontos validados positivamente

- `authenticateJWT` reconsulta o usuário e bloqueia contas inativas/não verificadas.
- `requirePermission` restringe permissões sensíveis para membros de workspace.
- Webhooks usam validação de URL contra SSRF e assinatura HMAC.
- Helmet, CSP, CSRF para sessão por cookie e correlação de requisição estão presentes.
- Rotas de e-mail e webhook filtram recursos pelo usuário/conta na maior parte das consultas revisadas.

## Plano de implementação recomendado

1. **Incidente de segredos:** rotação, remoção do Git/histórico, secret manager e validação de boot.
2. **Baseline reprodutível:** `npm ci` em ambos os projetos, corrigir typecheck/testes e instituir CI obrigatório.
3. **API keys:** prefixo indexado + uma verificação bcrypt; testes de migração e carga.
4. **Entrega assíncrona:** definir fila única, lease/idempotência/retry/DLQ e métricas.
5. **Hardening:** rate limit distribuído, CORS sem exceção global, redaction de logs e flags fail-closed.
6. **Dívida técnica:** retirar artefatos legados e convergir migrações gradualmente.

## Testes executados

| Comando | Resultado |
| --- | --- |
| `frontend/npm run typecheck` (execução anterior) | aprovado |
| `backend/npm run typecheck` | bloqueado: dependências ausentes; revelou que o baseline não é reproduzível sem `npm ci` |
| `backend/npm run test:unit` | bloqueado: `jest` não instalado |
| revisão estática de autenticação, rotas, webhooks, envio, compose e arquivos rastreados | concluída |

## Próximos passos

Não é seguro implementar remoção de segredos sem coordenar a rotação real de credenciais. As demais melhorias podem começar após restaurar o ambiente de dependências e confirmar a baseline em CI.

## Atualização de implementação — 12/09/2026

Itens implementados em microlotes, com commit e push individuais:

- Segredos e artefatos sensíveis foram removidos do índice Git; regras de ignore foram ampliadas. A rotação dos valores já expostos continua sendo uma ação operacional externa ao repositório.
- Produção passou a exigir `APP_ENCRYPTION_KEY` e `JWT_REFRESH_SECRET`; logs de inicialização não imprimem mais a URL do banco.
- API keys usam prefixo indexado antes da verificação bcrypt, evitando varrer todas as chaves ativas.
- CORS sem `Origin` foi restringido em produção; verificadores de assinatura de webhook validam formato e usam comparação segura.
- Limites de cadastro e reset foram separados; falhas do limitador retornam 503 e IDs baixos não recebem mais tiers elevados implicitamente.
- Foi adicionado workflow de qualidade com instalação limpa, typecheck, build e testes unitários para backend e frontend.
- A fila `email_delivery_queue` faz claim condicional por status, persiste uma tentativa por claim, recupera leases expirados e registra falhas definitivas em `queue_job_failures` sem armazenar o corpo do e-mail.
- A rota de teste de webhook deixou de bloquear o request HTTP; ela dispara o `WebhookService`, que centraliza assinatura, validação SSRF, tentativas e logs.

Lacunas ainda abertas: migração efetiva para uma única fonte de schema (Prisma ou Knex), rate limiting compartilhado entre réplicas, fila de webhook realmente durável e retirada controlada dos artefatos legados.
