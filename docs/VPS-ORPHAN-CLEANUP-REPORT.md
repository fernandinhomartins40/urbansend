# Relatório: origem dos containers órfãos e plano de limpeza automatizada

> ## ⚠️ ESTADO SUPERADO — leia antes de agir sobre este documento
>
> **Medição de 2026-09-16 contradiz todo o levantamento abaixo.** Entre 14/09 e 16/09 a VPS foi
> reconstruída ou limpa a fundo. Medido com os mesmos comandos (`free`, `df`, `docker ps`, `uptime`):
>
> | Métrica | Este relatório (14/09) | **Medido em 16/09** |
> |---|---|---|
> | Containers | 95 | **16** |
> | Disco | 162 GB (84%) | **20 GB (11%)** |
> | Swap | 2.759 MB (67%) | **1 MB (0%)** |
> | CPU | 96% (throttle) | **load 0.06, steal 0%** |
> | Builds zumbis | 11 | **0** |
> | Containers do flowcraft | 8 órfãos | **nenhum** |
>
> **Os órfãos descritos aqui não existem mais.** `scripts/remove-flowcraft-orphans.sh` não tem
> mais alvos: ele aborta por segurança se os containers não casarem com o padrão esperado.
>
> **Este documento é preservado como registro de causa raiz**, não como retrato do estado atual.
> A análise dos mecanismos (release sem retirada da anterior, PGDATA compartilhado, build órfão)
> continua **tecnicamente válida e útil** — foi ela que originou as regras de
> `docs/PADRAO-VPS-MULTI-APPS.md`.
>
> Para o estado atual e o diagnóstico vigente, ver **`docs/AUDITORIA-OTIMIZACAO-VPS.md`**.

**VPS:** srv953800.hstgr.cloud (72.60.10.108) — Ubuntu 22.04, KVM 4
**Data do levantamento:** 2026-09-14
**Método:** inspeção read-only via SSH/paramiko. Nada foi removido nesta fase.

---

## 1. Estado atual medido

| Métrica | Valor | Observação |
|---|---|---|
| CPU | 96% | Limitação (throttle) ativada pela Hostinger |
| RAM | 7.964 MB / 15.988 MB | 50% |
| **Swap** | **2.759 MB / 4.095 MB (67%)** | Sinal mais grave: a máquina pagina para disco |
| Disco | 162 GB / 194 GB (**84%**) | 32 GB livres |
| Containers | **95** | 89 running, 6 exited |
| Projetos distintos | **~24** | |
| Volumes | 71 | 10 dangling |
| Imagens dangling | 8 | |
| Journald | 1,0 GB | |

**Evidência de saturação de I/O:** durante o levantamento, `docker system df`, `docker images`
e `du -xhd1 /var/lib/docker` **estouraram timeout de 280 s**. O daemon Docker não consegue
responder a comandos de inventário. Isso não é lentidão de rede — é contenção de disco/CPU.

### Medição do Docker (obtida na 4ª tentativa, após ~30 min de espera)

| Tipo | Itens | Tamanho | **Recuperável** |
|---|---|---|---|
| Images | 67 | 31,53 GB | **6,25 GB (19%)** |
| Local Volumes | 70 | 21,84 GB | 3,48 GB (15%) — ⚠️ são dados |
| **Build Cache** | 156 | **4,94 GB** | 5,1 kB |
| Containers | 94 | 932,3 MB | 12,9 MB (1%) |
| **Total Docker** | — | **~59,2 GB** | — |

`/var/lib/docker/overlay2` tem **962 diretórios** para 67 imagens — indício de camadas
acumuladas. Inodes em 8% (2.029.327 de 25.804.800): não há risco por inode.

### Releases acumuladas: 36 diretórios em 8 projetos

