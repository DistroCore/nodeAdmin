#!/bin/bash
# PostgreSQL Restore Script for nodeAdmin
# This script restores a PostgreSQL backup

set -euo pipefail
umask 077

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./infra/docker/postgres/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-nodeadmin-postgres}"
DB_NAME="${DB_NAME:-nodeadmin}"
DB_USER="${DB_USER:-nodeadmin}"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
POST_RESTORE_PRIVILEGES_PATH="${SCRIPT_DIR}/postRestorePrivileges.sql"
RESTORE_ERROR_LOG=""

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

if [[ ! "${CONTAINER_NAME}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] ||
   [[ ! "${DB_NAME}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] ||
   [[ ! "${DB_USER}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    log_error "Container, database, and user names must be safe identifiers"
    exit 1
fi

# Check if backup file is provided
if [ $# -eq 0 ]; then
    log_error "Usage: $0 <backup_file>"
    log_info "Available backups:"
    ls -lh "${BACKUP_DIR}"/nodeadmin_backup_*.sql.gz 2>/dev/null || log_warn "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    # Try with backup directory prefix
    BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    if [ ! -f "${BACKUP_FILE}" ]; then
        log_error "Backup file not found: $1"
        exit 1
    fi
fi

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

log_warn "WARNING: This will DROP and recreate the database '${DB_NAME}'"
log_warn "All existing data will be lost!"
read -p "Are you sure you want to continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Restore cancelled"
    exit 0
fi

log_info "Starting PostgreSQL restore..."
log_info "Backup file: ${BACKUP_FILE}"

# Verify backup file integrity
if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
    log_error "Backup file is corrupted (gzip test failed)"
    exit 1
fi

log_info "Backup file integrity verified"

ROLE_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -At -c \
    "SELECT COUNT(*) FROM pg_roles WHERE (rolname = 'nodeadmin_app' AND NOT rolsuper AND NOT rolbypassrls) OR (rolname = 'nodeadmin_outbox' AND NOT rolsuper AND rolbypassrls);")
if [ "${ROLE_COUNT}" -ne 2 ]; then
    log_error "Required restricted roles are missing or unsafe; run database role migrations before restore"
    exit 1
fi

# Terminate existing connections
log_info "Terminating existing connections to database..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

# Drop and recreate database
log_info "Dropping database..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" || {
    log_error "Failed to drop database"
    exit 1
}

log_info "Creating database..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};" || {
    log_error "Failed to create database"
    exit 1
}

# Restore backup
log_info "Restoring backup..."
RESTORE_ERROR_LOG=$(mktemp "${TMPDIR:-/tmp}/nodeadmin-restore.XXXXXX")
chmod 600 "${RESTORE_ERROR_LOG}"
cleanup_restore_log() {
    if [ -n "${RESTORE_ERROR_LOG}" ]; then
        rm -f "${RESTORE_ERROR_LOG}"
    fi
}
trap cleanup_restore_log EXIT HUP INT TERM

if { gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql \
    --no-psqlrc \
    --no-password \
    --set=ON_ERROR_STOP=1 \
    --single-transaction \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --file=-; } > /dev/null 2>"${RESTORE_ERROR_LOG}"; then
    log_info "Restore completed successfully"
else
    log_error "Restore failed"
    tail -n 20 "${RESTORE_ERROR_LOG}" >&2
    exit 1
fi

if docker exec -i "${CONTAINER_NAME}" psql \
    --no-psqlrc \
    --no-password \
    --set=ON_ERROR_STOP=1 \
    --single-transaction \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --file=- < "${POST_RESTORE_PRIVILEGES_PATH}" > /dev/null 2>>"${RESTORE_ERROR_LOG}"; then
    log_info "Post-restore privileges and RLS metadata verified"
else
    log_error "Post-restore privilege hardening failed"
    tail -n 20 "${RESTORE_ERROR_LOG}" >&2
    exit 1
fi

rm -f "${RESTORE_ERROR_LOG}"
RESTORE_ERROR_LOG=""
trap - EXIT HUP INT TERM

# Verify restore
TABLE_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')

CORE_TABLE_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -At -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('audit_logs', 'conversations', 'messages', 'outbox_events');")

if [ "${CORE_TABLE_COUNT}" -ne 4 ]; then
    log_error "Restore verification failed: expected 4 core tables, found ${CORE_TABLE_COUNT}"
    exit 1
fi

log_info "Restored ${TABLE_COUNT} tables"

log_info "Restore process completed successfully"

exit 0
