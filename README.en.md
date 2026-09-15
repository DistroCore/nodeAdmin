**English** | [简体中文](README.md)

<div align="center">

# nodeAdmin

**An opinionated, enterprise-grade framework for building multi-tenant middle/back-office applications — fast.**

NestJS 11 + Fastify · React 18 + Vite 6 · PostgreSQL (RLS) · Redis · Kafka · Socket.IO · OpenTelemetry

[![CI](https://github.com/DistroCore/nodeAdmin/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/DistroCore/nodeAdmin/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick start](#quick-start) · [Features](#what-you-get) · [Architecture](#architecture) · [Documentation](#documentation) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

</div>

---

## Why nodeAdmin

Most "admin dashboard" starters solve the UI and stop there. Real internal platforms need a lot more than a sidebar and a table: multi-tenant isolation, auth/RBAC, audit logging, async messaging, realtime delivery, observability, a plugin story, and a CI pipeline you can actually trust.

**nodeAdmin is a framework, not a product.** It is designed to be **forked and extended** — you bring your business domain, it brings the platform plumbing. A reference IM (instant messaging) module is included to prove every piece of that plumbing actually works end-to-end at 1万+ concurrent connections.

> The companion modules (Agent services, vertical integrations, etc.) that used to live here have been moved to downstream forks. The upstream `nodeAdmin` repo now focuses exclusively on **framework DX, platform stability, and extensibility**. See [roadmap §9](docs/delivery/roadmapPlan.md#9-phase-5m3-之后的增量能力) and decision log `D-019` for the positioning.

## What you get

### 🚀 Developer Experience

- **Swagger / OpenAPI out of the box** — every controller tagged, every DTO annotated, served at `/api/docs` behind `SWAGGER_ENABLED`
- **Code generator CLI** — `npm run generate:crud` scaffolds controller + service + Drizzle schema + DTO + React page from one command
- **Shared TypeScript types** — `packages/shared-types` keeps the wire protocol honest across the stack; the FE cannot drift from the BE
- **shadcn/ui + Tailwind** preconfigured with design tokens, dark mode, and 20+ business components ready to compose
- **Plugin marketplace** — drop-in NestJS modules and React pages with dynamic `import()` + importmap shared deps; install/uninstall/update without redeploy
- **Zero-warning lint** policy, Prettier, strict TS, and a one-shot `npm run ci:local` that mirrors GitHub Actions

### 🛡 Platform Stability

- **6-job CI pipeline** — static / unit-test / audit / build / integration / docker-build, with artifact sharing and failure log collection
- **Supply-chain gate** — `audit-ci` blocks high/critical advisories; allowlist entries carry mandatory expiry dates that CI enforces
- **Security-first defaults** — JWT auth, RLS-backed multi-tenancy, structured audit log, encrypted secrets, hardened `.dockerignore`
- **Outbox pattern** — every business write that publishes an event inserts the outbox row in the same DB transaction, then a Kafka consumer drains it. No double-writes, no lost messages, idempotent consumers
- **Postgres RLS** — tenant isolation is enforced by the database, not by the application layer alone
- **OpenTelemetry** tracing + structured logging + Prometheus metrics + Grafana dashboards + Alertmanager rules, all wired in infra/
- **Load-tested to 10,000 concurrent Socket.IO connections** (see `docs/delivery/m2CapacityBaseline.md`)

### 🧩 Extensibility

- **`TenantContext` + `SINGLE_TENANT_MODE`** — one codebase, one deployment model for both single-tenant and multi-tenant installs (decision `D-015`)
- **Plugin marketplace Phase 0–2 complete** — manifest validation, dynamic module registration, React.lazy FE loading, shared deps via importmap, install/uninstall/publish/auto-update APIs
- **Modernizer module** — analyze / docSync / controller pipeline that keeps API docs and schemas in lockstep with code
- **PgBouncer, Redis Cluster, Kafka partitioning** all validated in the reference docker-compose — not aspirational

## Tech stack

| Layer                  | Choice                                                        | Why                                                         |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| **Runtime**            | Node.js ≥ 22                                                  | Top-level await, native test runner, performance            |
| **Backend framework**  | NestJS 11 + Fastify 11                                        | DI + decorators + the fastest Node HTTP adapter             |
| **Database**           | PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team/) 0.45 | Type-safe SQL, RLS for tenant isolation, honest migrations  |
| **Connection pooling** | PgBouncer (transaction mode)                                  | Survives the "1万 connections" stampede                     |
| **Cache / pub-sub**    | Redis 7                                                       | Socket.IO adapter, rate limiting, session store             |
| **Async messaging**    | Kafka 3 (KRaft) + Outbox pattern                              | At-least-once delivery, conversation-scoped ordering        |
| **Realtime**           | Socket.IO 4 + Redis Adapter                                   | Horizontal scale-out across pods                            |
| **Frontend framework** | React 18 + Vite 6                                             | HMR in <100ms, ESM everywhere                               |
| **UI primitives**      | Tailwind CSS + shadcn/ui                                      | Copy-paste components, no runtime CSS-in-JS                 |
| **Server state**       | TanStack Query 5                                              | Cache invalidation is not your problem anymore              |
| **Client state**       | Zustand 5                                                     | Less boilerplate than Redux, more predictable than Context  |
| **Observability**      | OpenTelemetry + Prometheus + Grafana + Alertmanager           | Traces, metrics, logs, alerts — all correlated by `traceId` |
| **CI / Quality gates** | GitHub Actions + ESLint + Prettier + Vitest + audit-ci        | Zero-warning lint, supply-chain audit, allowlist expiry     |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      adminPortal (React 18 + Vite)                  │
│   shadcn/ui · Tailwind · TanStack Query · Zustand · Socket.IO cli   │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTP (REST /api/v1) + WS (/socket.io)
┌───────────────────────────▼─────────────────────────────────────────┐
│                        coreApi (NestJS 11 + Fastify)                │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬────────┐  │
│  │   Auth   │   RBAC   │    IM    │  Audit   │ Plugins  │ Health │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴────────┘  │
│    JWT guard · TenantContext · ValidationPipe · Global filters      │
│    Controller → Service → Repository (Drizzle ORM)                  │
└──┬────────────┬─────────────┬──────────────┬──────────────┬─────────┘
   │            │             │              │              │
┌──▼──┐    ┌────▼────┐   ┌────▼────┐   ┌─────▼─────┐   ┌────▼────┐
│ PG  │    │PgBouncer│   │  Redis  │   │   Kafka   │   │   OTel  │
│ RLS │    │  6432   │   │ adapter │   │  outbox   │   │  traces │
└─────┘    └─────────┘   └─────────┘   └───────────┘   └─────────┘
```

- **Request flow**: `Controller → DTO validation → Service → Repository → Drizzle → Postgres (with RLS)`
- **Event flow**: `Service writes business row + outbox row in one TX → Kafka consumer publishes → downstream consumers (idempotent by eventId)`
- **Realtime flow**: `Socket.IO gateway → Redis adapter → fan-out to all nodes → client delivery ACK → sequence-id reconcile`

Deeper reading: [`docs/architecture/`](docs/architecture/), [`docs/platformSpec.md`](docs/platformSpec.md).

## Quick start

**Requirements**: Node.js ≥ 22, npm ≥ 10, Docker + Docker Compose.

```bash
# 1. Clone & install
git clone https://github.com/DistroCore/nodeAdmin.git
cd nodeAdmin
npm ci

# 2. Start infra (PostgreSQL 55432, PgBouncer 6432, Redis 56379)
npm run infra:up

# 3. Configure environment
cp apps/coreApi/.env.example apps/coreApi/.env

# 4. Apply database migrations
npm run db:migrate -w coreApi

# 5. Start dev servers (two terminals, or run in background)
npm run dev:api    # CoreApi backend — http://localhost:11451
npm run dev:web    # AdminPortal    — http://localhost:3000
```

Then open:

- **Admin portal** → http://localhost:3000
- **API docs (Swagger)** → http://localhost:11451/api/docs
- **Health** → http://localhost:11451/health

### Default login

| Email                 | Password      | Tenant    | Role          |
| --------------------- | ------------- | --------- | ------------- |
| `admin@nodeadmin.dev` | `Admin123456` | `default` | `super-admin` |

Register additional accounts at http://localhost:3000/register.

### Optional profiles

```bash
npm run infra:up:kafka        # + Kafka + Zookeeper (for outbox event flow)
npm run infra:up:monitoring   # + Prometheus + Grafana + Alertmanager
npm run infra:up:tls          # + Nginx TLS proxy on :3443
```

## Local CI

Before opening a PR, run the same checks GitHub Actions runs (minus the integration-heavy jobs):

```bash
npm run ci:local     # format:check → lint → test:coreApi + test:adminPortal → build
```

Or step by step:

```bash
npm run format:check
npm run lint                  # --max-warnings=0, zero tolerance
npm run test:coreApi          # Vitest backend unit tests
npm run test:adminPortal      # Vitest frontend unit tests
npm run build                 # Both apps
```

Backend integration tests (need `npm run infra:up` first):

```bash
npm run test:coreApi:integration
npm run m2:acceptance:auto    # end-to-end M2 milestone acceptance
```

## Documentation

| Topic                               | File                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Architecture deep-dive              | [`docs/architecture/`](docs/architecture/)                                                 |
| Platform spec (non-functional reqs) | [`docs/platformSpec.md`](docs/platformSpec.md)                                             |
| API endpoint catalogue              | [`docs/api-endpoints.md`](docs/api-endpoints.md)                                           |
| Roadmap & milestone history         | [`docs/delivery/roadmapPlan.md`](docs/delivery/roadmapPlan.md)                             |
| Decision log (ADRs)                 | [`docs/governance/decisionLog.md`](docs/governance/decisionLog.md)                         |
| Security policy                     | [`SECURITY.md`](SECURITY.md)                                                               |
| Contributing guide                  | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                       |
| Operations runbooks                 | [`docs/operations/`](docs/operations/)                                                     |
| Plugin marketplace                  | [`docs/architecture/pluginMarketplacePlan.md`](docs/architecture/pluginMarketplacePlan.md) |
| Full doc index                      | [`docs/docIndex.md`](docs/docIndex.md)                                                     |

## Project status

nodeAdmin has cleared all three MVP milestones:

| Milestone         | Scope                                                                            | Status |
| ----------------- | -------------------------------------------------------------------------------- | ------ |
| **M1 — Usable**   | Main request/event paths up, core APIs stable, Phase 1 → 2 capacity gates passed | ✅     |
| **M2 — Reliable** | Idempotency, retries, alerting, load tests at 10K concurrent connections         | ✅     |
| **M3 — Operable** | Audit, DR drills, SLA dashboards, on-call handbook                               | ✅     |

Since M3, the project is in **Phase 5** — incremental framework-level improvements only. No new business verticals ship in the upstream repo; see [`docs/delivery/roadmapPlan.md §9`](docs/delivery/roadmapPlan.md#9-phase-5m3-之后的增量能力).

## Known tech debt

We keep this list short and honest rather than hide it. Full details and tracking IDs in [`roadmapPlan.md §9.3`](docs/delivery/roadmapPlan.md#93-tech-debt按紧迫度排序).

- **TD-1** — `@nestjs/swagger@11.2.6` exact-pins `lodash@4.17.23` and `path-to-regexp@8.3.0`, forcing an `audit-ci` allowlist entry that expires **2026-07-07**
- **TD-2** — `react-intl@10.1.1` × `@types/react@18.3.28` peer conflict means only `npm ci` produces a clean install; `npm install` cannot cleanly rebuild the lockfile
- **TD-3** — Playwright E2E was removed from CI (commit `c33a0fc`) due to flakiness; root-cause is still open before it can be re-added

New contributors: any of the above is a great first-PR target. Open an issue before starting so we can coordinate.

## Contributing

We welcome issues, PRs, documentation improvements, and community plugins. Start here: [`CONTRIBUTING.md`](CONTRIBUTING.md).

Because nodeAdmin is designed to be forked, most downstream work happens in your fork. Only **framework-level** improvements (DX, stability, extensibility, security) need to come back upstream — business features belong in the fork.

## Community & support

- **Bugs / feature requests** — use the [issue tracker](https://github.com/DistroCore/nodeAdmin/issues) with the appropriate template
- **Security vulnerabilities** — **do not** open a public issue; see [`SECURITY.md`](SECURITY.md) for the private disclosure flow
- **Discussions** — use GitHub Discussions for design questions and show-and-tell (enable in repo Settings → Features if not yet on)

## License

nodeAdmin is released under the [MIT License](LICENSE). You are free to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, subject to the conditions in the license file. Contributions are accepted under the same terms.

---

<div align="center">
Built with care for teams that refuse to re-invent the platform layer on every project.
</div>