| Projeto | Releases | Período |
|---|---|---|
| **flowcraft** | **8** | todas de 09/05/2026 |
| **rapidinho** | **6** | 10/09 a 14/09 (3 só em 14/09) |
| dramarcela | 5 | todas de 08/09 |
| voxcelular | 5 | 01/05 a 05/05 |
| tagarelinha | 4 | todas de 27/05 |
| aprenderia | 3 | todas de 13/09 |
| m2centerauto | 3 | todas de 26/08 |
| culturaviva | 2 | 07/05 |

### Backups soltos em `/root`: ~600 MB + 26 diretórios

| Arquivo | Tamanho |
|---|---|
| `backup_antes_full.sql.gz` | 313 MB |
| `legado.dump` | 137 MB |
| `legado.sql.gz` | 137 MB |
| `ferraco-full-backup-20251125-163623.sql` | 14 MB |

`legado.dump` e `legado.sql.gz` são provavelmente **o mesmo dado em dois formatos**.
Há ainda 5 cópias de `ferraco-volumes-backup-*` e um diretório literalmente chamado
`mercadoflow.backup.$(date +%Y%m%d-%H%M%S)` — um script que falhou sem expandir a variável.

> **NÃO MEDIDO:** a distribuição de GB por diretório (`/opt`, `/root`). Quatro tentativas de
> `du -xsh` excederam 280 s cada. Não invento valores.

---

## 2. De onde vêm os órfãos — causa raiz

O inventário com `com.docker.compose.project.working_dir` revelou a origem. Existem **três
mecanismos distintos** gerando lixo, e cada um exige um tratamento diferente.

### Mecanismo A — Deploy versionado sem retirada da versão anterior (causa principal)

Vários projetos usam o padrão `/opt/<projeto>/releases/<sha>-<timestamp>/`. O deploy cria uma
release nova e sobe os containers dela, **mas não derruba os da release anterior**. Como o nome
do projeto compose deriva do diretório, cada release vira um *projeto compose diferente* — então
o Docker não tem como saber que um substitui o outro. Os containers antigos ficam rodando para sempre.

A prova está nos nomes. Estes 9 containers têm nome de hash porque o diretório de release virou o
nome do projeto:

| Container | Projeto real | Diretório de origem | Idade |
|---|---|---|---|
| `7914c1c-20260509111806-postgres-1` | flowcraft | `/opt/flowcraft/releases/7914c1c-20260509111806` | 4 meses |
| `8c1dc40-20260509113600-postgres-1` | flowcraft | `/opt/flowcraft/releases/8c1dc40-20260509113600` | 4 meses |
| `8c1dc40-20260509113600-api-1` | flowcraft | idem | 4 meses |
| `8c1dc40-20260509113805-postgres-1` | flowcraft | `/opt/flowcraft/releases/8c1dc40-20260509113805` | 4 meses |
| `8c1dc40-20260509113805-api-1` | flowcraft | idem | 4 meses |
| `289cb5b-20260509114459-postgres-1` | flowcraft | `/opt/flowcraft/releases/289cb5b-20260509114459` | 4 meses |
| `25f0505-20260509115257-postgres-1` | flowcraft | `/opt/flowcraft/releases/25f0505-20260509115257` | 4 meses |
| `a6c3fa0-20260509132846-postgres-1` | flowcraft | `/opt/flowcraft/releases/a6c3fa0-20260509132846` | 4 meses |
| `56184f7-20260531143115-postgres-1` | palmital | `/opt/palmital/releases/56184f7-20260531143115` | 3 meses |

**O flowcraft sozinho deixou 8 containers órfãos — 6 deles Postgres — todos de 09/05/2026,
em 6 deploys feitos no intervalo de 2 horas** (11:18, 11:36, 11:38, 11:44, 11:52, 13:28).
Cada deploy daquela sessão empilhou mais um Postgres que nunca saiu.

Um Postgres ocioso consome ~30-60 MB de RSS e mantém processos de background (autovacuum,
checkpointer, WAL writer). Nove deles são um custo permanente de RAM e de CPU de fundo.

### 🔴 Mecanismo A-bis — Releases APAGADAS com containers ainda rodando (achado crítico)

