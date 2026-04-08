# 决策日志

## 记录规则

- 每条决策包含：编号、日期、决策内容、原因、影响范围、责任人。
- 发生重大调整时，必须追加新条目，不覆盖历史条目。

## 决策清单

### D-001

- 日期：2026-02-28
- 决策：前端技术栈固定为 `React + TypeScript + Tailwind CSS + shadcn/ui`。
- 原因：统一设计系统与组件复用路径，减少样式分叉。
- 影响范围：`apps/adminPortal` 及后续所有前端应用。
- 责任人：前端负责人。

### D-002

- 日期：2026-02-28
- 决策：目录命名使用 `UpperCamelCase`，业务文件命名使用 `lowerCamelCase`。
- 原因：提高跨团队一致性，降低维护成本。
- 影响范围：整个仓库新增目录与业务代码文件。
- 责任人：技术负责人。

### D-003

- 日期：2026-02-28
- 决策：IM 实时层采用 `Socket.IO + Redis Adapter`。
- 原因：开发效率高、生态成熟，适合企业场景快速交付。
- 影响范围：网关服务、在线态服务、消息投递服务。
- 责任人：IM 负责人。

### D-004

- 日期：2026-02-28
- 决策：异步总线默认采用 `Kafka`。
- 原因：吞吐与分区能力更适合中台事件规模增长。
- 影响范围：消息 outbox、异步任务、通知分发。
- 责任人：后端负责人。

### D-005

- 日期：2026-02-28
- 决策：租户隔离采用“共享库 + RLS”。
- 原因：在成本与隔离性之间平衡，便于初期快速落地。
- 影响范围：数据库模型、查询策略、权限中间件。
- 责任人：架构负责人。

### D-006

- 日期：2026-02-28
- 决策：消息留存默认 1 年，支持 legal hold。
- 原因：满足多数企业合规与审计需求。
- 影响范围：消息存储、归档策略、审计系统。
- 责任人：安全与合规负责人。

### D-007

- 日期：2026-03-01
- 决策：采用模块化单体策略，M2 前不做物理微服务拆分。
- 原因：团队规模与代码量不支持 8 个微服务的分布式运维开销；NestJS Module 边界已满足逻辑隔离需求。
- 影响范围：`apps/coreApi` 架构演进节奏，Phase 3 之前不新增独立进程。
- 责任人：架构负责人。

### D-008

- 日期：2026-03-01
- 决策：ORM 选用 Drizzle，不采用 TypeORM 或 Prisma。
- 原因：类型安全、SQL-first、性能优异、社区活跃；TypeORM 处于维护模式，Prisma 生成层过重。
- 影响范围：`apps/coreApi/Infrastructure/Database/` 及所有数据库查询层。
- 责任人：后端负责人。

### D-009

- 日期：2026-03-01
- 决策：前端状态管理采用 Zustand（客户端状态）+ TanStack Query（服务端状态）组合方案。
- 原因：两者互补且轻量，Zustand 无 Provider 负担，TanStack Query 自动处理缓存/重试/失效。
- 影响范围：`apps/adminPortal/src/stores/` 及所有数据获取逻辑。
- 责任人：前端负责人。

### D-010

- 日期：2026-03-01
- 决策：MVP 阶段不引入外部 API 网关（如 APISIX），使用 NestJS 内建 Guard/Interceptor/Middleware。
- 原因：服务数量未达到需要统一网关的阈值，引入外部网关增加运维复杂度而收益有限。
- 影响范围：认证、限流、路由策略均在 CoreApi 内实现；待服务拆分到 3+ 个时重新评估。
- 责任人：架构负责人。

### D-011

- 日期：2026-03-01
- 决策：结构化日志框架选用 Pino。
- 原因：Fastify 原生支持 Pino，JSON 结构化输出性能最优，与 OpenTelemetry traceId 关联成本低。
- 影响范围：`apps/coreApi` 所有日志输出，禁止使用 `console.log`。
- 责任人：后端负责人。

### D-012

- 日期：2026-04-03
- 决策：Playwright E2E 暂时退出 CI pipeline，只保留本地运行入口 (`npm run test:e2e:web`)。
- 原因：E2E 在 CI 环境下持续 flaky（本地能过 CI 挂），`a1fe31a`、`d37d846` 两次 harden 尝试均未解决根因。继续带着不稳定的 gate 会吞噬注意力并降低整体 CI 信号质量；选择退出而非静默 skip 以保持诚实。
- 影响范围：`.github/workflows/ci.yml`（删除 e2e job）；重新加回 CI 前必须先定位 flake 根因。
- 责任人：平台与 QA 负责人。
- 溯源：`c33a0fc`

### D-013

- 日期：2026-04-06
- 决策：插件市场后端动态加载采用「启动前扫描 + DynamicModule 注册」，不使用 `LazyModuleLoader`。
- 原因：NestJS `LazyModuleLoader` 无法在 bootstrap 之后注册 Controller/Route，Fastify 路由表在 `listen()` 时冻结；启动前扫描 `node_modules/@nodeadmin/plugin-*` 并通过 `DynamicModule.forRootAsync()` 注入是唯一稳定路径。
- 影响范围：`apps/coreApi/src/modules/plugin/`、`AppModule` 启动流程、插件 manifest 规范。
- 责任人：后端负责人 + 架构负责人。
- 溯源：`docs/architecture/pluginMarketplacePlan.md`，实现 `e11a5d9`

### D-014

