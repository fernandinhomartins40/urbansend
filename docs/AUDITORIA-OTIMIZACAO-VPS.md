# Auditoria de otimização para VPS compartilhada — urbansend / VeloMail

**Data:** 2026-09-16
**VPS:** velomail.com.br (72.60.10.108) — Hostinger KVM, Ubuntu 22.04
**Método:** inspeção read-only via paramiko/SSH + GitHub API + análise estática do repositório.
**Nada foi alterado nesta fase.**

---

## 0. Correção de premissa — leia antes de tudo

Este documento **contradiz** `docs/VPS-ORPHAN-CLEANUP-REPORT.md` (14/09) e **a premissa do pedido**.
Registro a correção explicitamente, conforme exigido pela §1.3:

> **Afirmado antes:** "esta aplicação consome mais recursos da VPS do que deveria"; VPS saturada
> com 95 containers, disco 84%, swap 67%, CPU 96%.
>
> **Por que estava errado (hoje):** essas medições são de 14/09. Entre 14/09 e 16/09 a VPS foi
> reconstruída ou limpa a fundo. As medições de hoje, feitas com **os mesmos comandos**, mostram
> uma máquina ociosa.
>
> **Conclusão correta:** não há saturação a combater. O problema real é outro e é mais grave —
> **a aplicação VeloMail não está no ar.**

O comentário no topo de `backend/Dockerfile` ("nesta VPS, saturada, ~94 containers") descreve uma
realidade que não existe mais. Não o removi: ele documenta o motivo de uma decisão ainda válida,
mas está factualmente desatualizado.

---

## 1. Resumo executivo

A auditoria começou procurando desperdício de recursos e encontrou outra coisa.

1. **A aplicação não existe na VPS.** Nenhum container, volume, diretório, site nginx ou porta do
   VeloMail está presente. `www.velomail.com.br` serve certificado de outro domínio.
2. **O último deploy bem-sucedido foi em 12/09/2026.** Todos os posteriores falharam.
3. **A causa da falha é o próprio processo de deploy**, que compila na máquina de produção. O build
   morreu com `failed to build: NotFound: forwarding Ping: no such job ...` — BuildKit perdendo a
   sessão numa VPS então saturada (disco 84%).
4. **O código está saudável.** Backend e frontend passam `typecheck` sem erro. A suíte de testes
   existe de fato (34 arquivos). O `docker-compose.yml` e o `Dockerfile` já estão bem otimizados.
5. **A VPS hoje está ociosa** e hospeda três outras aplicações (aprenderia, digiurban, m2centerauto).

O trabalho a fazer não é "consumir menos". É **restaurar a aplicação e corrigir o processo de deploy
que a derrubou** — e, ao fazê-lo, estabelecer o padrão reutilizável pedido.

---

## 2. Estado atual — MEDIDO em 2026-09-16 04:09 UTC

Comandos: `uptime`, `vmstat 1 3`, `free -m`, `df -h`, `docker ps -a`, `ss -lntp`, `curl`.

### 2.1 Host

| Métrica | Valor | Marca |
|---|---|---|
| Load average | 0.06 / 0.21 / 0.31 | **MEDIDO** (`uptime`) |
| **Steal time** | **0%** | **MEDIDO** (`vmstat`) — o provedor entrega a CPU contratada |
| CPU idle | 99–100% | **MEDIDO** (`vmstat`) |
| RAM usada | 1.313 MB / 15.988 MB (8%) | **MEDIDO** (`free -m`) |
| RAM disponível | 14.229 MB | **MEDIDO** |
| **Swap usado** | **1 MB / 2.047 MB (0%)** | **MEDIDO** |
| Disco | **20 GB / 194 GB (11%)** | **MEDIDO** (`df -h`) |
| Uptime | 1 dia 7 h | **MEDIDO** |
| Containers | 16 (15 running, 1 exited) | **MEDIDO** |

Comparação com 14/09 — **mesmo método nas duas medições**:

| Métrica | 14/09 | 16/09 | Variação |
|---|---|---|---|
| Containers | 95 | 16 | −83% |
| Disco | 162 GB (84%) | 20 GB (11%) | −142 GB |
| Swap | 2.759 MB (67%) | 1 MB (0%) | zerado |
| CPU | 96% (throttle) | ~0% (load 0.06) | ocioso |
| Builds zumbis | 11 | 0 | eliminados |

