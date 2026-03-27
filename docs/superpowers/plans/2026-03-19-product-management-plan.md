# nodeAdmin 产品管理框架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 nodeAdmin 添加代码生成器、需求管理 (Backlog)、架构现代化三大模块

**Architecture:** CLI 工具独立运行不加载到 NestJS 运行时；Backlog 和 Modernizer 作为标准 NestJS 模块；复用现有 JwtAuthGuard 和 RolesGuard

**Tech Stack:** NestJS, TypeORM, yargs, nunjucks, SQLite

---

## 文件结构

```
backend/src/
├── cli/                              # [新建] CLI 入口
│   ├── index.ts                     # 主入口
│   └── generate.ts                   # generate crud 命令
├── generator/                         # [新建] 生成器逻辑
│   ├── entity-parser.ts              # Entity 元数据解析
│   └── templates/                    # Nunjucks 模板
│       ├── service.template.njk
│       ├── controller.template.njk
│       ├── create-dto.template.njk
│       └── update-dto.template.njk
├── backlog/                          # [新建] 需求管理模块
│   ├── backlog.module.ts
│   ├── backlog.service.ts
│   ├── sprint.service.ts
│   ├── task.controller.ts
│   ├── sprint.controller.ts
│   └── entities/
│       ├── task.entity.ts
│       └── sprint.entity.ts
└── modernizer/                       # [新建] 架构现代化模块
    ├── modernizer.module.ts
    ├── analyze.service.ts
    └── doc-sync.service.ts
```

---

## Phase 1: 代码生成器

### Task 1: 安装依赖

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: 安装 yargs 和 nunjucks**

Run: `cd backend && npm install yargs nunjucks --save-dev && npm install @types/yargs --save-dev`

---

### Task 2: 创建 CLI 入口

**Files:**
- Create: `backend/src/cli/index.ts`
- Create: `backend/src/cli/generate.ts`

- [ ] **Step 1: 创建 CLI 目录**

```bash
mkdir -p backend/src/cli
```

- [ ] **Step 2: 创建 index.ts**

```typescript
import * as yargs from 'yargs';
import { generateCrud } from './generate';

yargs
  .command(
    'crud <name>',
    'Generate CRUD module for an entity',
    (yargs) => {
      return yargs
        .positional('name', {
          describe: 'Entity name (e.g., User)',
          type: 'string',
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          description: 'Overwrite existing files',
          default: false,
        })
        .option('dry-run', {
          alias: 'd',
          type: 'boolean',
          description: 'Preview without writing files',
          default: false,
        })
        .option('path', {
          alias: 'p',
          type: 'string',
          description: 'Output path (default: src/{nameLower})',
          default: null,
        })
        .option('entity-path', {
          alias: 'e',
          type: 'string',
          description: 'Path to entity file or directory containing entities',
          default: null,
        });
    },
    async (argv) => {
      await generateCrud({
        name: argv.name,
        force: argv.force,
        dryRun: argv['dry-run'],
        path: argv.path,
        entityPath: argv['entity-path'],
      });
    }
  )
  .demandCommand()
  .help()
  .parse();
```

- [ ] **Step 3: 创建 generate.ts**

