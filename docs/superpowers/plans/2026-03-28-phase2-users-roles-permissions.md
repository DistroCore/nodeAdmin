# Phase 2: 用户/角色/权限管理模块 实施计划

> **Status (2026-04-08 update): COMPLETED.** users / roles / permissions 三个
> NestJS 模块均已落地，见 `apps/coreApi/src/modules/users/`、`roles/`、
> `permissions/`。本文档作为模块结构和校验规范的参考保留。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现用户 CRUD、角色 CRUD + 权限分配、权限列表 API。

**Architecture:** 在 coreApi 的 modules/ 下新增 users、roles、permissions 三个 NestJS 模块，复用 DatabaseService 的 Pool 直连模式。

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, class-validator

---

### Task 1: 创建 PermissionsModule

**Files:**

- Create: `apps/coreApi/src/modules/permissions/permissionsModule.ts`
- Create: `apps/coreApi/src/modules/permissions/permissionsController.ts`
- Create: `apps/coreApi/src/modules/permissions/permissionsService.ts`

permissionsService.ts — 查询所有权限（只读，种子数据初始化的）：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async findAll(): Promise<PermissionItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, code, name, module, description FROM permissions ORDER BY module, code'
    );
    return result.rows;
  }

  async findByModule(module: string): Promise<PermissionItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
      [module]
    );
    return result.rows;
  }
}
```

permissionsController.ts:

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { PermissionsService } from './permissionsService';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  async findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':module')
  async findByModule(@Param('module') module: string) {
    return this.permissionsService.findByModule(module);
  }
}
```

permissionsModule.ts:

```typescript
import { Module } from '@nestjs/common';
import { PermissionsController } from './permissionsController';
import { PermissionsService } from './permissionsService';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
```

---

### Task 2: 创建 UsersModule

**Files:**

- Create: `apps/coreApi/src/modules/users/usersModule.ts`
- Create: `apps/coreApi/src/modules/users/usersController.ts`
- Create: `apps/coreApi/src/modules/users/usersService.ts`
- Create: `apps/coreApi/src/modules/users/dto/createUserDto.ts`
- Create: `apps/coreApi/src/modules/users/dto/updateUserDto.ts`
- Create: `apps/coreApi/src/modules/users/dto/listUsersQueryDto.ts`

listUsersQueryDto.ts:

```typescript
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
```

createUserDto.ts:

```typescript
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsArray,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roleIds?: string[];
}
```

updateUserDto.ts:

```typescript
import { IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar?: string;

  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roleIds?: string[];
}
```

