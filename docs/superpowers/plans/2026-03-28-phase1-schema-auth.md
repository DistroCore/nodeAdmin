# Phase 1: 数据库 Schema + 认证系统 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 P0 所需的数据库表，并实现邮箱密码登录/注册/密码重置的完整认证流程。

**Architecture:** 在现有 CoreApi (NestJS + Drizzle + PostgreSQL) 基础上，扩展 schema.ts 新增 users/roles/permissions/tenants 等表，扩展 AuthModule 支持正式认证，用 bcrypt 加密密码，JWT 双 token 机制不变。

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, bcrypt, jsonwebtoken, class-validator

---

## File Structure

```
apps/coreApi/
  src/
    infrastructure/database/
      schema.ts                    ← MODIFY: 新增 users, roles, permissions, tenants 等表定义
    modules/auth/
      authModule.ts                ← MODIFY: 注册 DatabaseService, UsersController
      authController.ts            ← MODIFY: 新增 login/register/refresh/password-reset 端点
      authService.ts               ← MODIFY: 新增密码验证、用户查找、token 刷新逻辑
      authIdentity.ts              ← KEEP: 不变
      dto/
        issueDevTokenDto.ts        ← KEEP: 不变
        registerDto.ts             ← CREATE: 注册请求 DTO
        loginDto.ts                ← CREATE: 登录请求 DTO
        refreshTokenDto.ts         ← CREATE: 刷新 token DTO
        resetPasswordDto.ts        ← CREATE: 密码重置 DTO
    app/
      runtimeConfig.ts             ← MODIFY: 新增 bcrypt rounds 配置
  .env.example                     ← MODIFY: 新增环境变量说明
  drizzle/migrations/
    0016_rbac_tables.sql           ← CREATE: 新增所有 RBAC 相关表
    0016_rbac_tables_seed.sql      ← CREATE: 种子数据（默认租户、管理员角色、权限列表）
```

---

### Task 1: 新增 Drizzle Schema 定义

**Files:**
- Modify: `apps/coreApi/src/infrastructure/database/schema.ts`

- [ ] **Step 1: 在 schema.ts 末尾追加所有新表定义**

在文件末尾（`auditLogs` 表之后）添加以下表定义：

```typescript
// ─── RBAC / Admin Platform Tables ────────────────────────────────

export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  logo: varchar('logo', { length: 500 }),
  isActive: integer('is_active').$type<boolean>().default(1).notNull(),
  configJson: text('config_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  tenantId: varchar('tenant_id', { length: 128 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  avatar: varchar('avatar', { length: 500 }),
  isActive: integer('is_active').$type<boolean>().default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  usersTenantEmailUnique: uniqueIndex('users_tenant_email_uniq').on(table.tenantId, table.email),
  usersTenantIdx: index('users_tenant_idx').on(table.tenantId),
}));

export const roles = pgTable('roles', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  tenantId: varchar('tenant_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystem: integer('is_system').$type<boolean>().default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  rolesTenantNameUnique: uniqueIndex('roles_tenant_name_uniq').on(table.tenantId, table.name),
  rolesTenantIdx: index('roles_tenant_idx').on(table.tenantId),
}));

export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  code: varchar('code', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  module: varchar('module', { length: 50 }).notNull(),
  description: text('description'),
});

export const userRoles = pgTable('user_roles', {
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  roleId: varchar('role_id', { length: 128 }).notNull().references(() => roles.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId], name: 'user_roles_pk' }),
}));

export const rolePermissions = pgTable('role_permissions', {
  roleId: varchar('role_id', { length: 128 }).notNull().references(() => roles.id),
  permissionId: varchar('permission_id', { length: 128 }).notNull().references(() => permissions.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.permissionId], name: 'role_permissions_pk' }),
}));

export const menus = pgTable('menus', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  parentId: varchar('parent_id', { length: 128 }),
  name: varchar('name', { length: 100 }).notNull(),
  path: varchar('path', { length: 200 }),
  icon: varchar('icon', { length: 100 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  permissionCode: varchar('permission_code', { length: 100 }),
  isVisible: integer('is_visible').$type<boolean>().default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  menusParentIdx: index('menus_parent_idx').on(table.parentId),
}));

export const roleMenus = pgTable('role_menus', {
  roleId: varchar('role_id', { length: 128 }).notNull().references(() => roles.id),
  menuId: varchar('menu_id', { length: 128 }).notNull().references(() => menus.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.menuId], name: 'role_menus_pk' }),
}));

export const oauthAccounts = pgTable('oauth_accounts', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  oauthProviderUnique: uniqueIndex('oauth_provider_uniq').on(table.provider, table.providerId),
}));

export const smsCodes = pgTable('sms_codes', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  phone: varchar('phone', { length: 20 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  smsPhoneIdx: index('sms_phone_idx').on(table.phone, table.createdAt),
}));
```