```typescript
import * as path from 'path';
import * as fs from 'fs';
import * as nunjucks from 'nunjucks';
import { parseEntityFromMetadata } from '../generator/entity-parser';

interface GenerateOptions {
  name: string;
  force?: boolean;
  dryRun?: boolean;
  path?: string;
  entityPath?: string;
}

export async function generateCrud(options: GenerateOptions): Promise<void> {
  const { name, force = false, dryRun = false, path: customPath, entityPath } = options;
  const nameLower = name.toLowerCase();
  const namePlural = nameLower + 's';
  const outputPath = customPath || path.join(__dirname, '..', nameLower);

  console.log(`Generating CRUD for ${name}...`);
  console.log(`Output path: ${outputPath}`);

  // Resolve entity path - use provided path or search in standard locations
  let resolvedEntityPath = entityPath;
  if (!resolvedEntityPath) {
    const standardPaths = [
      path.join(__dirname, '..', 'users', 'entities', `${name}.entity.ts`),
      path.join(__dirname, '..', 'roles', 'entities', `${name}.entity.ts`),
    ];
    resolvedEntityPath = standardPaths.find((p) => fs.existsSync(p)) || null;
  }

  if (!resolvedEntityPath || !fs.existsSync(resolvedEntityPath)) {
    console.error(`Entity file not found: ${resolvedEntityPath}`);
    console.log('Use --entity-path to specify the entity location');
    return;
  }

  // Use TypeORM metadata storage to parse entity
  const entityMeta = parseEntityFromMetadata(name);

  // Setup nunjucks
  nunjucks.configure(__dirname + '/../generator/templates', { autoescape: false });

  const files = {
    service: nunjucks.render('service.template.njk', {
      name,
      nameLower,
      namePlural,
      columns: entityMeta.columns,
      relations: entityMeta.relations,
    }),
    controller: nunjucks.render('controller.template.njk', {
      name,
      nameLower,
      namePlural,
    }),
    'dto/create': nunjucks.render('create-dto.template.njk', {
      name,
      nameLower,
      columns: entityMeta.columns,
    }),
    'dto/update': nunjucks.render('update-dto.template.njk', {
      name,
      nameLower,
      columns: entityMeta.columns,
    }),
  };

  if (dryRun) {
    console.log('\n=== DRY RUN - Preview ===\n');
    console.log('--- service ---');
    console.log(files.service);
    console.log('--- controller ---');
    console.log(files.controller);
    console.log('--- dto/create ---');
    console.log(files['dto/create']);
    console.log('--- dto/update ---');
    console.log(files['dto/update']);
    return;
  }

  // Create directories
  const dirs = [outputPath, path.join(outputPath, 'dto')];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Write files
  const fileMap = [
    [path.join(outputPath, `${nameLower}.service.ts`), files.service],
    [path.join(outputPath, `${nameLower}.controller.ts`), files.controller],
    [path.join(outputPath, 'dto', `create-${nameLower}.dto.ts`), files['dto/create']],
    [path.join(outputPath, 'dto', `update-${nameLower}.dto.ts`), files['dto/update']],
    [path.join(outputPath, 'entities', `${name}.entity.ts`), generateEntityTemplate(name, entityMeta)],
  ];

  fileMap.forEach(([filePath, content]) => {
    if (fs.existsSync(filePath) && !force) {
      console.log(`Skipped (exists): ${filePath}`);
    } else {
      fs.writeFileSync(filePath, content);
      console.log(`Created: ${filePath}`);
    }
  });

  console.log('\nDone!');
}

function generateEntityTemplate(name: string, meta: EntityMeta): string {
  const columns = meta.columns.map((col) => {
    if (col.primary) {
      if (col.type === 'string') {
        return `  @PrimaryColumn()\n  ${col.propertyName}: string;`;
      }
      return `  @PrimaryGeneratedColumn('uuid')\n  ${col.propertyName}: string;`;
    }
    const opts = col.nullable ? '{ nullable: true }' : '';
    return `  @Column${opts}\n  ${col.propertyName}: ${col.type};`;
  }).join('\n');

  return `import { Entity, PrimaryColumn, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('${name.toLowerCase()}s')
export class ${name} {
${columns}

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
`;
}
```

---

### Task 3: 实现 Entity 解析器

**Files:**
- Create: `backend/src/generator/entity-parser.ts`
- Create: `backend/src/generator/templates/service.template.njk`
- Create: `backend/src/generator/templates/controller.template.njk`
- Create: `backend/src/generator/templates/create-dto.template.njk`
- Create: `backend/src/generator/templates/update-dto.template.njk`

- [ ] **Step 1: 创建 entity-parser.ts**

```typescript
import { getMetadataArgsStorage } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

export interface ColumnMeta {
  propertyName: string;
  type: string;
  nullable: boolean;
  primary: boolean;
}

export interface RelationMeta {
  propertyName: string;
  type: 'many-to-one' | 'one-to-many' | 'many-to-many';
  targetEntity: string;
}

export interface EntityMeta {
  name: string;
  columns: ColumnMeta[];
  relations: RelationMeta[];
}

/**
 * Parse entity metadata using TypeORM's getMetadataArgsStorage()
 * This reads the decorator metadata, not the compiled entity
 */
export function parseEntityFromMetadata(entityName: string): EntityMeta {
  const storage = getMetadataArgsStorage();

  // Get columns
  const columns: ColumnMeta[] = storage.columns
    .filter((col) => col.target === entityName)
    .map((col) => ({
      propertyName: col.propertyName,
      type: (col.options as any)?.type?.name || 'string',
      nullable: (col.options as any)?.nullable || false,
      primary: col.mode === 'primary',
    }));

  // Get relations
  const relations: RelationMeta[] = storage.relations
    .filter((rel) => rel.target === entityName)
    .map((rel) => ({
      propertyName: rel.propertyName,
      type: rel.type as RelationMeta['type'],
      targetEntity: (rel.type as Function).name,
    }));

  return { name: entityName, columns, relations };
}

/**
 * Auto-discover entity files in a directory
 */
export function discoverEntities(entityDir: string): { name: string; path: string }[] {
  const entities: { name: string; path: string }[] = [];
  const files = fs.readdirSync(entityDir);

  files.forEach((file) => {
    if (file.endsWith('.entity.ts')) {
      const name = file.replace('.entity.ts', '');
      entities.push({
        name,
        path: path.join(entityDir, file),
      });
    }
  });

  return entities;
}
```

- [ ] **Step 2: 创建 service.template.njk**

```nunjucks
import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { {{ name }} } from './entities/{{ nameLower }}.entity';

@Injectable()
export class {{ name }}Service {
  constructor(
    @InjectRepository({{ name }})
    private repository: Repository<{{ name }}>,
  ) {}

  async findAll(page = 1, limit = 10) {
    const [data, total] = await this.repository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('{{ name }} not found');
    }
    return entity;
  }

  async create(data: Partial<{{ name }}>) {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: string, data: Partial<{{ name }}>) {
    const entity = await this.findOne(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async remove(id: string) {
    const entity = await this.findOne(id);
    await this.repository.remove(entity);
    return { message: '{{ name }} deleted' };
  }
}
```

- [ ] **Step 3: 创建 controller.template.njk**

```nunjucks
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request
} from '@nestjs/common';
import { {{ name }}Service } from './{{ nameLower }}.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('{{ namePlural }}')
@UseGuards(JwtAuthGuard, RolesGuard)
export class {{ name }}Controller {
  constructor(private readonly {{ nameLower }}Service: {{ name }}Service) {}

  @Get()
  @Roles('admin')
  findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.{{ nameLower }}Service.findAll(+page, +limit);
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.{{ nameLower }}Service.findOne(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() data: any) {
    return this.{{ nameLower }}Service.create(data);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() data: any) {
    return this.{{ nameLower }}Service.update(id, data);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.{{ nameLower }}Service.remove(id);
  }
}
```

- [ ] **Step 4: 创建 create-dto.template.njk**

```nunjucks
import { IsNotEmpty, IsString, IsOptional, IsEmail, IsInt, IsBoolean, IsDateString } from 'class-validator';

export class Create{{ name }}Dto {
{% for column in columns %}
{% if not column.primary %}
  @Is{{ column.nullable ? 'Optional' : 'NotEmpty' }}()
{% if column.type === 'string' %}
  @IsString()
{% elif column.type === 'number' or column.type === 'int' %}
  @IsInt()
{% elif column.type === 'boolean' %}
  @IsBoolean()
{% elif column.type === 'Date' %}
  @IsDateString()
{% endif %}
  {{ column.propertyName }}{{ column.nullable ? '?' : '' }}: {{ column.type }};
{% endif %}
{% endfor %}
}
```

- [ ] **Step 5: 创建 update-dto.template.njk**

```nunjucks
import { IsOptional, IsString, IsInt, IsBoolean, IsDateString } from 'class-validator';

export class Update{{ name }}Dto {
{% for column in columns %}
{% if not column.primary %}
  @IsOptional()
{% if column.type === 'string' %}
  @IsString()
{% elif column.type === 'number' or column.type === 'int' %}
  @IsInt()
{% elif column.type === 'boolean' %}
  @IsBoolean()
{% elif column.type === 'Date' %}
  @IsDateString()
{% endif %}
  {{ column.propertyName }}?: {{ column.type }};
{% endif %}
{% endfor %}
}
```

- [ ] **Step 6: 创建 templates 目录并写入模板**

```bash
mkdir -p backend/src/generator/templates
```

---

### Task 4: 添加 npm scripts

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: 添加 generate script**

Add to `scripts`:
```json
"generate:crud": "ts-node src/cli/index.ts"
```

---

## Phase 2: 需求管理 (Backlog)

### Task 5: 创建 Backlog 模块结构

**Files:**
- Create: `backend/src/backlog/backlog.module.ts`
- Create: `backend/src/backlog/entities/task.entity.ts`
- Create: `backend/src/backlog/entities/sprint.entity.ts`

- [ ] **Step 1: 创建 task.entity.ts**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany,
} from 'typeorm';
import { Sprint } from './sprint.entity';

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
```

- [ ] **Step 2: 创建 sprint.entity.ts**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Task } from './task.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: 创建 backlog.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { Sprint } from './entities/sprint.entity';
import { TaskController } from './task.controller';
import { SprintController } from './sprint.controller';
import { BacklogService } from './backlog.service';

@Module({
  imports: [TypeOrmModule.forFeature([Task, Sprint])],
  controllers: [TaskController, SprintController],
  providers: [BacklogService],
  exports: [BacklogService],
})
export class BacklogModule {}
```

---

### Task 6: 实现 Backlog Service

**Files:**
- Create: `backend/src/backlog/backlog.service.ts`

- [ ] **Step 1: 创建 backlog.service.ts**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Sprint } from './entities/sprint.entity';