> **NÃO MEDIDO:** `docker system df` (imagens/volumes/build cache) e a causa exata da mudança de
> estado do host. Não inventei explicação — apenas registro que os números mudaram radicalmente.

### 2.2 Aplicações vivas no host (3, além do VeloMail ausente)

Agrupadas por `com.docker.compose.project` — **MEDIDO**:

| Projeto | Containers | Observação |
|---|---|---|
| `digiurban` | 6 | inclui `ultrazend-messages`, `ultrazend-face`, `ultrazend-smtp` |
| `m2centerauto` | 5 | versionados por `<sha>-<timestamp>` — padrão correto |
| `aprenderia` | 5 | 1 exited (`media-init`, saída 0 — normal) |

⚠️ **Armadilha de nomenclatura:** os containers `ultrazend-messages`, `ultrazend-face` e
`ultrazend-smtp` **NÃO são desta aplicação**. Pertencem ao projeto `digiurban` e rodam imagens
`ghcr.io/fernandinhomartins40/digiurban-*`. Um `docker rm` por filtro de nome `ultrazend`
**derrubaria produção do digiurban**. Registrado aqui porque é um erro fácil de cometer.

---

## 3. Achado crítico — a aplicação não está implantada

Provas independentes e convergentes (§1.2: procurei em Docker, PM2, portas, nginx, volumes e FS):

| Verificação | Comando | Resultado |
|---|---|---|
| Containers da app | `docker ps -a` | **nenhum** `ultrazend-api` / `-postgres` / `-migration` |
| Porta da API | `ss -lntp` | **nada escuta em 3001** |
| Gerenciador de processo | `pm2 list` | **pm2 ausente** |
| Diretório da app | `ls /var/www/` | só `certbot/` e `html/` — **sem `ultrazend`** |
| Estáticos do frontend | `ls /var/www/` | **sem `ultrazend-static`** |
| Dados persistentes | `ls /var/lib/ultrazend` | **não existe** |
| Site nginx | `ls /etc/nginx/sites-enabled/` | aprenderia, digiurban, m2centerauto — **sem velomail** |
| Volumes | `docker volume ls` | **sem** `ultrazend-postgres-data` / `-storage-data` |
| HTTP público | `curl https://www.velomail.com.br` | **falha TLS**: certificado de outro domínio |

### 3.1 Perda de dados — decisão pendente

`/var/lib/ultrazend` continha, conforme o script de deploy:

- `configs/.env.production` — JWT_SECRET, COOKIE_SECRET, APP_ENCRYPTION_KEY, SUPER_ADMIN_PASSWORD;
- `configs/dkim-keys/velomail.com.br-default-private.pem` — **chave privada DKIM**;
- `logs/` — logs de aplicação.

Mais os volumes `ultrazend-postgres-data` (banco) e `ultrazend-storage-data` (uploads).

> **NÃO MEDIDO / A DECIDIR:** se existe backup desses dados. Não posso determinar isso pelo host
> atual. **A chave DKIM é a mais sensível:** se foi perdida, o registro DNS `default._domainkey`
> precisa ser republicado com a chave nova, ou toda entrega de e-mail assinada falhará na
> validação. `backup-system.sh` existe no repositório, mas **não verifiquei se rodava nem onde
> gravava** — não afirmo que havia backup, nem que não havia.

---

## 4. Causa raiz da falha de deploy

### 4.1 Histórico — MEDIDO via GitHub API

| Data | Commit | Resultado |
|---|---|---|
| 14/09 16:32 | `03c14b7` Fix deploy failure: remove syntax directive | **failure** |
| 14/09 03:26 | `e2d2849` Reduce production image 1.37GB→310MB | **failure** |
| 12/09 20:08 | `e02bde9` Fix typecheck OOM | **success** ← último sucesso |
| 12/09 16:03–16:19 | 9 commits | **failure** (todos) |

O commit local `ca33512` **não foi enviado ao remote** — existe só nesta máquina.

### 4.2 O erro

```
ERROR: failed to build: NotFound: forwarding Ping: no such job 304on8h9bk5jx07ylz7xkkn8n
ERRO: deploy interrompido na linha 386 (exit=1)
/dev/sda1  194G  163G  32G  84% /
```

