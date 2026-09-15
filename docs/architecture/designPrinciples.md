# 设计准则（数据建模与边界）

把本框架已经在执行的设计原则显式化，作为**新建模块 / 接手代码时的硬约束**。每条配一个常见反模式，避免重蹈。一句话：**让数据库做约束的主语、让框架做边界的执行者。**

## 1. 关系建在 schema 里

- **实体间用真外键 + 代理 id 关联**，不拿名字 / 可变字符串当连接键。
  - 证据：`drizzle/migrations/0016_rbac_tables_*` 中 `user_roles` / `role_permissions` / `role_menus` / `oauth_accounts` 全部 `REFERENCES users(id)` / `roles(id)` / …；权限判定按 `user_id` join，不依赖角色名编码。
  - 反模式：用名字相等 join（改名即断链、同名歧义、吃 collation 坑）。
- **多对多用关联表**（一行一关系，复合主键 + FK），不塞 JSON / CSV。
  - 证据：`user_roles` / `role_permissions` / `role_menus`、`0022_conversation_members`。关系本身要带属性就加在关联表（如成员 `role`）。
  - 反模式：`xxx_ids` 串字段塞一组外键 → 无法 join / 加索引 / 加约束，删父行留垃圾 id。
- **状态 / 开关用规范类型 + 受控取值 + 唯一约束**，单一状态列。
  - 证据：`0025_booleanize_rbac_flags` 把 0/1 收敛为原生 `BOOLEAN`；`(tenant_id,name)` / `permissions.code` 加 `UNIQUE`。
  - 反模式：魔法字符串状态、`status` 与 `is_xxx` 语义重叠并存、中文枚举值当状态。

## 2. 约束与隔离下沉到数据库

- **多租户用 `FORCE` + `RESTRICTIVE` RLS + `WITH CHECK`**，应用层 where 只当性能优化、不当安全边界。
  - 证据：`0001_rls` 每表 `ENABLE`+`FORCE ROW LEVEL SECURITY`；`0009_rls_restrictive_policies` 用 `AS RESTRICTIVE FOR ALL … WITH CHECK` 且校验 `current_setting('app.current_tenant') != ''` 防空租户绕过。
- **写库统一经 tenant-scoped executor**（`BEGIN` → `set_config('app.current_tenant', …)` → 执行 → `COMMIT`），入口校验租户非空，禁裸 `pool.query` 绕过。

## 3. 一个事实源 + 薄内核 + 插件

- 业务域做成**插件**，挂在同一框架 / 同一库 / 同一迁移账本上，**不另起独立栈**；core 只留底座能力 + RBAC + 参照实现 + 插件运行时。
  - 证据：`coreVsPluginBoundary.md` 的留 core 四条判据；插件（`packages/plugin-backlog`）自带 migrations + RLS + 权限码。
- **边界要被执行**：定期拿判据回查"名义插件、实则编进内核"的模块；繁杂往往不是因为功能多，而是 core/plugin 边界没被执行。

## 4. 变更纪律

- **改库只走带账本的幂等迁移**：`schema_migrations`（filename UNIQUE + 跳过已应用），迁移全用 `CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / `DO $$ … pg_policies` 可重放；core 先于 plugin，插件迁移按 `pluginId:filename` 命名空间。**绝不手抠生产库。**
- **一切数据访问走分层 service**：`Controller → Service → Repository`（`check:layers` 强制）。

## 5. 数据驱动 & 可靠性

- **权限 / 菜单由 DB grant 驱动、插件自注册**，内核不硬编码插件权限码（证据：`plugin-backlog/0004_backlog_perm_grants`、`menus.permission_code`）。
- **审计 + Outbox**：`0003_audit_logs`（action/target/trace_id/context）；业务写 + outbox 行**同一事务**，消费按 `eventId` 幂等去重，**禁双写**。

## 6. 工程门禁（规范即代码）

- 命名 / 分层 / 禁 `any` / 禁 `console` / 禁硬编码 `tenantId·userId·API base URL` 用 ESLint + `check:naming` / `check:layers` / `check:docs` 接入 CI，违规直接 fail——规范不靠口头和 review，靠不可绕过的门禁。

## 参考

- 迁移：`apps/coreApi/drizzle/migrations/`（`0000` outbox、`0001`/`0009` RLS、`0016` RBAC、`0022` conversation_members、`0025` booleanize、`0003` audit）。
- 文档：`architectureBaseline.md`、`coreVsPluginBoundary.md`；强制约束见根 `CLAUDE.md` / `AGENTS.md`。

## 最近更新时间

- 2026-06-17（首版：把框架已在执行的设计原则显式化，每条配证据与反模式）