O script de detecção encontrou **mais 6 casos que a inspeção manual não pegou**: containers de
projetos que você usa hoje, rodando a partir de um diretório de release **que não existe mais no disco**.

| Container | Imagem | Idade | Projeto |
|---|---|---|---|
| `aprenderia-scheduler` | curlimages/curl:8.12.1 | 2 dias | aprenderia |
| `rapidinho-redis` | redis:7-alpine | 4 dias | rapidinho |
| `rapidinho-minio` | minio/minio:latest | 4 dias | rapidinho |
| `marcela_postgres` | postgres:16-alpine | 4 meses | dramarcela |
| `marcela_minio` | minio/minio:latest | 4 meses | dramarcela |
| `m2centerauto-postgres-1` | postgres:16-alpine | 4 meses | m2centerauto |

**Estes NÃO são órfãos para apagar — são uma bomba-relógio.** O container está vivo só porque
nunca reiniciou. O `docker-compose.yml` que o define foi apagado junto com a release antiga.
Consequência: **se a VPS reiniciar, ou se esses containers caírem, eles não sobem de novo** —
e `marcela_postgres`, `rapidinho-redis` e `m2centerauto-postgres-1` são bancos de dados de produção.

Isto é mais urgente que a limpeza de disco. Ação recomendada: para cada um, recriar o compose na
release atual do projeto e migrar o serviço, **antes** de qualquer reinício.

### Mecanismo B — O mesmo padrão, de forma parcial, em projetos ativos

Alguns projetos têm containers apontando para **releases diferentes ao mesmo tempo** — sinal de
que o deploy atualizou parte dos serviços e deixou o resto na versão antiga:

- **aprenderia**: `nginx`/`web` na release `479bfd3-20260913212411`, `postgres` na `21d12e5-20260913191335`, `media-init` na `e4aacb6-20260912201704`, `scheduler` na `0e724b2-20260911224933` — **4 releases distintas**
- **dramarcela**: 4 containers na release `f4441c6-20260908214010`, mas `minio` e `postgres` na `3a5f208-20260430150044` (4 meses atrás)
- **m2centerauto**: 5 containers na `eaa925f-20260826135333`, `postgres` na `53897eb-20260428213216`
- **culturaviva**: 3 containers na `0c47924`, `postgres` na `30f0a6a`
- **rapidinho**: 4 na `73ab4da`, mas `redis`/`minio` na `c320cf1`

Isto **não é necessariamente erro** — pode ser intencional (não recriar o banco a cada deploy).
Mas significa que os diretórios de release antigos **não podem ser apagados**: ainda há containers
vivos referenciando-os. Importante para a limpeza de disco.

### 🔴 Mecanismo A-ter — Processos `docker build` órfãos (achado de 2026-09-14 16:56Z)

**11 processos `docker build -t ultrazend-api:latest` travados desde 12/09/2026, 15:24.**

```
PID     PPID  STAT  ELAPSED      COMMAND
2533408 1     Ss    2-01:33:26   bash -s
2540508 2533408 Sl  2-01:32:40   docker build ... -t ultrazend-api:latest
... (mais 8 iguais, iniciados entre 15:24 e 15:45 de 12/09)
```

**`PPID 1` prova que são órfãos:** a sessão SSH do deploy morreu, o `bash -s` foi
adotado pelo init, e o `docker build` ficou esperando um cliente que não existe mais.

A janela 15:24–15:45 de 12/09 é **exatamente a dos 14 deploys que falharam naquele dia**.
Cada deploy que estourou deixou o `docker build` para trás.

Estado `Sl` e 0% de CPU: não queimam processador, mas **seguram locks e sessões do
BuildKit**, o que faz cada novo build rastejar. São seguros de encerrar — builds
abandonados há 2 dias não produzem nada.

**Load average: 258,78** numa VPS de 4 vCPUs — 64× a capacidade. Não é CPU ocupada
computando; é fila de processos presos em I/O.

Origem: `.github/scripts/deploy-production-remote.sh`, que roda `docker build`
diretamente pela sessão SSH, sem `setsid`/`nohup` e sem trap de limpeza. Quando o
deploy falha ou o SSH cai, o build fica.

