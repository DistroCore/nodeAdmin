#!/bin/bash
# PostgreSQL Backup Script for nodeAdmin
# This script performs automated backups of the PostgreSQL database

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./infra/docker/postgres/backups}"
CONTAINER_NAME="nodeadmin-postgres"
DB_NAME="nodeadmin"
DB_USER="nodeadmin"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="nodeadmin_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_error "PostgreSQL container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# Check if container is healthy
if ! docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1; then
    log_error "PostgreSQL is not ready to accept connections"
    exit 1
fi

log_info "Starting PostgreSQL backup..."
log_info "Database: ${DB_NAME}"
log_info "Backup file: ${BACKUP_FILE}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Perform backup using pg_dump
if docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
    --format=plain \
    --no-owner \
    --no-acl \
    --verbose 2>&1 | gzip > "${BACKUP_PATH}"; then

    BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
    log_info "Backup completed successfully"
    log_info "Backup size: ${BACKUP_SIZE}"
    log_info "Backup location: ${BACKUP_PATH}"
else
    log_error "Backup failed"
    rm -f "${BACKUP_PATH}"
    exit 1
fi

# Verify backup file is not empty
if [ ! -s "${BACKUP_PATH}" ]; then
    log_error "Backup file is empty"
    rm -f "${BACKUP_PATH}"
    exit 1
fi

# Test backup integrity by checking gzip
if ! gzip -t "${BACKUP_PATH}" 2>/dev/null; then
    log_error "Backup file is corrupted (gzip test failed)"
    rm -f "${BACKUP_PATH}"
    exit 1
fi

log_info "Backup integrity verified"

# Clean up old backups (keep last N days)
log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "nodeadmin_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete -print | wc -l)

if [ "${DELETED_COUNT}" -gt 0 ]; then
    log_info "Deleted ${DELETED_COUNT} old backup(s)"
else
    log_info "No old backups to delete"
fi

# List current backups
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "nodeadmin_backup_*.sql.gz" -type f | wc -l)
log_info "Total backups: ${BACKUP_COUNT}"

# Calculate total backup size
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
log_info "Total backup size: ${TOTAL_SIZE}"

log_info "Backup process completed successfully"

# Export metrics for Prometheus (optional)
if [ -n "${PROMETHEUS_PUSHGATEWAY:-}" ]; then
    cat <<EOF | curl --data-binary @- "${PROMETHEUS_PUSHGATEWAY}/metrics/job/postgres_backup/instance/${CONTAINER_NAME}" 2>/dev/null || true
# HELP postgres_backup_success Whether the last backup was successful
# TYPE postgres_backup_success gauge
postgres_backup_success 1
# HELP postgres_backup_timestamp_seconds Timestamp of the last successful backup
# TYPE postgres_backup_timestamp_seconds gauge
postgres_backup_timestamp_seconds $(date +%s)
# HELP postgres_backup_size_bytes Size of the last backup in bytes
# TYPE postgres_backup_size_bytes gauge
postgres_backup_size_bytes $(stat -c%s "${BACKUP_PATH}")
# HELP postgres_backup_count Total number of backups
# TYPE postgres_backup_count gauge
postgres_backup_count ${BACKUP_COUNT}
EOF
fi

exit 0
