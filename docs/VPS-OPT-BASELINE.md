# VPS-OPT — Baseline (Etapa 1: Descoberta)

> **Escopo:** somente medição de leitura. Nada foi otimizado, alterado, reiniciado ou apagado na VPS
> nem no código. Nenhuma ENV foi exibida e nenhum segredo foi inspecionado.
> Documento par de `VPS-OPT-INVENTORY.md`.

| Campo | Valor |
|---|---|
| Data desta coleta | **2026-09-17, 03:04–03:25 UTC** |
| Host | `velomail.com.br` / `72.60.10.108` (Hostinger) |
| Acesso | **OBTIDO** — SSH via Paramiko (`root`), comandos somente-leitura |
| Commit no ar | `7e1e9bf` |
| Deploy correspondente | run `35147306986`, **success**, 2026-09-16 20:33Z, 3m20s |
| Estado da aplicação | **NO AR e saudável** (`ultrazend-api` Up 6 h, `healthy`) |

> **Correção de premissa.** A versão anterior deste documento registrava a aplicação como fora do
> ar e todas as métricas como NOT MEASURED, baseando-se em auditorias de 14–16/09. A medição direta
> desta sessão desmente isso: o deploy de 16/09 20:33Z foi bem-sucedido e a aplicação está no ar.
> Todas as métricas abaixo são **medidas**, não herdadas.

### Validação de disponibilidade desta revisão (2026-09-17 14:56 BRT)

O workspace desta revisão não tem acesso ao daemon Docker local nem à telemetria do host alvo:
`docker ps` retornou *permission denied* no pipe `docker_engine`, e as consultas WMI/CIM de CPU e
memória foram negadas. Por isso, **não houve nova amostra** de `docker stats`, `df`, `free`, `uptime`,
processos ou I/O. As tabelas seguintes permanecem a **última baseline diretamente medida**, com data,
duração e limitações explícitas; não devem ser apresentadas como estado em tempo real posterior a
03:25 UTC. Esta limitação é uma lacuna de acesso, não evidência de ausência de serviço.

---

## 1. Host — estado atual (MEDIDO, 2026-09-17 03:04 UTC)

| Métrica | Valor | Método |
|---|---|---|
| Uptime | 2 dias 6 h | `uptime` |
| Load average | **0,32 / 0,15 / 0,15** | `uptime` |
| vCPUs | 4 | `nproc` |
| RAM total | 15.988 MB | `free -m` |
| RAM **usada** | **1.657 MB (10,4 %)** | `free -m` |
| RAM **disponível** | **13.857 MB** | `free -m` |
| RAM em **buff/cache** | 13.902 MB | `free -m` |
| **Swap usado** | **1 MB de 2.047 MB (0,05 %)** | `free -m` |
| Disco | **29 GB de 194 GB (15 %)**, 165 GB livres | `df -h /` |
| Containers no host | **17 running** (4 aplicações) | `docker ps` |
| Nginx | `active`, nginx/1.18.0 (Ubuntu) | `systemctl is-active` |
| Journald | 56,0 MB | `journalctl --disk-usage` |

Separação usada / disponível / cache / swap preservada conforme o protocolo §7. Nenhum limite
configurado foi apresentado como consumo. **O host não está sob pressão de recursos.**

---

## 2. Consumo por container (MEDIDO — `docker stats --no-stream`, amostra instantânea em repouso)

> ⚠️ Amostra única em repouso, 03:05 UTC. **Não representa pico** (ver §5).

### 2.1 VeloMail

| Container | RAM usada / limite | RAM % | CPU % | PIDs |
|---|---|---|---|---|
| `ultrazend-api` | **94,91 MiB / 512 MiB** | **18,54 %** | 0,12 % | 12 |
| `ultrazend-postgres` | **61,67 MiB / 256 MiB** | **24,09 %** | 0,08 % | 14 |
| **Total VeloMail** | **≈ 157 MiB** | — | ≈ 0,2 % | 26 |

O VeloMail consome **~1 % da RAM do host** e praticamente nada de CPU em repouso.

### 2.2 As outras 3 aplicações (contexto — host compartilhado)

