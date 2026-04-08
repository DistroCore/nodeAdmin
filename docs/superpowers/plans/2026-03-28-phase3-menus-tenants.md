# Phase 3: 菜单 + 租户管理模块 实施计划

> **Status (2026-04-08 update): COMPLETED.** menus 和 tenants 两个 NestJS 模块
> 均已落地，菜单树 CRUD + 角色-菜单关联 + 用户可见菜单 CTE 查询齐全，见
> `apps/coreApi/src/modules/menus/` 和 `apps/coreApi/src/modules/tenants/`。
> 本文档作为模块结构和 CTE 查询设计的参考保留。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现菜单树 CRUD + 角色关联菜单 + 用户可见菜单查询，以及租户 CRUD。

**Architecture:** 在 coreApi 的 modules/ 下新增 menus、tenants 两个 NestJS 模块，复用 pg.Pool 直连模式。

**Tech Stack:** NestJS 11, pg.Pool, PostgreSQL, class-validator

---

### Task 1: 创建 MenusModule

**Files:**

- Create: `apps/coreApi/src/modules/menus/menusModule.ts`
- Create: `apps/coreApi/src/modules/menus/menusController.ts`
- Create: `apps/coreApi/src/modules/menus/menusService.ts`
- Create: `apps/coreApi/src/modules/menus/dto/createMenuDto.ts`
- Create: `apps/coreApi/src/modules/menus/dto/updateMenuDto.ts`
- Create: `apps/coreApi/src/modules/menus/dto/setRoleMenusDto.ts`

createMenuDto.ts:

```typescript
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';

export class CreateMenuDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  parentId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  path?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  icon?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  permissionCode?: string;

  @IsOptional()
  isVisible?: boolean;
}
```

updateMenuDto.ts:

```typescript
import { IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';

export class UpdateMenuDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  parentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  path?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  icon?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  permissionCode?: string;

  @IsOptional()
  isVisible?: boolean;
}
```

setRoleMenusDto.ts:

```typescript
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class SetRoleMenusDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  menuIds!: string[];
}
```

menusService.ts — 菜单树 + 角色关联 + 用户可见菜单:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export interface MenuItem {
  id: string;
  parentId: string | null;
  name: string;
  path: string | null;
  icon: string | null;
  sortOrder: number;
  permissionCode: string | null;
  isVisible: boolean;
  createdAt: Date;
  children?: MenuItem[];
}

