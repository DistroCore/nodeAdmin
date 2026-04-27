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
      modules/     ← 业务模块 (Health, Auth, Im)
      infrastructure/ ← 数据库、Redis、消息存储
  adminPortal/     ← 前端 React 应用 (ESM, port 3000)
    src/
      app/         ← 路由、根组件
      components/
        ui/        ← shadcn/ui 基础组件 (button, card, input, table, badge, toast)
        business/  ← 业务面板组件
      hooks/       ← 自定义 Hooks (useApiClient, useImSocket)
      stores/      ← Zustand Stores (useAuthStore, useSocketStore, useMessageStore, useUiStore)
      lib/         ← 工具函数 (apiClient, className)
packages/          ← 共享包（预留）
docs/              ← 项目文档
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

- ❌ 不要使用 `any` 类型（除非绝对必要并添加注释）
- ❌ 不要使用 `console.log`（使用结构化日志系统）
- ❌ 不要硬编码 tenantId / userId / conversationId
- ❌ 不要在代码中直接写 API base URL（使用环境变量）
- ❌ 不要修改 `.git/` 目录下的文件
- ❌ 不要自动安装新依赖包（除非任务明确要求）
- ❌ 不要自动 commit 或 push

## API 路径约定

- REST API 前缀：`/api/v1/`
- 健康检查：`/health`（无前缀）
- WebSocket：Socket.IO 默认路径 `/socket.io`

## 测试

- 后端：Vitest 单元测试 (`npm run test:coreApi`) + 集成测试 (`npm run test:coreApi:integration`)，覆盖率约 80%
- 前端：Vitest + Testing Library (`npm run test:adminPortal`)，E2E 用 Playwright (`npm run test:e2e:web`，仅本地运行)
- 代码质量：ESLint (`eslint.config.cjs`) + Prettier (`.prettierrc.cjs`)

## 多 Agent 协作协议

本项目使用三 agent 协作模式，运行在 tmux `ai-workbench` session 中。

### 角色与职责

| Agent                    | Pane               | 职责                              | 禁止                          |
| ------------------------ | ------------------ | --------------------------------- | ----------------------------- |
| **Claude (Claude Code)** | `ai-workbench:1.1` | 协调、规划、E2E 测试、文档、CI/CD | —                             |
| **Codex**                | `ai-workbench:1.2` | 后端开发、后端测试、基础设施      | ❌ 前端代码                   |
| **Gemini**               | `ai-workbench:1.3` | **前端 UI/UX only**               | ❌ 后端、❌ 测试、❌ 基础设施 |

### tmux 通讯协议（强制）

你正在 tmux pane 中运行。当你收到包含路由头的协作消息（如 `[Claude][to:Codex][task:T-XXX][msg:M-XXX][P1][task] ...`），**必须通过 tmux 回发到发送方的 pane**，不能只在本地对话中回复。

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
  --message "[Codex][to:Claude][task:T-XXX][msg:M-XXX][inReplyTo:M-XXX][P1][answer] 回复内容"

# 自动生成并发送 ack（推荐，从原始消息自动解析路由头）
~/.claude/skills/tmux-ai-collab/scripts/autoAckTmuxAiMessage.sh \
  --as codex \
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

详细规则见 skill 文件：`~/.codex/skills/tmux-ai-collab/SKILL.md`

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