**Correção estrutural:** mover o build para o CI (GHCR). Sem build na VPS, não há
build órfão. É o mesmo item P0-1 já registrado.

### Conflito de prune concorrente (observado)

O `--apply` do guardian falhou em `docker image prune` com:

```
Error response from daemon: a prune operation is already running
```

Causa: o `deploy-production-remote.sh` executa `docker image prune -af --filter "until=24h"`.
Note o **`-a`**: remove todas as imagens sem container, não apenas dangling. Esse prune do
deploy ficou **mais de 16 minutos** sem concluir.

Dois deploys simultâneos, ou um deploy junto do guardian, colidem. Mitigação: o timer do
guardian roda às 04:00, fora da janela típica de deploy.

### 🔬 Flowcraft: 6 Postgres disputando o MESMO PGDATA (2026-09-14 17:50Z)

Ao executar a remoção com dump, o `pg_dumpall` travou e produziu um arquivo de 1376 bytes
sem nenhum `CREATE TABLE`. O script **recusou remover** (comportamento projetado: dump
inválido ⇒ container preservado) e apagou o dump ruim. Investigando o porquê:

```
a6c3fa0-...-postgres-1 -> /opt/flowcraft/data/postgres
25f0505-...-postgres-1 -> /opt/flowcraft/data/postgres
289cb5b-...-postgres-1 -> /opt/flowcraft/data/postgres
8c1dc40-...113805-postgres-1 -> /opt/flowcraft/data/postgres
8c1dc40-...113600-postgres-1 -> /opt/flowcraft/data/postgres
7914c1c-...-postgres-1 -> /opt/flowcraft/data/postgres
```

**Os 6 Postgres montam o mesmo diretório de dados** (bind mount, não volume Docker).
Um PGDATA só admite um postmaster: o `postmaster.pid` mostra um único dono, e os outros
5 containers **nunca conseguiram inicializar** — daí estarem `unhealthy` há 4 meses e não
responderem a `docker exec`.

| Fato | Valor |
|---|---|
| PGDATA total | **47 MB** |
| `/opt/flowcraft` inteiro | 51 MB |
| Última escrita de dados | **2026-05-09 13:29** |
| Containers compartilhando | 6 |
| Containers que subiram de fato | 1 |

**Consequência para a limpeza:** o dump por `pg_dumpall` é impossível em 5 dos 6 — eles não
têm banco rodando. E é desnecessário: o backup correto é copiar o diretório
`/opt/flowcraft/data/postgres` (47 MB), que contém o estado real e único.

**Causa raiz:** o mesmo bug dos demais mecanismos. Cada deploy criou uma release nova
apontando para o PGDATA compartilhado em `/opt/flowcraft/data/`, sem derrubar a anterior.
O padrão de release versionada foi aplicado ao código, mas **não ao dado** — que ficou
num caminho fixo, compartilhado por todas as releases.

### Mecanismo C — Containers `Exited` acumulados

6 containers parados, nunca removidos:

| Container | Estado | Há quanto tempo |
|---|---|---|
| `erpnovo-queue` | Exited (1) | 9 horas |
| `vigiaescolar-retention-worker-1` | Exited (1) | 9 horas |
| `vigiaescolar-absence-worker-1` | Exited (128) | 12 horas |
| `ultrazend-smtp` | **Exited (137)** | 17 horas |
| `aprenderia-media-init` | Exited (0) | 18 horas |
| `vigiaescolar-notification-worker-1` | Exited (1) | 29 horas |

Dois achados que merecem atenção **independente da limpeza**:

- **`ultrazend-smtp` — Exited (137) = morto por OOM killer.** É um serviço do digiurban, e
  está fora do ar há 17 h. 137 = 128+9 (SIGKILL), assinatura de falta de memória.
- **Os 3 workers do vigiaescolar com Exit 1** estão em loop de falha; não é limpeza, é bug.