注意：需要在文件顶部 import 中添加 `randomUUID` 和 `uniqueIndex`：
```typescript
import { randomUUID } from 'node:crypto';
```
并确保 `uniqueIndex` 已在 drizzle-orm/pg-core 的导入中。

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd /home/hahage/Code/nodeAdmin && npx tsc --noEmit -p apps/coreApi/tsconfig.json 2>&1 | head -20`
Expected: 无 schema 相关错误

- [ ] **Step 3: Commit**

```bash
git add apps/coreApi/src/infrastructure/database/schema.ts
git commit -m "feat(schema): add RBAC tables (users, roles, permissions, tenants, menus, oauth, sms)"
```

---

### Task 2: 创建数据库迁移 SQL

**Files:**
- Create: `apps/coreApi/drizzle/migrations/0016_rbac_tables.sql`
- Create: `apps/coreApi/drizzle/migrations/0016_rbac_tables_seed.sql`

- [ ] **Step 1: 创建建表迁移**

创建 `apps/coreApi/drizzle/migrations/0016_rbac_tables.sql`:

```sql
-- 0016: RBAC / Admin Platform Tables

-- tenants
CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  logo VARCHAR(500),
  is_active INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar VARCHAR(500),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_uniq ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

-- roles
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_name_uniq ON roles (tenant_id, name);
CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles (tenant_id);

-- permissions
CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  module VARCHAR(50) NOT NULL,
  description TEXT
);

-- user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(128) NOT NULL REFERENCES users(id),
  role_id VARCHAR(128) NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

-- role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(128) NOT NULL REFERENCES roles(id),
  permission_id VARCHAR(128) NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

-- menus
CREATE TABLE IF NOT EXISTS menus (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id VARCHAR(128),
  name VARCHAR(100) NOT NULL,
  path VARCHAR(200),
  icon VARCHAR(100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  permission_code VARCHAR(100),
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menus_parent_idx ON menus (parent_id);

-- role_menus
CREATE TABLE IF NOT EXISTS role_menus (
  role_id VARCHAR(128) NOT NULL REFERENCES roles(id),
  menu_id VARCHAR(128) NOT NULL REFERENCES menus(id),
  PRIMARY KEY (role_id, menu_id)
);

-- oauth_accounts
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id),
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_provider_uniq ON oauth_accounts (provider, provider_id);

-- sms_codes
CREATE TABLE IF NOT EXISTS sms_codes (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_phone_idx ON sms_codes (phone, created_at);
```

- [ ] **Step 2: 创建种子数据迁移**

创建 `apps/coreApi/drizzle/migrations/0016_rbac_tables_seed.sql`:

```sql
-- 0016 seed: default tenant, admin role, permissions

-- Default tenant
INSERT INTO tenants (id, name, slug, is_active, config_json)
VALUES ('default', 'Default Tenant', 'default', 1, '{}')
ON CONFLICT (slug) DO NOTHING;

-- System admin role
INSERT INTO roles (id, tenant_id, name, description, is_system)
VALUES ('role-super-admin', 'default', 'super-admin', '系统超级管理员', 1)
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, tenant_id, name, description, is_system)
VALUES ('role-admin', 'default', 'admin', '租户管理员', 1)
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, tenant_id, name, description, is_system)
VALUES ('role-viewer', 'default', 'viewer', '只读用户', 1)
ON CONFLICT DO NOTHING;

