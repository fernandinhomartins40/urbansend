# Padrão para rodar muitas aplicações Docker na mesma VPS

Regras derivadas da auditoria do VeloMail e do estado real desta VPS (aprenderia, digiurban,
m2centerauto e VeloMail no mesmo host). **Não é teoria genérica** — cada regra aponta o problema
concreto que a originou, e o status de validação está declarado.

---

## 0. As quatro lições que custaram caro

Antes das regras, o que esta auditoria de fato provou:

1. **O deploy que compila na máquina de produção é a maior fonte de dano.** Não pelo consumo em si,
   mas porque a falha de build vira falha de deploy, sem artefato para promover — e porque um SSH
   interrompido deixa processos órfãos segurando locks. Foi o que tirou o VeloMail do ar por 4 dias.
2. **Nome de container não identifica a aplicação.** `ultrazend-messages` pertence ao projeto
   `digiurban`. Limpeza por nome derruba produção alheia. **Use labels.**
3. **Dado de auditoria envelhece rápido.** Um relatório de 14/09 descrevia 95 containers e disco a
   84%; em 16/09 eram 16 containers e 11%. Agir sobre número velho é agir às cegas — **meça de novo**.
4. **Tirar o build da VPS não basta: o pipeline precisa de fila e de gate.** Dois workflows
   disparando no mesmo push compilavam tudo em dobro, e o deploy subia mesmo com o gate de
   qualidade cancelado. Sem `concurrency`, dois pushes seguidos viram dois deploys simultâneos no
   mesmo host — **o mesmo empilhamento que gerou os órfãos do flowcraft**. Ver §3.3.

---

## 1. Estrutura de uma aplicação nova

```
projeto/
├── .github/
│   ├── workflows/deploy-production.yml   # build no runner, deploy por SSH
│   └── scripts/deploy-remote.sh          # o que roda NA VPS (só pull + run)
├── backend/
│   ├── Dockerfile                        # multi-stage
│   └── .dockerignore                     # obrigatório
├── docker-compose.yml                    # DEV LOCAL — avisar no topo se produção não usa
└── docs/DEPLOY.md                        # rollback testado, limpeza, diagnóstico
```

**Regra:** se produção não usa o compose, **diga isso no topo do arquivo**. Divergência silenciosa
entre o que está versionado e o que roda é uma armadilha para o próximo que editar.
*(Status: aplicada no VeloMail; validada por leitura, não por incidente.)*

---

## 2. Dockerfile

- **Multi-stage sempre**: `prod-deps` → `builder` → `runtime`, e um stage opcional para migration.
- **Ferramenta de schema fora do runtime.** O Prisma CLI (~190 MB) vive só no stage de migration,
  que roda como container efêmero. Não fica residente 24 h. *(Validado: medido em ~190 MB.)*
- **`--chown` nos `COPY`, nunca `chown -R` depois.** Um `chown -R` posterior reescreve cada arquivo
  e cria uma camada do tamanho de `node_modules`. *(Validado: ~230 MB medidos no VeloMail.)*
- **Usuário não-root** criado *antes* dos `COPY`.
- **`dumb-init` como PID 1**, para que sinais cheguem ao processo.
- **`.dockerignore` obrigatório.** No VeloMail corta 99,1% (492 MB → 4,2 MB). *(MEDIDO.)*
- ⚠️ **Não adicione `# syntax=docker/dockerfile:1` sem necessidade.** Faz o BuildKit baixar o
  frontend do Docker Hub a cada build; numa VPS saturada isso falha com TLS timeout. Só use se
  precisar de heredoc, `RUN --mount` ou `COPY --link`. *(Validado: causou falha de deploy real.)*

---

## 3. Deploy — a regra que mais importa

### 3.1 Build fora da produção, sempre

| Onde | O quê |
|---|---|
| **Runner de CI** | `docker build`, `npm run build`, testes, lint |
| **VPS** | `docker pull`, `docker run`, extrair tarball |

A VPS não deve ter toolchain de build. Se o deploy precisa de `npm` na VPS, o desenho está errado.

