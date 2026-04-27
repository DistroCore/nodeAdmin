# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nodeAdmin** is an enterprise-grade, multi-tenant SaaS middleware platform with an IM (Instant Messaging) module. It is organized as an npm workspace monorepo.

## Branch Strategy (Git Flow)

| Branch    | Purpose               | Rules                                                                |
| --------- | --------------------- | -------------------------------------------------------------------- |
| `master`  | **Stable / Release**  | Only merged from `develop` at milestone completion; no direct pushes |
| `develop` | **Development trunk** | All daily development, PR merges, and CI validation happen here      |

- All AI agents and developers **default to working on `develop`**
- After a milestone, the tech lead merges `develop` → `master` (preferably via PR + review)
- Hotfixes branch off `master`, fix merges back to both `master` and `develop`

## Commands

All commands are run from the repo root unless noted.

### Development

```bash
npm run dev:api          # Start CoreApi (NestJS, port 11451) with HMR via ts-node-dev
npm run dev:web          # Start AdminPortal (Vite dev server, port 3000)
```

### Build

```bash
npm run build            # Build both CoreApi (tsc → CommonJS) and AdminPortal (tsc + Vite → ESM)
```

### Testing & Quality

```bash
npm run test:coreApi    # Run backend unit tests with Vitest
npm run test:adminPortal # Run frontend unit tests with Vitest
npm run test:e2e:web     # Run Playwright E2E tests for AdminPortal
npm run lint             # ESLint on all apps/**/*.{ts,tsx} — zero warnings/errors allowed
npm run format:check     # Prettier format check
npm run ci:local         # Full local CI: format + lint + unit tests + build (+ structural checks with --full)
```

### Structural Checks

```bash
npm run check:naming     # Validate directory/file naming conventions
npm run check:layers     # Enforce controller→service→repository layering
npm run check:docs       # Detect doc drift (stale dates, missing index refs)
npm run cleanup:ai       # Scan for AI-generated code smells
```

### Operations & Diagnostics

```bash
npm run status           # Print project status card (milestones, infra, open TODOs)
npm run diagnose         # Runtime service health check (ports, Docker containers)
npm run playbook         # Fault query playbook (connection spikes, Kafka lag, Redis health)
npm run smoke:mvp        # Automated MVP release smoke test
```

### Infrastructure

```bash
npm run infra:up                  # Start core services (PostgreSQL on 55432, PgBouncer on 6432, Redis on 56379)
npm run infra:up:kafka            # Add Kafka + Zookeeper
npm run infra:up:monitoring       # Add Prometheus (9091), Grafana (3003), AlertManager (9093)
npm run infra:up:tls              # Generate dev TLS cert + start Nginx TLS proxy (port 3443)
npm run infra:down                # Stop all services
```

### Smoke & Load Tests

```bash
npm run smoke:im                  # IM end-to-end flow smoke test
npm run smoke:outbox              # Kafka outbox smoke test
npm run smoke:tls                 # TLS termination smoke test
npm run smoke:pgbouncer           # PgBouncer connection pooling check
npm run load:k6                   # K6 load test (default scenario)
npm run load:k6:smoke             # K6 smoke scenario
npm run load:k6:spike             # K6 spike scenario
npm run load:k6:stress            # K6 stress scenario
npm run m1:acceptance:auto        # M1 milestone acceptance (auto-starts API)
npm run m2:acceptance:auto        # M2 milestone acceptance (auto-starts API)
```

## Architecture

### Monorepo Structure

```
apps/coreApi/        ← NestJS 11 + Fastify backend (CommonJS, port 11451)
apps/adminPortal/    ← React 18 + Vite 6 frontend (ESM, port 3000)
packages/shared-types/ ← Shared TypeScript types/interfaces (ESM)
infra/               ← Caddy, Nginx, Prometheus, Grafana configs
scripts/             ← Operational and acceptance test scripts (CommonJS .cjs)
docs/                ← Architecture, delivery, operations documentation
```

### Backend (CoreApi — NestJS)

Layered architecture: **Controller → Service → Repository**

```
src/
  app/           ← Root module (appModule.ts), runtime config, global exception filter
  modules/       ← Business domains: Health, Auth, Im (conversations, messages, presence)
  infrastructure/ ← Database (Drizzle ORM), Redis, Kafka outbox, Audit, OpenTelemetry
```

- HTTP via Fastify; real-time via Socket.IO with Redis Adapter for multi-node scaling
- DTOs validated with `class-validator` + `class-transformer` + `ValidationPipe`
- Auth via JWT guards; tenant context injected at gateway layer — services must never skip tenant validation
- Async messaging uses the **Outbox Pattern**: business write + outbox row in a single DB transaction; Kafka consumer publishes and marks as done
- Structured logging only — no `console.log`; use NestJS logger or OpenTelemetry

### Frontend (AdminPortal — React)

```
src/
  app/            ← Router + provider wrapper
  components/ui/  ← shadcn/ui primitives (button, card, input, table, badge, toast...)
  components/business/ ← Domain panels composing ui components
  hooks/          ← useApiClient (HTTP), useImSocket (WebSocket)
  stores/         ← Zustand: useAuthStore, useSocketStore, useMessageStore, useUiStore
  lib/            ← apiClient.ts, className.ts (clsx + tailwind-merge)
  styles/         ← globals.css (Tailwind directives + CSS variables as hsl(var(--xxx)))
```

- Server state: **TanStack Query** (`useQuery`/`useMutation`)
- Client state: **Zustand** stores
- Path alias `@/` maps to `src/`
- Styling: Tailwind CSS utilities only; custom CSS avoided; CSS design tokens in `globals.css`

### Multi-Tenancy

- Shared PostgreSQL database with **Row-Level Security (RLS)**
- Every core table has a `tenantId` column
- All message/event payloads must carry: `tenantId`, `conversationId`, `messageId`, `traceId`
- Consumers must be idempotent (deduplication via `eventId`)
- Only **conversation-scoped ordering** is guaranteed — no global ordering

### API Conventions

- REST prefix: `/api/v1/`
- Health check: `/health` (no prefix)
- WebSocket: Socket.IO at `/socket.io`

## Naming Conventions (Enforced)

| Entity                    | Convention            | Example                                           |
| ------------------------- | --------------------- | ------------------------------------------------- |
| Directories               | `lowercase`           | `components/`, `modules/`, `business/`            |
| Business files            | `lowerCamelCase`      | `messagePanel.tsx`, `conversationService.ts`      |
| Framework/config files    | Official names        | `package.json`, `vite.config.ts`, `tsconfig.json` |
| React components (export) | `PascalCase` function | `export function ManagementOverviewPanel()`       |
| Variables & functions     | `camelCase`           |                                                   |
| Constants                 | `UPPER_SNAKE_CASE`    |                                                   |
| Types & interfaces        | `PascalCase`          | `interface UserProfile`, `type MessageEvent`      |

## Coding Rules

- **No `any` type** — enforced by ESLint `no-explicit-any: error`; zero tolerance
- **No `console.log`** — enforced by ESLint `no-console: error` (console.warn/error/info allowed); use structured logging
- **No hardcoded** `tenantId`, `userId`, `conversationId`, or API base URLs
- **No double-writes** — always use the outbox transaction pattern for Kafka events
- Do not auto-install new dependencies or auto-commit/push
- Backend is **CommonJS**; frontend is **ESM** — do not mix module systems within an app
- Use `interface` for object shapes; use `type` for unions/aliases
