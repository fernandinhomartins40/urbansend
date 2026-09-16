# Plano de otimização e restauração — urbansend / VeloMail

**Data:** 2026-09-16
**Base:** `docs/AUDITORIA-OTIMIZACAO-VPS.md`
**Decisão do usuário:** a aplicação **fica na VPS**; ambiente **de teste, sem usuários**; implementar agora.

---

## 0. Enquadramento honesto do que este plano entrega

A auditoria fechou cada frente de "consumir menos" sem trabalho a fazer: host ocioso (load 0.06,
disco 11%), dependências sem nada a podar (12/12 em uso), contexto de build cortando 99,1%, compose
e Dockerfile já otimizados. **Não há desperdício comprovado a eliminar nesta aplicação.**

O que existe é um **defeito estrutural de processo** que derrubou a aplicação e que, num host
compartilhado, ameaça as outras três aplicações. Este plano ataca isso. A economia de recursos vem
como consequência (build sai da VPS), não como objetivo principal.

> ⚠️ **Não venderei restauração como economia.** A linha de base de consumo da app é zero por
> ausência. Ver §9 da auditoria.

### Descoberta que reorienta o plano (§2.1 — auditar o arquivo certo)

**O `docker-compose.yml` da raiz NÃO é usado em produção.** O deploy
(`.github/scripts/deploy-production-remote.sh`) replica tudo em `docker run` manuais
(linhas 347, 392, 406). O compose bem escrito que a auditoria elogiou é **documentação que não
executa**. Os limites reais em produção são os das flags `docker run`.

Consequência prática: corrigir só o compose não mudaria nada em produção. O plano trata os dois.

---

## 1. Itens do plano

### 🔴 CRÍTICA-1 — Mover o build para fora da VPS (GitHub Actions + GHCR)

| Campo | Conteúdo |
|---|---|
| **Problema** | O deploy roda `npm ci && npm run build` (frontend) e dois `docker build` (backend) dentro da VPS. Foi a causa direta da queda: `failed to build: NotFound: forwarding Ping` com disco a 84%. Disputa CPU/I-O com aprenderia, digiurban e m2centerauto. SSH caindo deixa build zumbi com `PPID 1`. |
| **Solução** | Buildar backend e frontend no runner do GitHub. Publicar a imagem no **GHCR** com tag imutável `sha-<commit>`. A VPS passa a fazer apenas `docker pull` + `docker run`. Frontend: build no runner, artefato enviado por `rsync`/`scp`. |
| **Impacto** | **ESTIMADO:** elimina 100% do consumo de CPU de build na VPS. Não meço ganho em MB porque o baseline é zero (app fora do ar). |
| **Risco** | **Médio.** Requer `GITHUB_TOKEN` com `packages:write` e login no GHCR a partir da VPS. Se o pacote for privado, a VPS precisa de credencial. |
| **Arquivos** | `.github/workflows/deploy-production.yml`, `.github/scripts/deploy-production-remote.sh` |
| **Depende de** | nada — é o item raiz |
| **Como testar** | Workflow conclui; `docker images` na VPS mostra a imagem com tag `sha-*`; nenhum processo `docker build` na VPS durante o deploy. |
| **Como medir** | `ps -eo args \| grep 'docker build'` durante deploy = vazio; `uptime` na VPS durante deploy ≈ inalterado. |
| **Como reverter** | O script antigo fica versionado; `git revert` do commit restaura o build-na-VPS. |

---

### 🔴 CRÍTICA-2 — Versionamento imutável de imagem e rollback real

| Campo | Conteúdo |
|---|---|
| **Problema** | A imagem é `ultrazend-api:latest`. Rollback exige **rebuild** — que é justamente o que falha quando o host está saturado. |
| **Solução** | Tag `ghcr.io/<owner>/velomail-api:sha-<commit>`. Deploy recebe o SHA por variável. Rollback = trocar a variável e rodar de novo, sem build. |
| **Impacto** | **ESTIMADO:** rollback de minutos (rebuild) para segundos (pull de imagem já existente). |
| **Risco** | **Baixo.** |
| **Arquivos** | workflow, script de deploy |
| **Depende de** | CRÍTICA-1 |
| **Como testar** | Fazer deploy de dois SHAs e voltar ao primeiro sem build. |
| **Como reverter** | Manter `:latest` como tag adicional durante a transição. |

---

### 🔴 CRÍTICA-3 — Restaurar a aplicação na VPS

