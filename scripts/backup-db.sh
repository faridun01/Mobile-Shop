#!/bin/bash
set -euo pipefail
umask 077
DB_CONTAINER="${DB_CONTAINER:-mobile_shop_db_prod}"
DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-mobile_shop_db}}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p -- "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S)_$$.sql.gz"
PARTIAL=$(mktemp "$BACKUP_DIR/.backup.XXXXXX")
trap 'rm -f -- "$PARTIAL"' EXIT
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --schema=public --clean --if-exists --no-owner --no-privileges | gzip > "$PARTIAL"
gzip -t "$PARTIAL"
mv -- "$PARTIAL" "$BACKUP_FILE"
echo "Backup complete: $BACKUP_FILE"
find "$BACKUP_DIR" -type f -name "${DB_NAME}_*.sql.gz" -mtime +30 -delete
