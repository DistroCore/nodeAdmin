# Harness 使用文档

> **status**: approved | **last-reviewed**: 2026-06-03

本文档说明 nodeAdmin 的验证 / 迁移 / 运维 harness 怎么跑：各层入口命令、前置条件（尤其哪些需要 Docker），以及典型组合。命令默认在仓库根执行。

## 1. 前置条件

| 能力                                       | 是否需要 Docker | 说明                                               |
| ------------------------------------------ | --------------- | -------------------------------------------------- |
| 单元测试、lint、类型检查、build            | 否              | 纯静态 / 内存，随时可跑                            |
| 集成测试、DB 迁移、smoke、acceptance、load | 是              | 依赖 `infra:up` 起的 PostgreSQL / Redis /（Kafka） |

> Docker Desktop 未启动时，`infra:up` 会报 `failed to connect to the docker API ... daemon is running`，此时集成 / 迁移 / smoke / acceptance 全部无法运行。先启动 Docker。

## 2. 静态层（无需 Docker）

```bash
npm run lint             # ESLint，零警告零错误
npm run format:check     # Prettier 校验
npm run build            # shared-types + 前后端 tsc + vite，跨包类型门
npm run test:coreApi     # 后端单测（Vitest，含 OpenAPI 快照契约）
npm run test:adminPortal # 前端单测（Vitest）
npm run ci:local         # format + lint + 单测 + build 一条龙（加 --full 跑结构检查）
```

结构检查：`check:naming`、`check:layers`、`check:docs`、`cleanup:ai`。

## 3. 基础设施（需 Docker）

```bash
npm run infra:up             # PostgreSQL(55432)、PgBouncer(6432)、Redis(56379)
npm run infra:up:kafka       # 追加 Kafka + Zookeeper
npm run infra:up:monitoring  # 追加 Prometheus(9091)/Grafana(3003)/AlertManager(9093)
npm run infra:up:tls         # 生成 dev TLS 证书 + Nginx TLS 代理(3443)
npm run infra:down           # 全部停止
```

## 4. 数据库迁移

迁移是 `apps/coreApi/drizzle/migrations/` 下手写的编号 `.sql`，由 `scripts/applySqlMigration.cjs` 按文件名顺序应用，已应用记录写入 `schema_migrations` 表，幂等跳过已应用项。**不是 drizzle-kit**，因此新增迁移无需维护 journal。

```bash
npm run infra:up        # 先起库
npm run db:migrate      # = node scripts/applySqlMigration.cjs
                        # 读 DATABASE_URL，缺省 postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin
```

新增迁移：在 `migrations/` 放下一个编号文件（如 `0026_*.sql`），重跑 `db:migrate` 即可。改列类型这类变更，用 `ALTER TABLE ... ALTER COLUMN ... TYPE ... USING (...)`（必要时先 `DROP DEFAULT` 再 `SET DEFAULT`）。

## 5. 集成 / 验收 / smoke / load（需 Docker）

```bash
npm run m1:acceptance:auto   # M1 里程碑验收（自动起 API）
npm run m2:acceptance:auto   # M2 验收
npm run smoke:mvp            # MVP 发布 smoke
npm run smoke:im             # IM 端到端
npm run smoke:outbox         # Kafka outbox
npm run smoke:tls            # TLS 终止
npm run smoke:pgbouncer      # 连接池
npm run load:k6              # K6 负载（:smoke / :spike / :stress 各场景）
```

集成测试（`*.integration.test.ts`）依赖真实库：先完成 `infra:up` + `db:migrate`、确保 `DATABASE_URL` / `FRONTEND_ORIGINS` 等环境变量就绪，再运行。它们不在默认 `npm run test:coreApi`（纯内存 mock）路径里。

## 6. E2E

```bash
npm run test:e2e:web    # Playwright（AdminPortal）
```

## 7. 运维诊断

```bash
npm run status          # 项目状态卡（里程碑 / 基础设施 / 待办）
npm run diagnose        # 运行时健康检查（端口、Docker 容器）
npm run playbook        # 故障查询 playbook（连接暴涨、Kafka 积压、Redis 健康）
```

## 8. 推荐组合

- 改代码、提交前（无 Docker 即可）：`npm run ci:local`
- 改了迁移 / DB 行为：`infra:up` → `db:migrate` → `npm run test:coreApi` + 相关 `*.integration.test.ts`
- 上线前：`npm run ci:local`（带 `--full`）+ 验收 + smoke + load

## 最近更新时间

- 2026-06-03（初版：文档化验证 / 迁移 / 运维 harness 各层入口、Docker 前置条件与典型组合）