*(Status: **implementado** no VeloMail, **ainda não executado** de ponta a ponta.)*

### 3.2 Versione por identificador imutável

`ghcr.io/<owner>/<app>:sha-<commit>` — nunca só `:latest`.

É isso que torna rollback uma **troca de variável** em vez de um rebuild sob pressão. Um rebuild de
emergência acontece exatamente quando o host está mal — ou seja, quando ele falha.

*(Status: implementado; **rollback ainda não testado de ponta a ponta**.)*

### 3.3 Um push, um pipeline — com trava de concorrência

Três erros que andam juntos e que esta auditoria cometeu antes de corrigir:

**a) Workflows duplicados.** `quality.yml` e `deploy-production.yml` disparavam ambos em
`push: main`. Resultado: o frontend era compilado **duas vezes** no mesmo commit, e o backend no
`quality` e de novo dentro do `docker build`. Correção: o workflow de qualidade roda em
`pull_request`; no push, o gate é um **job** dentro do próprio deploy.

**b) Deploy sem gate.** Como eram workflows independentes, o deploy publicava imagem e fazia SSH
**mesmo com o `quality` falhando ou cancelado** — observado: um run com `Quality checks: cancelled`
e `Deploy Production: success` no mesmo segundo. Correção: `needs: quality` no job de build.

**c) Sem trava de concorrência.** Dois pushes seguidos disparavam dois deploys simultâneos contra o
mesmo host. **É esse empilhamento que produziu os 8 containers órfãos e os 11 `docker build` zumbis
do flowcraft** (6 deploys em 2 horas). Correção:

```yaml
concurrency:
  group: deploy-production      # sem ${{ github.ref }}: a fila é por AMBIENTE, não por branch
  cancel-in-progress: false     # cancelar no meio deixa migração pela metade e container parcial
```

> `cancel-in-progress: false` é deliberado no deploy. Em CI de qualidade, `true` é o certo (cancelar
> uma verificação obsoleta não custa nada). **Num deploy, cancelar no meio é pior que esperar:**
> deixa migração parcial e container meio-subido no host.

*(Status: **implementado e simulado** nos 5 cenários de gate; ainda não exercitado com dois pushes
concorrentes reais.)*

### 3.4 Deploy não destrutivo e idempotente

- Clone/extração em diretório temporário, **troca atômica** só após sucesso. Nunca `rm -rf` do
  destino antes de ter o substituto pronto.
- Validar o artefato antes de trocar (ex.: `test -f dist/index.html`).
- Rodar duas vezes não deve acumular lixo.

*(Status: implementado no VeloMail.)*

### 3.5 Serviço removido não some sozinho

Ao retirar um serviço, percorra o checklist da §7. Remoção pela metade deixa a aplicação **pior**:
paga o custo da configuração morta sem nenhum benefício.

---

## 4. Limites de recurso — obrigatórios, os três

Todo container precisa de **memória**, **CPU** e **PIDs**. Sem os três, não é padrão seguro: é
proteção ausente. Uma app pode derrubar as outras.

```bash
docker run -d \
  -m 512m --memory-swap 512m \
  --cpus=1.5 \
  --pids-limit=300 \
  ...
```

No compose, use `mem_limit` / `cpus` / `pids_limit` no nível do serviço. **`deploy.resources` é
chave do Swarm** — no Compose v2 o equivalente direto é mais explícito e menos sujeito a surpresa.
*(Validado: `docker compose config` confirma a resolução dos três limites.)*

### 4.1 Limite externo exige ajuste interno

Esta é a regra que mais gente erra. Limitar memória **sem ajustar a configuração do processo** faz
o container ser morto por OOM exatamente sob carga — pior que não limitar.

| Processo | Limite do container | Ajuste interno obrigatório |
|---|---|---|
| Node | 512 MB | `NODE_OPTIONS=--max-old-space-size=384` (folga p/ off-heap) |
| Postgres | 256 MB | `shared_buffers=64MB`, `effective_cache_size=192MB`, `max_connections=50` |