O BuildKit perdeu a sessão de build. Não é erro de código — o typecheck passa. É o daemon Docker
afogado: disco a 84% e 11 processos `docker build` zumbis segurando locks do BuildKit.

### 4.3 O defeito estrutural — violação da regra "build fora de produção"

`.github/scripts/deploy-production-remote.sh` executa **dois builds pesados dentro da VPS**:

| Linha (aprox.) | Operação | Custo |
|---|---|---|
| ~193 | `npm ci` + `npm run build` do frontend | Vite + toolchain completo |
| ~386 | `docker build` da imagem do backend | multi-stage, `npm ci` duas vezes |

Consequências, todas observadas:

1. **Disputa CPU e I/O com as outras 3 aplicações** — um build do VeloMail degrada aprenderia,
   digiurban e m2centerauto;
2. **Requer toolchain de build em produção** (Node, npm, cache) — superfície e disco desnecessários;
3. **Falha de build = falha de deploy**, sem artefato prévio para promover;
4. **SSH cai → build vira zumbi** (`PPID 1`), segurando locks. Foi o mecanismo dos 11 processos
   documentados em 14/09;
5. **Não há versionamento imutável de artefato** (`ultrazend-api:latest`), então **rollback exige
   rebuild sob pressão** — exatamente o que não funciona quando o host está saturado.

O CI já tem o que falta: `quality.yml` roda `npm ci`, `typecheck`, `build` e testes em runner do
GitHub. **A capacidade de buildar fora da VPS já existe e já funciona** — só não é usada pelo deploy.

### 4.4 Deploy destrutivo

```bash
rm -rf "$APP_DIR"
git clone --depth 1 "$REPO_URL" "$APP_DIR"
```

Apaga o diretório da aplicação antes de qualquer validação. Se o clone falhar, não há estado
anterior para o qual voltar. Não é idempotente no sentido seguro do termo.

---

## 5. Inventário e classificação (§1.4)

### 5.1 Serviços definidos em `docker-compose.yml`

| Serviço | Estado | Classificação | Ação |
|---|---|---|---|
| `postgres` | ausente na VPS | **Necessário** | restaurar |
| `ultrazend-migration` | ausente | **Necessário mas otimizável** (já é efêmero — correto) | restaurar |
| `ultrazend-api` | ausente | **Necessário** | restaurar |

**Nenhum serviço obsoleto ou duplicado foi encontrado no compose.** A arquitetura de 3 containers
(banco + migration efêmera + API) é racional e justificada: cada um tem ciclo de vida próprio.

### 5.2 O que já está correto — NÃO MEXER

Isto é resultado de trabalho anterior e **não deve ser refeito**:

- ✅ Limites de memória em todos os serviços (256M postgres, 512M api/migration);
- ✅ **Postgres tunado para o limite do container**, não para a RAM do host (`shared_buffers=64MB`,
  `effective_cache_size=192MB`, `max_connections=50`) — evita exatamente o OOM sob carga que a
  §1.6 alerta;
- ✅ **`NODE_OPTIONS=--max-old-space-size=384`** abaixo do limite de 512M, com folga para off-heap;
- ✅ Logging com rotação (`max-size=10m`, `max-file=3`) em todos os serviços;
- ✅ Postgres **não publica porta no host** (`expose`, não `ports`);
- ✅ Migration como **container efêmero** — o Prisma CLI (~190 MB) não fica residente;
- ✅ Dockerfile multi-stage com `--chown` nos COPY (evita camada extra de ~230 MB);
- ✅ Healthchecks em postgres e api; `dumb-init` como PID 1; usuário não-root (uid 1001);
- ✅ `.dockerignore` correto (exclui `node_modules`, `dist`, `.git`, `.env`);
- ✅ Labels `com.ultrazend.component=application` — permitem limpeza com escopo restrito.

### 5.3 Lacunas reais nos limites

| Limite | Status | Observação |
|---|---|---|
| Memória | ✅ definido | 256M / 512M / 512M |
| **CPU** | ❌ **ausente** | nenhum serviço tem `cpus` |
| **PIDs** | ❌ **ausente** | nenhum serviço tem `pids_limit` |

Sem limite de CPU, um loop quente no Node consome todos os vCPUs e degrada as outras 3 aplicações.
Sem `pids_limit`, um vazamento de processos derruba o host inteiro.

