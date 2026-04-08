# 插件市场实施计划（Phase 1 + Phase 2）

> 日期：2026-04-06
> 前置条件：Plugin Phase 0（租户级功能开关）已完成
> **状态（2026-04-08 更新）：Phase 0 + Phase 1 + Phase 2 已实现，见 `e11a5d9`**
> 后端 22 个文件覆盖 registry / market / auto-update / sandbox / guard / manifest
> validator / admin controller，install / update / publish / uninstall 端点齐全；
> 前端市场首页 / 详情页 / 已安装管理 / 配置页齐全。本文档保留作为原始规划和技术
> 决策的参考；Phase 3 及后续增强请另起新计划文档。

## 技术决策

| 决策          | 选择                            | 备选方案               | 理由                                                                                        |
| ------------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| 后端插件加载  | 启动前扫描 + DynamicModule 注册 | LazyModuleLoader       | LazyModuleLoader 无法在 bootstrap 后注册 Controller/Route，Fastify 路由表在 listen() 时冻结 |
| 前端插件加载  | Dynamic import() + React.lazy() | Vite Module Federation | @module-federation/vite 仍 0.x beta，HMR 兼容性差，Dynamic import 更可控且浏览器原生支持    |
| 插件打包      | 独立 npm 包 + ESM bundle        | monorepo 内模块        | 外部插件必须独立发布和版本管理                                                              |
| 插件 Registry | 内置 PostgreSQL 存储            | 独立 npm registry      | 初期不需要独立 registry 服务，数据库即可                                                    |
| 共享依赖      | importmap + externals           | SystemJS               | importmap 是浏览器标准，零额外依赖                                                          |

---

## Phase 1：支持外部插件加载（4-6 周）

### 1.1 插件 Manifest 规范

定义 `nodeadmin-plugin.json`：

```jsonc
{
  "id": "@nodeadmin/plugin-kanban",
  "version": "1.0.0",
  "displayName": "看板管理",
  "description": "可视化任务看板，拖拽排序",
  "author": { "name": "NodeAdmin Team", "email": "team@nodeadmin.dev" },
  "engines": { "nodeAdmin": ">=1.0.0" },
  "permissions": ["task:read", "task:write"],
  "dependencies": [], // 依赖的其他插件 id
  "entrypoints": {
    "server": "./dist/server/index.js", // NestJS Module 入口
    "ui": "./dist/ui/index.js", // 前端 ESM bundle 入口
    "settings": "./settings.schema.json", // 配置 JSON Schema（可选）
  },
  "contributes": {
    "menus": [{ "name": "看板", "icon": "LayoutDashboard", "route": "/plugins/kanban" }],
    "routes": ["/api/v1/plugins/kanban"],
  },
  "lifecycle": {
    "onInstall": "./scripts/install.cjs",
    "onUninstall": "./scripts/uninstall.cjs",
  },
}
```

**任务拆分**：

| ID    | 工作项                                                                        | 分派  | 依赖  |
| ----- | ----------------------------------------------------------------------------- | ----- | ----- |
| T-101 | 在 `packages/shared-types` 定义 `PluginManifest` 接口（与上面 JSON 结构对齐） | Codex | 无    |
| T-102 | 实现 manifest 校验器（class-validator 或 zod，校验 manifest JSON）            | Codex | T-101 |

---

### 1.2 后端动态加载

**架构**：

```
启动流程:
  1. AppModule.forRootAsync()
  2. → PluginRegistryService.scanInstalledPlugins()
  3. → 遍历 node_modules/@nodeadmin/plugin-*
  4. → 读取每个包的 nodeadmin-plugin.json
  5. → require(entrypoints.server) 获取 NestJS Module
  6. → DynamicModule.forRoot({ imports: [...pluginModules] })
  7. → 插件路由自动挂载到 /api/v1/plugins/<name>/
```

**核心组件**：

- **PluginRegistryService**：扫描、注册、管理已安装插件的生命周期
- **PluginSandbox**：限制插件只能访问注入的 `TenantContext` + `DatabaseService`，不能跨插件注入
- **PluginRouterModule**：动态为每个插件创建路由前缀 `/api/v1/plugins/<name>/`

**任务拆分**：

| ID    | 工作项                                                                     | 分派  | 依赖  |
| ----- | -------------------------------------------------------------------------- | ----- | ----- |
| T-103 | 实现 `PluginRegistryService`（扫描 node_modules、解析 manifest、注册模块） | Codex | T-102 |
| T-104 | 实现 `PluginSandboxModule`（注入限制、权限声明校验）                       | Codex | T-103 |
| T-105 | 修改 `AppModule` 使用 DynamicModule.forRootAsync() 集成插件                | Codex | T-103 |
| T-106 | 实现插件路由前缀自动挂载（RouterModule.register）                          | Codex | T-105 |

