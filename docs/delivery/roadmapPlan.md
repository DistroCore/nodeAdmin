# 实施路线图（默认方案）

## 1. 默认前提

- IM 场景：内部协作。
- 目标规模：1 万同时在线。
- 消息中间件：`Kafka`。
- 租户模型：共享库 + `RLS`。
- 消息留存：1 年。
- 客户端范围：Web 优先。

---

## 2. 0-30 天（基线交付）- 详细检查点

### 2.1 工程脚手架

- [x] Monorepo 结构验证（`apps/`、`packages/`）
- [x] coreApi NestJS 项目完整配置
- [x] adminPortal React + shadcn/ui 项目创建
- [x] shared-types 共享类型包创建
- [x] ESLint + Prettier 命名规范规则（目录 lowercase、文件 lowerCamelCase）
- [x] Git hook + PR 检查配置

### 2.2 基础设施增补

| 检查项                          | 原因                                                     | 优先级 |
| ------------------------------- | -------------------------------------------------------- | ------ |
| [x] PostgreSQL 连接池上限配置   | 默认 10 连接，1万在线时瞬间打满                          | 🔴 P0  |
| [x] Redis Cluster 模式预研      | 单机 Redis 在 Phase 2 横向扩展时会成为瓶颈               | 🟡 P1  |
| [x] Kafka Topic 分区数 ≥ 3      | 为后续水平扩展预留，避免重新分区                         | 🔴 P0  |
| [x] 数据库索引基线              | `conversation_id + created_at`, `user_id + last_read_at` | 🔴 P0  |
| [x] Docker Compose 环境完整配置 | PostgreSQL + pgbouncer + Redis + Kafka + Zookeeper       | 🔴 P0  |

### 2.3 认证与租户

- [x] `identityAuthService` - 登录/注册/令牌/Refresh Token
- [x] `tenantRbacService` - 租户/角色/权限
- [x] RLS (Row Level Security) 策略配置
- [x] JWT Guard + Tenant Context 注入
- [x] 审计日志基础（登录、权限变更）

### 2.4 IM 核心链路增补

```typescript
// 必须验证的边界场景
- [x] 消息顺序号（Sequence ID）在分布式下的单调递增
- [x] Socket.IO 节点重启时的会话迁移（Redis 适配器预置）
- [x] 消息去重键（client_message_id）唯一索引
- [x] 大消息体截断（>1MB 拒绝或分片）
- [x] 消息体大小校验中间件（防大文件攻击）
```

**服务模块**：

- [x] `imConversationService` - 会话管理（单人/群组）
- [x] `imMessageService` - 消息写入、顺序号、Outbox
- [x] `imDeliveryService` - Socket.IO 投递、ACK 机制
- [x] `imPresenceService` - 在线状态、心跳、设备状态
- [x] Outbox 模式 + Kafka 异步分发
- [x] Socket.IO 配置：`perMessageDeflate: false`（1万在线时压缩 CPU 开销巨大）

### 2.5 前端基线增补

- [x] Tailwind 设计令牌配置
- [x] shadcn/ui 基础组件（`Src/Components/Ui/`）
- [x] 登录/注册页面
- [x] 会话列表组件（虚拟滚动：react-window，>50 条时启用）
- [x] 聊天窗口组件（`Src/Components/Business/`）
- [x] 输入防抖：消息输入框 300ms 防抖
- [x] 重连 UI 状态：断线时显示"连接中..."
- [x] Socket.IO 客户端集成

### 2.6 可观测基线

- [x] OpenTelemetry trace + log 集成
- [x] 结构化日志（traceId 强制关联）
- [x] 基础指标采集（延迟、错误率、队列积压、重试次数）
- [x] IM 指标增补（连接数、在线人数、消息吞吐、投递时延）
- [x] 健康检查端点
- [x] 错误告警规则

---

## 3. Phase 1 → Phase 2 关键门槛

在进入 Phase 2 前，必须确认以下数据：

| 指标                      | 目标值        | 验证方式     |
| ------------------------- | ------------- | ------------ |
| 单节点 Socket.IO 承载上限 | 5000 并发连接 | 压测         |
| 消息端到端延迟 P99        | < 200ms       | 同机房测试   |
| 消息丢失率                | 0             | ACK 机制验证 |
| 数据库 CPU 峰值           | < 50%         | 监控         |

