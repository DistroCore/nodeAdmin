# PostgreSQL Backup Runbook

## Create Backup
- Command: `npm run backup:pg`
- Output: SQL file under `Backups/`
- Fallback behavior:
  - Uses local `pg_dump` if available
  - Falls back to `docker exec nodeadmin-postgres pg_dump` when local binary is missing

## Restore Backup
- Command:
  - `BACKUP_FILE=Backups/<file>.sql npm run restore:pg`
- Fallback behavior:
  - Uses local `psql` if available
  - Falls back to `docker exec -i nodeadmin-postgres psql`

## Verification
- `npm run db:migrate -w core-api`
- `npm run m1:acceptance:auto`

Last updated: 2026-03-01
