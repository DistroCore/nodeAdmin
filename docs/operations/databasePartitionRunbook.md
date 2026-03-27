# Database Partition Rehearsal Runbook

## Goal
Validate partition strategy and migration safety before production rollout.

## Migration
- Rehearsal migration file: `apps/core-api/drizzle/migrations/0004_partition_rehearsal.sql`
- Apply with:
  - `npm run db:migrate -w core-api`

## Verification
- `npm run partition:check`

Expected output:
- `partitionCount >= 4`
- Partition names:
  - `messages_partitioned_rehearsal_p0`
  - `messages_partitioned_rehearsal_p1`
  - `messages_partitioned_rehearsal_p2`
  - `messages_partitioned_rehearsal_p3`

## Rollout Guidance
- Keep rehearsal table isolated from runtime query path.
- After validating access plans and migration windows, execute production partition plan as a separate migration batch.

Last updated: 2026-03-01
