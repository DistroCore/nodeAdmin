# P0 后台管理中台核心功能设计

> 日期: 2026-03-28
> 状态: 待实现

## 目标

在现有 CoreApi (Drizzle + PostgreSQL) 上构建后台管理中台的 P0 核心功能，实现最小可用路径：**登录 → 用户管理 → 角色权限 → 动态菜单 → 租户管理**。

## 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 技术栈 | Apps/CoreApi (Drizzle + PostgreSQL) | 已有生产级基础设施，废弃旧 backend/ |
| 认证方式 | 邮箱密码 + 手机验证码 + OAuth | 用户要求三种都支持 |
| 权限模型 | 纯 RBAC | 角色绑定权限，用户绑定角色，简单明确 |
| 多租户 | 行级隔离 (RLS) | 现有方案，共享数据库实例 |
| 菜单系统 | 数据库驱动 | 菜单存数据库，角色关联可见菜单 |

## 数据库设计

### 新增表

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### roles
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);
```

#### permissions
```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,  -- e.g. 'user:create', 'role:delete'
  name VARCHAR(200) NOT NULL,          -- 显示名称
  module VARCHAR(50) NOT NULL,         -- 所属模块
  description TEXT
);
```

#### user_roles
```sql
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id),
  role_id UUID REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
```

#### role_permissions
```sql
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id),
  permission_id UUID REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
```

#### menus
```sql
CREATE TABLE menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES menus(id),
  name VARCHAR(100) NOT NULL,
  path VARCHAR(200),
  icon VARCHAR(100),
  sort_order INT DEFAULT 0,
  permission_code VARCHAR(100),  -- 关联 permission.code
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### role_menus
```sql
CREATE TABLE role_menus (
  role_id UUID REFERENCES roles(id),
  menu_id UUID REFERENCES menus(id),
  PRIMARY KEY (role_id, menu_id)
);
```

#### tenants
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### oauth_accounts
```sql
CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  provider VARCHAR(50) NOT NULL,    -- github, google
  provider_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, provider_id)
);
```

#### sms_codes
```sql
CREATE TABLE sms_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 后端模块设计

### 1. AuthModule (扩展现有)

现有: JWT dev-token 签发
新增:

**AuthController**
- `POST /api/v1/auth/register` — 邮箱密码注册
- `POST /api/v1/auth/login` — 邮箱密码登录
- `POST /api/v1/auth/login/sms` — 手机验证码登录
- `POST /api/v1/auth/login/oauth/:provider` — OAuth 登录/回调
- `POST /api/v1/auth/sms/send` — 发送验证码
- `POST /api/v1/auth/refresh` — 刷新 token
- `POST /api/v1/auth/password/reset` — 密码重置

**AuthService**
- 密码 bcrypt 加密
- JWT access + refresh token 双 token 机制
- 验证码生成、过期、校验 (存 Redis)
- OAuth 流程: GitHub / Google

### 2. UsersModule

**UsersController**
- `GET /api/v1/users` — 用户列表 (分页、筛选)
- `GET /api/v1/users/:id` — 用户详情
- `POST /api/v1/users` — 创建用户
- `PATCH /api/v1/users/:id` — 更新用户
- `DELETE /api/v1/users/:id` — 删除用户
- `PATCH /api/v1/users/:id/status` — 启用/禁用

**UsersService**
- CRUD、分页查询
- 密码哈希、状态切换
- 关联角色管理

### 3. RolesModule

**RolesController**
- `GET /api/v1/roles` — 角色列表
- `GET /api/v1/roles/:id` — 角色详情 (含权限)
- `POST /api/v1/roles` — 创建角色
- `PATCH /api/v1/roles` — 更新角色
- `DELETE /api/v1/roles/:id` — 删除角色
- `PUT /api/v1/roles/:id/permissions` — 设置角色权限

**RolesService**
- 角色 CRUD
- 权限分配/取消
- 系统角色保护 (不可删除)

### 4. MenusModule

**MenusController**
- `GET /api/v1/menus` — 菜单树
- `GET /api/v1/menus/user` — 当前用户可见菜单
- `POST /api/v1/menus` — 创建菜单项
- `PATCH /api/v1/menus/:id` — 更新菜单项
- `DELETE /api/v1/menus/:id` — 删除菜单项
- `PUT /api/v1/roles/:id/menus` — 设置角色菜单

**MenusService**
- 树形结构管理 (parent_id)
- 角色关联菜单
- 根据用户角色过滤可见菜单

### 5. TenantsModule

**TenantsController**
- `GET /api/v1/tenants` — 租户列表
- `GET /api/v1/tenants/:id` — 租户详情
- `POST /api/v1/tenants` — 创建租户
- `PATCH /api/v1/tenants/:id` — 更新租户
- `DELETE /api/v1/tenants/:id` — 删除租户

**TenantsService**
- 租户 CRUD
- 租户配置管理 (config JSONB)

### 6. PermissionsModule

**PermissionsController**
- `GET /api/v1/permissions` — 权限列表 (全量)

权限通过种子数据初始化，不支持动态创建，但可通过 role_permissions 分配。

## 前端页面设计

### 新增页面

| 路由 | 页面 | 权限 |
|------|------|------|
| `/login` | 登录页 | public |
| `/register` | 注册页 | public |
| `/users` | 用户管理 | `user:view` |
| `/roles` | 角色管理 | `role:view` |
| `/menus` | 菜单管理 | `menu:view` |
| `/tenants` | 租户管理 | `tenant:manage` |

### 前端改造

- 登录页替代现有 dev-token 机制
- 动态菜单: 启动时从 `/api/v1/menus/user` 获取菜单树，渲染侧边栏
- 路由守卫: 根据权限动态注册路由，无权限跳转 403
- 新增 stores: `useMenuStore`, `useUserStore`

## 实施顺序

```
Phase 1: 数据库 + 认证
  ├─ 1.1 Schema: 新增所有表 (Drizzle schema + migration)
  ├─ 1.2 Auth: 登录/注册/密码重置
  └─ 1.3 种子数据: 默认租户、管理员角色、权限列表

Phase 2: 用户 + 角色 + 权限
  ├─ 2.1 UsersModule: 用户 CRUD
  ├─ 2.2 RolesModule: 角色 CRUD + 权限分配
  └─ 2.3 PermissionsModule: 权限列表

Phase 3: 菜单 + 租户
  ├─ 3.1 MenusModule: 菜单树 CRUD + 角色关联
  ├─ 3.2 TenantsModule: 租户管理
  └─ 3.3 种子数据: 默认菜单树

Phase 4: 前端
  ├─ 4.1 登录/注册页面
  ├─ 4.2 动态菜单 + 路由守卫
  ├─ 4.3 用户管理页面
  ├─ 4.4 角色管理页面 (含权限矩阵)
  ├─ 4.5 菜单管理页面
  └─ 4.6 租户管理页面

Phase 5: 认证增强
  ├─ 5.1 手机验证码登录
  └─ 5.2 OAuth (GitHub + Google)
```

## 安全考虑

- 密码使用 bcrypt (salt rounds: 12)
- JWT access token 短有效期 (15min) + refresh token (7d)
- 验证码存 Redis，5 分钟过期，限流每手机号 1 条/分钟
- 所有管理 API 需要 JWT 认证 + 权限校验
- 系统角色 (admin) 不可删除
- 租户隔离贯穿所有 API