usersService.ts — 核心 CRUD:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { Pool } from 'pg';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async list(tenantId: string, page = 1, pageSize = 20, search?: string) {
    if (!this.pool) return { items: [], total: 0, page, pageSize };
    const offset = (page - 1) * pageSize;
    let whereClause = 'WHERE u.tenant_id = $1';
    const params: unknown[] = [tenantId];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
    }

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM users u ${whereClause}`,
      params
    );
    const total = countResult.rows[0].count;

    const result = await this.pool.query(
      `SELECT u.id, u.tenant_id, u.email, u.phone, u.name, u.avatar, u.is_active, u.created_at, u.updated_at,
        COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return { items: result.rows, total, page, pageSize };
  }

  async findById(tenantId: string, userId: string) {
    if (!this.pool) throw new NotFoundException('User not found');
    const result = await this.pool.query(
      `SELECT u.id, u.tenant_id, u.email, u.phone, u.name, u.avatar, u.is_active, u.created_at, u.updated_at,
        COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.tenant_id = $1 AND u.id = $2
      GROUP BY u.id`,
      [tenantId, userId]
    );
    if (result.rows.length === 0) throw new NotFoundException('User not found');
    return result.rows[0];
  }

  async create(
    tenantId: string,
    email: string,
    password: string,
    name?: string,
    roleIds?: string[]
  ) {
    if (!this.pool) throw new Error('Database not available');
    const userId = randomUUID();
    const passwordHash = await hash(password, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(
        'INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)',
        [userId, tenantId, email, passwordHash, name ?? null]
      );
      if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
            userId,
            roleId,
          ]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, userId);
  }

  async update(
    tenantId: string,
    userId: string,
    data: { name?: string; avatar?: string; isActive?: boolean; roleIds?: string[] }
  ) {
    if (!this.pool) throw new Error('Database not available');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (data.name !== undefined) {
        sets.push(`name = $${++paramIdx}`);
        params.push(data.name);
      }
      if (data.avatar !== undefined) {
        sets.push(`avatar = $${++paramIdx}`);
        params.push(data.avatar);
      }
      if (data.isActive !== undefined) {
        sets.push(`is_active = $${++paramIdx}`);
        params.push(data.isActive);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId, userId);
        await client.query(
          `UPDATE users SET ${sets.join(', ')} WHERE tenant_id = $${paramIdx + 1} AND id = $${paramIdx + 2}`,
          params
        );
      }

      if (data.roleIds !== undefined) {
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        for (const roleId of data.roleIds) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
            userId,
            roleId,
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, userId);
  }

  async remove(tenantId: string, userId: string) {
    if (!this.pool) throw new Error('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      const result = await client.query(
        'DELETE FROM users WHERE tenant_id = $1 AND id = $2 RETURNING id',
        [tenantId, userId]
      );
      await client.query('COMMIT');
      if (result.rows.length === 0) throw new NotFoundException('User not found');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

usersController.ts:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './usersService';
import { CreateUserDto } from './dto/createUserDto';
import { UpdateUserDto } from './dto/updateUserDto';
import { ListUsersQueryDto } from './dto/listUsersQueryDto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Query() query: ListUsersQueryDto) {
    const tenantId = query.tenantId ?? 'default';
    return this.usersService.list(tenantId, query.page, query.pageSize, query.search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.usersService.findById(tenantId ?? 'default', id);
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto.tenantId, dto.email, dto.password, dto.name, dto.roleIds);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Query('tenantId') tenantId?: string
  ) {
    return this.usersService.update(tenantId ?? 'default', id, {
      name: dto.name,
      avatar: dto.avatar,
      isActive: dto.isActive,
      roleIds: dto.roleIds,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.usersService.remove(tenantId ?? 'default', id);
    return { success: true };
  }
}
```

usersModule.ts:

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './usersController';
import { UsersService } from './usersService';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

---

### Task 3: 创建 RolesModule

**Files:**

- Create: `apps/coreApi/src/modules/roles/rolesModule.ts`
- Create: `apps/coreApi/src/modules/roles/rolesController.ts`
- Create: `apps/coreApi/src/modules/roles/rolesService.ts`
- Create: `apps/coreApi/src/modules/roles/dto/createRoleDto.ts`
- Create: `apps/coreApi/src/modules/roles/dto/updateRoleDto.ts`

createRoleDto.ts:

```typescript
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}
```

updateRoleDto.ts:

```typescript
import { IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}
```

rolesService.ts:

```typescript
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async list(tenantId: string) {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at,
        COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name)) FILTER (WHERE p.id IS NOT NULL), '[]') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.tenant_id = $1
      GROUP BY r.id
      ORDER BY r.created_at`,
      [tenantId]
    );
    return result.rows;
  }

  async findById(tenantId: string, roleId: string) {
    if (!this.pool) throw new NotFoundException('Role not found');
    const result = await this.pool.query(
      `SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at,
        COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name)) FILTER (WHERE p.id IS NOT NULL), '[]') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.tenant_id = $1 AND r.id = $2
      GROUP BY r.id`,
      [tenantId, roleId]
    );
    if (result.rows.length === 0) throw new NotFoundException('Role not found');
    return result.rows[0];
  }

  async create(tenantId: string, name: string, description?: string, permissionIds?: string[]) {
    if (!this.pool) throw new Error('Database not available');
    const roleId = randomUUID();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(
        'INSERT INTO roles (id, tenant_id, name, description) VALUES ($1, $2, $3, $4)',
        [roleId, tenantId, name, description ?? null]
      );
      if (permissionIds && permissionIds.length > 0) {
        for (const permId of permissionIds) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [roleId, permId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, roleId);
  }

  async update(
    tenantId: string,
    roleId: string,
    data: { name?: string; description?: string; permissionIds?: string[] }
  ) {
    if (!this.pool) throw new Error('Database not available');

    // Check not system role
    const check = await this.pool.query(
      'SELECT is_system FROM roles WHERE tenant_id = $1 AND id = $2',
      [tenantId, roleId]
    );
    if (check.rows.length === 0) throw new NotFoundException('Role not found');
    if (check.rows[0].is_system) throw new BadRequestException('Cannot modify system roles');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 0;

      if (data.name !== undefined) {
        sets.push(`name = $${++paramIdx}`);
        params.push(data.name);
      }
      if (data.description !== undefined) {
        sets.push(`description = $${++paramIdx}`);
        params.push(data.description);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId, roleId);
        await client.query(
          `UPDATE roles SET ${sets.join(', ')} WHERE tenant_id = $${paramIdx + 1} AND id = $${paramIdx + 2}`,
          params
        );
      }

      if (data.permissionIds !== undefined) {
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
        for (const permId of data.permissionIds) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [roleId, permId]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, roleId);
  }

  async remove(tenantId: string, roleId: string) {
    if (!this.pool) throw new Error('Database not available');
    const check = await this.pool.query(
      'SELECT is_system FROM roles WHERE tenant_id = $1 AND id = $2',
      [tenantId, roleId]
    );
    if (check.rows.length === 0) throw new NotFoundException('Role not found');
    if (check.rows[0].is_system) throw new BadRequestException('Cannot delete system roles');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      await client.query('DELETE FROM user_roles WHERE role_id = $1', [roleId]);
      await client.query('DELETE FROM roles WHERE tenant_id = $1 AND id = $2', [tenantId, roleId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

rolesController.ts:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RolesService } from './rolesService';
import { CreateRoleDto } from './dto/createRoleDto';
import { UpdateRoleDto } from './dto/updateRoleDto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async list(@Query('tenantId') tenantId?: string) {
    return this.rolesService.list(tenantId ?? 'default');
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.rolesService.findById(tenantId ?? 'default', id);
  }

  @Post()
  async create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto.tenantId, dto.name, dto.description, dto.permissionIds);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Query('tenantId') tenantId?: string
  ) {
    return this.rolesService.update(tenantId ?? 'default', id, {
      name: dto.name,
      description: dto.description,
      permissionIds: dto.permissionIds,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.rolesService.remove(tenantId ?? 'default', id);
    return { success: true };
  }
}
```

rolesModule.ts:

```typescript
import { Module } from '@nestjs/common';
import { RolesController } from './rolesController';
import { RolesService } from './rolesService';

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
```

---

### Task 4: 注册新模块到 AppModule

修改 `apps/coreApi/src/app/appModule.ts`，在 imports 中添加 UsersModule、RolesModule、PermissionsModule：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxPublisherService } from '../infrastructure/outbox/outboxPublisherService';
import { AuthModule } from '../modules/auth/authModule';
import { ConsoleModule } from '../modules/console/consoleModule';
import { HealthModule } from '../modules/health/healthModule';
import { ImModule } from '../modules/im/imModule';
import { PermissionsModule } from '../modules/permissions/permissionsModule';
import { RolesModule } from '../modules/roles/rolesModule';
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
  ],
  providers: [OutboxPublisherService],
})
export class AppModule {}
```

---

### Task 5: 验证所有 API 端点

启动服务器后测试：

- `GET /api/v1/permissions` — 返回 18 条权限
- `GET /api/v1/users` — 用户列表
- `GET /api/v1/roles` — 角色列表（含权限）
- `POST /api/v1/users` — 创建用户
- `PATCH /api/v1/roles/:id` — 分配权限
