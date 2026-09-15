[English](README.md) | **简体中文**

<div align="center">

# nodeAdmin

**一个有主见的企业级多租户中后台框架 —— 让你把平台层这件事一次做完。**

NestJS 11 + Fastify · React 18 + Vite 6 · PostgreSQL (RLS) · Redis · Kafka · Socket.IO · OpenTelemetry

[![CI](https://github.com/DistroCore/nodeAdmin/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/DistroCore/nodeAdmin/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[快速开始](#快速开始) · [特性](#特性) · [架构](#架构) · [文档](#文档) · [贡献](#贡献) · [安全](SECURITY.md)

</div>

---

## 为什么要有 nodeAdmin

多数「后台管理模板」只把界面搭好就结束了。但真正要上线的内部平台远不止侧边栏加表格：多租户隔离、认证与 RBAC、审计日志、异步消息、实时推送、可观测性、插件机制，以及一条**你真敢信的** CI 流水线。

**nodeAdmin 是框架，不是产品。** 它的设计目标是**被 fork 后扩展** —— 你带业务域进来，它提供平台层的水电煤。仓库内置一个参照实现（IM 即时通讯模块），用来证明这套平台层在 **1 万+ 并发连接**下确实端到端跑得通，而不是纸面能力。

> 曾经放在本仓库的配套模块（Agent 服务、垂直行业集成等）已迁至下游 fork。上游 `nodeAdmin` 现在只聚焦三件事：**框架开发体验、平台稳定性、可扩展性**。定位说明见 [roadmap §9](docs/delivery/roadmapPlan.md#9-phase-5m3-之后的增量能力) 与决策记录 `D-019`。

## 特性

### 🚀 开发体验

- **开箱即用的 Swagger / OpenAPI** —— 每个 controller 都有 tag、每个 DTO 都有注解，由 `SWAGGER_ENABLED` 控制，挂在 `/api/docs`
- **代码生成 CLI** —— `npm run generate:crud` 一条命令生成 controller + service + Drizzle schema + DTO + React 页面
- **前后端共享类型** —— `packages/shared-types` 让接口协议无法悄悄漂移：前端想跟后端不一致都难
- **shadcn/ui + Tailwind** 已预配置设计令牌、暗色模式，以及 20+ 个可直接组合的业务组件
- **插件市场** —— NestJS 模块与 React 页面以动态 `import()` + importmap 共享依赖的方式即插即用；安装 / 卸载 / 更新**都不需要重新部署**
- **零警告 lint** 策略、Prettier、严格 TS，以及一条与 GitHub Actions 对齐的 `npm run ci:local`

### 🛡 平台稳定性

- **6 段 CI 流水线** —— 静态检查 / 单元测试 / 依赖审计 / 构建 / 集成 / 镜像构建，带产物传递与失败日志收集
- **供应链闸门** —— `audit-ci` 拦截高危与严重级依赖告警；白名单条目**必须带过期时间**，由 CI 强制校验
- **安全优先的默认值** —— JWT 认证、RLS 支撑的多租户、结构化审计日志、密钥加密、加固过的 `.dockerignore`
- **Outbox 模式** —— 每一次会发事件的业务写入，都在**同一个事务**里落一条 outbox 记录，再由 Kafka 消费者投递。不双写、不丢消息、消费端幂等
- **Postgres RLS** —— 租户隔离由**数据库**强制，而不是只靠应用层自觉
- **OpenTelemetry** 链路追踪 + 结构化日志 + Prometheus 指标 + Grafana 看板 + Alertmanager 告警规则，全部在 `infra/` 里接好
- **经压测验证支持 1 万并发 Socket.IO 连接**（见 `docs/delivery/m2CapacityBaseline.md`）

### 🧩 可扩展性

- **`TenantContext` + `SINGLE_TENANT_MODE`** —— 一套代码、一种部署模型，同时支持单租户与多租户交付（决策 `D-015`）
- **插件市场 Phase 0–2 已完成** —— manifest 校验、动态模块注册、React.lazy 前端加载、importmap 共享依赖、安装 / 卸载 / 发布 / 自动更新 API
- **Modernizer 模块** —— analyze / docSync / controller 管线，让 API 文档与 schema 始终和代码同步
- **PgBouncer、Redis Cluster、Kafka 分区** 都在参考版 docker-compose 里实测通过 —— 不是「计划支持」

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| **运行时** | Node.js ≥ 22 | 顶层 await、原生测试运行器、性能 |
| **后端框架** | NestJS 11 + Fastify 11 | DI + 装饰器 + 最快的 Node HTTP 适配器 |
| **数据库** | PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team/) 0.45 | 类型安全 SQL、用 RLS 做租户隔离、迁移可读可审 |
| **连接池** | PgBouncer（transaction 模式） | 扛住「1 万连接」的冲击 |
| **缓存 / 发布订阅** | Redis 7 | Socket.IO 适配器、限流、会话存储 |
| **异步消息** | Kafka 3 (KRaft) + Outbox 模式 | 至少一次投递、会话内有序 |
| **实时通信** | Socket.IO 4 + Redis Adapter | 跨节点水平扩展 |
| **前端框架** | React 18 + Vite 6 | HMR 小于 100ms，全链路 ESM |
| **UI 基元** | Tailwind CSS + shadcn/ui | 组件是代码不是依赖，无运行时 CSS-in-JS |
| **服务端状态** | TanStack Query 5 | 缓存失效不再是你的事 |
| **客户端状态** | Zustand 5 | 比 Redux 少样板，比 Context 更可预测 |
| **可观测性** | OpenTelemetry + Prometheus + Grafana + Alertmanager | 链路、指标、日志、告警全部按 `traceId` 关联 |
| **CI / 质量门禁** | GitHub Actions + ESLint + Prettier + Vitest + audit-ci | 零警告 lint、供应链审计、白名单过期强制 |

## 架构

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

- **请求链路**：`Controller → DTO 校验 → Service → Repository → Drizzle → Postgres（带 RLS）`
- **事件链路**：`Service 在一个事务里写业务行 + outbox 行 → Kafka 消费者投递 → 下游消费（按 eventId 幂等）`
- **实时链路**：`Socket.IO 网关 → Redis 适配器 → 扇出到所有节点 → 客户端投递 ACK → 按序列号对账`

深入阅读：[`docs/architecture/`](docs/architecture/)、[`docs/platformSpec.md`](docs/platformSpec.md)。

## 快速开始

**环境要求**：Node.js ≥ 22、npm ≥ 10、Docker + Docker Compose。

```bash
# 1. 克隆并安装
git clone https://github.com/DistroCore/nodeAdmin.git
cd nodeAdmin
npm ci

# 2. 启动基础设施（PostgreSQL 55432、PgBouncer 6432、Redis 56379）
npm run infra:up

# 3. 配置环境变量
cp apps/coreApi/.env.example apps/coreApi/.env

# 4. 执行数据库迁移
npm run db:migrate -w coreApi

# 5. 启动开发服务（两个终端，或后台运行）
npm run dev:api    # CoreApi 后端 —— http://localhost:11451
npm run dev:web    # AdminPortal  —— http://localhost:3000
```

然后打开：

- **管理后台** → http://localhost:3000
- **API 文档（Swagger）** → http://localhost:11451/api/docs
- **健康检查** → http://localhost:11451/health

### 默认账号

| 邮箱 | 密码 | 租户 | 角色 |
| --- | --- | --- | --- |
| `admin@nodeadmin.dev` | `Admin123456` | `default` | `super-admin` |

在 http://localhost:3000/register 可以继续注册账号。

### 可选启用的组件

```bash
npm run infra:up:kafka        # + Kafka + Zookeeper（跑 outbox 事件链路用）
npm run infra:up:monitoring   # + Prometheus + Grafana + Alertmanager
npm run infra:up:tls          # + Nginx TLS 代理，监听 :3443
```

## 本地 CI

开 PR 之前，跑一遍和 GitHub Actions 相同的检查（不含重集成的那几项）：

```bash
npm run ci:local     # format:check → lint → test:coreApi + test:adminPortal → build
```

也可以逐步执行：

```bash
npm run format:check
npm run lint                  # --max-warnings=0，零容忍
npm run test:coreApi          # Vitest 后端单元测试
npm run test:adminPortal      # Vitest 前端单元测试
npm run build                 # 前后端一起构建
```

后端集成测试（需先 `npm run infra:up`）：

```bash
npm run test:coreApi:integration
npm run m2:acceptance:auto    # M2 里程碑端到端验收
```

## 文档

| 主题 | 文件 |
| --- | --- |
| 架构深入 | [`docs/architecture/`](docs/architecture/) |
| 平台规格（非功能需求） | [`docs/platformSpec.md`](docs/platformSpec.md) |
| API 接口目录 | [`docs/api-endpoints.md`](docs/api-endpoints.md) |
| 路线图与里程碑历史 | [`docs/delivery/roadmapPlan.md`](docs/delivery/roadmapPlan.md) |
| 决策记录（ADR） | [`docs/governance/decisionLog.md`](docs/governance/decisionLog.md) |
| 安全策略 | [`SECURITY.md`](SECURITY.md) |
| 贡献指南 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 运维手册 | [`docs/operations/`](docs/operations/) |
| 插件市场 | [`docs/architecture/pluginMarketplacePlan.md`](docs/architecture/pluginMarketplacePlan.md) |
| 完整文档索引 | [`docs/docIndex.md`](docs/docIndex.md) |

## 项目状态

nodeAdmin 已通过全部三个 MVP 里程碑：

| 里程碑 | 范围 | 状态 |
| --- | --- | --- |
| **M1 — 可用** | 主请求 / 事件链路打通，核心 API 稳定，Phase 1 → 2 容量门禁通过 | ✅ |
| **M2 — 可靠** | 幂等、重试、告警，1 万并发连接压测 | ✅ |
| **M3 — 可运维** | 审计、容灾演练、SLA 看板、值班手册 | ✅ |

M3 之后项目进入 **Phase 5** —— 只做框架层的增量改进。上游仓库不再新增业务垂类，见 [`docs/delivery/roadmapPlan.md §9`](docs/delivery/roadmapPlan.md#9-phase-5m3-之后的增量能力)。

## 已知技术债

我们选择把这份清单保持得又短又诚实，而不是藏起来。完整细节与跟踪编号见 [`roadmapPlan.md §9.3`](docs/delivery/roadmapPlan.md#93-tech-debt按紧迫度排序)。

- **TD-1** —— `@nestjs/swagger@11.2.6` 精确锁定了 `lodash@4.17.23` 与 `path-to-regexp@8.3.0`，导致必须在 `audit-ci` 白名单里留一条记录，该记录**2026-07-07 过期**
- **TD-2** —— `react-intl@10.1.1` 与 `@types/react@18.3.28` 存在 peer 冲突，只有 `npm ci` 能装出干净依赖；`npm install` 无法干净地重建 lockfile
- **TD-3** —— Playwright E2E 因不稳定已从 CI 移除（提交 `c33a0fc`），根因仍在排查，之后才能重新纳入

新贡献者注意：以上任何一条都是很好的第一个 PR 目标。动手前请先开 issue 协调一下。

## 贡献

我们欢迎 issue、PR、文档改进和社区插件。从这里开始：[`CONTRIBUTING.md`](CONTRIBUTING.md)。

因为 nodeAdmin 的设计目标就是被 fork，大部分下游工作发生在你自己的 fork 里。只有**框架层**的改进（开发体验、稳定性、可扩展性、安全）才需要回流上游 —— 业务功能属于 fork。

## 社区与支持

- **缺陷 / 功能请求** —— 用 [issue 追踪器](https://github.com/DistroCore/nodeAdmin/issues)，请选择合适的模板
- **安全漏洞** —— **不要**开公开 issue；私有披露流程见 [`SECURITY.md`](SECURITY.md)
- **讨论** —— 设计问题与作品分享请用 GitHub Discussions（若尚未开启，在仓库 Settings → Features 中打开）

## 许可

nodeAdmin 基于 [MIT License](LICENSE) 发布。你可以在遵守许可条件的前提下自由使用、复制、修改、合并、发布、分发、再授权与销售本软件。贡献同样按此条款接受。

---

<div align="center">
为那些拒绝在每个项目上重新发明平台层的团队而做。
</div>