-- Permissions
INSERT INTO permissions (id, code, name, module, description) VALUES
  ('perm-overview-view', 'overview:view', '查看概览', 'overview', NULL),
  ('perm-im-view', 'im:view', '查看即时通讯', 'im', NULL),
  ('perm-im-send', 'im:send', '发送消息', 'im', NULL),
  ('perm-user-view', 'user:view', '查看用户', 'user', NULL),
  ('perm-user-create', 'user:create', '创建用户', 'user', NULL),
  ('perm-user-update', 'user:update', '编辑用户', 'user', NULL),
  ('perm-user-delete', 'user:delete', '删除用户', 'user', NULL),
  ('perm-role-view', 'role:view', '查看角色', 'role', NULL),
  ('perm-role-create', 'role:create', '创建角色', 'role', NULL),
  ('perm-role-update', 'role:update', '编辑角色', 'role', NULL),
  ('perm-role-delete', 'role:delete', '删除角色', 'role', NULL),
  ('perm-menu-view', 'menu:view', '查看菜单', 'menu', NULL),
  ('perm-menu-manage', 'menu:manage', '管理菜单', 'menu', NULL),
  ('perm-tenant-view', 'tenant:view', '查看租户', 'tenant', NULL),
  ('perm-tenant-manage', 'tenant:manage', '管理租户', 'tenant', NULL),
  ('perm-release-view', 'release:view', '查看发布', 'release', NULL),
  ('perm-settings-view', 'settings:view', '查看设置', 'settings', NULL),
  ('perm-audit-view', 'audit:view', '查看审计日志', 'audit', NULL)
ON CONFLICT (code) DO NOTHING;

-- super-admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-super-admin', id FROM permissions
ON CONFLICT DO NOTHING;

-- admin gets all except tenant:manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-admin', id FROM permissions WHERE code != 'tenant:manage'
ON CONFLICT DO NOTHING;

-- viewer gets view-only permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-viewer', id FROM permissions WHERE code LIKE '%:view'
ON CONFLICT DO NOTHING;

-- Default menus
INSERT INTO menus (id, name, path, icon, sort_order, permission_code, is_visible) VALUES
  ('menu-overview', '概览', '/overview', 'bar', 0, 'overview:view', 1),
  ('menu-im', '即时通讯', '/im', 'chat', 1, 'im:view', 1),
  ('menu-users', '用户管理', '/users', 'users', 2, 'user:view', 1),
  ('menu-roles', '角色管理', '/roles', 'shield', 3, 'role:view', 1),
  ('menu-menus', '菜单管理', '/menus', 'menu', 4, 'menu:view', 1),
  ('menu-tenants', '租户管理', '/tenants', 'building', 5, 'tenant:view', 1),
  ('menu-release', '发布控制', '/release', 'rocket', 6, 'release:view', 1),
  ('menu-settings', '系统设置', '/settings', 'gear', 7, 'settings:view', 1)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Commit**

```bash
git add apps/coreApi/drizzle/migrations/
git commit -m "feat(db): add RBAC migration and seed data"
```

---

### Task 3: 安装 bcrypt 依赖

**Files:**
- Modify: `apps/coreApi/package.json`

- [ ] **Step 1: 安装 bcryptjs 和类型定义**

Run: `cd /home/hahage/Code/nodeAdmin && npm install bcryptjs --workspace=coreApi && npm install -D @types/bcryptjs --workspace=coreApi`

- [ ] **Step 2: Commit**

```bash
git add apps/coreApi/package.json package-lock.json
git commit -m "chore: add bcryptjs dependency for password hashing"
```

---

### Task 4: 创建 Auth DTOs

**Files:**
- Create: `apps/coreApi/src/modules/auth/dto/registerDto.ts`
- Create: `apps/coreApi/src/modules/auth/dto/loginDto.ts`
- Create: `apps/coreApi/src/modules/auth/dto/refreshTokenDto.ts`
- Create: `apps/coreApi/src/modules/auth/dto/resetPasswordDto.ts`

- [ ] **Step 1: 创建 registerDto.ts**

```typescript
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
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
  @MaxLength(128)
  tenantId!: string;
}
```

- [ ] **Step 2: 创建 loginDto.ts**

```typescript
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  tenantId!: string;
}
```

- [ ] **Step 3: 创建 refreshTokenDto.ts**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
```

- [ ] **Step 4: 创建 resetPasswordDto.ts**

```typescript
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/coreApi/src/modules/auth/dto/
git commit -m "feat(auth): add login, register, refresh, reset-password DTOs"
```

---

### Task 5: 扩展 AuthService 支持密码认证

**Files:**
- Modify: `apps/coreApi/src/modules/auth/authService.ts`

- [ ] **Step 1: 扩展 AuthService**

替换 `apps/coreApi/src/modules/auth/authService.ts` 的全部内容为：

```typescript
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { Pool } from 'pg';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuthIdentity } from './authIdentity';