---

### 1.3 前端动态加载

**架构**：

```
加载流程:
  1. GET /api/v1/tenants/me/plugins 获取已启用插件列表
  2. 对每个有 ui 入口的插件：
     const mod = await import(/* @vite-ignore */ pluginUiUrl)
  3. React.lazy() 包装为懒加载组件
  4. 挂载到对应路由 /plugins/<name>
  5. 共享依赖通过 importmap 提供（React, react-dom, @tanstack/react-query 等）
```

**共享依赖策略**：

插件构建时将 React/react-dom/zustand/TanStack Query 标记为 externals，运行时通过 importmap 从主应用加载：

```html
<script type="importmap">
  {
    "imports": {
      "react": "/shared/react.production.min.js",
      "react-dom": "/shared/react-dom.production.min.js"
    }
  }
</script>
```

**插件前端入口规范**：

```typescript
// 插件必须默认导出一个 React 组件
export default function KanbanPlugin() { ... }

// 可选：导出配置面板
export function SettingsPanel() { ... }
```

**任务拆分**：

| ID    | 工作项                                                                     | 分派   | 依赖  |
| ----- | -------------------------------------------------------------------------- | ------ | ----- |
| T-107 | 实现 `usePluginLoader` hook（dynamic import + React.lazy + ErrorBoundary） | Gemini | T-101 |
| T-108 | 实现 importmap 生成逻辑（构建时提取共享依赖版本）                          | Gemini | 无    |
| T-109 | 实现插件路由动态挂载（React Router lazy routes）                           | Gemini | T-107 |
| T-110 | 侧边栏集成插件 contributes.menus（扩展 Phase 0 的动态菜单）                | Gemini | T-109 |

---

### 1.4 示例插件 — 验证完整链路

| ID    | 工作项                                                                     | 分派   | 依赖         |
| ----- | -------------------------------------------------------------------------- | ------ | ------------ |
| T-111 | 创建 `packages/plugin-example`：最小 NestJS Module + React 组件 + manifest | Claude | T-106, T-110 |
| T-112 | 端到端验证：安装示例插件 → 启用 → 后端路由可用 → 前端面板加载              | Claude | T-111        |

---

## Phase 2：插件市场（6-10 周，Phase 1 完成后启动）

### 2.1 数据库扩展

新增表：

```sql
-- 插件 registry（全局，不区分租户）
CREATE TABLE plugin_registry (
  id VARCHAR(128) PRIMARY KEY,          -- @nodeadmin/plugin-xxx
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  author_name VARCHAR(100),
  author_email VARCHAR(255),
  latest_version VARCHAR(20) NOT NULL,
  is_public BOOLEAN DEFAULT true,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 插件版本
CREATE TABLE plugin_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id VARCHAR(128) REFERENCES plugin_registry(id),
  version VARCHAR(20) NOT NULL,
  manifest JSONB NOT NULL,               -- 完整 nodeadmin-plugin.json
  bundle_url VARCHAR(500) NOT NULL,      -- 前端 bundle CDN 地址
  server_package VARCHAR(500) NOT NULL,  -- npm 包名@版本
  min_platform_version VARCHAR(20),      -- 最低平台版本
  changelog TEXT,
  published_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plugin_id, version)
);

-- 租户已安装插件（扩展 Phase 0 的 tenant_plugins）
-- 追加字段：
ALTER TABLE tenant_plugins ADD COLUMN installed_version VARCHAR(20);
ALTER TABLE tenant_plugins ADD COLUMN auto_update BOOLEAN DEFAULT true;
ALTER TABLE tenant_plugins ADD COLUMN installed_at TIMESTAMPTZ DEFAULT now();
```

| ID    | 工作项                                                                              | 分派  | 依赖    |
| ----- | ----------------------------------------------------------------------------------- | ----- | ------- |
| T-201 | Drizzle schema + migration（plugin_registry, plugin_versions, tenant_plugins 扩展） | Codex | Phase 1 |
| T-202 | RLS 策略（plugin_registry 全局可读，tenant_plugins 租户隔离）                       | Codex | T-201   |

---

### 2.2 安装/卸载 API

| 端点                               | 方法   | 说明                                     |
| ---------------------------------- | ------ | ---------------------------------------- |
| `/api/v1/admin/plugins`            | GET    | 查询市场可用插件列表（分页、搜索、分类） |
| `/api/v1/admin/plugins/:id`        | GET    | 查询单个插件详情（含版本历史）           |
| `/api/v1/admin/plugins/install`    | POST   | 安装插件到当前租户                       |
| `/api/v1/admin/plugins/:id`        | DELETE | 卸载插件                                 |
| `/api/v1/admin/plugins/:id/update` | POST   | 更新到指定版本                           |
| `/api/v1/admin/plugins/publish`    | POST   | 发布新插件/版本（管理员）                |