---

## 4. 容量预判（1万在线目标）

| 组件       | Phase 1 配置  | Phase 2 扩展            |
| ---------- | ------------- | ----------------------- |
| Socket.IO  | 单节点 4C8G   | 3 节点 + Redis Adapter  |
| PostgreSQL | 4C8G 主从     | 读写分离 / 分库分表评估 |
| Redis      | 2G 主从       | Cluster 6 节点          |
| Kafka      | 3 节点 × 2C4G | 分区扩展到 6-12         |

---

## 5. 31-60 天（可靠性增强）

- [x] 接入 `Redis Adapter` 横向扩展。
- [x] 完成 outbox + Kafka 异步分发。
- [x] 增加 ACK、重试、死信队列处理。
- [x] 增加离线消息补拉与断线重连策略。
- [x] 执行专项压测并输出容量基线。
- [x] 幂等性测试覆盖。
- [x] Socket.IO 多节点负载均衡验证。

---

## 6. 61-90 天（企业能力完善）

- [x] 完成群聊、回执、会话搜索能力。
- [x] 加入审计能力与权限变更追踪。
- [x] 完成安全加固（限流、风控、越权测试）。
- [x] 完成容灾演练与发布回滚预案。
- [x] 发布 SLA 指标看板与运维值守手册。

---

## 7. 里程碑验收标准

| 里程碑        | 标准                                                          | 状态    |
| ------------- | ------------------------------------------------------------- | ------- |
| **M1 可用**   | 主链路打通，核心 API 稳定，Phase 1 → Phase 2 门槛指标全部通过 | ✅ 通过 |
| **M2 可靠**   | 幂等、重试、告警、压测通过                                    | ✅ 通过 |
| **M3 可运营** | 审计、容灾、SLA、值守机制到位                                 | ✅ 通过 |

---

## 8. 本周可执行的 3 个动作（已完成）

1. **[x]** Docker Compose 中加入 `pgbouncer`，提前验证连接池行为
2. **[x]** Socket.IO 启用 `perMessageDeflate: false`（1万在线时压缩 CPU 开销巨大）
3. **[x]** 在 `imMessageService` 中加入消息体大小校验（防大文件攻击）

---

## 9. Phase 5（M3 之后的增量能力）

M1/M2/M3 的 MVP 目标已全部通过。以下是自 2026-03-01 以来的增量工作与后续规划。

### 9.1 已完成（M3 → 现在）

> nodeAdmin 被定位为**企业级中后台快速开发框架**，所以 M3 之后的增量工作都围绕框架
> DX（API 文档、插件机制、CI 稳定性）而非单一业务功能展开。

- [x] **Swagger API 文档集成**（`dff4c45`，2026-03-29）— `SwaggerModule.setup('api/docs', ...)` 在 `apps/coreApi/src/app/createApp.ts:135`，由 `SWAGGER_ENABLED` 环境变量开关；所有 controller 已打 `@ApiTags` + `@ApiOperation`，DTO 已打 `@ApiProperty`。对应 spec: `docs/superpowers/specs/2026-03-29-swagger-modernizer-design.md` Part 1。
- [x] **审计日志系统**（`5aa6e1c` PR #21）— JWT HTTP guard、全局审计拦截器、Drizzle 查询层、前端 Timeline 组件与 AuditLogPanel。对应 spec: `docs/superpowers/specs/2026-03-29-audit-log-system-design.md`。
- [x] **Modernizer 模块**（`dff4c45` Part 2 同批）— analyze / docSync / controller 链路，配合 M3 后的文档治理能力。
- [x] **插件市场 Phase 0 + 1 + 2**（`e11a5d9`）— 租户级功能开关、manifest 校验、动态 NestJS Module 注册、前端 dynamic import + React.lazy、importmap 共享依赖、市场 UI / 安装卸载 / 发布 / 自动更新端点齐全。对应计划: `docs/architecture/pluginMarketplacePlan.md`，决策: D-013、D-014。
- [x] **TenantContext 抽象 + `SINGLE_TENANT_MODE`**（`d132602`）— 单/多租户部署统一入口，决策: D-015。
- [x] **CI/CD 加固**（`b463d59` → `4a21e1e` 共 8 提交，2026-04-08）— 6 job 工作流（static / unit-test 含前端 vitest / audit / build / test-integration / docker-build）、artifact 共享、failure 时 docker logs 收集、`wait-for-infra` 静默失败修复、audit-ci + allowlist 模式、allowlist 过期自动检查、`.dockerignore` pattern-based 白名单加固、drizzle-orm SQL 注入补丁（`f2ee0d8`）。决策: D-016、D-017、D-018。

