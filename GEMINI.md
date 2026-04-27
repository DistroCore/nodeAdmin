# GEMINI.md - Project Context & Instructions

This file provides essential context, architectural patterns, and development guidelines for the **nodeAdmin** project. It is intended to guide AI agents and developers in maintaining consistency and quality across the codebase.

## Project Overview

**nodeAdmin** is an enterprise-grade, multi-tenant SaaS middleware platform with an integrated Instant Messaging (IM) module. It is structured as an npm workspace monorepo.

## Branch Strategy (Git Flow)

| Branch    | Purpose               | Rules                                                                |
| --------- | --------------------- | -------------------------------------------------------------------- |
| `master`  | **Stable / Release**  | Only merged from `develop` at milestone completion; no direct pushes |
| `develop` | **Development trunk** | All daily development, PR merges, and CI validation happen here      |

- All AI agents and developers **default to working on `develop`**
- After a milestone, the tech lead merges `develop` → `master` (preferably via PR + review)
- Hotfixes branch off `master`, fix merges back to both `master` and `develop`

### Core Technologies

- **Monorepo**: npm workspaces
- **Backend**: NestJS 11 + Fastify + TypeScript (CommonJS)
- **Frontend**: React 18 + Vite 6 + TypeScript (ESM) + Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL with Row-Level Security (RLS) + Drizzle ORM
- **Real-time**: Socket.IO + Redis Adapter
- **Messaging**: Kafka (Outbox Pattern)
- **State Management**: Zustand (Client) + TanStack Query (Server)
- **Infrastructure**: Docker Compose (Postgres, Redis, Kafka, Prometheus, Grafana, Nginx)

## Directory Structure

```text
/
├── apps/
│   ├── coreApi/          # NestJS backend (CommonJS, port 11451)
│   └── adminPortal/      # React frontend (ESM, port 3000)
├── packages/
│   └── shared-types/     # Shared TypeScript interfaces (ESM)
├── infra/                # Docker, Nginx, Prometheus, Grafana configs
├── scripts/              # Operational, migration, and test scripts (.cjs)
└── docs/                 # Architecture and operational documentation
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose

### Development Commands

Run these from the repository root:

| Command            | Description                                 |
| ------------------ | ------------------------------------------- |
| `npm run infra:up` | Start core infrastructure (DB, Redis, etc.) |
| `npm run dev:api`  | Start backend in development mode           |
| `npm run dev:web`  | Start frontend in development mode          |
| `npm run build`    | Build both backend and frontend             |

### Infrastructure Variants

- `npm run infra:up:kafka`: Start Kafka + Zookeeper.
- `npm run infra:up:monitoring`: Start Prometheus, Grafana, and AlertManager.
- `npm run infra:up:tls`: Generate dev certificates and start Nginx TLS proxy (port 3443).

## Testing & Quality

| Command                    | Description                                                                       |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm run lint`             | Run ESLint (zero errors/warnings, `no-explicit-any` enforced)                     |
| `npm run format:check`     | Check code formatting with Prettier                                               |
| `npm run test:coreApi`     | Run backend unit tests (Vitest)                                                   |
| `npm run test:adminPortal` | Run frontend unit tests (Vitest)                                                  |
| `npm run test:e2e:web`     | Run frontend E2E tests (Playwright)                                               |
| `npm run ci:local`         | Full local CI (format + lint + tests + build, add `--full` for structural checks) |
| `npm run check:naming`     | Validate directory/file naming conventions                                        |
| `npm run check:layers`     | Enforce controller→service→repository layering                                    |
| `npm run check:docs`       | Detect doc drift (stale dates, missing index refs)                                |
| `npm run cleanup:ai`       | Scan for AI-generated code smells                                                 |
| `npm run smoke:im`         | Run IM flow smoke test                                                            |
| `npm run smoke:mvp`        | Automated MVP release smoke test                                                  |
| `npm run diagnose`         | Runtime service health check                                                      |
| `npm run status`           | Print project status card                                                         |
| `npm run load:k6`          | Run K6 load tests                                                                 |

## Development Conventions

### Naming & Structure

