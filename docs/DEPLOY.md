# Deploy — VeloMail / urbansend

Procedimento reproduzível de implantação, atualização, rollback, limpeza e diagnóstico.

> ⚠️ **Push na `main` dispara deploy automático** (caminhos `backend/**`, `frontend/**`,
> `configs/**` e os próprios arquivos de deploy). Um commit nesses caminhos **é uma implantação**.

---

## 1. Arquitetura do deploy

```
push na main
   │
   ├─► job "build"  (runner do GitHub — NUNCA na VPS)
   │      ├── docker build --target runtime    → ghcr.io/<owner>/velomail-api:sha-<commit>
   │      ├── docker build --target migration  → ghcr.io/<owner>/velomail-migration:sha-<commit>
   │      └── npm run build (frontend)         → tarball como artefato
   │
   └─► job "deploy" (SSH na VPS)
          ├── scp do tarball do frontend
          └── deploy-production-remote.sh
                 ├── docker pull das duas imagens (sem build)
                 ├── extrai frontend e troca atomicamente
                 ├── sobe postgres → migration (efêmera) → api
                 └── nginx + certbot
```

**Princípio central:** a VPS nunca compila. Ela só baixa bytes prontos e executa.

---

## 2. Pré-requisitos

### Secrets do GitHub (repositório → Settings → Secrets)

| Secret | Uso |
|---|---|
| `VPS_HOST` | IP da VPS (padrão `72.60.10.108`) |
| `VPS_USER` | usuário SSH (padrão `root`) |
| `VPS_PASSWORD` | senha SSH |
| `GITHUB_TOKEN` | automático — precisa de `packages: write` (já declarado no workflow) |

### Na VPS

- Docker e Docker Compose
- nginx + certbot
- Acesso ao GHCR (o script faz `docker login` com o token do workflow)

### Volumes e diretórios persistentes

| Caminho | Conteúdo | Sobrevive ao deploy? |
|---|---|---|
| `/var/lib/ultrazend/configs/.env.production` | secrets (JWT, cookie, encryption) | **sim** |
| `/var/lib/ultrazend/configs/dkim-keys/` | **chave privada DKIM** | **sim** |
| `/var/lib/ultrazend/logs/` | logs da aplicação | sim |
| volume `ultrazend-postgres-data` | banco de dados | **sim** |
| volume `ultrazend-storage-data` | uploads | **sim** |

🔴 **Nunca remova esses volumes.** Contêm dados e a chave de assinatura de e-mail.

---

## 3. Deploy normal

Automático no push. Manualmente: **Actions → Deploy Production → Run workflow**.

Validação pós-deploy:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.velomail.com.br/api/health/simple   # 200
docker ps --filter name=ultrazend-api --format '{{.Names}} {{.Status}}'
```

---

## 4. Rollback

Porque a imagem é versionada por SHA imutável, **rollback não precisa de rebuild**:

1. **Actions → Deploy Production → Run workflow**
2. Preencher **`rollback_sha`** com o SHA de 40 caracteres do commit desejado
3. Executar

O job de build reaproveita a tag `sha-<commit>` já existente no GHCR; a VPS faz `pull` dela.

### Rollback manual direto na VPS (emergência)

```bash
SHA=<sha-do-commit-bom>
OWNER=<owner-em-minusculas>
docker pull ghcr.io/$OWNER/velomail-api:sha-$SHA
docker rm -f ultrazend-api
docker run -d --name ultrazend-api \
  --label com.ultrazend.component=application \
  --restart unless-stopped --network ultrazend-network \
  --env-file /var/lib/ultrazend/configs/.env.production \
  -p 3001:3001 -m 512m --memory-swap 512m --cpus=1.5 --pids-limit=300 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  -e NODE_OPTIONS=--max-old-space-size=384 -e NODE_ENV=production -e DB_CLIENT=pg -e PORT=3001 \
  -e DATABASE_URL=postgresql://ultrazend:ultrazend@ultrazend-postgres:5432/ultrazend?schema=public \
  -v /var/lib/ultrazend/logs:/app/logs -v /var/lib/ultrazend/configs:/app/configs \
  -v ultrazend-storage-data:/app/storage \
  ghcr.io/$OWNER/velomail-api:sha-$SHA node dist/index.js
```

> **NÃO VALIDADO:** este procedimento de rollback ainda não foi executado de ponta a ponta.
> Testar com dois deploys consecutivos antes de confiar nele numa emergência.

---

## 5. Limpeza segura

🔴 **Host compartilhado** — aprenderia, digiurban e m2centerauto rodam na mesma máquina.

### Proibido

```bash
docker system prune -a        # apaga imagens das outras aplicações
docker image prune -a         # idem
docker builder prune          # NÃO aceita filtro por projeto: apaga cache alheio
docker volume prune           # apaga DADOS
docker rm $(docker ps -aq --filter name=ultrazend)   # pega containers do digiurban!
```

⚠️ **Armadilha de nome:** `ultrazend-messages`, `ultrazend-face` e `ultrazend-smtp` pertencem ao
projeto **digiurban**, não a esta aplicação. Sempre confira o label:

```bash
docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}'
```

### Permitido

O deploy já faz limpeza com escopo restrito quando o disco cai abaixo de 1,5 GB: remove imagens
`velomail-api`/`velomail-migration` antigas, mantendo as 3 mais recentes e nunca a que está em uso.

Manual:

```bash
docker images --filter "reference=*/*/velomail-api" --format '{{.CreatedAt}}\t{{.ID}}' \
  | sort -r | tail -n +4 | cut -f2 | xargs -r docker rmi
```

---

## 6. Diagnóstico

```bash
# Estado dos containers da aplicação
docker ps -a --filter name=ultrazend-api --filter name=ultrazend-postgres

# Logs
docker logs ultrazend-api --tail 100
docker logs ultrazend-postgres --tail 50

# Limites aplicados (confirma ALTA-4)
docker inspect ultrazend-api --format 'mem={{.HostConfig.Memory}} cpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}}'

# Consumo real
docker stats --no-stream ultrazend-api ultrazend-postgres

# Saúde do host
uptime; free -m; df -h /; vmstat 1 3
```

### Sintomas conhecidos

| Sintoma | Causa provável |
|---|---|
| `failed to build: NotFound: forwarding Ping` | **Não deve mais ocorrer** — o build saiu da VPS |
| API reinicia em loop | OOM: ver `docker inspect ultrazend-api --format '{{.State.OOMKilled}}'` |
| Postgres morto sob carga | limite de 256 MB com tuning interno casado — não alterar um sem o outro |
| DKIM falha ao carregar | permissão do diretório `dkim-keys` precisa de `+x` (755) |
| TLS com certificado errado | certbot não emitiu para o domínio; ver `/etc/nginx/sites-enabled/` |

---

## 7. Estado pendente

🔴 **Chave DKIM.** `/var/lib/ultrazend/configs/dkim-keys/` não existe na VPS atual. O deploy avisa
(`AVISO: DKIM private key not found`) mas **prossegue**. Antes de enviar e-mail em produção, decidir:
restaurar de backup, gerar par novo **e atualizar o DNS `default._domainkey`**, ou subir com
`ENABLE_DKIM=false`. Chave nova sem atualizar o DNS faz toda entrega assinada falhar na validação.

🟡 **Banco vazio.** O volume `ultrazend-postgres-data` não existe; a aplicação subirá com banco novo.