### Diagnóstico adicional: "unhealthy" em massa

**53 dos 89 containers running estão `(unhealthy)`.** Inclusive bancos de dados em produção
(`digiurban-postgres`, `tagarelinha-postgres`, `rapidinho-postgres`, `vigiaescolar-db-1`...).

Isto é quase certamente **consequência, não causa**: healthchecks têm timeout curto (3-10 s), e
numa máquina com CPU a 96% e swap a 67% eles expiram antes de responder. O healthcheck falhando
faz o Docker executá-lo de novo, o que consome mais CPU — um ciclo que se realimenta.

---

## 3. Por que o deploy do urbansend "não funciona"

Não é falha da aplicação. É consequência direta do estado acima:

1. O runner do GitHub Actions é **self-hosted, dentro desta mesma VPS** (`/opt/actions-runner`,
   `/opt/actions-runner-dubena` — processo `RunnerService.js` ativo há 97 dias).
2. O run `34802642929` (commit `e2d2849`) foi criado às **03:26 UTC** e só começou a executar às
   **14:58 UTC** — **11h32 de fila**, esperando o runner vagar.
3. Às 15:15 UTC havia um **`npm ci` a 71,8% de CPU** rodando há 15 min: é o build do urbansend
   competindo com 95 containers.
4. Havia um `docker builder prune -f` **travado há 12h41min** — comando que normalmente leva segundos.
5. No momento de escrita, o step "Deploy via SSH" já passa de **1h30 em execução**.

**O deploy não falha — ele rasteja e às vezes estoura timeout.** O histórico confirma: em
2026-09-12, entre 15:45 e 16:20, houve **14 execuções com 11 falhas**, todas no mesmo intervalo
de meia hora.

### Conexão com a otimização já feita

A redução da imagem (1,37 GB → 310 MB, commit `e2d2849`) é real e continua válida, mas ataca um
sintoma secundário. **O gargalo é a VPS compilar a aplicação.** O item P0-1 já registrado em
`VPS-OPTIMIZATION-AUDIT.md` — mover o build para GitHub Actions + GHCR — passa a ser a correção
principal, não um "nice to have".

O padrão já existe na sua infra: o **erpnovo** roda imagens `ghcr.io/fernandinhomartins40/erpnovo-app:<sha>`,
ou seja, **pull em vez de build**. O urbansend é que ficou para trás.

---

## 4. O que pode ser limpo — classificado por risco

### ✅ SEGURO — automatizável sem confirmação

| Item | Quantidade | Ganho |
|---|---|---|
| Imagens dangling | 8 | NÃO MEDIDO |
| Build cache do Docker | — | NÃO MEDIDO (`docker system df` não respondeu) |
| Journald acima de 200 MB | 1,0 GB atual | ~800 MB |
| Logs de container json-file > 100 MB | NÃO MEDIDO | — |

### ⚠️ SEGURO COM REGRA — automatizável com critério de idade

| Item | Quantidade | Critério proposto |
|---|---|---|
| Containers `Exited` | 6 | Remover se parado há > 7 dias **e** não fizer parte de projeto ativo |

Observação: dos 6 atuais, **nenhum** tem mais de 7 dias. A regra não os removeria hoje — e está
correto, porque `ultrazend-smtp` e os workers do vigiaescolar são **bugs a investigar**, não lixo.

### 🛑 REQUER SUA DECISÃO — nunca automatizar

| Item | Quantidade | Por quê |
|---|---|---|
| **15 containers órfãos de release** | 15 (9 bancos) | São bancos de dados. Podem conter dados que você quer. Ver Mecanismo A e A-bis. |
| **10 volumes dangling** | 10 | Ver alerta abaixo. |
| Diretórios `/opt/*/releases` antigos | NÃO MEDIDO | Alguns ainda têm containers vivos (Mecanismo B) |
| Backups em `/root` | ~25 arquivos/dirs | `.sql.gz`, `.dump`, `ferraco-volumes-backup-*` (5 cópias), `dramarcela.bak*`... |