| Container | Projeto | RAM usada / limite | CPU % |
|---|---|---|---|
| `digiurban-vps` | digiurban | 286,2 MiB / 1 GiB | 0,04 % |
| `digiurban-postgres` | digiurban | 106,7 MiB / 512 MiB | 3,88 % |
| `ultrazend-smtp` | **digiurban** | 93,36 MiB / 384 MiB | 1,11 % |
| `ultrazend-messages` | **digiurban** | 68,77 MiB / 384 MiB | 0,00 % |
| `ultrazend-face` | **digiurban** | 36,69 MiB / 384 MiB | 0,00 % |
| `digiurban-redis` | digiurban | 4,62 MiB / 192 MiB | 0,44 % |
| `m2centerauto-alpr-1` | m2centerauto | 94,27 MiB / 1 GiB | 0,18 % |
| `m2centerauto-backend-1` | m2centerauto | 61,19 MiB / 1 GiB | 0,00 % |
| `m2centerauto-postgres-1` | m2centerauto | 61,93 MiB / 768 MiB | 0,01 % |
| `m2centerauto-plate-scraper-1` | m2centerauto | 52,60 MiB / 1 GiB | 0,00 % |
| `m2centerauto-frontend-1` | m2centerauto | 5,15 MiB / 128 MiB | 0,00 % |
| `aprenderia-web` | aprenderia | 86,02 MiB / 512 MiB | 0,00 % |
| `aprenderia-postgres` | aprenderia | 41,26 MiB / 512 MiB | 0,00 % |
| `aprenderia-nginx` | aprenderia | 4,99 MiB / 128 MiB | 0,00 % |
| `aprenderia-scheduler` | aprenderia | 0,52 MiB / 32 MiB | 0,00 % |

**Atenção a uma armadilha de nomenclatura:** os containers `ultrazend-smtp`, `ultrazend-messages` e
`ultrazend-face` **pertencem ao digiurban**, não ao VeloMail. Atribuí-los a esta aplicação
inflaria o consumo em ~199 MiB. Ver §4.2.

---

## 3. Limites efetivos vs declarados (MEDIDO — `docker inspect`)

| Container | Parâmetro | Declarado no deploy | **Efetivo** | Confere |
|---|---|---|---|---|
| `ultrazend-api` | Memory | 512 m | `536870912` = 512 MiB | ✅ |
| `ultrazend-api` | MemorySwap | 512 m | `536870912` (sem swap extra) | ✅ |
| `ultrazend-api` | NanoCpus | 1.5 | `1500000000` = 1,5 CPU | ✅ |
| `ultrazend-api` | PidsLimit | 300 | `300` | ✅ |
| `ultrazend-api` | Restart | unless-stopped | `unless-stopped` | ✅ |
| `ultrazend-postgres` | Memory | 256 m | `268435456` = 256 MiB | ✅ |
| `ultrazend-postgres` | NanoCpus | 1.0 | `1000000000` | ✅ |
| `ultrazend-postgres` | PidsLimit | 200 | `200` | ✅ |

**Tuning do PostgreSQL — efetivamente aplicado** (`SHOW`, dentro do banco):

| Parâmetro | Declarado | **Efetivo** |
|---|---|---|
| `shared_buffers` | 64 MB | **64MB** ✅ |
| `max_connections` | 50 | **50** ✅ |
| `work_mem` | 4 MB | **4MB** ✅ |

**Todos os limites declarados estão de fato aplicados.** Não há divergência entre configuração e
realidade nesta dimensão.

### 3.1 Estabilidade

| Métrica | Valor |
|---|---|
| `OOMKilled` (`ultrazend-api`) | **false** |
| `RestartCount` (`ultrazend-api`) | **0** |
| `OOMKilled` (`ultrazend-postgres`) | **false** |
| `RestartCount` (`ultrazend-postgres`) | **0** |
| OOM no kernel (`dmesg`) | **nenhum registro** |

---

## 4. Persistência e disco (MEDIDO)

### 4.1 Docker no host (compartilhado pelas 4 aplicações)

| Tipo | Total | Ativo | Tamanho | **Recuperável** |
|---|---|---|---|---|
| Imagens | 45 | 18 | 19,79 GB | **9,22 GB (46 %)** |
| Containers | 18 | 17 | 79,85 MB | 4,1 kB (0 %) |
| Volumes locais | 17 | 17 | 299,4 MB | **0 B (0 %)** |
| **Build cache** | 100 | 28 | **5,73 GB** | **1,99 GB** |

> Tamanho **lógico** das imagens (19,79 GB) ≠ disco ocupado, por camadas compartilhadas.
> O disco real do host é 29 GB de 194 GB.

**Imagens do VeloMail no host:**

| Imagem | Tamanho |
|---|---|
| `velomail-api` (`:latest` e 3 tags SHA) | **310 MB** cada |
| `velomail-migration` (`:latest` e 3 tags SHA) | **868 MB** cada |

