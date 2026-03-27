# nodeAdmin 产品管理框架设计

**日期**: 2026-03-19
**版本**: 1.0
**状态**: 草稿

---

## 1. 概述

### 1.1 目标

为 nodeAdmin 后台管理系统添加产品管理能力，包括：

1. **代码生成器** - 基于 Entity 自动生成 CRUD 模块，减少重复代码
2. **需求管理** - 产品待办列表、Sprint 规划、任务看板
3. **架构现代化** - 代码质量分析、迁移辅助、文档更新

### 1.2 技术栈

- NestJS 模块化架构
- SQLite 本地存储（复用现有数据库）
- Nunjucks 模板引擎
- 命令行界面 (CLI)

---

## 2. 模块设计

### 2.1 代码生成器 (Generator)

#### 架构说明
代码生成器作为 **独立 CLI 工具** 运行，不加载到 NestJS 运行时模块中。这样可以：
- 在构建时运行，不影响生产包体积
- 不依赖 NestJS 容器，直接解析 Entity 文件

#### 功能
- 基于 TypeORM Entity 自动生成完整 CRUD 模块
- 生成 Service、Controller、DTOs
- 生成单元测试模板

#### 命令
```bash
cd backend
npx ts-node src/cli/generate.ts crud User           # 生成 User CRUD
npx ts-node src/cli/generate.ts crud User --force   # 覆盖已有文件
npx ts-node src/cli/generate.ts crud User --dry-run # 仅预览不写入
npx ts-node src/cli/generate.ts crud User --path src/modules/product  # 指定输出路径
```

#### 生成文件结构
```
src/{nameLower}/
├── {nameLower}.service.ts       # 从模板生成
├── {nameLower}.controller.ts    # 从模板生成
├── dto/
│   ├── create-{nameLower}.dto.ts
│   └── update-{nameLower}.dto.ts
└── entities/
│   └── {nameLower}.entity.ts   # 复制或引用原 Entity
```

#### CLI 框架
使用 `yargs` 进行参数解析。

#### Entity 解析
使用 TypeORM 的 `getMetadataArgsStorage()` 读取 Entity 元数据：
```typescript
import { getMetadataArgsStorage } from 'typeorm';
const columns = getMetadataArgsStorage().columns
  .filter(c => c.target === EntityClass);
```

#### 模板变量结构
| 变量 | 类型 | 说明 |
|------|------|------|
| `name` | string | 实体名称 (如 User) |
| `nameLower` | string | 小写形式 (如 user) |
| `namePlural` | string | 复数形式 (如 users) |
| `columns` | ColumnMeta[] | 字段列表 |
| `relations` | RelationMeta[] | 关联关系 |

```typescript
interface ColumnMeta {
  propertyName: string;
  type: string;
  nullable: boolean;
  primary: boolean;
}

interface RelationMeta {
  propertyName: string;
  type: 'many-to-one' | 'one-to-many' | 'many-to-many';
  targetEntity: string;
}
```

#### 依赖
```bash
npm install yargs nunjucks --save-dev
npm install @types/yargs --save-dev
```

### 2.2 需求管理 (Backlog)

#### 功能
- 产品待办列表管理
- Sprint 规划
- 任务状态看板 (Todo/In Progress/Done)

#### 数据模型
```typescript
// Task Entity
@Entity('backlog_tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', default: 'todo' })
  status: 'todo' | 'in_progress' | 'done';

  @Column({ type: 'varchar', default: 'medium' })
  priority: 'low' | 'medium' | 'high';

  @ManyToOne(() => Sprint, (sprint) => sprint.tasks, { nullable: true, onDelete: 'SET NULL' })
  sprint?: Sprint;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Sprint Entity
@Entity('backlog_sprints')
export class Sprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'datetime' })
  startDate: Date;

  @Column({ type: 'datetime' })
  endDate: Date;

  @OneToMany(() => Task, (task) => task.sprint)
  tasks: Task[];
}
```