> ⚠️ **Ressalva sobre `deploy.resources.limits` em `docker compose up`:** essa chave é do Swarm.
> Docker Compose v2 a respeita para memória, mas o equivalente direto (`mem_limit`, `cpus`,
> `pids_limit`) é mais explícito. **NÃO MEDIDO:** se os limites estavam de fato aplicados nos
> containers que rodavam — não há container vivo para inspecionar. Verificar com `docker inspect`
> após o próximo deploy.

---

## 6. Código da aplicação (§2.2)

| Item | Resultado | Marca |
|---|---|---|
| `npm run typecheck` backend | **passa, zero erros** | **MEDIDO** |
| `npm run typecheck` frontend | **passa, zero erros** | **MEDIDO** |
| Arquivos TS em `backend/src` | 163 | **MEDIDO** |
| Arquivos de teste | 34 | **MEDIDO** |
| Diretórios de teste | `backend/src/__tests__`, `backend/src/tests`, `e2e/` — **existem** | **MEDIDO** |
| Deps de produção / dev | 29 / 34 | **MEDIDO** |
| Contexto de build (backend versionado) | 3,7 MB, 315 arquivos | **MEDIDO** |
| Contexto de build (disco, pós-`.dockerignore`) | **4,2 MB** de 492 MB — corta 99,1% | **MEDIDO** (`du -sh`) |

### 6.1 Dependências de produção — todas em uso (§2.4)

Verifiquei as 12 dependências de runtime mais suspeitas de serem desnecessárias, buscando imports
em `backend/src`. **Todas têm consumidor real:**

`@modelcontextprotocol/sdk` (2), `jsdom` (3), `dompurify` (1), `dns-packet` (1), `generic-pool` (1),
`node-cache` (1), `smtp-server` (2), `mailparser` (5), `swagger-jsdoc` (1), `swagger-ui-express` (1),
`socket.io` (1), `node-cron` (2).

**Nenhuma dependência de produção obsoleta foi encontrada.** Não há poda a fazer aqui.

> **Correção de uma hipótese minha, registrada conforme §1.3:**
>
> **Afirmei** que `@modelcontextprotocol/sdk` em `dependencies` era atípico para um backend de
> e-mail e candidato a ser apenas ferramenta de build — reforçado pelo commit `e02bde9`
> ("Fix typecheck OOM from MCP SDK zod type explosion").
>
> **Estava errado.** `backend/src/routes/ai.ts` instancia `McpServer` e
> `StreamableHTTPServerTransport` — é **uma rota servida pela API em runtime**, não um import de
> tipo que sumiria no build.
>
> **Conclusão correta:** classificação **Necessário**. Removê-lo quebraria uma funcionalidade
> ativa. Este é exatamente o erro que a §1.2 descreve, e só não virou recomendação porque a
> verificação foi feita antes de concluir.

**Busca ampliada (repositório inteiro, não só `backend/src`)** confirmou que o MCP é maior do que
uma rota — é **funcionalidade de produto voltada ao cliente final**:

| Evidência | Local |
|---|---|
| Endpoint MCP autenticado (`POST`/`GET`/`DELETE /api/ai/mcp`) | `src/routes/ai.ts` |
| Protegido por `authenticateJwtOrApiKey` | idem |
| `AiIntegrationService` gera config pronta do **Cursor** (`.cursor/mcp.json`) | `src/services/AiIntegrationService.ts` |
| Idem para **VS Code** (`.vscode/mcp.json`), com chave de API embutida | idem |
| Documentação servida como recurso MCP (`ultrazend://docs/mcp`) | `src/routes/ai.ts` |

O produto oferece ao usuário conectar sua IDE com IA ao VeloMail via MCP. Isso encerra qualquer
hipótese de poda: a dependência é **Necessária** e a superfície é **contratual com o cliente**.

> **NÃO MEDIDO:** as 17 demais dependências de produção não foram verificadas uma a uma. Não
> afirmo que todas estão em uso — afirmo que as 12 mais suspeitas estão.

**A suíte de testes existe de verdade** — ao contrário do cenário que a §5 do prompt alerta
(scripts apontando para diretórios vazios). O `quality.yml` já executa `test:unit` no CI.

> **NÃO MEDIDO:** desperdício em runtime (recurso criado por requisição, polling agressivo, N+1,
> vazamento de conexão). **Isso exige a aplicação rodando e sob carga** — impossível com a app fora
> do ar. Fica pendente para depois da restauração. Não afirmo que está limpo; afirmo que não pude
> verificar.

