#!/bin/bash
# Redis Backup Script for nodeAdmin
# This script performs automated backups of Redis data (RDB + AOF)

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./infra/docker/redis/backups}"
CONTAINER_NAME="nodeadmin-redis"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="redis_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

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
    log_error "Redis container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# Check if Redis is responding
if ! docker exec "${CONTAINER_NAME}" redis-cli ping > /dev/null 2>&1; then
    log_error "Redis is not responding to PING"
    exit 1
fi

log_info "Starting Redis backup..."
log_info "Backup name: ${BACKUP_NAME}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_PATH}"

# Trigger BGSAVE to create fresh RDB snapshot
log_info "Triggering BGSAVE..."
BGSAVE_RESULT=$(docker exec "${CONTAINER_NAME}" redis-cli BGSAVE 2>&1)

if echo "$BGSAVE_RESULT" | grep -q "Background saving started"; then
    log_info "BGSAVE started successfully"

    # Wait for BGSAVE to complete
    log_info "Waiting for BGSAVE to complete..."
    TIMEOUT=30
    ELAPSED=0
    while [ $ELAPSED -lt $TIMEOUT ]; do
        BGSAVE_STATUS=$(docker exec "${CONTAINER_NAME}" redis-cli INFO persistence | grep rdb_bgsave_in_progress | cut -d: -f2 | tr -d '\r')

        if [ "$BGSAVE_STATUS" = "0" ]; then
            log_info "BGSAVE completed"
            break
        fi

        sleep 1
        ELAPSED=$((ELAPSED + 1))

        if [ $ELAPSED -eq $TIMEOUT ]; then
            log_warn "BGSAVE still in progress after ${TIMEOUT} seconds, continuing anyway"
            break
        fi
    done
else
    log_warn "BGSAVE already in progress or failed: $BGSAVE_RESULT"
fi

# Copy all Redis data files (supports both old and new AOF format)
log_info "Copying Redis data files..."
docker exec "${CONTAINER_NAME}" sh -c "cd /data && tar -czf /tmp/redis-data.tar.gz ." 2>/dev/null || {
    log_error "Failed to create Redis data archive"
    exit 1
}

docker cp "${CONTAINER_NAME}:/tmp/redis-data.tar.gz" "${BACKUP_PATH}/redis-data.tar.gz" 2>/dev/null || {
    log_error "Failed to copy Redis data archive"
    exit 1
}

docker exec "${CONTAINER_NAME}" rm -f /tmp/redis-data.tar.gz 2>/dev/null || true

DATA_SIZE=$(du -h "${BACKUP_PATH}/redis-data.tar.gz" | cut -f1)
log_info "Redis data copied: ${DATA_SIZE}"

# Verify backup file was created
if [ ! -f "${BACKUP_PATH}/redis-data.tar.gz" ]; then
    log_error "No backup files created"
    rm -rf "${BACKUP_PATH}"
    exit 1
fi

# Rename to final backup name
mv "${BACKUP_PATH}/redis-data.tar.gz" "${BACKUP_PATH}.tar.gz"
rm -rf "${BACKUP_PATH}"

COMPRESSED_SIZE=$(du -h "${BACKUP_PATH}.tar.gz" | cut -f1)
log_info "Backup created: ${COMPRESSED_SIZE}"

# Verify backup integrity
if ! tar -tzf "${BACKUP_PATH}.tar.gz" > /dev/null 2>&1; then
    log_error "Backup file is corrupted (tar test failed)"
    rm -f "${BACKUP_PATH}.tar.gz"
    exit 1
fi

log_info "Backup integrity verified"

# Get Redis info
REDIS_VERSION=$(docker exec "${CONTAINER_NAME}" redis-cli INFO server | grep redis_version | cut -d: -f2 | tr -d '\r')
REDIS_KEYS=$(docker exec "${CONTAINER_NAME}" redis-cli DBSIZE | cut -d: -f2 | tr -d ' \r')
REDIS_MEMORY=$(docker exec "${CONTAINER_NAME}" redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')

log_info "Redis version: ${REDIS_VERSION}"
log_info "Total keys: ${REDIS_KEYS}"
log_info "Memory usage: ${REDIS_MEMORY}"

# Clean up old backups (keep last N days)
log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "redis_backup_*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete -print | wc -l)

if [ "${DELETED_COUNT}" -gt 0 ]; then
    log_info "Deleted ${DELETED_COUNT} old backup(s)"
else
    log_info "No old backups to delete"
fi

# List current backups
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "redis_backup_*.tar.gz" -type f | wc -l)
log_info "Total backups: ${BACKUP_COUNT}"

# Calculate total backup size
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
log_info "Total backup size: ${TOTAL_SIZE}"

log_info "Backup process completed successfully"

# Export metrics for Prometheus (optional)
if [ -n "${PROMETHEUS_PUSHGATEWAY:-}" ]; then
    cat <<EOF | curl --data-binary @- "${PROMETHEUS_PUSHGATEWAY}/metrics/job/redis_backup/instance/${CONTAINER_NAME}" 2>/dev/null || true
# HELP redis_backup_success Whether the last backup was successful
# TYPE redis_backup_success gauge
redis_backup_success 1
# HELP redis_backup_timestamp_seconds Timestamp of the last successful backup
# TYPE redis_backup_timestamp_seconds gauge
redis_backup_timestamp_seconds $(date +%s)
# HELP redis_backup_size_bytes Size of the last backup in bytes
# TYPE redis_backup_size_bytes gauge
redis_backup_size_bytes $(stat -c%s "${BACKUP_PATH}.tar.gz" 2>/dev/null || stat -f%z "${BACKUP_PATH}.tar.gz")
# HELP redis_backup_count Total number of backups
# TYPE redis_backup_count gauge
redis_backup_count ${BACKUP_COUNT}
# HELP redis_keys_total Total number of keys in Redis
# TYPE redis_keys_total gauge
redis_keys_total ${REDIS_KEYS}
EOF
fi

exit 0
