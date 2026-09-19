# Auditoria de host VPS — fase somente auditoria

Coleta: 2026-09-17 20:42–20:43 UTC, por SSH de leitura autorizado. Nenhum pacote foi instalado e nenhuma configuração, serviço, firewall, kernel, sysctl, volume, container ou dado foi alterado. O token de GitHub não foi necessário para a coleta do host e não foi usado; a análise de deploy usa os workflows e a evidência já documentada.

## Método e limitações

Comandos de leitura executados: `uptime`, `free -m`, `vmstat 1 5`, `df -hT`, `df -i`, `ps`, `docker ps/stats/system df/inspect`, `systemctl`, `journalctl --disk-usage`, `/proc/pressure/*`, `/proc/swaps`, `ss`, `nginx -t`, timers e uma chamada interna ao healthcheck. `iostat`/`mpstat` não estavam instalados e não foram instalados; I/O por dispositivo e série de CPU são **NOT MEASURED**. Uma amostra de cinco segundos não caracteriza pico, causa de steal, saturação de provedor ou throughput.

## Baseline do host e aplicações vizinhas

| Métrica | Medido | Interpretação |
|---|---:|---|
| CPU | 4 vCPU, AMD EPYC 9354P | Capacidade física observada; não equivale à soma dos quotas Docker. |
| Load | 0,18 / 0,12 / 0,10 (1/5/15 min) | Repouso, sem fila de CPU observada. |
| CPU (`vmstat`, 5 s) | user 0–3%, system 0–2%, iowait 0%, steal 0–4% | Série curta; não atribui contenção ao provedor. |
| RAM | 15.988 MiB total; 1.723 MiB usada; 13.782 MiB disponível | Sem pressão de memória no instante. Cache/buffers não foi confundido com consumo irrecuperável. |
| Swap | 2.047 MiB total; 1,25 MiB usado; `swappiness=60` | Swap está praticamente inativo; não é RAM extra nem evidência para reduzir memória. |
| PSI | memory e I/O: `avg10/60/300=0,00` | Sem pressão recente na amostra; contadores históricos não permitem diagnóstico causal. |
| Disco raiz | ext4, 194 GiB; 30 GiB usados; 165 GiB livres (16%) | Sem pressão de capacidade agora. |
| Inodes raiz | 3% usados | Sem pressão de inodes. |
| Docker | 17 containers em execução; 47 imagens/20,5 GB lógicos; cache 5,731 GB | 9,926 GB de imagens e 1,975 GB de cache aparecem recuperáveis, porém são compartilhados: não executar prune. |
| Log/journal | journal 64 MB; `/var/log/nginx` 30 MB; logs UltraZend 25 MB | Crescimento desde o snapshot anterior exige tendência, não limpeza automática. |

Os containers ativos pertencem a múltiplas aplicações. Os limites declarados agregam **8.800 MiB (~8,6 GiB)** de memória e **15,8 CPUs** para 4 vCPUs. Limites Docker são tetos, não reserva: a memória efetiva do host estava baixa no snapshot. Porém, em pico simultâneo, os quotas de CPU podem produzir throttling e a memória agregada deve manter folga para kernel, Docker, Nginx, runner, deploy, backup e falha de uma aplicação.

## Achados e propostas, sem implementação