### 9.2 Mock/Stub 全量审计（2026-04-11）

以下为代码库中发现的 mock 数据、硬编码值和 stub 实现，按优先级分类。

#### 🔴 P0 — 生产不可用的假实现

| 编号 | 位置                         | 问题                                                                      | 影响                  |
| ---- | ---------------------------- | ------------------------------------------------------------------------- | --------------------- |
| TD-6 | ~~`authService.ts`~~ ✅ 闭环 | GitHub OAuth 已接入真实 token exchange + user info API                    | GitHub OAuth 登录可用 |
| TD-7 | `authService.ts:370`         | SMS 验证码用 `Math.random()` 生成，且短信未接入真实供应商 (Twilio/阿里云) | 短信验证码登录不可用  |
| TD-8 | ~~`authService.ts`~~ ✅ 闭环 | 已移除明文 SMS 验证码日志                                                 | —                     |

#### 🟡 P1 — 硬编码回退值

| 编号  | 位置                                                                                             | 问题                                                                       |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| TD-9  | 5 个 Controller (`menus`, `users`, `roles`, `task`, `sprint`)                                    | `tenantId ?? 'default'` 硬编码租户回退，应强制从 TenantContext 获取        |
| TD-10 | `menusService.ts:71`                                                                             | 菜单 ID 用 `Math.random().toString(36)` 生成，应改用 `crypto.randomUUID()` |
| TD-11 | `auditLogService.ts:17-48`                                                                       | DB 不可用时用内存数组 (限 200 条)，非持久化                                |
| TD-12 | 前端 5 个文件 (`loginPage`, `registerPage`, `resetPasswordPage`, `useApiClient`, `messagePanel`) | API URL 硬编码 `http://${hostname}:11451` 回退                             |
| TD-13 | 前端 3 个页面                                                                                    | `useState('default')` 硬编码 tenantId 初始值                               |
| TD-14 | 前端 4 处 (`appLayout`, `moduleErrorBoundary`, `usePluginLoader`, `main`)                        | 使用 `console.error` 而非结构化日志                                        |
| TD-15 | ~~`runtimeConfig.ts`~~ ✅ 闭环                                                                   | `defaultTenantId` 改引用 `DEFAULT_TENANT_ID` 常量                          |

#### 🟢 P2 — 配置优化

| 编号  | 位置                    | 问题                                                        |
| ----- | ----------------------- | ----------------------------------------------------------- |
| TD-16 | ~~前端 5 处~~ ✅ 闭环   | 集中 `pollingIntervals.ts`，支持 `VITE_POLL_*` 环境变量覆盖 |
| TD-17 | `notificationPanel.tsx` | 使用 emoji 图标 (🔐👤🏢⚙️🔔) 而非 SVG design system 图标    |
| TD-18 | `messagePanel.tsx`      | `/api/v1/auth/dev-token` 作为开发回退，生产环境需确保禁用   |

### 9.3 规划中（未启动）

当前没有规划但未启动的**框架级**大型工作项。下游 fork 的业务能力（Agent / 闲鱼客服 /
量化日报等）不在 nodeAdmin 框架本体的路线图内，应由各 fork 自行维护，见
`docs/architecture/agentMicroservicePlan.md` 顶部的 Scope 说明。

### 9.3 Tech Debt（按紧迫度排序）

