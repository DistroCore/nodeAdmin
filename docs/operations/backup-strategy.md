# PostgreSQL Backup Strategy Documentation

## Overview
Automated PostgreSQL backup solution for nodeAdmin with retention policy and monitoring.

## Backup Scripts

### 1. Manual Backup (Node.js)
**Script**: `scripts/postgresBackup.cjs`
**Usage**: `npm run backup:pg`
**Output**: `Backups/nodeadmin-YYYY-MM-DDTHH-MM-SS.sql`

### 2. Automated Backup (Bash)
**Script**: `scripts/backup-postgres.sh`
**Features**:
- Compressed backups (gzip)
- Integrity verification
- 7-day retention policy
- Prometheus metrics export
- Detailed logging

**Usage**:
```bash
# Manual execution
bash scripts/backup-postgres.sh

# With custom backup directory
BACKUP_DIR=/path/to/backups bash scripts/backup-postgres.sh
```

**Output**: `infra/docker/postgres/backups/nodeadmin_backup_YYYYMMDD_HHMMSS.sql.gz`

## Restore Scripts

### 1. Manual Restore (Node.js)
**Script**: `scripts/postgresRestore.cjs`
**Usage**: `npm run restore:pg`

### 2. Automated Restore (Bash)
**Script**: `scripts/restore-postgres.sh`
**Usage**:
```bash
# Restore from specific backup
bash scripts/restore-postgres.sh nodeadmin_backup_20260302_210057.sql.gz

# Or with full path
bash scripts/restore-postgres.sh ./infra/docker/postgres/backups/nodeadmin_backup_20260302_210057.sql.gz
```

**Warning**: This will DROP and recreate the database. All existing data will be lost.

## Automated Backup Schedule

### Option 1: Cron (Linux/macOS)
Add to crontab (`crontab -e`):
```bash
# Daily backup at 2:00 AM
0 2 * * * cd /path/to/nodeAdmin && bash scripts/backup-postgres.sh >> /var/log/postgres-backup.log 2>&1
```

### Option 2: Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: `C:\Program Files\Git\bin\bash.exe`
   - Arguments: `scripts/backup-postgres.sh`
   - Start in: `C:\Users\a2778\Desktop\Code\nodeAdmin`

### Option 3: Docker Cron Container
Add to `docker-compose.yml`:
```yaml
  backup-cron:
    image: alpine:3.18
    container_name: nodeadmin-backup-cron
    depends_on:
      - postgres
    volumes:
      - ./Scripts:/scripts:ro
      - ./infra/docker/postgres/backups:/backups
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: >
      sh -c "apk add --no-cache docker-cli &&
             echo '0 2 * * * cd /app && bash /scripts/backup-postgres.sh' | crontab - &&
             crond -f -l 2"
```

## Backup Retention Policy

- **Retention**: 7 days
- **Automatic cleanup**: Old backups are deleted during each backup run
- **Storage location**: `infra/docker/postgres/backups/`

## Monitoring and Alerts

### Prometheus Metrics
The backup script exports metrics to Prometheus Pushgateway (if configured):
- `postgres_backup_success`: Whether the last backup was successful (1 = success, 0 = failure)
- `postgres_backup_timestamp_seconds`: Timestamp of the last successful backup
- `postgres_backup_size_bytes`: Size of the last backup in bytes
- `postgres_backup_count`: Total number of backups

### Alert Rules
Add to `infra/prometheus/alerts.yml`:
```yaml
  - name: nodeadmin-backup
    rules:
      - alert: PostgreSQLBackupFailed
        expr: postgres_backup_success == 0
        for: 5m
        labels:
          severity: P0
        annotations:
          summary: 'PostgreSQL backup failed'
          description: 'Last backup attempt failed. Check backup logs.'

      - alert: PostgreSQLBackupStale
        expr: time() - postgres_backup_timestamp_seconds > 86400 * 2
        for: 1h
        labels:
          severity: P1
        annotations:
          summary: 'PostgreSQL backup is stale'
          description: 'No successful backup in the last 2 days'

      - alert: PostgreSQLBackupDiskSpace
        expr: postgres_backup_count > 10
        for: 1h
        labels:
          severity: P2
        annotations:
          summary: 'Too many PostgreSQL backups'
          description: 'Backup retention policy may not be working. Check disk space.'
```

## Backup Verification

### Manual Verification
```bash
# List all backups
ls -lh infra/docker/postgres/backups/

# Test backup integrity
gzip -t infra/docker/postgres/backups/nodeadmin_backup_*.sql.gz

# Restore to test database (requires separate test container)
bash scripts/restore-postgres.sh nodeadmin_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Automated Verification
Add to CI/CD pipeline or weekly cron job:
```bash
# Restore latest backup to test container
# Verify table count matches production
# Run smoke tests against restored database
```

## Disaster Recovery Procedure

### Full Database Recovery
1. Stop the application:
   ```bash
   docker-compose stop
   ```

2. Identify the backup to restore:
   ```bash
   ls -lh infra/docker/postgres/backups/
   ```

3. Restore the backup:
   ```bash
   bash scripts/restore-postgres.sh nodeadmin_backup_YYYYMMDD_HHMMSS.sql.gz
   ```

4. Verify the restore:
   ```bash
   docker exec nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
   ```

5. Restart the application:
   ```bash
   docker-compose up -d
   ```

### Point-in-Time Recovery (PITR)
**Status**: Not implemented yet
**Future enhancement**: Configure PostgreSQL WAL archiving for PITR capability

## Security Considerations

1. **Backup Encryption**: Backups are currently unencrypted. Consider encrypting backups at rest:
   ```bash
   gpg --symmetric --cipher-algo AES256 backup.sql.gz
   ```

2. **Access Control**: Ensure backup directory has restricted permissions:
   ```bash
   chmod 700 infra/docker/postgres/backups/
   ```

3. **Off-site Storage**: Consider copying backups to S3/MinIO for disaster recovery:
   ```bash
   aws s3 sync infra/docker/postgres/backups/ s3://nodeadmin-backups/postgres/
   ```

## Troubleshooting

### Backup fails with "Permission denied"
- Ensure backup directory exists and is writable
- Check Docker container has access to backup volume

### Restore fails with "database is being accessed"
- Terminate all connections to the database first
- Stop the application before restoring

### Backup file is empty or corrupted
- Check PostgreSQL container logs: `docker logs nodeadmin-postgres`
- Verify PostgreSQL is healthy: `docker exec nodeadmin-postgres pg_isready`
- Check disk space: `df -h`

## Next Steps

1. **Implement automated backup schedule** (cron or Docker cron container)
2. **Add Prometheus backup monitoring alerts**
3. **Set up off-site backup storage** (S3/MinIO)
4. **Implement backup encryption**
5. **Configure PostgreSQL WAL archiving for PITR**
6. **Add automated backup verification tests**