- **Directories**: `lowercase` (e.g., `components/`, `modules/`)
- **Business Files**: `lowerCamelCase` (e.g., `messagePanel.tsx`, `userService.ts`)
- **React Components**: `PascalCase` exports (e.g., `export function UserTable()`)
- **Path Aliases**: Frontend uses `@/` to map to `src/`.

### Architectural Patterns

- **Multi-Tenancy**: Shared database with Row-Level Security (RLS). Every core table must have a `tenantId`.
- **Backend Layers**: Controller → Service → Repository.
- **Kafka Outbox**: Business writes and outbox events must occur in a single database transaction. No direct writes to Kafka from services.
- **Real-time**: Multi-node scaling via Socket.IO Redis Adapter.

### Coding Rules

- **No `any`**: Forbidden by ESLint rule `no-explicit-any: error`. Use proper typing always.
- **No `console.log`**: Forbidden by ESLint rule `no-console: error` (console.warn/error/info allowed). Use the structured logging system (NestJS Logger or OpenTelemetry).
- **Tenant Context**: Always validate `tenantId`. It is typically injected at the gateway/guard layer.
- **CommonJS vs ESM**: Backend is CommonJS; Frontend and Shared Packages are ESM. Do not mix module systems within an app.
- **Idempotency**: Message consumers must be idempotent (deduplicate via `eventId`).

## Operational Notes

- **Database Migrations**: Managed via Drizzle. See `apps/coreApi/drizzle.config.ts`.
- **Environment Variables**: See `.env.example` in root and app directories.
- **Documentation**: Comprehensive docs are located in the `docs/` folder, including `architecture/architectureBaseline.md`.

## AI Agent Instructions

- **Do not** auto-install dependencies unless explicitly requested.
- **Do not** use `any` types.
- **Always** follow the established directory and naming conventions.
- **Always** consider multi-tenant isolation and the outbox pattern when modifying data-related logic.
- **Refer** to `CLAUDE.md` and `AGENTS.md` for tool-specific guidance.

## 多 Agent 协作协议（强制）

你正在 tmux `ai-workbench` session 的 pane `ai-workbench:1.3` 中运行。

### Pane 布局

| Pane               | AI           | 职责                 |
| ------------------ | ------------ | -------------------- |
| `ai-workbench:1.1` | Claude       | 规划、协调、架构审查 |
| `ai-workbench:1.2` | Codex        | 后端实现、接口、测试 |
| `ai-workbench:1.3` | Gemini（你） | 前端实现、代码库分析 |

### tmux 通讯规则

当你收到包含路由头的协作消息（如 `[Claude][to:Gemini][task:T-XXX][msg:M-XXX][P1][task] ...`），**必须通过 tmux 回发到发送方的 pane**，不能只在本地对话中回复。

**核心规则：本地 CLI 输出 ≠ 已回复对方。只有通过 tmux 发回对方 pane 才算真正回复。**

#### 回复流程

1. 解析路由头中的 `to:`，确认消息是发给自己的
2. 立即用脚本发一个短 `ack` 回给发送方
3. 处理完任务后，再补发 `answer` / `done` / `blocked`

#### 发送脚本

```bash
# 回复 Claude（发到 Claude 的 pane）
~/.claude/skills/tmux-ai-collab/scripts/sendTmuxAiMessage.sh \
  --to claude \
  --message "[Gemini][to:Claude][task:T-XXX][msg:M-XXX][inReplyTo:M-XXX][P1][answer] 回复内容"

# 自动生成并发送 ack（推荐，从原始消息自动解析路由头）
~/.claude/skills/tmux-ai-collab/scripts/autoAckTmuxAiMessage.sh \
  --as gemini \
  --message "粘贴收到的原始消息"
```

#### 消息格式

```
[发送方][to:接收方][task:T-XXX][msg:M-XXX][优先级][消息类型]
正文内容
```

- 优先级：P0（阻塞/破坏性）/ P1（核心协作）/ P2（非阻塞）
- 消息类型：task / question / answer / update / blocked / done / review / handoff
- 回复时加 `[inReplyTo:M-XXX]`

#### 完整协议

详细规则见 skill 文件：`~/.gemini/skills/tmux-ai-collab/SKILL.md`