interface AccessTokenClaims {
  jti: string;
  roles: string[];
  sub: string;
  tid: string;
  type: 'access';
}

interface RefreshTokenClaims {
  jti: string;
  sub: string;
  tid: string;
  type: 'refresh';
}

interface IssueTokensInput {
  roles: string[];
  tenantId: string;
  userId: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  is_active: number;
}

interface RoleRow {
  name: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
      this.logger.warn('DATABASE_URL is not set. Database auth is disabled.');
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  issueTokens(input: IssueTokensInput): IssuedTokens {
    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();
    const roles = this.normalizeRoles(input.roles);

    const accessToken = sign(
      { jti: accessTokenJti, roles, sub: input.userId, tid: input.tenantId, type: 'access' } satisfies AccessTokenClaims,
      runtimeConfig.auth.accessSecret,
      { expiresIn: runtimeConfig.auth.accessExpiresIn as StringValue }
    );

    const refreshToken = sign(
      { jti: refreshTokenJti, sub: input.userId, tid: input.tenantId, type: 'refresh' } satisfies RefreshTokenClaims,
      runtimeConfig.auth.refreshSecret,
      { expiresIn: runtimeConfig.auth.refreshExpiresIn as StringValue }
    );

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  verifyAccessToken(token: string): AuthIdentity {
    let decoded: unknown;
    try {
      decoded = verify(token, runtimeConfig.auth.accessSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (!decoded || typeof decoded !== 'object') {
      throw new UnauthorizedException('Invalid access token payload.');
    }

    const payload = decoded as Partial<AccessTokenClaims>;
    const userId = this.normalizeString(payload.sub);
    const tenantId = this.normalizeString(payload.tid);
    const jti = this.normalizeString(payload.jti);
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role) => typeof role === 'string')
      : [];
    const tokenType = payload.type;

    if (!userId || !tenantId || !jti || tokenType !== 'access') {
      throw new UnauthorizedException('Malformed access token payload.');
    }

    return { jti, roles, tenantId, userId };
  }

  async register(email: string, password: string, tenantId: string, name?: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const existing = await this.pool.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email]
    );
    if (existing.rows.length > 0) {
      throw new UnauthorizedException('Email already registered in this tenant.');
    }

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