*(Validado por leitura da configuração do VeloMail; **não validado sob carga real**.)*

### 4.2 Dimensionar a partir de medição, não de chute

Meça o **pico**, não a ociosidade: `docker stats`. Defina o limite com folga real sobre o pico.

> ⚠️ **Confissão metodológica:** os valores de CPU/PIDs do VeloMail (1.0/200 e 1.5/300) são
> **ESTIMADOS**, não medidos — a aplicação estava fora do ar. São generosos de propósito e devem
> ser revistos após medição real. Registrar isso é parte do padrão: **um número sem origem
> declarada é um número em que não se deve confiar.**

---

## 5. Limpeza em host compartilhado

🔴 **A regra:** todo comando de limpeza precisa de escopo. Comando global atinge as outras apps.

### Nunca

| Comando | Por quê |
|---|---|
| `docker system prune -a` | apaga imagens de todas as aplicações |
| `docker image prune -a` | idem |
| `docker builder prune` | **não aceita filtro por projeto** — apaga cache alheio |
| `docker volume prune` | apaga **dados** |
| `docker rm $(docker ps -aq --filter name=<app>)` | nome ≠ projeto. Ver lição 2. |

### Sempre

Identifique pela **origem**, não pelo nome:

```bash
docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}'
docker images --filter "reference=*/*/<app>" --format '{{.CreatedAt}}\t{{.ID}}' \
  | sort -r | tail -n +4 | cut -f2 | xargs -r docker rmi
```

Mantenha as N mais recentes (rollback) e **nunca remova a imagem em uso**.

*(Validado: o padrão `*/*/<nome>` foi testado contra imagens GHCR reais neste host e casa apenas
com as do registry, não com imagens locais homônimas.)*

---

## 6. Evitar crescimento infinito de disco

| Fonte | Controle |
|---|---|
| Logs de container | `--log-opt max-size=10m --log-opt max-file=3` em **todos** |
| Releases antigas | manter N releases; derrubar os containers da anterior **antes** de apagar o diretório |
| Imagens antigas | limpeza com escopo (§5), mantendo as 3 mais recentes |
| journald | `SystemMaxUse=` em `/etc/systemd/journald.conf` |
| Backups em `/root` | política de retenção — nunca acumular indefinidamente |

⚠️ **Deploy versionado por diretório é uma armadilha conhecida.** Se o nome do projeto compose
deriva do diretório (`/opt/app/releases/<sha>/`), cada release vira **um projeto compose diferente**
e o Docker não sabe que um substitui o outro — os containers antigos ficam rodando para sempre.
*(Validado: 9 containers órfãos, 6 deles Postgres, de até 4 meses, documentados em 14/09.)*

**Correção:** fixe o nome do projeto (`COMPOSE_PROJECT_NAME=<app>`, ou `-p <app>`), independente do
diretório. E use `--remove-orphans`.

---

## 7. Checklist: remover um serviço

- [ ] Definição na orquestração (compose/script)
- [ ] Volumes e redes associados *(remover a chave e esquecer o resto invalida o arquivo)*
- [ ] Variáveis de ambiente
- [ ] **Geradores de configuração** — se algo reescreve o `.env` a cada deploy, a config morta ressuscita
- [ ] `depends_on` de outros serviços
- [ ] Pipeline de build e passos de deploy
- [ ] **Rotas/proxies que apontam para ele** (nginx)
- [ ] **Clientes que chamam essas rotas**
- [ ] **Telas que usam esses clientes**
- [ ] Validações de build que exigem seus artefatos
- [ ] Volumes e containers órfãos no host
- [ ] Ajustes de sistema feitos por causa dele

**Se a funcionalidade continua existindo no produto, não é remoção — é migração**, e precisa de
destino definido antes de desligar o antigo.

---

## 8. Checklist: aplicação nova