| ID | Ambiente e evidência; achado | Impacto | Proposta; risco e dependências | Aceite; rollback; métrica esperada | Cobertura |
|---|---|---|---|---|---|
| HOST-001 | Host, 20:42 UTC. `uptime`, `free`, `vmstat` e PSI: load baixo, 13.782 MiB disponíveis, swap ~1,25 MiB, iowait 0%, PSI recente zero. | Não há saturação atual atribuível ao UltraZend, às aplicações vizinhas ou ao provedor. | Manter uma série em horários de tráfego/deploy antes de reduzir limites ou contratar VPS maior. Risco: decidir por snapshot de repouso. | Aceite: série registra CPU user/system/iowait/steal, PSI, memória/swap, load e tráfego. Rollback: não aplicável à coleta. Métricas de pico — NOT MEASURED. | AUDITED |
| HOST-002 | Host, 20:42 UTC. `vmstat 1 5` mostrou steal entre 0 e 4%; `nproc/lscpu` confirmou 4 vCPU. | Steal pontual pode refletir virtualização, não prova contenção do provedor nem explica latência. | Correlacionar série de steal com carga, PSI, iowait e p95 externo antes de abrir chamado ao provedor ou mover carga. Risco: diagnóstico causal incorreto. | Aceite: série temporal com contexto de tráfego/deploy e limiar acordado. Rollback: não aplicável. Métricas: steal/p95 por janela — NOT MEASURED. | PENDING |
| HOST-003 | Host, `docker inspect`: quotas agregadas de 8.800 MiB e 15,8 CPUs; `docker stats`: UltraZend API 98,05 MiB/512 MiB e PostgreSQL 76,19 MiB/256 MiB no instante; ambos sem OOM/restarts. | A memória declarada não está reservada, mas quotas de CPU excedem 4 vCPU e picos simultâneos podem causar throttling/competição entre clientes. | Construir orçamento agregado por aplicação e cenário (tráfego, migration, backup e falha) antes de reduzir ou elevar limites. Risco: reduzir por repouso causa OOM; elevar tudo elimina isolamento. | Aceite: soma de picos + folga cabe no host, com throttling/OOM/restarts e p95 medidos. Rollback: limites atuais por container. Métricas: CPU throttled, RSS, OOM, p95 — NOT MEASURED. | PENDING |
| HOST-004 | Host, `df -hT`, `df -i`, `docker system df`: 165 GiB livres e inodes a 3%; imagens e cache recuperáveis pertencem a várias aplicações. | Não há pressão de disco agora. Uma limpeza global pode apagar rollback/cache de terceiros. | Preservar a política atual: limpeza somente com dono, imagens em uso e rollback identificados. Medir espaço temporário de deploy/backup, pois o total livre não substitui esse orçamento. | Aceite: orçamento por release inclui pull, extração, release antiga/nova, backup e logs; nenhum alvo compartilhado. Rollback: tags e artefatos anteriores preservados. Métrica: mínimo livre por deploy — NOT MEASURED. | AUDITED |
| HOST-005 | Host, 20:42 UTC. `/var/lib/ultrazend/logs` mede 25 MB versus 8,5 MB no snapshot histórico; `/var/log/nginx` mede 30 MB. `logrotate.timer` está ativo; rotação específica e taxas não foram lidas. | Há crescimento, mas um tamanho isolado não autoriza retenção menor. Logs são evidência de segurança, deploy e recuperação. | Coletar por canal/idade e confirmar regras Nginx/aplicação antes de qualquer retenção. Risco: perder diagnóstico ou histórico exigido. | Aceite: tamanho/idade/rotação por canal e retenção aprovada. Rollback: regras anteriores. Métricas: bytes/dia e arquivos rotacionados — NOT MEASURED. | PENDING |
| HOST-006 | Host. Nginx está ativo, `nginx -t` aprovou a configuração, `certbot.timer` e `logrotate.timer` estão ativos. Certificado local de `velomail.com.br`: Let’s Encrypt, válido até 2026-12-15. | Proxy/TLS estão saudáveis no instante, mas health interno não prova rota externa, renovação futura, política de cifra nem rate-limit efetivo. | Preservar Nginx, Certbot e monitoramento; medir resposta externa e resultado de renovação, sem desabilitar controles para economizar recursos. | Aceite: HTTPS externo, renovação e logs de proxy verificados sem segredo. Rollback: configuração/versionamento atuais. Métricas: p95 externo, falhas de TLS/renovação — NOT MEASURED. | AUDITED |
| HOST-007 | Host. Serviços ativos incluem Docker/containerd, Nginx, cron, runner GitHub, agente de segurança, journald e quatro pilhas de aplicação. Prometheus/Grafana não estão ativos como serviços ou containers observados. | Ausência de Prometheus/Grafana local não prova ausência de observabilidade externa; desabilitar runner/agente/monitoramento por economia reduziria segurança e operação. | Mapear donos, consumidores e custo de cada serviço antes de qualquer consolidação/separação. Considerar VPS maior, separação de cargas ou contato com provedor apenas se série mostrar saturação/steal sustentado. | Aceite: inventário de serviço/owner e tendência por cliente; decisão de capacidade baseada em pico. Rollback: manter serviços atuais. Métricas: RSS/CPU/I/O por serviço — NOT MEASURED. | PENDING |
| HOST-008 | Host. API responde `200` interno em 6,549 ms; portas públicas incluem outras aplicações e SMTP de outra pilha. PostgreSQL UltraZend é interno. | Resposta simples prova processo, não banco, migration, seed, SMTP, WebSocket ou cliente externo; atribuir portas das outras aplicações ao UltraZend superestima seu uso. | Usar health/readiness por escopo e rotular medições por aplicação; não expor banco/portas internas para simplificar diagnóstico. | Aceite: saúde interna/externa e dependências críticas correlacionadas por aplicação. Rollback: checks atuais. Métricas: conexões, p95/p99, falhas — NOT MEASURED. | AUDITED |
| HOST-009 | Host. `crontab` do root não contém backup UltraZend; `/etc/cron.d` só lista tarefas de sistema/certbot/segurança. Não foram encontrados dumps/snapshots/restore confirmados. | Falta de recuperação bloqueia redução de dados, mudanças de schema e rollback confiável; backup não pode ser tratado como descarte de disco. | Definir backup PostgreSQL consistente, cópia externa, retenção, RPO/RTO e restore isolado. Risco crítico: perda de dados se agir antes disso. | Aceite: restore testado com integridade e tempo registrado. Rollback: cópia restaurável, não apenas imagem anterior. Métricas: idade, duração, RPO/RTO — NOT MEASURED. | BLOCKED |

