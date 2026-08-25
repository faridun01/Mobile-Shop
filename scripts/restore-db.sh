#!/bin/bash
# ==============================================================================
# Production PostgreSQL Restore Script
# Restores a .sql.gz dump produced by backup-db.sh into a running db container.
# Usage: ./scripts/restore-db.sh <path-to-backup.sql.gz>
# ==============================================================================
set -o pipefail

DB_CONTAINER="${DB_CONTAINER:-mobile_shop_db_prod}"
BACKUP_FILE="$1"

if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <path-to-backup.sql.gz>"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "[$(date)] Restoring ${BACKUP_FILE} into container ${DB_CONTAINER}..."
echo "WARNING: this drops and recreates the public schema before restoring."

docker exec ${DB_CONTAINER} psql -U postgres -d mobile_shop_db \
    -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

if [ $? -ne 0 ]; then
    echo "[$(date)] ERROR: failed to reset schema before restore!"
    exit 1
fi

gunzip -c "${BACKUP_FILE}" | docker exec -i ${DB_CONTAINER} psql -U postgres -d mobile_shop_db -v ON_ERROR_STOP=1

if [ $? -eq 0 ]; then
    echo "[$(date)] Restore completed successfully from: ${BACKUP_FILE}"
else
    echo "[$(date)] ERROR: PostgreSQL restore failed!"
    exit 1
fi
