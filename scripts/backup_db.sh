#!/usr/bin/env bash
#
# Daily backup of the vkrb Postgres database.
# Dumps the running container, gzips, drops files older than RETAIN_DAYS.
#
# Install (one-shot):
#   chmod +x scripts/backup_db.sh
#   crontab -e
#   0 4 * * * /Users/resxton/Desktop/ВКР/VKRB/scripts/backup_db.sh >> ~/backups/vkrb/backup.log 2>&1
#

set -euo pipefail

CONTAINER="${CONTAINER:-vkrb-db-1}"
DB_NAME="${DB_NAME:-vkrb}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/vkrb}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

stamp=$(date +%Y%m%d_%H%M%S)
out="$BACKUP_DIR/vkrb_${stamp}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting backup → $out"

# pg_dump runs inside container, output streamed to host through stdout
if ! docker exec -i "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$out"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ pg_dump failed"
    rm -f "$out"
    exit 1
fi

size=$(du -h "$out" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ done — $size"

# Rotation: delete dumps older than RETAIN_DAYS
deleted=$(find "$BACKUP_DIR" -name 'vkrb_*.sql.gz' -type f -mtime +"$RETAIN_DAYS" -delete -print | wc -l | tr -d ' ')
if [ "$deleted" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🗑  removed $deleted old dump(s)"
fi
