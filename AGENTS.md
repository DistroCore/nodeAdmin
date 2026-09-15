# AGENTS.md — nodeAdmin 项目 Codex 公共指令

> 本文件为 AI 编码代理（Codex / Claude Code 等）提供项目上下文和编码规范。
> 所有 AI 代理在修改本项目时必须遵循以下规则。

## 项目概述

nodeAdmin 是一个企业级中台系统，包含 IM 即时通讯模块。Monorepo 结构。

## 分支策略（Git Flow）

| 分支      | 用途              | 规则                                              |
| --------- | ----------------- | ------------------------------------------------- |
| `master`  | **稳定/发布分支** | 只有里程碑完成时才从 `develop` 合入；禁止直接推送 |
| `develop` | **开发主干**      | 所有日常开发、PR 合入、CI 验证都在此分支进行      |

- 所有 AI 代理和开发者**默认在 `develop` 分支工作**
- 里程碑完成后，由技术负责人将 `develop` 合并到 `master`（建议使用 PR + review）
- 紧急 hotfix 可以从 `master` checkout，修复合并回 `master` 和 `develop`

## 技术栈

| 层       | 技术                                                      |
| -------- | --------------------------------------------------------- |
| 后端     | NestJS 11 + Fastify + TypeScript (CommonJS)               |
| 前端     | React 18 + TypeScript + Vite 6 + Tailwind CSS + shadcn/ui |
| 实时通信 | Socket.IO + Redis Adapter                                 |
| 数据库   | PostgreSQL + Drizzle ORM + RLS 多租户                     |
| 缓存     | Redis                                                     |
| 异步消息 | Kafka                                                     |
| 状态管理 | Zustand (客户端) + TanStack Query (服务端)                |

## 目录结构

```
apps/
  coreApi/         ← 后端 NestJS 应用 (CommonJS, port 11451)
    src/
      app/         ← 根模块、配置、过滤器
      modules/     ← 业务模块 (auth/console/health/im/menus/permissions/plugin/roles/tenants/users)
      infrastructure/ ← database(RLS)、Redis、Kafka outbox、audit、observability、tenant、resilience、security
  adminPortal/     ← 前端 React 应用 (ESM, port 3000)
    src/
      app/         ← 路由、根组件
      components/
        ui/        ← shadcn/ui 基础组件
        business/  ← 业务面板组件
      hooks/       ← 自定义 Hooks (useApiClient, useImSocket)
      stores/      ← Zustand Stores (useAuthStore, useSocketStore, useMessageStore, useUiStore)
      lib/         ← 工具函数 (apiClient, className)
packages/
  shared-types/    ← 共享 TypeScript 类型/接口 (ESM)
  plugin-backlog/  ← backlog 业务插件（dogfooding，自持 pg Pool + 自带表/RLS/权限菜单迁移）
infra/             ← Caddy、Nginx、Prometheus、Grafana 配置
scripts/           ← 运维与验收脚本 (CommonJS .cjs)
docs/              ← 架构、交付、运维文档
```

## 命名规范（强制）

- **目录名**：`lowercase` — 如 `components/`, `modules/`, `business/`
- **业务文件名**：`lowerCamelCase` — 如 `healthController.ts`, `messagePanel.tsx`
- **工具/框架文件**：保留官方命名 — 如 `package.json`, `tsconfig.json`, `vite.config.ts`
- **组件导出**：`PascalCase` 函数名 — 如 `export function ManagementOverviewPanel()`
- **变量/函数**：`camelCase`
- **常量**：`UPPER_SNAKE_CASE`（仅限真正的常量）
- **类型/接口**：`PascalCase`

## 编码规范

### TypeScript

- 严格模式 (`"strict": true`)
- 后端是 CommonJS (`"module": "commonjs"`)，前端是 ESM (`"module": "ESNext"`)
- 前端使用 `@/` 路径别名映射到 `src/`
- 使用 `interface` 定义对象结构，`type` 用于联合类型

### 后端 (NestJS)

- Controller → Service → Repository 分层
- 使用 `class-validator` + `class-transformer` 做 DTO 校验
- 使用 `@nestjs/config` 管理配置（`runtimeConfig.ts`）
- Guard 用于认证/授权
- 统一异常过滤器 (`unifiedExceptionFilter.ts`)

### 前端 (React)

- 函数组件 + Hooks（不用 class component）
- 使用 `useApiClient()` Hook 获取 API 客户端
- 使用 `useQuery` / `useMutation` (TanStack Query) 管理服务端状态
- 使用 Zustand store 管理客户端状态
- 使用 shadcn/ui 组件（在 `components/ui/` 下）
- Tailwind CSS 工具类，使用 `className()` 合并类名 (clsx + tailwind-merge)

