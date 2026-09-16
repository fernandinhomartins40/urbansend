#!/usr/bin/env bash
# Remove os containers orfaos do flowcraft, projeto confirmado como extinto
# pelo dono da VPS em 2026-09-14.
#
# REVERSIVEL: faz dump de cada Postgres ANTES de remover. Se algo era
# necessario, o dump permite restaurar.
#
# O que este script NAO faz:
#   - nao remove volumes (os dados ficam no disco mesmo apos remover o container)
#   - nao toca em nenhum projeto alem do flowcraft
#   - nao remove os diretorios /opt/flowcraft/releases (passo separado, manual)
#
# Uso:
#   bash remove-flowcraft-orphans.sh            # dry-run: so mostra
#   bash remove-flowcraft-orphans.sh --apply    # executa

set -uo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

BACKUP_DIR="/root/backups-orfaos-$(date +%Y%m%d-%H%M%S)"

# Lista explicita. Nada de padrao curinga: cada container foi verificado.
CONTAINERS=(
  "a6c3fa0-20260509132846-postgres-1"
  "25f0505-20260509115257-postgres-1"
  "289cb5b-20260509114459-postgres-1"
  "8c1dc40-20260509113805-postgres-1"
  "8c1dc40-20260509113600-postgres-1"
  "7914c1c-20260509111806-postgres-1"
  "8c1dc40-20260509113805-api-1"
  "8c1dc40-20260509113600-api-1"
)

echo "=================================================================="
if [ "$APPLY" = "1" ]; then
  echo "REMOCAO DOS ORFAOS DO FLOWCRAFT -- modo APLICAR"
else
  echo "REMOCAO DOS ORFAOS DO FLOWCRAFT -- DRY-RUN (nada sera alterado)"
fi
echo "=================================================================="
echo "Backup em: $BACKUP_DIR"
echo

# Guarda: recusa rodar se algum nome nao casar com o padrao de release do
# flowcraft. Protege contra edicao descuidada da lista.
for c in "${CONTAINERS[@]}"; do
  if ! echo "$c" | grep -qE '^[0-9a-f]{7}-20260509[0-9]{6}-(postgres|api)-1$'; then
    echo "RECUSADO: '$c' nao casa com o padrao esperado do flowcraft."
    echo "Nenhuma acao foi tomada."
    exit 1
  fi
done
echo "[OK] todos os ${#CONTAINERS[@]} nomes conferem com o padrao do flowcraft."
echo

PGDATA="/opt/flowcraft/data/postgres"

if [ "$APPLY" = "1" ]; then
  mkdir -p "$BACKUP_DIR"

  # Backup UNICO do PGDATA compartilhado, feito com os containers ainda de pe.
  # E um copia-a-frio de um Postgres que nao recebe escrita desde 2026-05-09;
  # para restaurar, aponte um postgres:16-alpine para o diretorio extraido.
  if [ -d "$PGDATA" ]; then
    echo "Copiando PGDATA compartilhado ($(du -xsh "$PGDATA" 2>/dev/null | cut -f1))..."
    if tar czf "$BACKUP_DIR/pgdata.tar.gz" -C "$(dirname "$PGDATA")" "$(basename "$PGDATA")" 2>/dev/null; then
      echo "[OK] backup: $BACKUP_DIR/pgdata.tar.gz ($(du -h "$BACKUP_DIR/pgdata.tar.gz" | cut -f1))"
    else
      echo "!! FALHA ao copiar o PGDATA. Abortando: nada sera removido."
      exit 1
    fi
  else
    echo "!! $PGDATA nao existe. Abortando por seguranca."
    exit 1
  fi
  echo
fi

for c in "${CONTAINERS[@]}"; do
  echo "------------------------------------------------------------------"
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "$c: nao existe (ja removido). Pulando."
    continue
  fi

  IMG=$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)
  echo "$c  [$IMG]"

  # Backup: NAO usamos pg_dumpall aqui.
  #
  # Descoberto em 2026-09-14: os 6 Postgres do flowcraft montam o MESMO
  # diretorio de dados (/opt/flowcraft/data/postgres, bind mount). Um PGDATA
  # so admite um postmaster, entao 5 dos 6 nunca inicializaram -- estao
  # unhealthy ha 4 meses e nao respondem a `docker exec`. Tentar pg_dumpall
  # neles trava e produz arquivo vazio.
  #
  # O backup correto e copiar o PGDATA uma unica vez (47MB), feito antes do
  # laco. Ver docs/VPS-ORPHAN-CLEANUP-REPORT.md.
  if echo "$IMG" | grep -qi postgres; then
    if [ ! -s "$BACKUP_DIR/pgdata.tar.gz" ]; then
      echo "  !! backup do PGDATA ausente. Container NAO sera removido."
      continue
    fi
    echo "  -> dados cobertos pelo backup do PGDATA compartilhado"
  fi

  if [ "$APPLY" = "1" ]; then
    echo "  -> parando e removendo..."
    docker stop -t 30 "$c" >/dev/null 2>&1
    # 'docker rm' SEM -v: o volume e preservado de proposito.
    if docker rm "$c" >/dev/null 2>&1; then
      echo "  -> REMOVIDO (volume preservado)"
    else
      echo "  !! falha ao remover"
    fi
  else
    echo "  -> FARIA: docker stop + docker rm (sem -v, volume preservado)"
  fi
done

echo "------------------------------------------------------------------"
echo
if [ "$APPLY" = "1" ]; then
  echo "Concluido. Dumps em: $BACKUP_DIR"
  ls -la "$BACKUP_DIR" 2>/dev/null
  echo
  echo "Os VOLUMES foram preservados. Para ve-los:"
  echo "  docker volume ls -qf dangling=true"
  echo
  echo "Diretorios de release NAO foram apagados. Se quiser, depois:"
  echo "  du -sh /opt/flowcraft"
else
  echo "DRY-RUN concluido. Para executar de verdade:"
  echo "  bash $0 --apply"
fi
echo
df -h / | tail -1
