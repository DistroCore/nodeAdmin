# CoreApi SQL Migrations

- Migration files are stored in `Apps/CoreApi/drizzle/migrations`.
- Apply migrations with:
  - `npm run db:migrate -w core-api`
- This project currently uses SQL-first migration files to keep RLS and index logic explicit.

## RLS Usage

RLS policies rely on PostgreSQL session setting `app.current_tenant`.

- In `pgbouncer` transaction mode, set tenant per transaction:
  - `SET LOCAL app.current_tenant = '<tenant-id>';`
- Application queries should still include explicit `WHERE tenant_id = $1` filters.