@Injectable()
export class MenusService {
  private readonly logger = new Logger(MenusService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async findAll(): Promise<MenuItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at FROM menus ORDER BY sort_order, created_at'
    );
    return this.buildTree(result.rows);
  }

  async findById(id: string): Promise<MenuItem> {
    if (!this.pool) throw new NotFoundException('Menu not found');
    const result = await this.pool.query(
      'SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at FROM menus WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundException('Menu not found');
    return result.rows[0];
  }

  async create(data: {
    parentId?: string;
    name: string;
    path?: string;
    icon?: string;
    sortOrder?: number;
    permissionCode?: string;
    isVisible?: boolean;
  }) {
    if (!this.pool) throw new Error('Database not available');
    const id = `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.pool.query(
      'INSERT INTO menus (id, parent_id, name, path, icon, sort_order, permission_code, is_visible) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        id,
        data.parentId ?? null,
        data.name,
        data.path ?? null,
        data.icon ?? null,
        data.sortOrder ?? 0,
        data.permissionCode ?? null,
        data.isVisible !== false,
      ]
    );
    return this.findById(id);
  }

  async update(
    id: string,
    data: {
      parentId?: string;
      name?: string;
      path?: string;
      icon?: string;
      sortOrder?: number;
      permissionCode?: string;
      isVisible?: boolean;
    }
  ) {
    if (!this.pool) throw new Error('Database not available');
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.parentId !== undefined) {
      sets.push(`parent_id = $${++idx}`);
      params.push(data.parentId);
    }
    if (data.name !== undefined) {
      sets.push(`name = $${++idx}`);
      params.push(data.name);
    }
    if (data.path !== undefined) {
      sets.push(`path = $${++idx}`);
      params.push(data.path);
    }
    if (data.icon !== undefined) {
      sets.push(`icon = $${++idx}`);
      params.push(data.icon);
    }
    if (data.sortOrder !== undefined) {
      sets.push(`sort_order = $${++idx}`);
      params.push(data.sortOrder);
    }
    if (data.permissionCode !== undefined) {
      sets.push(`permission_code = $${++idx}`);
      params.push(data.permissionCode);
    }
    if (data.isVisible !== undefined) {
      sets.push(`is_visible = $${++idx}`);
      params.push(data.isVisible);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    await this.pool.query(`UPDATE menus SET ${sets.join(', ')} WHERE id = $${idx + 1}`, params);
    return this.findById(id);
  }

  async remove(id: string) {
    if (!this.pool) throw new Error('Database not available');
    // Remove role associations first
    await this.pool.query('DELETE FROM role_menus WHERE menu_id = $1', [id]);
    // Recursively delete children
    const children = await this.pool.query('SELECT id FROM menus WHERE parent_id = $1', [id]);
    for (const child of children.rows) {
      await this.remove(child.id);
    }
    const result = await this.pool.query('DELETE FROM menus WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new NotFoundException('Menu not found');
  }

  async getRoleMenus(roleId: string): Promise<string[]> {
    if (!this.pool) return [];
    const result = await this.pool.query('SELECT menu_id FROM role_menus WHERE role_id = $1', [
      roleId,
    ]);
    return result.rows.map((r: any) => r.menu_id);
  }

  async setRoleMenus(roleId: string, menuIds: string[]) {
    if (!this.pool) throw new Error('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_menus WHERE role_id = $1', [roleId]);
      for (const menuId of menuIds) {
        await client.query('INSERT INTO role_menus (role_id, menu_id) VALUES ($1, $2)', [
          roleId,
          menuId,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getRoleMenus(roleId);
  }

  async getUserMenus(tenantId: string, userId: string): Promise<MenuItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT DISTINCT m.id, m.parent_id, m.name, m.path, m.icon, m.sort_order, m.permission_code, m.is_visible, m.created_at
       FROM menus m
       INNER JOIN role_menus rm ON rm.menu_id = m.id
       INNER JOIN user_roles ur ON ur.role_id = rm.role_id
       WHERE ur.user_id = $2 AND m.is_visible = true
       ORDER BY m.sort_order, m.created_at`,
      [tenantId, userId]
    );
    return this.buildTree(result.rows);
  }

  private buildTree(rows: any[]): MenuItem[] {
    const map = new Map<string, MenuItem>();
    const roots: MenuItem[] = [];
    for (const row of rows) {
      map.set(row.id, { ...row, children: [] });
    }
    for (const row of rows) {
      const node = map.get(row.id)!;
      if (row.parent_id && map.has(row.parent_id)) {
        map.get(row.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
```

menusController.ts:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { MenusService } from './menusService';
import { CreateMenuDto } from './dto/createMenuDto';
import { UpdateMenuDto } from './dto/updateMenuDto';
import { SetRoleMenusDto } from './dto/setRoleMenusDto';

@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  async findAll() {
    return this.menusService.findAll();
  }

  @Get('role/:roleId')
  async getRoleMenus(@Param('roleId') roleId: string) {
    return this.menusService.getRoleMenus(roleId);
  }

  @Get('user/:userId')
  async getUserMenus(@Param('userId') userId: string, @Query('tenantId') tenantId?: string) {
    return this.menusService.getUserMenus(tenantId ?? 'default', userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.menusService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateMenuDto) {
    return this.menusService.create({
      parentId: dto.parentId,
      name: dto.name,
      path: dto.path,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
      permissionCode: dto.permissionCode,
      isVisible: dto.isVisible,
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMenuDto) {
    return this.menusService.update(id, {
      parentId: dto.parentId,
      name: dto.name,
      path: dto.path,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
      permissionCode: dto.permissionCode,
      isVisible: dto.isVisible,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.menusService.remove(id);
    return { success: true };
  }

  @Put('role/:roleId')
  async setRoleMenus(@Param('roleId') roleId: string, @Body() dto: SetRoleMenusDto) {
    return this.menusService.setRoleMenus(roleId, dto.menuIds);
  }
}
```

menusModule.ts:

```typescript
import { Module } from '@nestjs/common';
import { MenusController } from './menusController';
import { MenusService } from './menusService';

@Module({
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
```

---

### Task 2: 创建 TenantsModule

**Files:**

- Create: `apps/coreApi/src/modules/tenants/tenantsModule.ts`
- Create: `apps/coreApi/src/modules/tenants/tenantsController.ts`
- Create: `apps/coreApi/src/modules/tenants/tenantsService.ts`
- Create: `apps/coreApi/src/modules/tenants/dto/createTenantDto.ts`
- Create: `apps/coreApi/src/modules/tenants/dto/updateTenantDto.ts`

createTenantDto.ts:

```typescript
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  logo?: string;

  @IsOptional()
  isActive?: boolean;
}
```

updateTenantDto.ts:

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  logo?: string;

  @IsOptional()
  isActive?: boolean;
}
```

tenantsService.ts:

```typescript
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async list() {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, name, slug, logo, is_active, config_json, created_at, updated_at FROM tenants ORDER BY created_at'
    );
    return result.rows;
  }

  async findById(id: string) {
    if (!this.pool) throw new NotFoundException('Tenant not found');
    const result = await this.pool.query(
      'SELECT id, name, slug, logo, is_active, config_json, created_at, updated_at FROM tenants WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundException('Tenant not found');
    return result.rows[0];
  }

  async create(data: { name: string; slug: string; logo?: string; isActive?: boolean }) {
    if (!this.pool) throw new Error('Database not available');

    const existing = await this.pool.query('SELECT id FROM tenants WHERE slug = $1', [data.slug]);
    if (existing.rows.length > 0) throw new ConflictException('Tenant slug already exists');

    const id = randomUUID();
    await this.pool.query(
      'INSERT INTO tenants (id, name, slug, logo, is_active, config_json) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, data.name, data.slug, data.logo ?? null, data.isActive !== false, '{}']
    );
    return this.findById(id);
  }

  async update(id: string, data: { name?: string; logo?: string; isActive?: boolean }) {
    if (!this.pool) throw new Error('Database not available');

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${++idx}`);
      params.push(data.name);
    }
    if (data.logo !== undefined) {
      sets.push(`logo = $${++idx}`);
      params.push(data.logo);
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${++idx}`);
      params.push(data.isActive);
    }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = now()`);
    params.push(id);
    const result = await this.pool.query(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${idx + 1} RETURNING id`,
      params
    );
    if (result.rows.length === 0) throw new NotFoundException('Tenant not found');
    return this.findById(id);
  }

  async remove(id: string) {
    if (!this.pool) throw new Error('Database not available');
    if (id === 'default') throw new ConflictException('Cannot delete the default tenant');
    const result = await this.pool.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new NotFoundException('Tenant not found');
  }
}
```

tenantsController.ts:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenantsService';
import { CreateTenantDto } from './dto/createTenantDto';
import { UpdateTenantDto } from './dto/updateTenantDto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async list() {
    return this.tenantsService.list();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create({
      name: dto.name,
      slug: dto.slug,
      logo: dto.logo,
      isActive: dto.isActive,
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, {
      name: dto.name,
      logo: dto.logo,
      isActive: dto.isActive,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.tenantsService.remove(id);
    return { success: true };
  }
}
```