- [ ] `.dockerignore` presente e efetivo (meça: `du` do diretório × contexto real)
- [ ] Dockerfile multi-stage, usuário não-root, `dumb-init`
- [ ] Ferramentas de schema/CLI fora do runtime
- [ ] Build no CI, **nunca** na VPS
- [ ] Imagem com tag `sha-<commit>`
- [ ] Os **três** limites em todos os containers
- [ ] Ajuste interno casado com o limite externo (§4.1)
- [ ] Rotação de log em todos os containers
- [ ] Healthcheck em todos os serviços residentes
- [ ] Banco **sem porta publicada** no host (`expose`, não `ports`)
- [ ] `COMPOSE_PROJECT_NAME` fixo, não derivado de diretório
- [ ] Labels para permitir limpeza com escopo
- [ ] Volumes de dados nomeados e documentados como "nunca remover"
- [ ] `docs/DEPLOY.md` com rollback **testado**
- [ ] Secrets fora do repositório; gate de arquivos sensíveis no CI

## 9. Checklist: revisão periódica

- [ ] `docker ps -a` — containers sem projeto conhecido?
- [ ] Containers rodando a partir de diretório de release **inexistente**? (bomba-relógio: não sobem após reboot)
- [ ] `docker volume ls` — volumes sem referência?
- [ ] `df -h` e `docker system df`
- [ ] `vmstat` — **steal time**: se o provedor não entrega CPU, o problema não é seu código
- [ ] Processos `docker build` com `PPID 1` (órfãos de deploy interrompido)
- [ ] Todos os containers com os três limites? (`docker inspect`)

---

## 10. Não faça

| Prática | Por quê |
|---|---|
| Juntar serviços num container para "reduzir números" | não reduz consumo e quebra ciclos de vida independentes |
| Separar em muitos containers por elegância de diagrama | cada container tem custo fixo de memória e supervisão |
| Publicar porta de banco no host | expõe sem necessidade; a rede interna basta |
| Limitar memória sem ajustar o processo | OOM sob carga — pior que não limitar |
| Remover código que aponta para serviço inexistente | não é código morto, é **funcionalidade quebrada**; falhe rápido e reporte |
| Concluir "sem uso" a partir de uma busca | busque da raiz, considere import indireto, alias, DI, reflexão |
| Confiar em relatório de auditoria antigo | meça de novo (lição 3) |

---

## 11. Status de validação — honestidade sobre o que foi provado

| Regra | Status |
|---|---|
| `.dockerignore` reduz contexto | ✅ **MEDIDO** (492 MB → 4,2 MB) |
| Prisma CLI fora do runtime economiza ~190 MB | ✅ medido em auditoria anterior |
| `chown -R` cria camada de ~230 MB | ✅ medido em auditoria anterior |
| Diretiva `# syntax` quebra build em VPS saturada | ✅ falha real observada |
| Deploy por diretório gera órfãos | ✅ 9 containers órfãos documentados |
| Build na VPS causa falha de deploy | ✅ `forwarding Ping` + 11 builds zumbis |
| Nome de container ≠ projeto | ✅ `ultrazend-*` do digiurban |
| Filtro `*/*/<app>` isola imagens do registry | ✅ testado neste host |
| Compose v2 aplica `cpus`/`pids_limit` | ✅ `docker compose config` |
| **Valores de CPU/PIDs do VeloMail** | ⚠️ **ESTIMADOS** — sem medição de pico |
| **Rollback por SHA** | ⚠️ **implementado, não testado de ponta a ponta** |
| **Tuning Postgres sob limite de 256 MB** | ⚠️ não validado sob carga real |
| **Build no CI + pull na VPS** | ✅ **executado com sucesso em 16/09** — app no ar, HTTPS válido |
| Limites CPU/PIDs aplicados de fato | ✅ `docker inspect`: `NanoCpus=1500000000`, `PidsLimit=300` |
| Bootstrap SSL em duas fases | ✅ certificado emitido, `CN=velomail.com.br` |
| Gate de qualidade bloqueia o deploy | ✅ 5 cenários simulados; ⚠️ não exercitado com falha real |
| `concurrency` evita deploys simultâneos | ⚠️ implementado, **não exercitado com 2 pushes concorrentes** |