## Matriz de cobertura: inventário → evidência → status

| Item do inventário | Evidência examinada | Status |
|---|---|---|
| ARQ-01..04 | Host compartilhado, Docker, Nginx e topologia de portas | AUDITED |
| CNT-01 | `docker stats/inspect`, health e limites da API | AUDITED |
| CNT-02 | `docker stats/inspect`, processo e limites PostgreSQL | AUDITED |
| CNT-03 | Job efêmero não estava em execução; impacto de pico/deploy não observado | PENDING |
| PRC-01..08 | Processos internos não podem ser separados no `ps`; carga por fluxo ausente | PENDING |
| DB-01..03 | Processo/volume e portas internas observados; I/O/locks não medidos | AUDITED |
| VOL-01..07 | Espaço de host, logs e Docker observados; crescimento/restore por volume pendentes | PENDING |
| BLD-01..12 | Runner externo, imagens/caches e espaço disponível revisados | AUDITED |
| CI-01..03 | Runner local/host e deploy documentado; custo/pico do runner pendente | AUDITED |
| LOG-01..08 | Journal, logs UltraZend/Nginx e timer de rotação observados | AUDITED |
| BKP-01..04 | Nenhum backup PostgreSQL/restore confirmado | BLOCKED |
| RES-01..08 | Limites e consumo de repouso dos containers UltraZend | AUDITED |
| RES-09 | Pico, throttling, séries de CPU/I/O/steal e impacto de deploy | PENDING |
| RES-10 | PM2 não é runtime efetivo | NOT APPLICABLE |
| RES-11 | Health interno, Docker/Nginx ativos | AUDITED |
| RES-12 | Nginx/TLS/timers observados; política efetiva completa pendente | PENDING |
| EXT-01..03 | Runner, registry e TLS têm dependências externas; disponibilidade não medida | PENDING |
| EXT-04..06 | DNS/SMTP/consumidores externos não medidos | PENDING |
| GAP-04a | Pico real de RAM/CPU/latência continua ausente | PENDING |
| GAP-10 | Rotação detalhada do Nginx não reconciliada | PENDING |

## Resultado da etapa

Cobertura da matriz (linhas): **9 AUDITED**, **9 PENDING**, **1 BLOCKED** e **1 NOT APPLICABLE**.

O host não apresenta saturação na amostra e não há base para reduzir recursos ou pedir VPS maior agora. A prioridade para capacidade segura é medir pico e quotas/throttling por aplicação; a prioridade para recuperação continua sendo backup/restore PostgreSQL validado. Nenhuma mudança foi aplicada.