---

## 7. Higiene do repositório

| Arquivo | Versionado? | Observação |
|---|---|---|
| `CREDENCIAIS_TESTE.md` | **SIM** | revisar conteúdo — o nome sugere credenciais |
| `cookies.txt`, `cookies_new.txt`, `cookies_test.txt` | não | cookies de sessão soltos no disco |
| `C:Projetos Cursorurbansendbackend.env.vps.backup` | não | `.env` de produção com path Windows colado no nome |

Os três últimos não estão no git (o `check-tracked-sensitive-files.mjs` do CI está fazendo seu
trabalho), mas **existem no disco local** e um deles é um `.env` de VPS.

Há ainda **~20 scripts `.sh` soltos na raiz** (`fix-backend.sh`, `force-fix-backend.sh`,
`quick-start.sh`, `redeploy.sh`, `local-deploy-enhanced.sh`…) e `ecosystem.config.js` (PM2), de uma
era anterior ao Docker. **Não os classifico como obsoletos sem evidência** (§1.2) — não rastreei
cada um. Classificação: **a investigar**.

---

## 8. Problemas por severidade

| # | Severidade | Problema | Evidência |
|---|---|---|---|
| 1 | 🔴 **CRÍTICA** | Aplicação fora do ar — não implantada na VPS | 9 verificações independentes |
| 2 | 🔴 **CRÍTICA** | Possível perda de chave DKIM, secrets e banco | `/var/lib/ultrazend` inexistente |
| 3 | 🔴 **CRÍTICA** | Deploy builda em produção — causa da falha e risco ao host | script, linhas ~193 e ~386 |
| 4 | 🟠 **ALTA** | Sem versionamento imutável de imagem → rollback exige rebuild | `ultrazend-api:latest` |
| 5 | 🟠 **ALTA** | Sem limite de CPU e PIDs | compose |
| 6 | 🟠 **ALTA** | `rm -rf $APP_DIR` antes de validar | script |
| 7 | 🟡 **MÉDIA** | DNS aponta para VPS sem site configurado (TLS quebrado) | `curl` |
| 8 | 🟡 **MÉDIA** | Colisão de nomes `ultrazend-*` com o projeto digiurban | labels compose |
| 9 | 🟡 **MÉDIA** | `.env` de produção e cookies soltos no disco local | `ls` |
| 10 | 🔵 **BAIXA** | ~20 scripts legados na raiz, status indefinido | `ls` |

---

## 9. Linha de base para comparação futura

Registrada agora, **mesmo método a ser usado depois** (§6):

| Métrica | Valor | Marca |
|---|---|---|
| Containers do VeloMail no host | **0** | MEDIDO |
| RAM consumida pelo VeloMail | **0 MB** | MEDIDO (não está rodando) |
| Disco do host | 20 GB / 194 GB (11%) | MEDIDO |
| RAM do host | 1.313 MB / 15.988 MB | MEDIDO |
| Load | 0.06 | MEDIDO |
| Steal | 0% | MEDIDO |
| Typecheck backend/frontend | passa | MEDIDO |
| Contexto de build backend | 3,7 MB / 315 arquivos | MEDIDO |
| Último deploy com sucesso | 12/09/2026 (`e02bde9`) | MEDIDO |
| Tamanho da imagem em produção | **NÃO MEDIDO** — não há imagem no host |
| RAM sob carga | **NÃO MEDIDO** — requer app no ar |

⚠️ **Consequência metodológica, e ela é importante:** a linha de base de consumo da aplicação é
**zero, por ausência**. Qualquer número depois da restauração será um *aumento*, não uma piora. A
comparação honesta não é "antes × depois desta otimização", e sim **"12/09 (última execução
conhecida) × depois"** — e os dados de 12/09 não existem mais no host. Isso precisa ficar explícito
em qualquer relatório de resultado, para não vender restauração como economia.

---

## 10. Pergunta que preciso responder antes do plano

Uma só, e é decisão de produto, não técnica (§1.8):

**O VeloMail deve voltar ao ar nesta VPS?**

A auditoria não responde isso. Se a resposta for sim, o plano é restauração + correção do deploy.
Se for não, o trabalho é outro (desativar DNS, arquivar repositório) e boa parte deste documento
vira histórico.

Não presumo a resposta.
