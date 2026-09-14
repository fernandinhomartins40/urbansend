# Prompt para auditoria e otimização de deploy

**Como usar:** abra cada aplicação no Claude Code e cole o bloco abaixo inteiro.
Um projeto por vez. Não rode em dois projetos ao mesmo tempo — a VPS é compartilhada
e duas auditorias simultâneas competem pelos mesmos recursos.

**Antes de começar:** este prompt pressupõe que a aplicação faz deploy na VPS
`srv953800.hstgr.cloud` (72.60.10.108), compartilhada com ~24 outros projetos.

---

## O PROMPT (copie daqui para baixo)

````
# AUDITORIA DE DEPLOY — REDUZIR CONSUMO DA VPS E ELIMINAR LIXO

## Contexto que você precisa conhecer antes de agir

Esta aplicação faz deploy numa VPS COMPARTILHADA com cerca de 24 outros projetos.
Estado medido dessa VPS em 2026-09-14:

- CPU: 96%, com throttling ativado pelo provedor
- Disco: 162 GB de 194 GB (84%)
- Swap: 2.759 MB de 4.095 MB (67%) — a máquina pagina para disco
- 94 containers, 55 deles marcados (unhealthy)
- Docker: 67 imagens / 31,53 GB, 6,25 GB recuperáveis
- Build cache: 4,94 GB
- Volumes: 70 / 21,84 GB
- 36 diretórios de release acumulados em 8 projetos

O daemon Docker está tão saturado que `docker system df` e `du /var/lib/docker`
chegam a estourar timeout de 280 segundos.

Portanto: qualquer desperdício desta aplicação soma-se ao de outras 23. O objetivo
não é só "otimizar este projeto", é parar de contribuir para a degradação coletiva.

## OBJETIVO

REDUZIR O CONSUMO DE VPS (RAM, CPU, DISCO, TAMANHO DAS IMAGENS, QUANTIDADE DE
CONTAINERS) E ELIMINAR O LIXO QUE O DEPLOY DEIXA PARA TRÁS, SEM REMOVER
FUNCIONALIDADES E SEM ALTERAR DESNECESSARIAMENTE A ARQUITETURA.

## REGRAS INVIOLÁVEIS

1. NÃO faça alterações baseadas em suposições. Confirme pelo código, pela
   configuração e pelo fluxo real de produção.
2. NÃO remova uma tecnologia porque ela "parece" não usada. Verifique scripts,
   imports dinâmicos, CLI, config, ORM, plugins, build e runtime. Uma variável de
   ambiente ou um comentário NÃO são prova de uso.
3. NÃO apague dados automaticamente. Não remova volumes, bancos, uploads ou
   backups sem confirmar a finalidade e sem autorização explícita.
4. NÃO exponha Postgres, Redis, MinIO ou serviços internos sem necessidade.
   Preserve isolamento de rede, secrets, permissões e headers.
5. NÃO invente ganhos. Onde não houver medição, escreva "NÃO MEDIDO".
   Medição de imagem só vale com `--no-cache`: uma imagem vinda de cache reporta
   camadas de 0B e não é medição.
6. A VPS NÃO DEVE COMPILAR A APLICAÇÃO. O build pertence ao CI/CD.
7. NÃO introduza serviços novos, microserviços, Supabase, Redis ou ferramentas
   pesadas de monitoramento. NÃO troque o banco. NÃO substitua funcionalidade por mock.

## PARTE 1 — AUDITAR O LIXO QUE ESTE DEPLOY DEIXA

Investigue e responda com evidência (caminho de arquivo e linha):

### 1.1 Releases órfãs
- O deploy usa diretório versionado (`/opt/<projeto>/releases/<sha>-<timestamp>/`)?
- Se sim: ele DERRUBA os containers da release anterior antes de subir a nova?
  Este é o bug mais comum. Quando o nome do projeto compose deriva do diretório,
  cada release vira um projeto Docker distinto e o Docker não sabe que um
  substitui o outro — os containers antigos ficam rodando para sempre.
