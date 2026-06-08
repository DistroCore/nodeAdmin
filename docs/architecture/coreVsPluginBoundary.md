# 内核 vs 插件：模块归属裁定（Core / Plugin Boundary）

> 决策文档 · 2026-06-05 · 状态：待评审（Proposed）
> 关联：[platformSpec.md](../platformSpec.md)、[architectureBaseline.md](./architectureBaseline.md)、[pluginMarketplacePlan.md](./pluginMarketplacePlan.md)

## 1. 背景与问题

本项目自我定位是「**框架而非产品**」——一套多租户中台底座（认证/RBAC、审计、Outbox 异步消息、可观测性），并以 **IM 模块**作为端到端的参照实现。

但实际落地已偏离这一定位。证据：

- **奠基规范设想的业务域只有两个**。[platformSpec.md](../platformSpec.md) §3 的目录树里，`coreApi/src/modules/` 下只列了 `identity` 与 `im`；[architectureBaseline.md](./architectureBaseline.md) §3 的「服务边界（第一期）」也只锁定 identity / tenant-RBAC / IM / notification。主线是自洽的。
- **实际落地了 12 个后端模块、13 个前端导航项**。多出来的部分正是「繁杂感」的来源。

### 1.1 核心病灶：边界没有被执行

最能说明问题的一处在 [navConfig.ts](../../apps/adminPortal/src/app/layout/navConfig.ts)——`tenant`、`modernizer`、`backlog` 三项都标了 `pluginCode`：

```ts
{ key: 'tenant',     path: '/tenants',    pluginCode: 'tenant-management' },
{ key: 'modernizer', path: '/modernizer', pluginCode: 'modernizer' },
{ key: 'backlog',    path: '/backlog',    pluginCode: 'backlog' },
```

也就是说**设计上它们被当作插件来 gate，实现上却全部住在核心 `apps/coreApi/src/modules/` 里并被编进 `appModule`**。结果两头不靠：

- 既增加了核心代码量、测试量、CI 时长（backlog + modernizer ≈ 1300 行源码 + ~1300 行测试）；
- 又没真正享受到插件系统「按租户启用 / 沙箱隔离 / 独立迭代」的好处。

而项目**已经建好了一套能力完整的插件系统**（`plugin` 模块 2025 行源码 + 沙箱 + 清单 + 自动更新 + 市场 UI，M3 已完成），下沉这些功能的基础设施已就绪——缺的只是真实负载。

> 结论先行：繁杂**不是因为功能多，而是因为 core / plugin 边界没被执行**。框架该薄，产品功能该外挂。

## 2. 裁定原则

一个模块**留在 core** 必须满足下列之一：

1. **底座能力**——多租户隔离、认证授权、审计、异步消息、可观测性，是所有上层功能的公共依赖；
2. **RBAC 整体**——auth / tenants / users / roles / permissions / menus 互相耦合，不可单独拆出；
3. **参照实现**——IM，唯一被规范认可的「证明底座可用」的样例；
4. **插件运行时本身**——注册 / 沙箱 / 守卫机制。

凡是**独立业务域**或**开发期工具**，一律下沉为插件或退化为 CI 脚本。

## 3. 逐模块裁定

### 3.1 后端模块（`apps/coreApi/src/modules/`，共 12 个）

| 模块          | 源码行 | 测试行 | 裁定                                      | 依据                                                                   |
| ------------- | ------ | ------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| `auth`        | 1199   | 1769   | **留 core**                               | 底座能力（认证/令牌/OAuth）                                            |
| `tenants`     | 249    | 359    | **留 core**                               | RBAC 整体 + 多租户基石                                                 |
| `users`       | 344    | 406    | **留 core**                               | RBAC 整体                                                              |
| `roles`       | 329    | 416    | **留 core**                               | RBAC 整体                                                              |
| `permissions` | 94     | 232    | **留 core**                               | RBAC 整体                                                              |
| `menus`       | 484    | 730    | **留 core**                               | RBAC 整体（权限驱动导航）                                              |
| `im`          | 1845   | 1631   | **留 core**                               | 唯一认可的参照实现                                                     |
| `health`      | 179    | 395    | **留 core**                               | 平台自身可观测                                                         |
| `console`     | 471    | 357    | **留 core**（建议改名 `platformMetrics`） | 平台自身指标看板                                                       |
| `plugin`      | 2025   | 2047   | **留 core 运行时，砍市场 UI/auto-update** | 见 §3.3                                                                |
| `backlog`     | 746    | 908    | **⬇ 下沉为插件**                          | 独立 Sprint/Task 产品，与「中台+IM」无关；已标 `pluginCode: 'backlog'` |
| `modernizer`  | 545    | 387    | **⬇ 退化为 CI 脚本 / 开发期插件**         | 开发团队自用工具，不该跑在多租户运行时；与 `scripts/` 的 check 同类    |

### 3.2 前端独立面板（无对应后端业务模块）

| 导航项          | 裁定                                                        | 依据                     |
| --------------- | ----------------------------------------------------------- | ------------------------ |
| `overview`      | 留 core                                                     | 平台首页                 |
| `audit`         | 留 core                                                     | 底座审计能力的 UI        |
| `metrics`       | 留 core                                                     | 同 `console`，平台可观测 |
| `settings`      | 留 core                                                     | 平台设置                 |
| `notifications` | **待定 → 评估**：属运维则并入 console/audit，属业务则插件化 | 定位模糊                 |
| `release`       | **待定 → 评估**：发布看板，倾向并入 overview 或运维面       | 定位模糊                 |

### 3.3 `plugin` 模块的特殊处理

