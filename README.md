# nodeAdmin

Enterprise-grade, multi-tenant SaaS middleware platform with an IM (Instant Messaging) module.

## Quick Start

### 1. Start Infrastructure

```bash
docker compose up -d postgres redis
```

| Service   | Host              | Port  |
|-----------|-------------------|-------|
| PostgreSQL| localhost         | 55432 |
| Redis     | localhost         | 56379 |

### 2. Initialize Database

```bash
node scripts/applySqlMigration.cjs
```

If the RBAC migration (0016) fails, apply it manually:

```bash
cat apps/coreApi/drizzle/migrations/0016_rbac_tables.sql | docker exec -i nodeadmin-postgres psql -U nodeadmin -d nodeadmin
cat apps/coreApi/drizzle/migrations/0016_rbac_tables_seed.sql | docker exec -i nodeadmin-postgres psql -U nodeadmin -d nodeadmin
```

### 3. Configure Environment

```bash
cp apps/coreApi/.env.example apps/coreApi/.env
```

### 4. Start Development Servers

```bash
npm run dev:api    # CoreApi backend (port 11451) with HMR
npm run dev:web    # AdminPortal frontend (port 3000) with Vite HMR
```

### 5. Access the Application

Open http://localhost:3000

## Default Accounts

| Email               | Password    | Tenant   | Role         |
|---------------------|-------------|----------|--------------|
| admin@nodeadmin.dev | Admin123456 | default  | super-admin  |

Register new accounts at http://localhost:3000/register.

## More Information

See [CLAUDE.md](CLAUDE.md) for architecture, commands, and coding conventions.
