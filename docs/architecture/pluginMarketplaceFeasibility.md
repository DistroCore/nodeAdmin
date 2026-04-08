# 插件市场可行性分析与路线图

> 日期：2026-04-06
> 状态：方案评估阶段

## 背景

评估将 nodeAdmin 从静态模块架构演进为插件化平台的可行性，包括多租户是否适合抽离为插件。

## 结论：多租户不适合作为插件

### 原因

多租户是**横切关注点（cross-cutting concern）**，不是可插拔的业务功能：

- **81 个文件**、**648 处**引用 `tenantId`
- **9 张表**有 tenantId 列，**4 张**启用 RLS
- 全局 Guard（`JwtAuthGuard`）在每个请求注入租户上下文
- Repository 层在每个事务前执行 `set_config('app.current_tenant', ...)`

抽离为插件意味着：

1. 所有 Service 方法签名要改（648 处 tenantId 参数变为可选）
2. 数据库 schema 分支维护（有/无 tenantId 列 + RLS），迁移脚本成本翻倍
3. "卸载"多租户后系统行为不可预测（RLS 是安全屏障）

### 推荐分层

```
┌─────────────────────────────────────┐
│  插件层（可插拔业务功能）              │  ← Backlog、IM、Modernizer、Agent
├─────────────────────────────────────┤
│  平台能力层（不可插拔）               │  ← 多租户、认证、审计、权限
├─────────────────────────────────────┤
│  基础设施层                          │  ← PostgreSQL、Redis、Kafka
└─────────────────────────────────────┘
```

插件感知多租户（通过 `TenantContext` 注入），但不能选择"不用多租户"。

---

## 当前插件能力现状

| 能力           | 状态   | 说明                                                   |
| -------------- | ------ | ------------------------------------------------------ |
| 模块边界       | 已具备 | 12 个 NestJS 模块各自包含 Controller + Service + Tests |
| 动态加载       | 不存在 | `appModule.ts` 硬编码 import 所有模块                  |
| 插件注册表     | 不存在 | 无 `DynamicModule`、无运行时加载                       |
| 插件契约       | 不存在 | 无 `PluginInterface`、无生命周期钩子                   |
| 租户级功能开关 | 不存在 | 无 `tenant_plugins` 表                                 |
| 前端动态加载   | 不存在 | 无 Module Federation 或远程组件                        |
| CRUD 生成器    | 已具备 | `npm run generate:crud` 可生成静态代码                 |

---

## 演进路线图

### Phase 0：租户级功能开关（内置插件化）

**目标**：现有模块以"内置插件"形态运行，租户可按需启用/禁用。

**工作项**：

1. **定义 `PluginInterface` 契约**

   ```typescript
   interface PluginMetadata {
     name: string; // 如 'backlog', 'im', 'modernizer'
     version: string;
     description: string;
     dependencies?: string[]; // 依赖的其他插件
   }

   interface PluginModule {
     metadata: PluginMetadata;
     module: Type<any>; // NestJS Module class
     routes?: string[]; // 注册的路由前缀
   }
   ```

2. **新增 `tenant_plugins` 表**

   ```sql
   CREATE TABLE tenant_plugins (
     tenant_id UUID REFERENCES tenants(id),
     plugin_name VARCHAR(64) NOT NULL,
     enabled BOOLEAN DEFAULT true,
     config JSONB DEFAULT '{}',
     enabled_at TIMESTAMPTZ DEFAULT NOW(),
     PRIMARY KEY (tenant_id, plugin_name)
   );
   ```

3. **添加插件守卫 `PluginGuard`**
   - 检查当前租户是否启用了该路由所属的插件
   - 未启用则返回 403 + 明确错误信息

4. **前端侧边栏动态渲染**
   - `/api/v1/tenants/me/plugins` 返回当前租户启用的插件列表
   - `navConfig.ts` 根据返回值过滤菜单项

**预估工作量**：1-2 周

### Phase 1：支持外部插件加载

**目标**：第三方或内部团队可以开发独立插件包。

**工作项**：

1. **插件打包规范**
   - 插件发布为 npm 包：`@nodeadmin/plugin-xxx`
   - 包含 NestJS Module + 前端组件 + 元数据
   - 定义 `nodeadmin-plugin.json` manifest

2. **后端动态加载**
   - `PluginRegistry` 服务扫描已安装插件
   - 通过 `LazyModuleLoader`（NestJS 内置）运行时加载
   - 插件路由自动挂载到 `/api/v1/plugins/<name>/`

3. **前端动态加载**
   - 使用 Vite Module Federation 或 `import()` 加载远程组件
   - 插件提供标准化的面板组件入口

4. **插件沙箱**
   - 插件只能通过注入的 `TenantContext` 和 `DatabaseService` 访问数据
   - 不能直接访问其他插件的 Service
   - 权限控制：插件声明所需权限，租户管理员授权

**预估工作量**：4-6 周

### Phase 2：插件市场

**目标**：提供插件发现、安装、更新的完整生命周期。

**工作项**：

1. **插件 Registry 服务**
   - 类似精简版 npm registry
   - 存储插件元数据、版本、下载量
   - 支持公开/私有插件

2. **安装/卸载 API**
   - `POST /api/v1/admin/plugins/install`
   - `DELETE /api/v1/admin/plugins/:name`
   - 安装时自动运行插件的数据库迁移

3. **版本管理**
   - 兼容性矩阵（插件版本 × 平台版本）
   - 自动更新策略（minor 自动、major 手动确认）

4. **市场 UI**
   - AdminPortal 增加"插件市场"页面
   - 展示可用插件、已安装插件、更新通知

**预估工作量**：6-10 周

---

## 优先级建议

Phase 0 是**现在就可以做的低风险高回报**工作：

- 不改变现有模块代码结构
- 给租户管理员提供功能开关的灵活性
- 为后续 Phase 1/2 打下数据基础（`tenant_plugins` 表）

## 交付现状（2026-04-08 更新）

Phase 0 + Phase 1 + Phase 2 已经全部落地，见 `e11a5d9`。插件市场现在是 nodeAdmin
框架的核心扩展机制：

- 后端 22 个文件（registry / market / auto-update / sandbox / guard / manifest
  validator / admin controller），install / update / publish / uninstall 端点齐全
- 前端市场首页 / 详情页 / 已安装管理 / 配置页齐全
- 原文档中"Phase 1/2 等 Agent 需求明确后再启动"的前提条件已经失效 —— 随着 nodeAdmin
  被定位为**中后台快速开发框架**，插件市场是独立于任何具体业务（包括下游 fork 的
  Agent 系统）的平台能力，理应先于下游业务交付。下游 fork 如果需要 Agent 能力，
  可以直接把 Agent 功能打包成 nodeAdmin 插件上架。

---

## 相关文档

- [Agent 微服务架构规划](./agentMicroservicePlan.md)
- [Agent 微服务评审意见](./agentMicroserviceReview.md)
- [架构基线](./architectureBaseline.md)
