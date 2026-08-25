#!/bin/bash
# ==============================================================================
# Production PostgreSQL Automated Backup Script
# Performs compressed pg_dump and retains backups for 30 days.
# ==============================================================================
set -o pipefail

DB_CONTAINER="${DB_CONTAINER:-mobile_shop_db_prod}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/mobile_shop_db_${TIMESTAMP}.sql.gz"

mkdir -p ${BACKUP_DIR}

echo "[$(date)] Starting PostgreSQL database backup..."

# Dump and gzip compression. pipefail (above) makes the pipeline's exit code
# reflect pg_dump's failure, not just gzip's — otherwise a failed dump (e.g.
# wrong container name) still produces a "successful", empty/corrupt archive.
docker exec ${DB_CONTAINER} pg_dump -U postgres -d mobile_shop_db | gzip > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup completed successfully: ${BACKUP_FILE}"
else
    echo "[$(date)] ERROR: PostgreSQL backup failed!"
    rm -f ${BACKUP_FILE}
    exit 1
fi

# Cleanup old backups older than 30 days
find ${BACKUP_DIR} -type f -name "*.sql.gz" -mtime +30 -exec rm {} \;

echo "[$(date)] Old backups cleanup complete."