| Campo | Conteúdo |
|---|---|
| **Problema** | App inexistente: sem containers, volumes, `/var/lib/ultrazend`, site nginx. TLS de `www.velomail.com.br` serve certificado de outro domínio. |
| **Solução** | Executar o deploy corrigido: recria diretórios persistentes, gera secrets, sobe postgres + migration + api, configura nginx e emite certificado. |
| **Impacto** | **MEDIDO após execução.** Aplicação no ar. |
| **Risco** | **Médio-baixo** (ambiente de teste, sem usuários). ⚠️ **Chave DKIM perdida** — ver DECISÃO-1. |
| **Arquivos** | script de deploy |
| **Depende de** | CRÍTICA-1, CRÍTICA-2 |
| **Como testar** | `curl https://www.velomail.com.br/api/health/simple` → 200; TLS válido para o domínio correto. |
| **Como reverter** | Ambiente de teste: `docker rm -f` dos containers da app (escopo por label). |

---

### 🟠 ALTA-4 — Limites de CPU e PIDs em todos os containers

| Campo | Conteúdo |
|---|---|
| **Problema** | Nenhum container tem `cpus` nem `pids_limit`. Memória está definida. Num host com 4 apps, um loop quente no Node toma todos os vCPUs; vazamento de processos derruba o host. |
| **Solução** | Adicionar aos `docker run` **e** ao compose: `--cpus`, `--pids-limit`. Postgres: `--cpus=1.0 --pids-limit=200`. API: `--cpus=1.5 --pids-limit=300`. Migration: `--cpus=1.0 --pids-limit=200`. |
| **Impacto** | **ESTIMADO:** impede que uma app monopolize o host. Não reduz consumo em repouso. |
| **Risco** | **Médio.** ⚠️ Limite de CPU apertado demais causa lentidão sob carga, não erro — difícil de diagnosticar. Valores generosos por não haver medição de pico. |
| **Arquivos** | script de deploy, `docker-compose.yml` |
| **Depende de** | CRÍTICA-3 (precisa da app no ar para validar) |
| **Como testar** | `docker inspect` mostra `NanoCpus` e `PidsLimit` ≠ 0; app responde normalmente. |
| **Como medir** | `docker stats` — comparar com o limite. |
| **Como reverter** | Remover as flags e recriar o container. |

> **Justificativa dos valores — declarada como ESTIMADO, não medido.** A auditoria não pôde medir
> pico (app fora do ar). A VPS tem 4 vCPU e 16 GB. Os valores dão folga ampla e serão **revistos
> após medição real** (item MÉDIA-8). Não invento precisão que não tenho.

---

### 🟠 ALTA-5 — Deploy não destrutivo

| Campo | Conteúdo |
|---|---|
| **Problema** | `rm -rf "$APP_DIR"` antes do `git clone`. Se o clone falhar, não há estado anterior. |
| **Solução** | Clonar em diretório temporário, validar, e só então trocar. Falha deixa o estado anterior intacto. |
| **Impacto** | **ESTIMADO:** elimina janela de indisponibilidade por falha de clone. |
| **Risco** | **Baixo.** |
| **Arquivos** | script de deploy |
| **Depende de** | nada |
| **Como testar** | Simular falha de clone (URL inválida) e confirmar que o diretório anterior sobrevive. |
| **Como reverter** | `git revert`. |

---

### 🟡 MÉDIA-6 — Alinhar `docker-compose.yml` com o que roda de verdade

| Campo | Conteúdo |
|---|---|
| **Problema** | O compose não é usado pelo deploy. Divergência silenciosa: alguém edita o compose achando que muda produção. |
| **Solução** | Adicionar aviso no topo do compose explicando que é para **desenvolvimento local**, e manter os limites em paridade com o deploy. |
| **Impacto** | Nenhum em recursos. Evita erro humano. |
| **Risco** | **Nenhum** (comentário + paridade de limites). |
| **Arquivos** | `docker-compose.yml` |
| **Depende de** | ALTA-4 |

---

### 🟡 MÉDIA-7 — Limpeza com escopo restrito

| Campo | Conteúdo |
|---|---|
| **Problema** | O deploy chama `docker image prune -f` e `docker builder prune -f` quando o disco aperta. Em host compartilhado, isso **atinge as outras três aplicações**. |
| **Solução** | Restringir por label/idade. Nunca `prune` global sem filtro. Remover imagens antigas **desta app** por tag SHA, mantendo as N mais recentes. |
| **Impacto** | **ESTIMADO:** evita apagar cache de build alheio. |
| **Risco** | **Baixo**, e reduz risco existente. |
| **Arquivos** | script de deploy |
| **Depende de** | CRÍTICA-2 (precisa de tags SHA para saber o que é desta app) |

---

### 🟡 MÉDIA-8 — Medir consumo real após restauração