- 日期：2026-04-06
- 决策：插件市场前端动态加载采用「Dynamic `import()` + `React.lazy()` + importmap 共享依赖」，不使用 Vite Module Federation。
- 原因：`@module-federation/vite` 仍在 0.x beta，HMR 兼容性差；Dynamic `import()` 是浏览器原生能力，可控性和稳定性更高；共享依赖通过 importmap 强制单实例，避免 React 多实例运行时崩溃。
- 影响范围：`apps/adminPortal` 插件加载 hook、构建期 externals 配置、importmap 生成。
- 责任人：前端负责人。
- 溯源：`docs/architecture/pluginMarketplacePlan.md`，实现 `e11a5d9`

### D-015

- 日期：2026-04-06
- 决策：引入 `TenantContext` 抽象并提供 `SINGLE_TENANT_MODE` 运行期开关，作为多租户/单租户部署的统一入口。
- 原因：历史代码中 `tenantId` 在 service/repo 层直接读取，单租户部署场景需要硬编码常量绕过租户校验；抽象出 `TenantContext` 后可以在同一份代码基上通过配置切换模式，且为后续按租户动态注入策略（限流、加密密钥、配额）留出扩展点。
- 影响范围：`apps/coreApi/src/infrastructure/tenant/`、所有需要 `tenantId` 的 service/repo、`env` 配置项 `SINGLE_TENANT_MODE`。
- 责任人：架构负责人。
- 溯源：`d132602`

### D-016

- 日期：2026-04-08
- 决策：CI 依赖安全审计采用 `audit-ci` + allowlist 模式，替代裸 `npm audit --audit-level=high`。
- 原因：裸 `npm audit` 无法对"已知但暂时无法修复的 transitive 漏洞"做结构化豁免；审计门槛要么全挂要么全放，缺乏可审计性。`audit-ci` 支持 allowlist + per-advisory 注释 + `skip-dev`，可以在保持 high/critical 严格门槛的同时显式声明风险接受。另一个现实约束：尝试 `npm overrides` 强制升级 `@nestjs/swagger@11.2.6` 的 exact-pin transitive (`lodash@4.17.23`, `path-to-regexp@8.3.0`) 未能成功（4 种 overrides 语法均被 npm 11.11.0 忽略），且 `npm audit fix --force` 会把 swagger 破坏性降级到 2.5.1，无可接受的自动修复路径。
- 影响范围：`.github/workflows/ci.yml` audit job、根 `audit-ci.jsonc`、开发依赖新增 `audit-ci`。
- 责任人：平台与安全负责人。
- 溯源：`ad33af1`

### D-017

- 日期：2026-04-08
- 决策：CI 新增 `docker-build` job，使用 `docker/build-push-action@v6` + GHA 缓存构建 `coreApi` 和 `adminPortal` 镜像，`push: false` 仅校验不推送。
- 原因：此前 CI 链路完全没有实际运行过 Dockerfile，导致 `.dockerignore` 与 Dockerfile 的不一致长期潜伏（`61b1cab` 修复的 `vite-importmap-plugin.ts` 即为一例）。镜像构建 gate 是 CD 的起点，即便暂无 registry 也应先建立校验能力。
- 影响范围：`.github/workflows/ci.yml`、`.dockerignore` 维护策略。
- 责任人：平台负责人。
- 溯源：`b463d59`，后续 `61b1cab` 修复首次 gate 抓到的损坏。

### D-018

- 日期：2026-04-08
- 决策：`audit-ci.jsonc` allowlist 条目必须携带 `Expiry: YYYY-MM-DD` 注释，CI 在 audit 步骤前自动检查过期。初始 expiry 窗口 90 天。
- 原因：allowlist 如果没有强制复核机制，会在几个月后退化成"永久豁免"，丧失安全意义。通过把过期检查写进 CI（`scripts/checkAuditAllowlistExpiry.cjs`），过期条目会直接把 audit job 拦红，强制人介入决定「上游已修 → 删除」、「仍然接受 → 延期并更新理由」、「可以升级 → 做 fix」三者之一。
- 影响范围：`audit-ci.jsonc` 注释格式、新增 `scripts/checkAuditAllowlistExpiry.cjs`、`ci.yml` audit job 新增 step。
- 责任人：平台与安全负责人。

### D-019

- 日期：2026-04-08
- 决策：nodeAdmin 明确定位为**企业级中后台快速开发框架**，具体业务能力（如 Agent / 闲鱼客服 / 量化日报 等）属于**下游 fork 的产品**，不在 nodeAdmin 本体路线图内。
- 原因：项目到 M3 之后方向一度模糊——从 Plan 文档看有 agentMicroservicePlan 在推进，给人"nodeAdmin 要做 Agent 业务"的错觉。实际意图是 nodeAdmin 作为基础框架，fork 出去承载具体业务。明确这个边界后，框架的优先级非常清晰：DX（API 文档、插件机制、代码生成、类型导出）、稳定性（CI、审计、依赖安全）、可扩展性（插件市场）高于任何纵向业务功能。
- 影响范围：
  - `docs/architecture/agentMicroservicePlan.md` 和 `agentMicroserviceReview.md` 已加 Scope 标注，说明这两份文档是下游 fork 架构的历史参考，不是 nodeAdmin 的开放工作。
  - `docs/delivery/roadmapPlan.md` 第 9.2 节原本把 Agent 列为"需战略决策"，移除。
  - `docs/delivery/mvpTeamTodo.md` 的 "Strategic Decisions Pending" 段落移除。
  - 未来讨论或规划时，默认假设：任何 vertical business domain（IM 业务具体玩法除外——IM 是框架内置的示范模块）应当放到下游 fork 的 repo，不进 nodeAdmin 主线。
- 责任人：项目负责人 / 架构负责人。

## 最近更新时间

- 2026-04-08（新增 D-019 明确框架定位；同日补录 D-012 ~ D-018，对齐插件市场 / CI 加固 / TenantContext 实际落地）
- 2026-03-01（补录 D-007 ~ D-011，对齐 brainstormingResults.md 决策建议）
- 2026-02-28