Arquitetura da imagem: **amd64/linux** — compatível com o host (fecha GAP-07).

### 4.2 Persistência do VeloMail

| Recurso | Tamanho medido | Observação |
|---|---|---|
| Banco `ultrazend` | **20 MB** | `pg_database_size` |
| Tabelas no schema `public` | **89** | — |
| Usuários cadastrados | 2 | — |
| `/var/lib/ultrazend/logs` | **8,5 MB** | ver §4.3 |
| `/var/lib/ultrazend/configs` | 88 KB | inclui chaves DKIM |
| `/var/www/ultrazend-static` | 17 MB | SPA compilada |
| `/var/www/ultrazend` | 29 MB | clone do repositório |
| **`/app/storage` (VOL-02)** | **4,0 KB — VAZIO** | **nenhum arquivo** |

**VOL-02 resolvido (fecha GAP-05):** o volume `ultrazend-storage-data` está **completamente vazio**
— apenas o diretório, sem um único arquivo. Confirma a análise de código: nenhuma linha escreve em
`/app/storage`. É um recurso **inerte**. Custo em disco: desprezível (4 KB); custo real: zero.

**VOL-07 resolvido (fecha GAP-06):** `docker volume ls` mostra **17 volumes**, e apenas
`ultrazend-postgres-data` e `ultrazend-storage-data` pertencem ao VeloMail. **Não há volumes
legados duplicados** (`ultrazend-storage`, `postgres-data`, `ultrazend_*` não existem). O fallback
do script de deploy nunca precisou atuar. Reclaimable de volumes = **0 B**.

### 4.3 Logs — o teto teórico NÃO se materializou

| Canal | Retenção configurada | **Tamanho real** |
|---|---|---|
| `application` | 30 d | 2,2 MB |
| `business` | **365 d** | 2,2 MB |
| `errors` | 90 d | **44 KB** |
| `performance` | 7 d | 2,2 MB |
| `security` | 180 d | 2,2 MB |
| **Total** | — | **8,5 MB** |

**Correção de uma estimativa anterior.** O inventário registrava RISK-01 como "teto de dezenas de
GB". Medido: **8,5 MB**. A aplicação está no ar há apenas ~1 dia, então a retenção longa ainda não
teve tempo de acumular — mas a taxa observada (~1,8 MB/dia no canal `business`) projeta ~650 MB/ano
para esse canal, não dezenas de GB. **RISK-01 é muito menor do que estimado** e não é prioridade.

---

## 5. Pico, carga e tráfego — ainda NÃO medidos

| ID | Métrica | Status | Motivo |
|---|---|---|---|
| BM-12 | **Pico** de RAM/CPU | **NOT MEASURED** | só há amostras em repouso; exige janela de observação ou carga real |
| BM-14 | Throughput e latência sob carga | **NOT MEASURED** | tráfego atual é praticamente só o healthcheck |
| BM-16 | Tempo de restart do container | **NOT MEASURED** | exigiria reiniciar — proibido nesta etapa |

**Tráfego observado:** os logs mostram essencialmente `GET /api/health/simple` a cada 30 s
(healthcheck do Docker), com `200` em **1–2 ms**. Não há uso real de usuários no período medido.
Heap do processo Node (do próprio log): `heapUsed` ≈ **69–70 MB**, `rss` ≈ **143 MB**, estável ao
longo de horas — sem sinal de vazamento.

**Disponibilidade externa (MEDIDO):**

| Endpoint | Resultado |
|---|---|
| `https://www.velomail.com.br/` | **HTTP 200** em 0,051 s |
| `https://www.velomail.com.br/api/health/simple` | **HTTP 200** em 0,065 s |

**Conexões PostgreSQL:** 9–14 de `max_connections=50` — o pool Knex (`min 2 / max 12`) está
dimensionado com folga e **não há pressão de conexões**.

---

## 6. Achados de runtime que a análise de código não podia confirmar

### 6.1 As portas SMTP 25/587 pertencem a OUTRA aplicação (fecha GAP-09) — achado grave

O inventário registrava que o VeloMail abre 25/587 no código mas não as publica. A medição mostra
algo mais específico:

```
ss -ltnp  →  0.0.0.0:25   docker-proxy (pid 1580677)
             0.0.0.0:587  docker-proxy (pid 1580699)
             0.0.0.0:3001 docker-proxy (pid 1472259)  ← ultrazend-api

docker ps →  ultrazend-api  ||| 0.0.0.0:3001->3001/tcp   (SOMENTE 3001)
             ultrazend-smtp ||| 0.0.0.0:25->25, 0.0.0.0:587->587
```