> ### ⛔ Alerta sobre `docker volume prune`
>
> **O script de automação NÃO vai apagar volumes, e recomendo que você também nunca rode
> `docker volume prune` nesta máquina.**
>
> "Dangling" não significa "lixo". Significa "nenhum container **existente** referencia este volume".
> Se um `docker compose down` removeu os containers de um projeto que você ainda usa, o volume do
> banco dele aparece como dangling — e um prune apagaria o banco.
>
> Veja a lista real de dangling: `api-app-gc_db_data`, `ultrazend_postgres-data`,
> `rebequi-ollama-data`, `moria-6df9f9ce_uploads_data`, `erp-novo_app_vendor`...
> **`ultrazend_postgres-data` e `api-app-gc_db_data` são volumes de banco de dados.** Um prune
> automático seria perda de dados irreversível.
>
> Volumes entram no relatório. Nunca na remoção automática.

---

## 5. Plano de ação

### Fase 1 — Alívio imediato, sem risco (posso executar agora)

1. `docker image prune -f` (só dangling, 8 imagens)
2. `docker builder prune -f --filter until=168h` (cache com mais de 7 dias)
3. `journalctl --vacuum-size=200M` (libera ~800 MB)
4. Truncar logs json-file acima de 100 MB

### Fase 2 — Órfãos de release (precisa da sua autorização, projeto por projeto)

Os 9 containers do flowcraft/palmital. **Antes de remover, farei dump de cada Postgres** para
`/root/backups-orfaos-<data>/`, para que a remoção seja reversível. Preciso que você confirme:

- **flowcraft** (8 containers, 6 Postgres): o projeto ainda existe? Os dados importam?
- **palmital** (1 Postgres): mesma pergunta.

### Fase 3 — Prevenção (a parte que resolve de verdade)

1. **Script Python de manutenção** instalado na VPS, rodando por cron — detalhado na seção 6.
2. **Corrigir o deploy dos projetos com `/releases`** para derrubar a release anterior. É aqui que
   o problema nasce; sem isso, os órfãos voltam.
3. **Mover o build do urbansend para GHCR** — tira o `npm ci` da VPS.
4. **Definir `log-opt max-size` global** em `/etc/docker/daemon.json`, para que todo container novo
   já nasça com rotação de log.
5. **Reavaliar capacidade**: 24 projetos, 95 containers, 84% de disco e swap a 67% não é problema
   de configuração — é de dimensionamento.

---

## 6. Script de manutenção automatizada

**Arquivo:** `scripts/vps-maintenance.py` (neste repositório, para instalar na VPS)

### Princípios de segurança

O script foi desenhado com estas travas:

1. **Dry-run por padrão.** Só age com `--apply` explícito.
2. **Nunca toca em volumes.** Só relata.
3. **Nunca toca em containers `running`.** Órfão em execução vira alerta no relatório, não remoção.
4. **Allowlist de operações.** Não existe `prune -a`, não existe `rm -rf` genérico.
5. **Idade mínima** configurável para cada categoria.
6. **Proteção de disco:** se o uso estiver acima de 90%, o script alerta mas continua; não entra em
   modo agressivo.
7. **Log auditável** em `/var/log/vps-maintenance.log`, com o que foi feito e o que foi só relatado.
8. **Lock file**, para não haver duas execuções simultâneas.
9. **`nice`/`ionice`**, para não competir com a aplicação.

### O que ele faz

| Operação | Automática | Condição |
|---|---|---|
| Remover imagens dangling | Sim | sempre |
| Podar build cache | Sim | idade > 7 dias |
| Vacuum do journald | Sim | acima de 200 MB |
| Truncar logs json-file | Sim | arquivo > 100 MB |
| Remover containers `Exited` | Sim | parado > 7 dias |
| Detectar órfãos de release | **Não** — só relata | container running cujo `working_dir` não existe mais |
| Volumes dangling | **Não** — só relata | sempre |
| Containers `unhealthy` | **Não** — só relata | sempre |

### Cron proposto

