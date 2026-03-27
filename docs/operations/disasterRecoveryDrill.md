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
2. Simulate service restart:
   - stop/start CoreApi process
3. Validate recovered service:
   - `npm run m1:acceptance:auto`
   - `npm run smoke:im`
4. Validate reliability:
   - `npm run reliability:regression`

## Outcome
- Backup generation successful (SQL file produced under `Backups/`)
- CoreApi recovered and passed acceptance checks
- IM and duplicate-idempotency checks passed

## Action Items
- Integrate scheduled backup execution in production scheduler
- Upload backup artifacts to offsite storage in CI/CD release workflow

Last updated: 2026-03-01