- Existe retenção de releases antigas? Quantas ficam? Quem as apaga?
- **Verifique se algum container em execução aponta para uma release JÁ APAGADA
  do disco.** Isso é crítico: o container está vivo apenas porque nunca
  reiniciou; se cair, não sobe mais, porque o compose que o define não existe.

### 1.2 Imagens
- Cada deploy cria uma tag nova? As antigas são removidas?
- Tags `:latest` sobrescritas deixam a imagem anterior como dangling?
- A imagem final tem multi-stage? O que ficou dentro dela que não precisa estar
  (compilador, devDependencies, código-fonte, cache de pacotes, ferramentas de CLI)?

### 1.3 Build
- O build roda na VPS? Se sim, é o problema mais grave: `npm ci`/`compile`
  competindo com ~90 containers. Mova para o CI e publique no registry (GHCR).
- O build cache é limpo? Um `docker builder prune` sem filtro de idade destrói o
  cache útil; um que nunca roda acumula gigabytes.

### 1.4 Containers
- Quantos containers esta aplicação sobe? Cada um é necessário em produção?
- Há containers efêmeros (migration, seed, init) que ficam residentes sem precisar?
- Containers `Exited` são removidos, ou acumulam? (`--rm` em jobs de uma vez só)

### 1.5 Volumes e dados
- Liste cada volume e sua finalidade real. NÃO remova nenhum.
- Algum volume ficou órfão de uma release antiga, mas contém dados de produção?

### 1.6 Logs
- Os containers definem `logging.options.max-size` e `max-file`?
  O driver json-file padrão cresce SEM LIMITE até encher o disco.
- A aplicação escreve logs em arquivo dentro do container? Há rotação e retenção?

### 1.7 Limites de recurso
- Os containers definem limite de memória? Sem limite, um vazamento nesta
  aplicação derruba serviços dos OUTROS 23 projetos.
- Se for Node: `NODE_OPTIONS=--max-old-space-size` está abaixo do limite do container?
- Se for Postgres: `shared_buffers` e `effective_cache_size` estão dimensionados
  para o LIMITE DO CONTAINER, e não para a RAM do host?

### 1.8 Healthchecks
- O healthcheck tem timeout realista? Numa VPS saturada, timeouts de 3s geram
  falso "unhealthy", e o retry consome ainda mais CPU — um ciclo que se realimenta.

### 1.9 Processos e automações
- Há cron, scheduler ou worker rodando dentro dos containers?
- Qual a frequência? Algum roda com frequência maior do que a necessária?
- Há processo em loop de falha (reinício constante)? Isso queima CPU continuamente.

### 1.10 Workflows de CI
- Quantos workflows existem? Há arquivos duplicados, `.disabled`, `.bak`?
- O runner é self-hosted NA PRÓPRIA VPS? Se sim, o CI compete com a produção.

## PARTE 2 — ENTREGÁVEL

Antes de implementar qualquer coisa, crie `docs/DEPLOY-AUDIT.md` contendo:

1. **Inventário atual**: containers, imagens, volumes, tamanhos. Marque NÃO MEDIDO
   onde não conseguir medir.
2. **Lixo identificado**, com a origem de cada item (qual linha de qual script o cria).
3. **Plano classificado** por prioridade:
   - P0: build fora da VPS; vazamento de recursos; falta de limite de memória
   - P1: lixo acumulativo (releases, imagens, cache)
   - P2: tamanho de imagem, número de containers
   - P3: ajuste fino
   - NÃO RECOMENDADO: com a justificativa do porquê
4. **Rollback** de cada mudança que afete banco, volume, storage, migration,
   compose ou imagem.

Só depois implemente, agrupando mudanças relacionadas. Após CADA grupo: rode os
testes, verifique o build, verifique o runtime, verifique os logs.

## PARTE 3 — PADRÃO ALVO

O deploy correto nesta infraestrutura tem esta forma:

