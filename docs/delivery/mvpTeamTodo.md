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

## Quick Commands
- `npm run format:check`
- `npm run lint`
- `npm run test:coreApi`
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

Last updated: 2026-03-01
