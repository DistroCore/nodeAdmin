# Disaster Recovery Drill Record

## Drill Date

- 2026-03-01

## Scope

- PostgreSQL backup generation and restore path
- CoreApi restart and health recovery
- IM smoke chain recovery

## Steps

1. Generate backup:
   - `npm run backup:pg`
2. Restore selected backup when rehearsing full database recovery:
   - `BACKUP_FILE=Backups/<file>.sql npm run restore:pg`
3. Apply current migrations after restore:
   - `npm run db:migrate -w coreApi`
4. Simulate service restart:
   - stop/start CoreApi process
5. Validate recovered service:
   - `npm run m1:acceptance:auto`
   - `npm run smoke:im`
6. Validate reliability:
   - `npm run reliability:regression`

## Outcome

- Backup generation successful (SQL file produced under `Backups/`)
- CoreApi recovered and passed acceptance checks
- IM and duplicate-idempotency checks passed
- 2026-07-09 review: D-022 means restore rehearsals must verify RBAC boolean migration `0025_booleanize_rbac_flags.sql`; D-023 does not change the backup/restore command path, but processed outbox rows may be absent if retention cleanup has already deleted them.

## Action Items

- Integrate scheduled backup execution in production scheduler
- Upload backup artifacts to offsite storage in CI/CD release workflow

Last updated: 2026-07-09（复审并补充 restore/migrate 验证步骤）
