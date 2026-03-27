#!/bin/bash
# PostgreSQL Restore Script for nodeAdmin
# This script restores a PostgreSQL backup

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./infra/docker/postgres/backups}"
CONTAINER_NAME="nodeadmin-postgres"
DB_NAME="nodeadmin"
DB_USER="nodeadmin"

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
if gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1; then
    log_info "Restore completed successfully"
else
    log_error "Restore failed"
    exit 1
fi

# Verify restore
TABLE_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')

log_info "Restored ${TABLE_COUNT} tables"

log_info "Restore process completed successfully"

exit 0
