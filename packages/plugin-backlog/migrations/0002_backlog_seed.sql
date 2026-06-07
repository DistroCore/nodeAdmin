-- Backlog plugin: register its permission codes into the RBAC catalog and its sidebar menu.
-- The codes are declared in nodeadmin-plugin.json (contributes.permissions); this seeds the rows.
INSERT INTO permissions (id, code, name, module, description) VALUES
  ('perm-backlog-view', 'backlog:view', 'View Backlog', 'backlog', 'View tasks and sprints'),
  ('perm-backlog-manage', 'backlog:manage', 'Manage Backlog', 'backlog', 'Create, edit and delete tasks and sprints')
ON CONFLICT (code) DO NOTHING;

INSERT INTO menus (id, parent_id, name, path, icon, sort_order, permission_code, is_visible)
VALUES (
  'menu-backlog',
  'menu-group-devtools',
  '需求管理',
  '/plugins/backlog',
  'list',
  2,
  'backlog:view',
  true
)
ON CONFLICT DO NOTHING;