**安装流程**：

```
POST /install { pluginId, version }
  1. 从 plugin_versions 获取 manifest + bundle_url + server_package
  2. npm install server_package（或从 CDN 拉取）
     - 状态（2026-04-08）：`T-P5-BE-04` 仅实现 lifecycle 调用机制，假设插件包已存在于
       `node_modules`；动态安装/拉取仍为后续工作项，当前不在该任务 scope 内
  3. 执行 lifecycle.onInstall（数据库迁移等）
  4. 写入 tenant_plugins（enabled=true, installed_version=version）
  5. 返回成功 → 前端刷新插件列表
```

| ID    | 工作项                                                 | 分派  | 依赖  |
| ----- | ------------------------------------------------------ | ----- | ----- |
| T-203 | 实现 `PluginMarketService`（市场查询、版本兼容性检查） | Codex | T-201 |
| T-204 | 实现安装/卸载 API + lifecycle 执行器                   | Codex | T-203 |
| T-205 | 实现发布 API（manifest 校验、bundle 上传/URL 注册）    | Codex | T-203 |

---

### 2.3 版本管理

- **兼容性矩阵**：`plugin_versions.min_platform_version` 与当前平台版本比对
- **更新策略**：`tenant_plugins.auto_update`
  - `true`：minor/patch 版本自动更新
  - `false`：所有更新需手动确认
- **回滚**：保留上一个版本的 bundle_url，卸载失败可回退

| ID    | 工作项                                        | 分派  | 依赖  |
| ----- | --------------------------------------------- | ----- | ----- |
| T-206 | 实现版本兼容性检查 + 自动更新调度（Cron job） | Codex | T-204 |

---

### 2.4 市场 UI

**页面结构**：

```
/plugins/marketplace        → 插件市场首页（卡片网格，搜索/分类筛选）
/plugins/marketplace/:id    → 插件详情（描述、截图、版本历史、安装按钮）
/plugins/installed          → 已安装插件管理（启用/禁用/卸载/更新）
/plugins/settings/:id       → 插件配置（渲染 settings.schema.json 生成的表单）
```

| ID    | 工作项                                     | 分派   | 依赖  |
| ----- | ------------------------------------------ | ------ | ----- |
| T-207 | 插件市场首页（卡片列表、搜索、分类、分页） | Gemini | T-203 |
| T-208 | 插件详情页（版本历史、安装/卸载操作）      | Gemini | T-207 |
| T-209 | 已安装插件管理页                           | Gemini | T-207 |
| T-210 | 插件配置页（JSON Schema → 动态表单）       | Gemini | T-209 |

---

## 里程碑与验收标准

| 里程碑            | 标准                                                     | 目标日期       |
| ----------------- | -------------------------------------------------------- | -------------- |
| **Phase 1 完成**  | 示例插件可安装、后端路由可用、前端面板加载、插件互相隔离 | Phase 0 + 5 周 |
| **Phase 2 Alpha** | 市场 UI 可浏览、安装/卸载 API 可用、版本管理基本工作     | Phase 1 + 4 周 |
| **Phase 2 GA**    | 发布 API 可用、自动更新、回滚、权限控制完善              | Alpha + 4 周   |

---

## 风险与缓解

| 风险                     | 影响         | 缓解                                    |
| ------------------------ | ------------ | --------------------------------------- |
| 插件代码可访问主应用内部 | 安全隔离失效 | PluginSandbox 限制注入范围 + 代码审查   |
| 前端 React 多实例        | 运行时崩溃   | importmap 强制单实例 + 构建时 externals |
| 插件 migration 破坏主库  | 数据损坏     | 插件表强制 `plugin_` 前缀 + 事务回滚    |
| 启动时扫描拖慢首次启动   | 延迟增大     | 缓存 manifest 解析结果 + 并行加载       |
| 插件版本与平台不兼容     | 功能异常     | engines 字段强校验 + 安装前检查         |

---

## 执行顺序建议

```
Phase 1 并行线:
  ┌─ Codex: T-101 → T-102 → T-103 → T-104 → T-105 → T-106
  └─ Gemini: T-108 → T-107 → T-109 → T-110
  → Claude: T-111 → T-112（集成验证）

Phase 2 并行线（Phase 1 完成后）:
  ┌─ Codex: T-201 → T-202 → T-203 → T-204 → T-205 → T-206
  └─ Gemini: T-207 → T-208 → T-209 → T-210
```