### 样式

- Tailwind CSS 优先，避免自定义 CSS
- 使用 CSS 变量定义设计令牌（在 `globals.css` 中）
- 颜色引用 `hsl(var(--xxx))` 格式

## 禁止事项

- 不要使用 `any` 类型（除非绝对必要并添加注释）
- 不要使用 `console.log`（使用结构化日志系统）
- 不要硬编码 tenantId / userId / conversationId
- 不要在代码中直接写 API base URL（使用环境变量）
- 不要修改 `.git/` 目录下的文件
- 不要自动安装新依赖包（除非任务明确要求）
- 不要自动 commit 或 push

## API 路径约定

- REST API 前缀：`/api/v1/`
- 健康检查：`/health`（无前缀）
- WebSocket：Socket.IO 默认路径 `/socket.io`

## 测试

- 后端：Vitest 单元测试 (`npm run test:coreApi`) + 集成测试 (`npm run test:coreApi:integration`)，覆盖率约 80%
- 前端：Vitest + Testing Library (`npm run test:adminPortal`)，E2E 用 Playwright (`npm run test:e2e:web`，仅本地运行)
- 代码质量：ESLint (`eslint.config.cjs`) + Prettier (`.prettierrc.cjs`)

## 常用命令（速查）

仓库根目录执行，完整清单见 `CLAUDE.md`：

| 命令                                                   | 用途                                               |
| ------------------------------------------------------ | -------------------------------------------------- |
| `npm run infra:up`                                     | 启动核心基础设施（PostgreSQL 55432 / Redis 56379） |
| `npm run dev:api` / `npm run dev:web`                  | 启动后端（11451）/ 前端（3000）                    |
| `npm run build`                                        | 构建前后端                                         |
| `npm run test:coreApi` / `npm run test:adminPortal`    | 后端 / 前端单元测试                                |
| `npm run lint` / `npm run format:check`                | ESLint（零容忍）/ Prettier 检查                    |
| `npm run check:naming` / `check:layers` / `check:docs` | 命名 / 分层 / 文档漂移结构校验                     |
| `npm run ci:local`                                     | 本地全量 CI（格式 + lint + 测试 + 构建）           |

## 多 Agent 协作协议

本项目使用三 agent 协作模式，运行在 tmux `ai-collab` session 中。协作总线是 `ai` 命令（详见公用 skill `ai-collaboration`，项目无关）。

### 角色与职责

| Agent                    | Pane                 | 职责                              | 禁止          |
| ------------------------ | -------------------- | --------------------------------- | ------------- |
| **Claude (Claude Code)** | `ai-collab:agents.0` | 协调、规划、E2E 测试、文档、CI/CD | —             |
| **Antigravity (agy)**    | `ai-collab:agents.1` | **前端 UI/UX、原型、可视化**      | 不做后端/协议 |
| **Codex**                | `ai-collab:agents.2` | 后端开发、后端测试、基础设施      | 不做前端代码  |

### `ai` 命令总线（强制）

你正在 tmux pane 中运行。**必须通过 `ai` 命令发消息——本地 CLI 输出对方收不到。**

```bash
ai send claude "短消息"
ai send antigravity "短消息"   # 别名 agy
ai send codex "短消息"
ai broadcast "发给全体（跳过自己）"
ai ack <sender> "收到；简短计划"
ai final <sender> "result: 结论/产物；files: 路径；verify: 命令/结果；next: 后续"
ai read <agent> [行数]
ai log [n]
ai panes
```

- 每条发送追加到 `~/.local/share/ai-collab/messages.log`，`ai log [n]` 看尾部；消息格式 `[sender -> recipient HH:MM:SS]`。
- 响应协议：收到 task/求助，最多回两次——先一条 `ack`，做完一条 `final`，中间不发进度闲聊；需澄清就把阻塞问题写进 `final`。

### 完整协议

详见公用 skill：`~/.claude/skills/ai-collaboration/SKILL.md`（项目无关，勿在其中写项目专属内容）。

## 相关文档

### Agent 首读顺序（必读）

所有 AI 代理在修改本项目时，**必须按以下顺序读取上下文**：

1. `AGENTS.md`（本文件）— 项目规范、命名约定、禁止事项
2. `CLAUDE.md` — 架构、命令、编码规则
3. `docs/governance/decisionLog.md` — 重大技术决策（避免重复决策）
4. `docs/delivery/roadmapPlan.md` — 当前阶段与里程碑状态

### 参考文档（按需读取）

- 架构基线：`docs/architecture/architectureBaseline.md`
- 头脑风暴结果：`docs/delivery/brainstormingResults.md`