Teste na porta 25 do host:

```
$ echo QUIT | nc 127.0.0.1 25
421 mail.digiurban.com.br You talk too soon
```

**Conclusão (VERIFIED):** as portas 25 e 587 do host são do container **`ultrazend-smtp`, que
pertence ao projeto digiurban** — apesar do prefixo `ultrazend-` no nome. O servidor SMTP do
VeloMail sobe **dentro do namespace de rede do seu próprio container**, registra
`"MX Server listening on port 25"` e `"SMTP Server started successfully"` nos logs, mas **não é
alcançável de fora do container**: nada publica essas portas para ele.

Ou seja: o SMTP do VeloMail **escuta num vácuo**. Ele consome memória e PIDs dentro do processo da
API sem poder receber uma única conexão externa. Os logs de sucesso são enganosos — reportam o
`listen()` interno, não a acessibilidade real.

> Isto **não** significa que o envio de e-mails esteja quebrado: o envio usa entrega direta via MX
> (`ULTRAZEND_DIRECT_DELIVERY=true`), que é saída, não entrada. O que está inerte é o **recebimento**.
> Determinar se o recebimento é requisito do produto é decisão de produto, fora do escopo desta etapa.

### 6.2 Tabela `application_error_logs` não existe — bug ativo em produção

Nos logs do container, a cada erro HTTP:

```
Application error log persistence disabled until the application_error_logs table exists
error: insert into "application_error_logs" (...)
```

Verificação no banco:

```sql
SELECT to_regclass('public.application_error_logs');  →  (vazio / NULL)
```

**Causa raiz (VERIFIED):** é a materialização exata da divergência DB-04/DB-06 do inventário.
A tabela é criada pela migration Knex `backend/src/migrations/A81_create_application_error_logs.js`,
mas em produção o schema vem de `prisma db push`, e **`schema.prisma` não contém esse model**
(busca por `application_error_logs`: 0 ocorrências). Resultado: as 89 migrations Knex não rodam, o
Prisma não conhece a tabela, e ela nunca é criada.

**Impacto:** a persistência de logs de erro da aplicação está **desativada em produção**; cada erro
gera uma exceção adicional do Postgres e ruído no log. Não derruba a aplicação (há tratamento
defensivo), mas cega a observabilidade de erros.

**Nenhuma correção foi aplicada** — esta etapa é somente descoberta, e essa foi a decisão registrada.

### 6.3 Chaves DKIM presentes e carregadas

`/var/lib/ultrazend/configs/dkim-keys/` contém `velomail.com.br-default-private.pem` (1704 bytes),
além de `.txt` públicos/DNS. Os logs confirmam `DKIMManager initialized successfully`
(`configuredDomains: 1`, domínio `velomail.com.br`). Também há resíduos de
`ultrazend.com.br-*` e `yourdomain.com-*` — inócuos, mas são lixo de configuração.

### 6.4 Backups: nenhum agendamento (fecha GAP-08)

```
crontab -l          →  vazio
/etc/cron.d/        →  certbot, e2scrub_all, monarx-update
```

**Não existe nenhum backup agendado do PostgreSQL do VeloMail.** O `backup-system.sh` do
repositório **não está instalado nem agendado** no host. Combinado com o
`prisma db push --accept-data-loss` a cada deploy (§6.2 do inventário), este é o **risco mais sério
identificado na auditoria** — de persistência, não de desperdício.

---

## 7. Análise do pipeline de deploy (via GitHub API)

| Run | Commit | Resultado | Duração |
|---|---|---|---|
| 35147306986 | `7e1e9bf` Remove quality gate | **success** | 3m20s |
| 35142999259 | `b98ca01` Quality gate paralelo | cancelled | 25m19s |
| 35139924926 | `682d6fb` Fix 500 Express 5 | cancelled | 20m21s |
| 35127213579 | `911f3c5` Deduplicate CI | cancelled | 20m44s |
| 35106806832 | `52e6e02` Fix SSL bootstrap | **success** | 3m41s |
| 35105486760 | Move build out of VPS | failure | 5m11s |
| 34869266980 | Fix Dockerfile syntax | failure | 55m13s |
| 34802642929 | Reduce image 1.37GB→310MB | failure | 55m57s |

