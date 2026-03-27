-- 0016 seed: default tenant, admin roles, permissions, menus

-- Default tenant
INSERT INTO tenants (id, name, slug, is_active, config_json)
VALUES ('default', 'Default Tenant', 'default', 1, '{}')
ON CONFLICT (slug) DO NOTHING;

-- System roles
INSERT INTO roles (id, tenant_id, name, description, is_system) VALUES
  ('role-super-admin', 'default', 'super-admin', '系统超级管理员', 1),
  ('role-admin', 'default', 'admin', '租户管理员', 1),
  ('role-viewer', 'default', 'viewer', '只读用户', 1)
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
