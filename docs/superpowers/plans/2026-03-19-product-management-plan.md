# nodeAdmin 产品管理框架实施计划

> **Goal:** 为 nodeAdmin 添加代码生成器、需求管理 (Backlog)、架构现代化三大模块

**Architecture:** CLI 工具独立运行不加载到 NestJS 运行时；Backlog 和 Modernizer 作为标准 NestJS 模块

**Tech Stack:** NestJS 11, Drizzle ORM, Fastify, yargs, nunjucks, PostgreSQL

---

## 文件结构

```
apps/coreApi/
  src/
    cli/                              # [新建] CLI 入口
      index.ts                        # 主入口
      generate.ts                     # generate crud 命令
    generator/                        # [新建] 生成器逻辑
      schemaParser.ts                 # Drizzle schema 元数据解析
      templates/                      # Nunjucks 模板
        service.template.njk
        controller.template.njk
        create-dto.template.njk
        update-dto.template.njk
    backlog/                          # [新建] 需求管理模块
      backlogModule.ts
      backlogService.ts
      sprintService.ts
      taskController.ts
      sprintController.ts
      dto/
        createTaskDto.ts
        updateTaskDto.ts
        createSprintDto.ts
        updateSprintDto.ts
    modernizer/                       # [新建] 架构现代化模块
      modernizerModule.ts
      analyzeService.ts
      docSyncService.ts
```

---

## Phase 1: 代码生成器

> CLI 工具，运行 `npm run generate:crud -- Product` 自动生成 Drizzle CRUD 模块

### Tasks

- [ ] **Task 1: 安装依赖** — `npm install yargs nunjucks --save-dev && npm install -D @types/yargs --workspace=coreApi`
- [ ] **Task 2: 创建 CLI 入口** — `apps/coreApi/src/cli/index.ts`（yargs 命令定义）+ `generate.ts`（生成逻辑）
- [ ] **Task 3: 实现 Drizzle Schema 解析器** — `schemaParser.ts`，从 `schema.ts` 的 `pgTable` 定义中提取列名、类型、关系
- [ ] **Task 4: 创建 Nunjucks 模板** — 适配 Drizzle ORM（非 TypeORM），生成 Service/Controller/DTO
  - `service.template.njk` — 使用 `db.select().from(table)` 风格
  - `controller.template.njk` — NestJS + Fastify `@Controller`
  - `create-dto.template.njk` / `update-dto.template.njk` — `class-validator` DTO
- [ ] **Task 5: 添加 npm script** — `"generate:crud": "npx ts-node apps/coreApi/src/cli/index.ts"`
- [ ] **Task 6: 支持 `--dry-run` 和 `--force` 选项**

### 验收
- `npm run generate:crud -- crud Product --dry-run` 预览生成内容
- `npm run generate:crud -- crud Product` 生成可编译的模块
- 生成的代码使用 Drizzle ORM，遵循项目 CommonJS 规范

---

## Phase 2: 需求管理 (Backlog)

> 标准 NestJS 模块，Task + Sprint 管理

### Tasks

- [ ] **Task 1: 新增 Drizzle Schema** — 在 `schema.ts` 添加 `backlogTasks` 和 `backlogSprints` 表
- [ ] **Task 2: 创建迁移 SQL** — `drizzle/migrations/` 下新增建表语句（含 RLS）
- [ ] **Task 3: 实现 BacklogService** — CRUD for tasks + sprints，使用 `pg.Pool` 直连
- [ ] **Task 4: 实现 Controllers** — `taskController.ts` + `sprintController.ts`
- [ ] **Task 5: 创建 DTOs** — `createTaskDto.ts`, `updateTaskDto.ts`, `createSprintDto.ts`, `updateSprintDto.ts`
- [ ] **Task 6: 注册 BacklogModule** — 添加到 `appModule.ts` imports

### API 端点
- `GET /api/v1/backlog/tasks` — 分页查询任务
- `POST /api/v1/backlog/tasks` — 创建任务
- `PATCH /api/v1/backlog/tasks/:id` — 更新任务状态/优先级
- `DELETE /api/v1/backlog/tasks/:id` — 删除任务
- `GET /api/v1/backlog/sprints` — Sprint 列表
- `POST /api/v1/backlog/sprints` — 创建 Sprint
- `PATCH /api/v1/backlog/sprints/:id` — 更新 Sprint
- `POST /api/v1/backlog/sprints/:id/tasks` — 将任务分配到 Sprint

### 验收
- 所有 API 端点可用
- 支持分页、状态筛选
- 前端 Backlog 面板（后续）

---

## Phase 3: 架构现代化 (Modernizer)

> 代码质量分析 + 文档自动同步

### Tasks

- [ ] **Task 1: 创建 ModernizerModule** — `modernizerModule.ts`
- [ ] **Task 2: 实现 AnalyzeService** — 扫描 `apps/coreApi/src/` 检测：
  - `console.log` 残留
  - TODO 注释
  - 缺少 `class-validator` 的 `@Body()` 端点
  - 未使用的导入
- [ ] **Task 3: 实现 DocSyncService** — 扫描 Controller 文件，提取路由信息，自动更新 API 文档
- [ ] **Task 4: 添加 CLI 入口** — `npm run modernizer:analyze` + `npm run modernizer:sync-docs`

### 验收
- `npm run modernizer:analyze` 输出代码质量报告
- `npm run modernizer:sync-docs` 自动更新 API 端点文档

---

## 优先级

| Phase | 优先级 | 前置条件 |
|-------|--------|----------|
| Phase 1: Code Generator | P2 | 审计日志模块完成 |
| Phase 2: Backlog | P3 | Phase 1 完成 |
| Phase 3: Modernizer | P3 | Phase 1 完成 |