      // Assign viewer role by default
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE tenant_id = $2 AND name = 'viewer' LIMIT 1`,
        [userId, tenantId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const roles = await this.getUserRoles(userId, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId });
    return { userId, tokens };
  }

  async login(email: string, password: string, tenantId: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const result = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, is_active FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email]
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const passwordValid = await compare(password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const roles = await this.getUserRoles(user.id, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId: user.id });
    return { userId: user.id, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<IssuedTokens> {
    let decoded: unknown;
    try {
      decoded = verify(refreshToken, runtimeConfig.auth.refreshSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (!decoded || typeof decoded !== 'object') {
      throw new UnauthorizedException('Invalid refresh token payload.');
    }

    const payload = decoded as Partial<RefreshTokenClaims>;
    const userId = this.normalizeString(payload.sub);
    const tenantId = this.normalizeString(payload.tid);

    if (!userId || !tenantId || payload.type !== 'refresh') {
      throw new UnauthorizedException('Malformed refresh token.');
    }

    const roles = await this.getUserRoles(userId, tenantId);
    return this.issueTokens({ roles, tenantId, userId });
  }

  private async getUserRoles(userId: string, tenantId: string): Promise<string[]> {
    if (!this.pool) return [];

    const result = await this.pool.query<RoleRow>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rows.map((row) => row.name);
  }

  private normalizeRoles(roles: string[]): string[] {
    const roleSet = new Set<string>();
    for (const role of roles) {
      if (typeof role !== 'string') continue;
      const normalizedRole = role.trim();
      if (normalizedRole.length > 0) roleSet.add(normalizedRole);
    }
    return [...roleSet];
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /home/hahage/Code/nodeAdmin && npx tsc --noEmit -p apps/coreApi/tsconfig.json 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/coreApi/src/modules/auth/authService.ts
git commit -m "feat(auth): add register, login, refresh-tokens with bcrypt password verification"
```

---

### Task 6: 扩展 AuthController 新增端点

**Files:**
- Modify: `apps/coreApi/src/modules/auth/authController.ts`

- [ ] **Step 1: 替换 authController.ts**

```typescript
import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { AuthService } from './authService';
import { IssueDevTokenDto } from './dto/issueDevTokenDto';
import { LoginDto } from './dto/loginDto';
import { RefreshTokenDto } from './dto/refreshTokenDto';
import { RegisterDto } from './dto/registerDto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const { userId, tokens } = await this.authService.register(
      dto.email,
      dto.password,
      dto.tenantId,
      dto.name
    );

    return {
      identity: { userId, tenantId: dto.tenantId },
      ...tokens,
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const { userId, tokens } = await this.authService.login(
      dto.email,
      dto.password,
      dto.tenantId
    );

    try {
      await this.auditLogService.record({
        action: 'auth.login',
        targetId: userId,
        targetType: 'user',
        tenantId: dto.tenantId,
        traceId: tokens.accessToken.slice(0, 12),
        userId,
      });
    } catch {
      // Don't block login if audit fails
    }

    return {
      identity: { userId, tenantId: dto.tenantId },
      ...tokens,
    };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshTokens(dto.refreshToken);
    return tokens;
  }

  @Post('dev-token')
  async issueDevToken(@Body() payload: IssueDevTokenDto) {
    if (!runtimeConfig.auth.enableDevTokenIssue) {
      throw new ForbiddenException('Dev token issuance is disabled.');
    }

    const roles = payload.roles ?? ['super-admin'];
    const tokens = this.authService.issueTokens({
      roles,
      tenantId: payload.tenantId,
      userId: payload.userId,
    });

    return {
      identity: { roles, tenantId: payload.tenantId, userId: payload.userId },
      ...tokens,
    };
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /home/hahage/Code/nodeAdmin && npx tsc --noEmit -p apps/coreApi/tsconfig.json 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/coreApi/src/modules/auth/authController.ts
git commit -m "feat(auth): add register, login, refresh endpoints"
```

---

### Task 7: 执行迁移并验证

- [ ] **Step 1: 启动 PostgreSQL (docker compose)**

Run: `cd /home/hahage/Code/nodeAdmin && npm run infra:up`

- [ ] **Step 2: 执行迁移**

Run: `cd /home/hahage/Code/nodeAdmin && npm run db:migrate`

然后手动执行种子数据：
Run: `PGPASSWORD=nodeadmin psql -h localhost -p 55432 -U nodeadmin -d nodeadmin -f apps/coreApi/drizzle/migrations/0016_rbac_tables.sql`
Run: `PGPASSWORD=nodeadmin psql -h localhost -p 55432 -U nodeadmin -d nodeadmin -f apps/coreApi/drizzle/migrations/0016_rbac_tables_seed.sql`

- [ ] **Step 3: 验证表和数据**

Run: `PGPASSWORD=nodeadmin psql -h localhost -p 55432 -U nodeadmin -d nodeadmin -c "\dt"`
Expected: 看到 tenants, users, roles, permissions, user_roles, role_permissions, menus, role_menus, oauth_accounts, sms_codes 表

Run: `PGPASSWORD=nodeadmin psql -h localhost -p 55432 -U nodeadmin -d nodeadmin -c "SELECT code FROM permissions ORDER BY code;"`
Expected: 看到 18 条权限记录

- [ ] **Step 4: 启动 API 测试认证流程**

Run: `cd /home/hahage/Code/nodeAdmin && npm run dev:api`

测试注册：
Run: `curl -X POST http://localhost:11451/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"admin@test.com","password":"Test1234","tenantId":"default","name":"Admin User"}'`
Expected: 返回 accessToken, refreshToken, identity

测试登录：
Run: `curl -X POST http://localhost:11451/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@test.com","password":"Test1234","tenantId":"default"}'`
Expected: 返回 accessToken, refreshToken

测试刷新：
Run: 使用上一步的 refreshToken:
`curl -X POST http://localhost:11451/api/v1/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"<token>"}'`
Expected: 返回新的 accessToken, refreshToken

- [ ] **Step 5: Commit (如有调整)**

```bash
git add -A
git commit -m "feat(auth): phase 1 complete - schema, migration, auth endpoints working"
```