**Efeito das otimizações anteriores, medido:** os deploys que rodavam build na VPS levavam
**55 minutos e falhavam**; após mover o build para o runner, passaram a **3–4 minutos com sucesso**.
A redução da imagem para 310 MB está confirmada no host.

Log do último deploy (`35147306986`), etapas relevantes:

```
Volume PostgreSQL selecionado: ultrazend-postgres-data
Container ultrazend-postgres ja esta em execucao (preservado).   ← dados preservados
Using PostgreSQL migration strategy via Prisma (db push).
  • You are about to alter the column `common_errors` ... cast from `Json` to `Unsupported("json")`
Migrations e seed concluidos
SSL configurado para ambos dominios
Health check: OK
Docker Status: Up 25 seconds (healthy)
```

> O aviso de `--accept-data-loss` alterando coluna com dados aparece **no deploy real**, sem backup
> prévio. Reforça §6.4.

**Nota de higiene do CI:** o workflow `Quality checks` acumulou execuções `cancelled` com durações
de **2 h a 6 h** (14–16/09). São minutos de runner consumidos sem entregar gate — o job ficava
pendurado até o timeout. O gate foi removido do caminho de `main` no commit `7e1e9bf`.

---

## 8. Situação das lacunas da versão anterior

| ID | Lacuna | Situação agora |
|---|---|---|
| GAP-01 | Sem acesso ao host | **FECHADA** — SSH obtido, métricas coletadas |
| GAP-02 | Limites efetivos | **FECHADA** — §3, todos conferem |
| GAP-03 | Tamanho de volumes/banco/logs | **FECHADA** — §4 |
| GAP-04 | Pico de RAM/CPU, OOM | **PARCIAL** — OOM/restart medidos (zero); **pico continua NOT MEASURED** |
| GAP-05 | Conteúdo de `ultrazend-storage-data` | **FECHADA** — vazio |
| GAP-06 | Volumes legados duplicados | **FECHADA** — não existem |
| GAP-07 | Arquitetura da imagem | **FECHADA** — amd64/linux |
| GAP-08 | Backup agendado | **FECHADA** — **não existe nenhum** |
| GAP-09 | Portas SMTP acessíveis | **FECHADA** — pertencem ao digiurban; SMTP do VeloMail inalcançável |
| GAP-10 | Rotação de logs do Nginx | **PENDENTE** — não verificada nesta coleta |

---

## 9. Linha de base consolidada (para comparação futura)

Método a repetir: §10. **Condições:** aplicação no ar há ~6 h, tráfego praticamente nulo
(só healthcheck), host com 17 containers de 4 aplicações, sem pressão de recursos.

| Métrica | Valor | Marca |
|---|---|---|
| **RAM `ultrazend-api`** | **94,91 MiB / 512 MiB (18,54 %)** | MEDIDO, repouso |
| **RAM `ultrazend-postgres`** | **61,67 MiB / 256 MiB (24,09 %)** | MEDIDO, repouso |
| **RAM total VeloMail** | **≈ 157 MiB** | MEDIDO, repouso |
| CPU VeloMail | ≈ 0,2 % | MEDIDO, repouso |
| PIDs VeloMail | 26 (de 500 permitidos) | MEDIDO |
| Heap Node (`heapUsed`) | 69–70 MB de 384 MB permitidos | MEDIDO (log) |
| RSS Node | ≈ 143 MB | MEDIDO (log) |
| Banco | 20 MB, 89 tabelas | MEDIDO |
| Conexões PG | 9–14 de 50 | MEDIDO |
| Logs em disco | 8,5 MB | MEDIDO |
| Volume storage | 4 KB (vazio) | MEDIDO |
| Imagem API | 310 MB (amd64) | MEDIDO |
| Imagem migration | 868 MB (efêmera) | MEDIDO |
| Latência `/` | 51 ms (HTTP 200) | MEDIDO |
| Latência `/api/health/simple` | 65 ms externo, 1–2 ms interno | MEDIDO |
| OOM kills | 0 | MEDIDO |
| Restarts | 0 | MEDIDO |
| Deploy bem-sucedido | 3m20s | MEDIDO (GitHub API) |
| Host: RAM usada | 1.657 MB / 15.988 MB (10,4 %) | MEDIDO |
| Host: disco | 29 GB / 194 GB (15 %) | MEDIDO |
| Host: swap | 1 MB (0 %) | MEDIDO |
| Host: load | 0,32 / 0,15 / 0,15 | MEDIDO |
| **Pico sob carga real** | — | **NOT MEASURED** |

---

## 10. Protocolo de coleta (somente leitura, para repetir)

