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

- `npm run db:migrate -w coreApi`
- `npm run m1:acceptance:auto`
- After D-022, migration verification must include `apps/coreApi/drizzle/migrations/0025_booleanize_rbac_flags.sql` so restored RBAC flags are native boolean columns.
- D-023 outbox cleanup can remove processed `outbox_events` rows older than `OUTBOX_RETENTION_DAYS`; this is expected and does not affect undelivered events.

Last updated: 2026-07-09（复审并补充 D-022/D-023 恢复验证影响）
