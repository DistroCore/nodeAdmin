# Database Partition Rehearsal Runbook

## Goal

Validate partition strategy and migration safety before production rollout.

## Migration

- Rehearsal migration file: `apps/coreApi/drizzle/migrations/0004_partition_rehearsal.sql`
- Apply with:
  - `npm run db:migrate -w coreApi`

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
- 2026-07-09 review: D-022 RBAC boolean migration and D-023 outbox/auth changes do not affect this isolated partition rehearsal table or `partition:check`.

Last updated: 2026-07-09（复审无变化）