```bash
date -u; uptime; nproc; free -m; df -h /
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}\t{{.PIDs}}'
docker system df
docker volume ls
for c in ultrazend-api ultrazend-postgres; do
  docker inspect "$c" --format '{{.Name}} mem={{.HostConfig.Memory}} cpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}'
done
du -sh /var/lib/ultrazend/logs /var/lib/ultrazend/configs /var/www/ultrazend-static /var/www/ultrazend
docker exec ultrazend-api sh -c 'du -sh /app/storage; ls -la /app/storage'
docker exec ultrazend-postgres psql -U ultrazend -d ultrazend -t -A -c "SELECT pg_size_pretty(pg_database_size('ultrazend'));"
docker exec ultrazend-postgres psql -U ultrazend -d ultrazend -t -A -c "SELECT count(*) FROM pg_stat_activity WHERE datname='ultrazend';"
docker port ultrazend-api; ss -ltnp | grep -E ':(25|587|3001)\s'
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://www.velomail.com.br/api/health/simple
crontab -l; ls /etc/cron.d/; journalctl --disk-usage
```

Registrar sempre: data/hora UTC, unidade, duração da amostra, carga, tráfego, commit no ar e
limitações. Um `--no-stream` é amostra instantânea em repouso — rotular como tal, nunca como pico.

---

## 11. Riscos, reordenados pela evidência medida

| ID | Risco | Severidade **após medição** | Base |
|---|---|---|---|
| RISK-02 | `prisma db push --accept-data-loss` a cada deploy **+ nenhum backup agendado** | **ALTA — o mais grave** | §6.4, §7 |
| RISK-10 | Tabela `application_error_logs` ausente: log de erros desativado | **MÉDIA-ALTA** (bug ativo) | §6.2 |
| RISK-06 | SMTP do VeloMail escuta portas que pertencem a outra app; inalcançável de fora | **MÉDIA** (funcionalidade inerte) | §6.1 |
| RISK-07 | `ecosystem.config.js` descreve arquitetura inexistente | **MÉDIA** (induz a erro operacional) | inventário §11 |
| RISK-08 | Deploy de `main` sem gate de typecheck/testes | **MÉDIA** | §7 |
| RISK-11 | Build cache Docker 5,73 GB (1,99 GB recuperável) e 9,22 GB de imagens recuperáveis | **BAIXA-MÉDIA** (compartilhado; disco em 15 %) | §4.1 |
| RISK-03 | Volume `ultrazend-storage-data` inerte (vazio) | **BAIXA** (4 KB) | §4.2 |
| RISK-05 | Heap 384 MB em limite 512 MB | **BAIXA** — medido 69–70 MB de heap, 18,5 % do limite | §3, §5 |
| RISK-01 | Retenção longa de logs | **BAIXA** — 8,5 MB reais, não dezenas de GB | §4.3 |
| RISK-04 | Volumes legados duplicados | **ELIMINADO** — não existem | §4.2 |
| RISK-09 | Contenção no host compartilhado | **BAIXA hoje** — load 0,32, RAM 10 %, swap 0 % | §1 |

**Conclusão sobre a missão de reduzir desperdício:** o VeloMail **não é um consumidor relevante de
recursos** — 157 MiB de RAM (~1 % do host), CPU desprezível, 20 MB de banco, 8,5 MB de logs, num
host com 15 % de disco e 10 % de RAM usados. As otimizações anteriores (build fora da VPS, imagem
310 MB, limites por container, migration efêmera) **já capturaram o ganho grande**, e isso está
medido. O que resta de desperdício mensurável é **compartilhado** (build cache e imagens antigas do
host, ~11 GB recuperáveis entre as 4 apps), não específico desta aplicação.

Os itens de maior valor agora **não são de desempenho, e sim de segurança de dados e correção**:
ausência de backup (RISK-02) e a tabela faltante (RISK-10).

---

## 12. Estado da auditoria

A descoberta está **substancialmente completa**: 9 das 10 lacunas anteriores foram fechadas com
medição direta. Permanecem em aberto:

- **Pico sob carga real** (BM-12/BM-14) — exige tráfego real ou janela de observação; um snapshot em
  repouso não o substitui.
- **Rotação de logs do Nginx no host** (GAP-10).

**Nenhuma alteração foi feita na VPS ou no código.** Nenhum serviço foi reiniciado, nenhum dado
apagado, nada instalado — a inspeção mostrou que **não havia necessidade de instalar nada** para
concluir a coleta. **Parado aqui, conforme instruído.**
