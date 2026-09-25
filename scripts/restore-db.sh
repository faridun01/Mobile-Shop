#!/bin/bash
# Stop application writers first. Requires CREATEDB on the PostgreSQL role.
set -euo pipefail
umask 077
DB_CONTAINER="${DB_CONTAINER:-mobile_shop_db_prod}"
DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-mobile_shop_db}}"
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <existing-backup.sql.gz>" >&2
  exit 1
fi
gzip -t "$BACKUP_FILE"
WORK_DIR=$(mktemp -d)
CHECK_DB="restore_check_$(date +%s)_$$_${RANDOM}"
CHECK_CREATED=false
cleanup() {
  if [ "$CHECK_CREATED" = true ]; then
    docker exec "$DB_CONTAINER" dropdb -U "$DB_USER" --if-exists "$CHECK_DB" || echo "WARNING: remove temporary database $CHECK_DB manually" >&2
  fi
  rm -f -- "$WORK_DIR/input.sql" "$WORK_DIR/validated.sql"
  rmdir -- "$WORK_DIR"
}
trap cleanup EXIT
gunzip -c "$BACKUP_FILE" > "$WORK_DIR/input.sql"
docker exec "$DB_CONTAINER" createdb -U "$DB_USER" -T template0 "$CHECK_DB"
CHECK_CREATED=true
docker exec -i "$DB_CONTAINER" psql -X -U "$DB_USER" -d "$CHECK_DB" -v ON_ERROR_STOP=1 --single-transaction -f - < "$WORK_DIR/input.sql"
TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -X -U "$DB_USER" -d "$CHECK_DB" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
if [ "$TABLE_COUNT" -eq 0 ]; then
  echo 'ERROR: archive contains no public tables; destination left unchanged' >&2
  exit 1
fi
# Materialize the complete dump before touching the destination.
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$CHECK_DB" --schema=public --no-owner --no-privileges > "$WORK_DIR/validated.sql"
# DROP and import share one transaction: an SQL error rolls back both.
docker exec -i "$DB_CONTAINER" psql -X -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --single-transaction -c 'DROP SCHEMA public CASCADE;' -f - < "$WORK_DIR/validated.sql"
echo "Restore complete: $DB_NAME (public schema)"