@Injectable()
export class BacklogService {
  constructor(
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(Sprint)
    private sprintRepo: Repository<Sprint>,
  ) {}

  // Task methods
  async findAllTasks(page = 1, limit = 10) {
    const [data, total] = await this.taskRepo.findAndCount({
      relations: ['sprint'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findTask(id: string) {
    const task = await this.taskRepo.findOne({ where: { id }, relations: ['sprint'] });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async createTask(data: Partial<Task>) {
    const task = this.taskRepo.create(data);
    return this.taskRepo.save(task);
  }

  async updateTask(id: string, data: Partial<Task>) {
    const task = await this.findTask(id);
    Object.assign(task, data);
    return this.taskRepo.save(task);
  }

  async deleteTask(id: string) {
    const task = await this.findTask(id);
    await this.taskRepo.remove(task);
    return { message: 'Task deleted' };
  }

  // Sprint methods
  async findAllSprints(page = 1, limit = 10) {
    const [data, total] = await this.sprintRepo.findAndCount({
      relations: ['tasks'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findSprint(id: string) {
    const sprint = await this.sprintRepo.findOne({ where: { id }, relations: ['tasks'] });
    if (!sprint) throw new NotFoundException('Sprint not found');
    return sprint;
  }

  async createSprint(data: Partial<Sprint>) {
    const sprint = this.sprintRepo.create(data);
    return this.sprintRepo.save(sprint);
  }

  async updateSprint(id: string, data: Partial<Sprint>) {
    const sprint = await this.findSprint(id);
    Object.assign(sprint, data);
    return this.sprintRepo.save(sprint);
  }

  async deleteSprint(id: string) {
    const sprint = await this.findSprint(id);
    await this.sprintRepo.remove(sprint);
    return { message: 'Sprint deleted' };
  }
}
```

---

### Task 7: 实现 Controllers

**Files:**
- Create: `backend/src/backlog/task.controller.ts`
- Create: `backend/src/backlog/sprint.controller.ts`

- [ ] **Step 1: 创建 task.controller.ts**

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('backlog/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class TaskController {
  constructor(private readonly backlogService: BacklogService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.backlogService.findAllTasks(+page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.backlogService.findTask(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.backlogService.createTask(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.backlogService.updateTask(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.backlogService.deleteTask(id);
  }
}
```

- [ ] **Step 2: 创建 sprint.controller.ts**

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('backlog/sprints')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SprintController {
  constructor(private readonly backlogService: BacklogService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.backlogService.findAllSprints(+page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.backlogService.findSprint(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.backlogService.createSprint(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.backlogService.updateSprint(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.backlogService.deleteSprint(id);
  }
}
```

---

### Task 8: 注册 Backlog 模块

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: 添加 BacklogModule 到 AppModule**

Add import:
```typescript
import { BacklogModule } from './backlog/backlog.module';

@Module({
  imports: [
    // ... existing imports
    BacklogModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: 创建数据库迁移**

```bash
cd backend && npm run migration:generate -- --name=CreateBacklogTables
cd backend && npm run migration:run
```

---

## Phase 3: 架构现代化 (Modernizer)

### Task 9: 创建 Modernizer 模块

**Files:**
- Create: `backend/src/modernizer/modernizer.module.ts`
- Create: `backend/src/modernizer/analyze.service.ts`
- Create: `backend/src/modernizer/doc-sync.service.ts`

- [ ] **Step 1: 创建 modernizer.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { AnalyzeService } from './analyze.service';
import { DocSyncService } from './doc-sync.service';

@Module({
  providers: [AnalyzeService, DocSyncService],
  exports: [AnalyzeService, DocSyncService],
})
export class ModernizerModule {}
```

- [ ] **Step 2: 创建 analyze.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AnalyzeService {
  analyze(): { issues: string[]; suggestions: string[] } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const srcPath = path.join(__dirname, '..');

    // Check for unused imports (simplified)
    const files = this.getTsFiles(srcPath);
    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');

      // Check for console.log
      if (content.includes('console.log')) {
        issues.push(`console.log found in ${file}`);
      }

      // Check for TODO comments
      if (content.includes('TODO')) {
        issues.push(`TODO comment found in ${file}`);
      }

      // Check for missing validation decorators
      if (content.includes('@Body()') && !content.includes('class-validator')) {
        suggestions.push(`Missing validation in ${file} - consider adding class-validator decorators`);
      }
    });

    return { issues, suggestions };
  }

  private getTsFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    items.forEach((item) => {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory() && !item.name.includes('node_modules')) {
        files.push(...this.getTsFiles(fullPath));
      } else if (item.name.endsWith('.ts') && !item.name.includes('.spec.ts')) {
        files.push(fullPath);
      }
    });
    return files;
  }
}
```

- [ ] **Step 3: 创建 doc-sync.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface Endpoint {
  method: string;
  path: string;
  description: string;
}

@Injectable()
export class DocSyncService {
  async syncDocs(): Promise<string> {
    const controllerPath = path.join(__dirname, '..', '..');
    const docPath = path.join(__dirname, '..', '..', '..', '..', 'TEST_DOCUMENTATION.md');

    const controllers = this.findControllers(controllerPath);
    const endpoints = this.extractEndpoints(controllers);
    const newSection = this.generateEndpointsSection(endpoints);

    let doc = fs.readFileSync(docPath, 'utf-8');

    // Replace existing auto-generated section or append
    const sectionMarker = '## Auto-generated Endpoints\n';
    if (doc.includes(sectionMarker)) {
      const start = doc.indexOf(sectionMarker);
      const end = doc.indexOf('\n## ', start + sectionMarker.length);
      doc = doc.substring(0, start) + newSection + doc.substring(end);
    } else {
      doc += '\n\n' + newSection;
    }

    fs.writeFileSync(docPath, doc);
    return `Synced ${endpoints.length} endpoints to documentation`;
  }

  private findControllers(dir: string): string[] {
    const controllers: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });

    items.forEach((item) => {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory() && !item.name.includes('node_modules') && !item.name.startsWith('.')) {
        controllers.push(...this.findControllers(fullPath));
      } else if (item.name.endsWith('.controller.ts')) {
        controllers.push(fullPath);
      }
    });

    return controllers;
  }

  private extractEndpoints(controllers: string[]): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const methodRegex = /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    controllers.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      let match;
      while ((match = methodRegex.exec(content)) !== null) {
        const [, method, route] = match;
        // Find controller base path
        const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]\)/);
        const basePath = controllerMatch ? controllerMatch[1] : '';
        endpoints.push({
          method: method.toUpperCase(),
          path: basePath + route,
          description: 'Auto-generated endpoint',
        });
      }
    });

    return endpoints;
  }

  private generateEndpointsSection(endpoints: Endpoint[]): string {
    const rows = endpoints.map((ep) => `| ${ep.method} | ${ep.path} | ${ep.description} |`).join('\n');
    return `## Auto-generated Endpoints

**Auto-updated:** ${new Date().toISOString()}

| Method | Path | Description |
|--------|------|-------------|
${rows}
`;
  }
}
```

---

### Task 10: 添加 Modernizer 到 AppModule

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: 添加 ModernizerModule**

```typescript
import { ModernizerModule } from './modernizer/modernizer.module';

@Module({
  imports: [
    // ... existing imports
    ModernizerModule,
  ],
})
export class AppModule {}
```

---

### Task 11: 添加 npm scripts

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: 添加 modernizer scripts**

Add to `scripts`:
```json
"modernizer:analyze": "ts-node -e \"const { AnalyzeService } = require('./src/modernizer/analyze.service'); console.log(new AnalyzeService().analyze())\"",
"modernizer:sync-docs": "ts-node -e \"const { DocSyncService } = require('./src/modernizer/doc-sync.service'); new DocSyncService().syncDocs().then(r => console.log(r))\""
```

Or create CLI entry points for better handling:

---

## 验收测试

- [ ] `npx ts-node src/cli/index.ts crud User --dry-run` 预览生成内容
- [ ] `npx ts-node src/cli/index.ts crud User` 生成完整 User 模块
- [ ] Backlog API 测试 (GET /backlog/tasks, POST /backlog/sprints 等)
- [ ] `npm run modernizer:analyze` 输出代码质量报告
- [ ] 数据库迁移成功执行