| Campo | Conteúdo |
|---|---|
| **Problema** | Toda a §2.2 da auditoria (desperdício em runtime: recurso por requisição, polling, N+1, vazamento) ficou **NÃO MEDIDA** por falta de app no ar. |
| **Solução** | Com a app rodando: `docker stats` em repouso e sob carga, `pg_stat_statements`, contagem de conexões do pool. |
| **Impacto** | Gera a base para o **dimensionamento honesto** dos limites da ALTA-4. |
| **Risco** | **Nenhum** (observação). |
| **Depende de** | CRÍTICA-3 |

---

### 🔵 BAIXA-9 — Higiene do repositório

Remover do disco local `cookies*.txt` e o `.env` de VPS com nome corrompido; revisar
`CREDENCIAIS_TESTE.md` (versionado). Os ~20 scripts `.sh` legados na raiz ficam **como estão** —
ver NÃO FAZER.

---

## 2. Decisões que exigem o usuário (§1.8)

### 🔴 DECISÃO-1 — Chave DKIM perdida

`/var/lib/ultrazend/configs/dkim-keys/` não existe. A chave privada de assinatura sumiu com o host.

O deploy **gera secrets novos automaticamente** (JWT, cookie, encryption) — isso é seguro num
ambiente de teste. **Mas a chave DKIM não pode ser regenerada silenciosamente:** o DNS
`default._domainkey.velomail.com.br` publica a chave *pública* correspondente. Chave nova sem
atualizar o DNS = **toda entrega assinada falha na validação**.

Opções: (a) restaurar de backup, se existir; (b) gerar par novo e **atualizar o registro DNS**;
(c) subir com `ENABLE_DKIM=false` temporariamente, aceitando pior entregabilidade.

**Não escolho sozinho.** Vou implementar tudo o mais e deixar este ponto explícito.

### 🟡 DECISÃO-2 — Banco de dados vazio

O volume `ultrazend-postgres-data` não existe. A app subirá com **banco novo, sem dados**. Em
ambiente de teste isso é aceitável; registro para não haver surpresa.

---

## 3. NÃO FAZER — considerado e recusado

| Item | Por que foi recusado |
|---|---|
| **Remover `@modelcontextprotocol/sdk`** | **Hipótese minha, verificada e descartada.** É funcionalidade de produto: endpoint `/api/ai/mcp` autenticado + geração de config para Cursor e VS Code. Superfície contratual com o cliente. |
| **Podar dependências de produção** | Verifiquei as 12 mais suspeitas: **todas em uso**. Não há poda. |
| **Reduzir o contexto de build** | Já corta 99,1% (492 MB → 4,2 MB). Nada a ganhar. |
| **Trocar `node:18-alpine` por imagem menor** | `bcrypt` e `sqlite3` têm binários nativos; distroless/scratch exigiria validação que o ganho não justifica. §1.6. |
| **Baixar os limites de memória atuais** | 256M/512M foram dimensionados com o tuning interno do Postgres e o `--max-old-space-size=384` casados. Mexer sem medir pico = OOM sob carga. §1.6. |
| **Juntar postgres + api num container** | Reduziria a contagem de containers sem reduzir consumo, e quebraria o ciclo de vida independente do banco. §2.3. |
| **Remover os ~20 scripts `.sh` legados da raiz** | **Não tenho evidência de que são obsoletos** — não rastreei cada um. §1.2 proíbe concluir "sem uso" sem prova. Ficam. |
| **`docker system prune -a` para liberar disco** | Host compartilhado: apagaria imagens e cache das outras três aplicações. 🔴 Proibido. |
| **Apagar containers por filtro de nome `ultrazend`** | `ultrazend-messages`, `-face`, `-smtp` pertencem ao projeto **digiurban**. Derrubaria produção alheia. |
| **Migrar o deploy para `docker compose up` na VPS** | Tentador (o compose é melhor que os `docker run`), mas aumenta o escopo da mudança num deploy já quebrado. Fica para depois de estabilizar. |

---

## 4. Ordem de execução (impacto ÷ risco, respeitando dependências)

1. **ALTA-5** — deploy não destrutivo *(sem dependências, risco baixo)*
2. **CRÍTICA-1** — build no CI + GHCR
3. **CRÍTICA-2** — tag imutável por SHA + rollback
4. **MÉDIA-7** — limpeza com escopo restrito
5. **ALTA-4** — limites de CPU e PIDs
6. **MÉDIA-6** — alinhar compose
7. **BAIXA-9** — higiene local
8. **CRÍTICA-3** — executar o deploy e restaurar *(requer DECISÃO-1)*
9. **MÉDIA-8** — medir e revisar limites *(só após a app no ar)*

Itens 1–7 são alterações de código, validáveis localmente. O item 8 toca a VPS. O item 9 exige
produção estável — vem depois, nunca antes.
