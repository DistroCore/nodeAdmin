---
name: dev
description: Start nodeAdmin local API and web development servers with their infrastructure and migrations.
---

## Start Development Environment

Run commands from the repository root. Use the installed dependencies and configure `apps/coreApi/.env` from `apps/coreApi/.env.example` if missing; preserve an existing environment file. Configure Compose secrets as described in `docs/operations/secrets-management.md`.

### 1. Infrastructure (if not running)

```bash
docker compose up -d postgres pgbouncer redis
```

This starts PostgreSQL (55432), PgBouncer (6432), and Redis (56379). `npm run infra:up` starts all unprofiled services, including the containerized API on 11451, which conflicts with a local API dev server. Check for an existing API process before starting another.

### 2. Apply Database Migrations

```bash
npm run db:migrate -w coreApi
```

Run for a new database and after pulling new migrations. The migration script reads `MIGRATION_DATABASE_URL`, then `DATABASE_URL`, from the shell environment; it does not load `.env` itself. Its local fallback connects directly to PostgreSQL on 55432 as the migration owner. Do not use the restricted application role for migrations.

### 3. Start Dev Servers

Run in separate terminals, selecting API, web, or both according to the request:

- `api` — `npm run dev:api` (NestJS on port 11451)
- `web` — `npm run dev:web` (Vite on port 3000)
- `both` or no selection — start both

### Login

Migrations create the default tenant and roles, but do not create an admin user. Register an account through `/register` for the `default` tenant; registration grants the viewer role.

The README's `admin@nodeadmin.dev` / `Admin123456` credentials belong to the optional `scripts/seed-test-data.cjs` fixture and are not guaranteed to exist. That legacy script still inserts integer `1` into `users.is_active`, which migration `0025_booleanize_rbac_flags.sql` changes to boolean; do not run it against the current schema without correcting and validating it first. Use an existing authorized admin account when elevated access is needed.