| 编号  | 内容                                                                                                                                                                                                                                                                                                                                      | 紧迫度                    | 触发来源                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------- |
| TD-1  | 升级或替换 `@nestjs/swagger@11.2.6`，使其不再 exact-pin `lodash@4.17.23` 和 `path-to-regexp@8.3.0`；成功后移除 `audit-ci.jsonc` 对应 allowlist 条目。**2026-04-08 D-020：T-P5-BE-01 验证 (a)(b) 均不可行；(c) 迁移代价过高且实际可利用性近零；接受风险，allowlist 延期到 2027-01-07，2026-10-08 复核**                                    | 中（已 accepted）         | D-020 → 2026-10-08            |
| TD-2  | 解决 `react-intl@10.1.0` 与 React 18 的 peer 依赖冲突，恢复 `npm install` 可重建 lockfile 的能力。**2026-04-08 D-021：执行第 (d) 条路径完成，降级到 `react-intl@7.1.14`（peer `react: 16 \|\| 17 \|\| 18 \|\| 19`），PR #48 已合 master。`npm install` 现在可干净重建 lockfile。D-021 addendum 记录了 react-intl 7.x API surface 的限制** | 已闭环（含 addendum）     | D-021                         |
| TD-3  | 定位并修复 Playwright E2E 的 CI 环境 flake 根因；修复后可以把 E2E job 加回 `.github/workflows/ci.yml`。**2026-04-10 闭环：消除所有 waitForTimeout / networkidle，用条件等待替代；login 后加 navigateAfterLogin 防 race；CI 用 vite preview 替代 dev server；E2E job 重新接入 CI（`13a97e7`）**                                            | 已闭环                    | D-012 / `c33a0fc` → `13a97e7` |
| TD-4  | （已处理）`.dockerignore` 对 `apps/adminPortal/` 改为扩展名 pattern 允许列表，避免新增 top-level 配置/插件文件被静默过滤                                                                                                                                                                                                                  | —                         | 2026-04-08 闭环               |
| TD-5  | （已处理）`audit-ci.jsonc` allowlist 条目 90 天强制复核 + CI 自动过期检查                                                                                                                                                                                                                                                                 | —                         | 2026-04-08 闭环               |
| TD-6  | ~~OAuth `exchangeOAuthCode()` 为 mock 实现~~ **2026-04-12 闭环：GitHub OAuth 接入真实 token exchange + user info API，GET callback 路由重定向至前端，前端 OAuth 按钮改为 GitHub authorize URL 跳转 + state 参数传递 tenantId，新增 `/auth/callback` 前端页面**                                                                            | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-7  | SMS 验证码用 `Math.random()` 生成，短信未接入真实供应商 — 短信登录不可用                                                                                                                                                                                                                                                                  | 🔴 高（需真实供应商接入） | §9.2 审计                     |
| TD-8  | ~~`authService.ts` 日志打印明文 SMS 验证码 — 安全隐患~~ **2026-04-12 闭环：移除日志中的验证码明文**                                                                                                                                                                                                                                       | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-9  | ~~5 个 Controller 硬编码 `tenantId ?? 'default'` 回退~~ **2026-04-12 闭环：提取 `DEFAULT_TENANT_ID` 常量到 `app/constants.ts`，5 个 Controller 统一引用**                                                                                                                                                                                 | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-10 | ~~`menusService.ts` 菜单 ID 用 `Math.random()` 生成~~ **2026-04-12 闭环：改用 `node:crypto.randomUUID()`**                                                                                                                                                                                                                                | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-11 | ~~`auditLogService.ts` DB 不可用时用内存数组 (限 200 条)~~ **2026-04-12 闭环：添加持久化警告日志**                                                                                                                                                                                                                                        | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-12 | ~~前端 5 文件硬编码 API URL `http://${hostname}:11451` 回退~~ **2026-04-12 闭环：移除硬编码 fallback，使用相对路径（Vite proxy）**                                                                                                                                                                                                        | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-13 | ~~前端 3 页面 `useState('default')` 硬编码 tenantId~~ **2026-04-12 闭环：改为空字符串初始值 + 提交验证**                                                                                                                                                                                                                                  | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-14 | ~~前端 4 处使用 `console.error` 而非结构化日志~~ **2026-04-12 闭环：创建 `lib/logger.ts` 结构化日志工具，替换 4 处调用**                                                                                                                                                                                                                  | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-15 | ~~`runtimeConfig.ts` 6 处硬编码默认值~~ **2026-04-12 闭环：`defaultTenantId` 改为引用 `DEFAULT_TENANT_ID` 常量（其余 5 项为 NestJS config 标准默认值，保留原样）**                                                                                                                                                                        | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-16 | ~~前端 5 处硬编码 polling interval~~ **2026-04-12 闭环：创建 `lib/pollingIntervals.ts` 集中配置，支持 `VITE_POLL_*` 环境变量覆盖，4 处（header/messagePanel/notificationPanel/systemMetricsPanel）统一引用**                                                                                                                              | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-17 | ~~`notificationPanel.tsx` 使用 emoji 图标而非 SVG design system~~ **2026-04-12 闭环：替换为 inline stroke SVG**                                                                                                                                                                                                                           | 已闭环                    | §9.2 审计 → 2026-04-12        |
| TD-18 | ~~`messagePanel.tsx` dev-token 端点回退，生产需确保禁用~~ **2026-04-12 闭环：添加 `import.meta.env.MODE === 'production'` guard**                                                                                                                                                                                                         | 已闭环                    | §9.2 审计 → 2026-04-12        |