`plugin` 是最大的单一模块（2025 行），但它混合了两类东西：

- **运行时**（注册 / `PluginSandboxModule` / 权限守卫 / `tenant_plugins`）——**留 core**，这是框架能力；
- **市场前端 + 自动更新**——**建议先砍/冻结**。v0.1.0 框架尚未到 1.0，却已做了完整市场 UI，是典型的过早投入。等有真实第三方插件（即 §4 的 dogfooding）跑通后再回补。

## 4. 收敛后的目标形态

- **后端模块：12 → 10**（移出 backlog、modernizer）。
- **前端导航：13 → 9~11**（移出 backlog/modernizer 至插件按需显示；release/notifications 视评估结果合并）。
- **每个仍留在 core 的功能都有清晰归属**：底座 / RBAC / 参照实现 / 平台可观测 / 插件运行时，五类之一。
- **插件系统获得首批真实负载**：用 backlog 当「第一个真实业务插件」验证插件 API 是否够用，比凭空维护市场 UI 更有价值。

## 5. 迁移路径（建议顺序，按性价比）

1. **backlog → 插件**（参照 [packages/plugin-example](../../packages/plugin-example)）：作为首批 dogfooding 案例，暴露插件 API 缺口。**优先做，价值最高。**
2. **modernizer → CI 脚本 / 开发期插件**：它做的事（扫 `console.log`、生成 API 文档）与 `scripts/` 里的 `cleanupAiResidue.cjs`、`check:docs` 同类，应退出多租户运行时。
3. **冻结 plugin 市场 UI + auto-update**，只保留运行时。
4. **评估 release / notifications**：明确归运维（并入 console）还是归业务（插件化）。
5. 全程保持 `check:layers` / `check:naming` 绿；每步独立可回滚。

## 6. 决议与执行结果（2026-06-05）

- [x] **backlog 下沉**：先补插件框架缺口（迁移框架 / 权限自注册 / 前端宿主上下文 / registry 软链+韧性），再整体搬成 `packages/plugin-backlog`（自持 pg Pool、自带表+RLS+权限/菜单种子迁移、server+ui）。内核 backlog 模块/前端/路由/nav/i18n/类型已移除；`backlog:*` 权限码 + console/store 权限 map 保留（插件前端 gating 通道）。
- [x] **modernizer**：直接删运行时（HTTP 模块 + 前端面板 + nav/路由/权限/i18n），开发期 CLI（`tools/modernizer/`，`npm run modernizer:analyze`/`sync-docs`）保留——独有能力（DTO 校验、未用 import、API 文档生成）不丢。
- [x] **plugin 市场 UI + auto-update**：**保留**（架构 lead 决定）。团队在主动维护市场 UI，价值明确；冻结/砍待插件生态成熟再议。
- [x] **release / notifications 归属**：评估结论——**两者都是平台运维视角，不是业务功能，故不插件化、留在 core**。`release` 数据（`/console/release-checks`）已被 overview todos 整合；`notifications` 是 `/console/audit-logs` 的只读 feed（= audit 面板简化版，复用 `audit:view`）。两者与 console/overview/audit 重叠，**可选**的纳维优化是把 release 并入 overview 卡片、notifications 并入 audit 的 feed tab；但这属 UI 整理，不属 core/plugin 边界，未执行。
- [x] **`tenant-management` 的 `pluginCode` 历史遗留**：已从 navConfig 移除（tenants 属 RBAC 整体，不应插件化）。

### 遗留的后续项（非本轮边界目标）

- ~~插件权限到前端的下发仍是硬编码（console 权限 map + usePermissionStore）~~ **（已解决 2026-06-08）**：插件权限改为**从 DB 动态下发**。
  - 方案（最小风险，不碰 core 自己的粗粒度 gating 模型）：① backlog 插件 migration 0004 自注册权限授权（补 seed 缺口）；② 新端点 `GET /api/v1/permissions/me/plugins` 按 user_id 查 role_permissions、与已装插件 manifest 声明的码取交集，返回用户已授予的插件权限码；③ 前端从 `AppPermission` 移除 `backlog:*`，权限 store 新增动态 `pluginPermissions` 集，`hasPermission` 对非 core 码走该集，appLayout 拉取、sidebar 菜单 gating 走 `hasPermission`。
  - 结果：core（类型 / console map / 前端 store）**完全不认识 `backlog:*`**，插件权限纯由 DB 授权 + manifest 声明驱动。注：core 自己的细粒度 RBAC（`users:create` 等）↔ 粗粒度 gating（`users:manage`）调和不在本次范围，core 权限维持原 role 派生逻辑。
- ~~`tenantsService` 删租户时仍级联删 `backlog_*` 表~~ **（已解决 2026-06-08）**：插件在 manifest 声明 `contributes.tenantTables`（标识符校验防注入），`tenantsService` 删租户时通过 `collectPluginTenantTables()` 通用清理，core 不再硬编码插件表名。
- ~~插件菜单仅由 seed 迁移装入、卸载留孤儿~~ **（已解决 2026-06-08）**：菜单改由安装/卸载生命周期接管（`provisionPluginMenus` 从 `contributes.menus` 建、`removePluginMenus` 删），并新增 `menus.plugin_code` 列让 sidebar 按租户启用状态过滤；同时清理了 modernizer 下线残留的死菜单/权限。
- 可选 UI 整理：release→overview 卡片、notifications→audit feed tab。

---

_§1–§4 为分析与裁定（数据采集自迁移前的 `master` 工作区）；§6 记录已落地的决议。_

---

最近更新时间：2026-06-08
