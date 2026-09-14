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

[ "$APPLY" = "1" ] && mkdir -p "$BACKUP_DIR"

for c in "${CONTAINERS[@]}"; do
  echo "------------------------------------------------------------------"
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "$c: nao existe (ja removido). Pulando."
    continue
  fi

  IMG=$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)
  echo "$c  [$IMG]"

  # Dump apenas dos Postgres.
  if echo "$IMG" | grep -qi postgres; then
    if [ "$APPLY" = "1" ]; then
      echo "  -> dump..."
      # pg_dumpall precisa do superusuario; tenta os nomes usuais.
      OK=0
      for u in postgres flowcraft app; do
        if docker exec "$c" pg_dumpall -U "$u" > "$BACKUP_DIR/$c.sql" 2>/dev/null; then
          SZ=$(du -h "$BACKUP_DIR/$c.sql" 2>/dev/null | cut -f1)
          if [ -s "$BACKUP_DIR/$c.sql" ]; then
            echo "  -> dump OK como '$u' ($SZ)"; OK=1; break
          fi
        fi
      done
      if [ "$OK" != "1" ]; then
        rm -f "$BACKUP_DIR/$c.sql"
        echo "  !! DUMP FALHOU. Container NAO sera removido."
        echo "     (o banco pode estar parado ou com outro usuario)"
        continue
      fi
    else
      echo "  -> FARIA dump para $BACKUP_DIR/$c.sql"
    fi
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