---

## 10. 最近更新时间

- 2026-04-12（**GitHub OAuth 实装**：TD-6 闭环。后端：`authService.ts` 新增 `exchangeGitHubCode()` 真实 token exchange + user/email API 调用，`authController.ts` 新增 `GET /auth/github/callback` 浏览器重定向回调（state 参数传递 tenantId），`runtimeConfig.ts` 新增 `githubOAuth` 配置段，`jwtAuthGuard.ts` 排除 OAuth 路由。前端：`loginPage.tsx` GitHub 按钮改为 `github.com/login/oauth/authorize` 跳转 + state 编码，新增 `oauthCallbackPage.tsx` 处理回调 + 存储 token。E2E 97/97 通过）
- 2026-04-12（**Tech Debt 清理**：TD-8 ~ TD-16、TD-17、TD-18 共 12 项闭环。后端：DEFAULT*TENANT_ID 常量提取（5 Controller + runtimeConfig）、crypto.randomUUID 替换 Math.random、SMS 明文日志脱敏、audit 内存 fallback 加警告。前端：移除硬编码 API URL、tenantId 初始值改为空串+提交验证、console.error→结构化 logger、emoji→inline SVG、dev-token 生产环境 guard、polling interval 集中配置（`lib/pollingIntervals.ts`，4 处统一引用，支持 `VITE_POLL*\*` 环境变量覆盖）。E2E 97/97 通过。剩余 TD-7（需真实 SMS 供应商接入））
- 2026-04-11（**Mock/Stub 全量审计**：§9.2 新增 TD-6 ~ TD-18 共 13 项假数据/硬编码技术债务；根目录清理：9 PNG 截图移入 `docs/assets/screenshots/`，3 个临时任务文件删除，`start-backend.sh` 移入 `scripts/`；Dialog 焦点跳转 bug 修复；IM 会话创建 bug 审计完成：upload 403、标题不更新、图片粘贴位置、侧边栏 i18n、IM 路由缺失）
- 2026-04-08（**P5 框架加固阶段全部收尾**：单一工作窗口内 BE/FE 各 5 个工作项落地为 7 个 PR 全部合入 master：BE-01 swagger 调研 → D-020 defer、BE-02 后端覆盖率基线 + audit/im 关键链路补强、BE-03 OpenAPI snapshot drift guard、BE-04 plugin lifecycle hooks 含真实 PG 集成测试、FE-01 react-intl 降级解 D-021、FE-02 hooks/stores 6 文件覆盖率、FE-03 plugin marketplace UI polish + a11y、FE-04 design token 一致性扫盲。governance commit 11546bb 含 D-020/D-021；后续 7 笔 squash merge 提交 67fba6f → e10cbb4。TD-1 / TD-2 状态全部更新；新增 D-021 addendum 关于 react-intl 7.x API surface 限制；新增 Phase 5 章节，同步 2026-03-01 以来的增量工作、未启动规划与 tech debt）
- 2026-03-01（全量完成标记同步，Docker 全栈部署验证，全量测试通过）
- 2026-02-28（基础设施增补、容量预判、关键门槛指标）