```cron
# Relatório diário (não altera nada) — 06:00
0 6 * * * /usr/bin/python3 /opt/vps-maintenance/vps-maintenance.py --report >> /var/log/vps-maintenance.log 2>&1

# Limpeza segura semanal — domingo 04:00
0 4 * * 0 /usr/bin/nice -n 19 /usr/bin/ionice -c3 /usr/bin/python3 /opt/vps-maintenance/vps-maintenance.py --apply >> /var/log/vps-maintenance.log 2>&1
```

---

## 6-bis. Validação do script (executada)

O script foi enviado para `/opt/vps-maintenance/vps-maintenance.py` e executado nos dois modos
não destrutivos. Resultados reais:

**Auditoria estática (AST):** extraí os 13 comandos shell que o script realmente executa.
Nenhum é destrutivo — não há `volume rm`, `volume prune`, `prune -a` nem `rm -rf`.

```
df --output=pcent /              docker image prune -f
docker builder prune -f --filter docker images -qf dangling=true
docker inspect -f {{.State...}}  docker ps -a --format
docker rm <nome>                 docker system df -v
docker volume ls -qf dangling    find ... -name '*-json.log'
journalctl --disk-usage          journalctl --vacuum-size
truncate -s 0 <arquivo>
```

**Execução `--report`** (2026-09-14 15:46Z): 0 ações, 59 alertas, 0 erros. Disco 84% → 84%.

**Execução dry-run** (15:51Z): 3 ações planejadas, 65 alertas, 0 erros.

| O script FARIA | O script NÃO fez, corretamente |
|---|---|
| Remover 8 imagens dangling | Nenhum volume (10 dangling, só relatados) |
| Podar build cache > 168h | Nenhum container running (15 suspeitos, só relatados) |
| Journald 1,0 GB → 200 MB | Nenhum container Exited: todos têm < 7 dias |

A regra de idade provou seu valor: os 6 containers parados têm entre 0,4 e 1,2 dias. Uma limpeza
ingênua os teria apagado; o script os classificou como **"investigar se for falha"** — que é o
diagnóstico certo, já que `ultrazend-smtp` morreu por OOM e os workers do vigiaescolar estão em
loop de erro.

**Bug encontrado e corrigido durante o teste:** meu wrapper de deploy usava `--report` como padrão
quando nenhum argumento era passado, o que fazia o dry-run nunca ser realmente exercitado. Corrigido
antes da validação acima.

**Ponto aberto:** `vigiaescolar-absence-worker-1` (Exit 128) levou 60 s de timeout no
`docker inspect` e o script não conseguiu determinar a idade. Tratou corretamente — não removeu e
gerou alerta. É sintoma da saturação do daemon.

---

## 7. Ganhos esperados

| Item | Ganho |
|---|---|
| Journald | ~800 MB (medido: 1,0 GB → 200 MB) |
| Imagens dangling (8) | NÃO MEDIDO |
| Build cache | NÃO MEDIDO — `docker system df` não respondeu em 280 s |
| 9 containers órfãos | NÃO MEDIDO em disco; estimativa de RAM: 9 × ~40 MB ≈ 360 MB + CPU de background |
| Build fora da VPS (GHCR) | Elimina picos de `npm ci` a ~72% de CPU a cada deploy |

**Não invento números.** A maior parte do ganho de disco está como NÃO MEDIDO porque o Docker não
respondeu aos comandos de inventário — o que é, em si, a melhor evidência de quão saturada a
máquina está. Medirei depois da Fase 1, quando o daemon voltar a responder.

---

## 8. Ações de segurança pendentes

Durante esta investigação foram expostos em texto no chat:

1. **Token GitHub PAT** (fine-grained, nome "Claude") — revogar em https://github.com/settings/tokens
2. **Senha root da VPS** — trocar no painel Hostinger

Ambos devem ser rotacionados. Para acesso contínuo, o correto é **chave SSH** em vez de senha —
a Hostinger já oferece isso em "Chave SSH → Gerenciar".