```
CI (GitHub Actions)        VPS
─────────────────────      ─────────────────────────
build + test          →    (nada)
docker build          →    (nada)
push para GHCR        →    docker pull
                           docker compose up -d
                           (migration como container efêmero, --rm)
                           limpeza da release anterior
```

A VPS PULA, MIGRA e SOBE. Nunca compila.

Referência real: o projeto `erpnovo` na mesma VPS já faz isso — usa imagens
`ghcr.io/fernandinhomartins40/erpnovo-app:<sha>`. Use-o como modelo.

Checklist do alvo:
- [ ] Build no CI, imagem publicada no GHCR com tag de SHA (nunca só `:latest`)
- [ ] VPS faz apenas pull + up
- [ ] Multi-stage: a imagem residente não contém compilador nem devDependencies
- [ ] Migration/seed em container efêmero com `--rm`
- [ ] Todo container com limite de memória
- [ ] Todo container com `max-size` e `max-file` de log
- [ ] Deploy derruba explicitamente a release anterior
- [ ] Retenção de releases: manter no máximo 3
- [ ] Retenção de imagens: remover tags antigas após deploy bem-sucedido
- [ ] Serviços internos com `expose`, não `ports`
- [ ] Healthcheck com timeout compatível com uma máquina sob carga

## PARTE 4 — LIMPEZA RETROATIVA

Identifique o lixo que os deploys ANTERIORES deixaram, e classifique:

- **Pode remover automaticamente**: imagens dangling, build cache antigo,
  containers `Exited` há mais de 7 dias, logs rotacionáveis
- **Exige minha autorização**: containers órfãos em execução, releases antigas,
  volumes, backups
- **NUNCA remover**: qualquer volume, qualquer banco, qualquer upload

Para o que exigir autorização, gere um script que faça DUMP antes de remover,
para que a remoção seja reversível. Apresente a lista e ESPERE minha resposta.

## O QUE NÃO FAZER

- Não remova funcionalidades, páginas, endpoints, tabelas ou modelos
- Não troque o banco de dados
- Não use localStorage como substituto de banco
- Não compile na VPS
- Não adicione ferramentas pesadas de monitoramento
- Não rode `docker volume prune` — "dangling" não significa lixo; pode ser o
  banco de um projeto cujos containers foram derrubados
- Não rode `docker system prune -a` — remove imagens em uso por containers parados

## COMEÇE ASSIM

1. Mapeie o fluxo de deploy atual de ponta a ponta (workflow → script → compose)
2. Liste o que roda na VPS versus o que roda no CI
3. Identifique o lixo e sua origem
4. Escreva `docs/DEPLOY-AUDIT.md`
5. Aguarde minha aprovação do plano
6. Implemente em grupos, testando cada um

Não pare na análise. Depois de aprovado, execute a otimização completa,
preservando todas as funcionalidades existentes.
````

---

## Ordem sugerida de execução

Priorize pelos projetos que mais poluem, segundo o levantamento de 2026-09-14:

| Ordem | Projeto | Por quê |
|---|---|---|
| 1 | **flowcraft** | 8 releases, 8 containers órfãos (6 Postgres) de 09/05 |
| 2 | **rapidinho** | 6 releases, 3 só em 14/09; redis/minio com release apagada |
| 3 | **dramarcela** | 5 releases; postgres e minio com release apagada |
| 4 | **voxcelular** | 5 releases, nenhuma desde 05/05 |
| 5 | **tagarelinha** | 4 releases, todas de 27/05 |
| 6 | **aprenderia** | 3 releases; scheduler com release apagada |
| 7 | **m2centerauto** | 3 releases; postgres com release apagada |
| 8 | **culturaviva** | 2 releases |
| 9 | **urbansend** | já auditado; falta mover o build para GHCR |

Projetos sem `/releases` (`fusehotel`, `moria`, `ferraco`, `jmeletrica`,
`my-progress-tracker`, `digiurban`, `vigiaescolar`, `rebequi`) usam outro padrão
e devem ser auditados depois — o lixo deles é menor, mas o padrão também precisa
convergir.