tenantsModule.ts:

```typescript
import { Module } from '@nestjs/common';
import { TenantsController } from './tenantsController';
import { TenantsService } from './tenantsService';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
```

---

### Task 3: 注册新模块到 AppModule

修改 `apps/coreApi/src/app/appModule.ts`，在 imports 中添加 MenusModule、TenantsModule：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxPublisherService } from '../infrastructure/outbox/outboxPublisherService';
import { AuthModule } from '../modules/auth/authModule';
import { ConsoleModule } from '../modules/console/consoleModule';
import { HealthModule } from '../modules/health/healthModule';
import { ImModule } from '../modules/im/imModule';
import { MenusModule } from '../modules/menus/menusModule';
import { PermissionsModule } from '../modules/permissions/permissionsModule';
import { RolesModule } from '../modules/roles/rolesModule';
import { TenantsModule } from '../modules/tenants/tenantsModule';
import { UsersModule } from '../modules/users/usersModule';

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    HealthModule,
    AuthModule,
    ImModule,
    ConsoleModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    MenusModule,
    TenantsModule,
  ],
  providers: [OutboxPublisherService],
})
export class AppModule {}
```

---

### Task 4: 验证所有 API 端点

启动服务器后测试：

- `GET /api/v1/menus` — 返回 8 个菜单的树形结构
- `GET /api/v1/menus/role/role-super-admin` — 超级管理员的菜单
- `GET /api/v1/tenants` — 租户列表
- `POST /api/v1/tenants` — 创建租户
- `PUT /api/v1/menus/role/role-viewer` — 设置角色菜单
