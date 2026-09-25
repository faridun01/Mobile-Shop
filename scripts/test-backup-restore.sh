#!/bin/bash
# Run INSIDE a disposable postgres container with this scripts directory mounted.
set -euo pipefail
export DB_USER="${POSTGRES_USER}" DB_NAME=restore_test DB_CONTAINER=isolated
export BACKUP_DIR=$(mktemp -d)
# Exercise the real scripts against real PostgreSQL without a host Docker socket.
docker() {
  [ "$1" = exec ]; shift
  if [ "${1:-}" = -i ]; then shift; fi
  [ "$1" = isolated ]; shift
  if [ "${FAIL_FINAL_IMPORT:-false}" = true ] && [ "$1" = psql ] && [[ " $* " == *' -d restore_test '* ]]; then
    { cat; echo 'SELECT deliberately_missing_function();'; } | command "$@"
  else
    command "$@"
  fi
}
export -f docker
dropdb -U "$DB_USER" --if-exists "$DB_NAME"
createdb -U "$DB_USER" "$DB_NAME"
psql -U "$DB_USER" -d "$DB_NAME" -c 'CREATE TABLE marker (id integer); INSERT INTO marker VALUES (7);'
bash /checks/backup-db.sh
archive=$(find "$BACKUP_DIR" -name '*.sql.gz' -print -quit)
psql -U "$DB_USER" -d "$DB_NAME" -c 'UPDATE marker SET id=42;'
printf broken > /tmp/corrupt.sql.gz
if bash /checks/restore-db.sh /tmp/corrupt.sql.gz; then exit 1; fi
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT id FROM marker')" = 42 ]
echo 'PASS corrupt gzip leaves destination intact'
printf 'CREATE TABLE x(id integer); SELECT missing_function();' | gzip > /tmp/invalid.sql.gz
if bash /checks/restore-db.sh /tmp/invalid.sql.gz; then exit 1; fi
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT id FROM marker')" = 42 ]
echo 'PASS invalid SQL leaves destination intact'
printf '' | gzip > /tmp/empty.sql.gz
if bash /checks/restore-db.sh /tmp/empty.sql.gz; then exit 1; fi
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT id FROM marker')" = 42 ]
echo 'PASS empty archive leaves destination intact'
if FAIL_FINAL_IMPORT=true bash /checks/restore-db.sh "$archive"; then exit 1; fi
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT id FROM marker')" = 42 ]
echo 'PASS final import failure rolls back schema deletion and data'
bash /checks/restore-db.sh "$archive"
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT id FROM marker')" = 7 ]
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT count(*) FROM pg_database WHERE datname LIKE 'restore_check_%'")" = 0 ]
echo 'PASS successful restore with custom user/database; temporary databases removed'
pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > /tmp/legacy.sql.gz
psql -U "$DB_USER" -d "$DB_NAME" -c 'UPDATE marker SET id=99;'
bash /checks/restore-db.sh /tmp/legacy.sql.gz
[ "$(psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT id FROM marker')" = 7 ]
echo 'PASS legacy plain pg_dump archive restored'