#### 级联行为
- 删除 Sprint 时，关联的 Task 会自动解除关联（`sprint` 设为 null）
- 不自动删除 Task，任务需单独管理

#### API 端点
所有端点需要 `admin` 角色认证。

**认证机制**: 复用现有的 `JwtAuthGuard` 和 `RolesGuard`。Controller 使用 `@UseGuards(JwtAuthGuard, RolesGuard)` 和 `@Roles('admin')` 装饰器。

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /backlog/tasks?page=1&limit=10 | 获取任务列表 (分页) |
| POST | /backlog/tasks | 创建任务 |
| PATCH | /backlog/tasks/:id | 更新任务 |
| DELETE | /backlog/tasks/:id | 删除任务 |
| GET | /backlog/sprints?page=1&limit=10 | 获取 Sprint 列表 (分页) |
| POST | /backlog/sprints | 创建 Sprint |
| PATCH | /backlog/sprints/:id | 更新 Sprint |
| DELETE | /backlog/sprints/:id | 删除 Sprint |

### 2.3 架构现代化 (Modernizer)

#### 功能
- **代码质量分析** - 检查未使用的导入、缺失的 DTO 验证
- **依赖检查** - 检查过时的依赖包
- **API 文档同步** - 根据 Controller 自动更新 TEST_DOCUMENTATION.md

#### 命令
```bash
npm run modernizer:analyze    # 分析代码质量
npm run modernizer:sync-docs  # 同步 API 文档
```

---

## 3. 架构图

```
backend/src/
├── cli/                         # CLI 入口 (独立运行，不加载到 AppModule)
│   ├── index.ts                 # CLI 入口文件
│   └── generate.ts              # generate:crud 命令实现
├── generator/                   # 生成器逻辑 (可被 CLI 调用)
│   ├── entity-parser.ts          # Entity 元数据解析
│   └── templates/               # Nunjucks 模板
│       ├── service.template.njk
│       ├── controller.template.njk
│       └── dto.template.njk
├── backlog/                     # 需求管理 (运行时模块)
│   ├── backlog.module.ts
│   ├── backlog.service.ts        # 任务 CRUD
│   ├── sprint.service.ts         # Sprint 管理
│   └── entities/
│       ├── task.entity.ts
│       └── sprint.entity.ts
└── modernizer/                  # 架构现代化 (运行时模块)
    ├── modernizer.module.ts
    ├── analyze.service.ts        # 代码分析
    └── doc-sync.service.ts       # 文档同步
```

**注意**: CLI 和 Generator 不加载到 `AppModule` 中，是独立的构建时工具。

---

## 4. 实施计划

### Phase 1: 代码生成器
1. 安装 yargs, nunjucks 依赖
2. 创建 cli/ 目录和入口文件
3. 实现 entity-parser.ts 解析 TypeORM 元数据
4. 编写 Nunjucks 模板
5. 实现 generate.ts 命令

### Phase 2: 需求管理
1. 创建 backlog 模块
2. 实现 Task 和 Sprint Entity (TypeORM)
3. 实现 CRUD API (分页、认证)
4. 创建数据库迁移

### Phase 3: 架构现代化
1. 创建 modernizer 模块
2. 实现代码质量分析规则
3. 实现文档同步功能
4. 添加 npm scripts

---

## 5. 优先级

| Phase | 功能 | 优先级 | 工作量 |
|-------|------|--------|--------|
| 1 | 代码生成器 | P0 | 中 |
| 2 | 需求管理 | P1 | 中 |
| 3 | 架构现代化 | P2 | 小 |

---

## 6. 验收标准

- [ ] `npx ts-node src/cli/generate.ts crud User --dry-run` 预览生成内容
- [ ] `npx ts-node src/cli/generate.ts crud User` 生成完整 User 模块
- [ ] 可通过 API 管理任务和 Sprint (需认证)
- [ ] `npm run modernizer:analyze` 输出代码质量报告
- [ ] 生成的代码通过 ESLint 检查
- [ ] Backlog API 支持分页
