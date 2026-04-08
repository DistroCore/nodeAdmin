# MVP Team Execution Board (8 Weeks)

> Team charter: `docs/delivery/implementationTeamCharter.md`  
> Task source baseline: `docs/delivery/brainstormingResults.md`

Status legend:

- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed

## Phase 1 (Week 1-2) Survival Baseline

### Backend

- [x] JWT access/refresh token chain with secure defaults
- [x] `WsTenantGuard` identity extraction from JWT only
- [x] Runtime config loading and validation (`@nestjs/config`)
- [x] Structured logging baseline
- [x] IM gateway/service/repository split
- [x] Unified error model and exception filter
- [x] Strict CORS origin whitelist

### Frontend

- [x] React Router based layout routing
- [x] Module level `ErrorBoundary` integration
- [x] `html lang="zh-CN"` baseline
- [x] Core UI primitives (`Input/Card/Badge/Table/Toast`)
- [x] Tailwind token system and theme variables
- [x] Removed hardcoded identity from IM payloads

### Quality and Platform

- [x] ESLint + Prettier quality gate
- [x] P0 smoke scripts for IM/infra flow
- [x] Basic health checks and logs available

## Phase 2 (Week 3-4) Persistence Foundation

### Backend

- [x] Drizzle + PostgreSQL schema landed
- [x] SQL migration scripts repeatable and idempotent
- [x] RLS baseline + explicit tenant query constraints (`WHERE tenant_id = ?`)
- [x] PgBouncer integrated and stress script passing
- [x] Redis + Socket.IO adapter integrated

### Frontend

- [x] Zustand stores (`Auth/Socket/Message/UI`) in place
- [x] TanStack Query + API client integrated
- [x] IM socket logic extracted into reusable hook
- [x] Overview/Tenant/Release panels use real API data
- [x] Theme toggle and tokenized styling validated

### Quality and Platform

- [x] Docker Compose one-click base environment
- [x] Core unit tests for store and guard
- [x] M1 acceptance scripts and auto-runner completed

## Phase 3 (Week 5-6) Reliability Enhancement

### Backend

- [x] Outbox + polling publisher implemented
- [x] Kafka topic publish + DLQ fallback strategy integrated
- [x] OpenTelemetry integration (`metrics/trace` bootstrap)
- [x] Graceful shutdown for HTTP + WebSocket + Redis clients
- [x] WebSocket rate limiting online
- [x] TLS termination available and smoke-verified (`nginx:3443`)

### Frontend

- [x] Virtualized message list rendering
- [x] Conversation list + unread badge usable
- [x] Message type expansion (`text/image/file/system`)
- [x] Permission framework for route/page/button controls

### Quality and Platform

- [x] k6 load script delivered (`scripts/k6ImLoad.js`)
- [x] Reliability regression script delivered (`duplicate/idempotency`)
- [x] M2 acceptance gate and auto-runner completed

## Phase 4 (Week 7-8) Enterprise Capabilities

### Backend

- [x] Audit log recording and query endpoint
- [x] Security headers (HSTS/CSP and baseline headers)
- [x] Message XSS sanitization on server side
- [x] Partition rehearsal migration and verification script
- [x] Shared types package integrated (`@nodeadmin/shared-types`)

### Frontend

- [x] Offline message queue and reconnect sync
- [x] Typing indicator end-to-end (`typing` event flow)
- [x] Playwright E2E smoke case landed and passing
- [x] Build chunk optimization (`manualChunks`)

### Quality and Platform

- [x] Grafana + Prometheus + Alertmanager stack profile
- [x] PostgreSQL backup/restore automation scripts
- [x] Disaster recovery drill record documented
- [x] CI/CD workflow with M2 gate (`.github/workflows/ci.yml`)

## Phase 5 (Post-M3) Incremental Capabilities

> nodeAdmin is positioned as a **rapid-development enterprise middle/back-office
> framework**, so post-M3 work focuses on framework DX (API documentation, plugin
> mechanism, CI stability) rather than vertical business features. Business
> capabilities live in downstream forks.

### Backend

- [x] Swagger API documentation (`dff4c45`, 2026-03-29) — `SwaggerModule.setup('api/docs', ...)` in `apps/coreApi/src/app/createApp.ts`, gated by `SWAGGER_ENABLED`; `@ApiTags` + `@ApiOperation` on all controllers, `@ApiProperty` on DTOs
- [x] Audit log system — JWT HTTP guard, global interceptor, Drizzle repository, query API (`5aa6e1c` / PR #21)
- [x] Modernizer module — analyze / docSync / controller (part of `dff4c45` batch)
- [x] Plugin marketplace Phase 0+1+2 — manifest schema, dynamic NestJS module registration, plugin sandbox, install/uninstall/publish API, auto-update service, version management (`e11a5d9`)
- [x] TenantContext abstraction + `SINGLE_TENANT_MODE` switch (`d132602`)
- [ ] TD-1: upgrade/replace `@nestjs/swagger@11.2.6` to escape exact-pinned `lodash` / `path-to-regexp` (allowlist expiry 2026-07-07)

### Frontend

- [x] Audit log timeline UI + filters (`auditLogPanel.tsx`, Timeline primitive)
- [x] Plugin marketplace UI — marketplace page, detail page, installed plugins management, settings page
- [x] Button + Link a11y fixes (`07d0942`, `2cdb769`) — export `buttonVariants`, eliminate invalid `<Button><Link/></Button>` nesting
- [ ] TD-2: resolve `react-intl@10.1.1` vs `@types/react@18.3.28` peer conflict so that `npm install` can regenerate the lockfile from scratch (currently only `npm ci` works)

### Quality and Platform

- [x] CI workflow expanded to 6 jobs: static / unit-test (now also runs `test:adminPortal`) / audit / build / test-integration / docker-build (`b463d59`)
- [x] `.dockerignore` pattern-based allowlist for `apps/adminPortal/` top-level files (`61b1cab` fix + TD-4 hardening)
- [x] CI audit gated by `audit-ci` with documented allowlist (`ad33af1`)
- [x] Audit-ci allowlist 90-day expiry enforced by `scripts/checkAuditAllowlistExpiry.cjs` (TD-5)
- [x] `wait-for-infra` composite action no longer silently continues on port/PG timeout
- [x] Build artifact shared between `build` and `test-integration` jobs via `actions/upload-artifact`
- [x] Frontend unit warnings cleaned up (BacklogPanel duplicate-key, LoginPage `act()`, plugin marketplace Button+Link)
- [x] drizzle-orm 0.45.1 → 0.45.2 patching GHSA-gpj5-g38j-94v9 SQL injection (`f2ee0d8`), caught by new audit-ci gate
- [ ] TD-3: root-cause Playwright E2E flake (removed from CI in `c33a0fc`) before re-adding E2E job

## Quick Commands

- `npm run format:check`
- `npm run lint`
- `npm run test:coreApi`
- `npm run test:adminPortal`
- `npm run build`
- `npm run infra:up`
- `npm run infra:up:kafka`
- `npm run infra:up:tls`
- `npm run infra:up:monitoring`
- `npm run m1:acceptance:auto`
- `npm run m2:acceptance:auto`
- `npm run smoke:im`
- `npm run smoke:outbox`
- `npm run smoke:pgbouncer`
- `npm run smoke:tls`
- `npm run reliability:regression`
- `npm run partition:check`
- `npm run backup:pg`
- `npx audit-ci --config audit-ci.jsonc`
- `node scripts/checkAuditAllowlistExpiry.cjs`

Last updated: 2026-04-08 (Phase 5 added, reflecting post-M3 delivery and open tech debt)
