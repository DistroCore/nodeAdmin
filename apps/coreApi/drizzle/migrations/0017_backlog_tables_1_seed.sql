-- Seed backlog permissions and menu
INSERT INTO permissions (id, code, name, module, description) VALUES
  ('perm-backlog-view', 'backlog:view', 'View Backlog', 'backlog', 'View tasks and sprints'),
  ('perm-backlog-manage', 'backlog:manage', 'Manage Backlog', 'backlog', 'Create, edit and delete tasks and sprints')
ON CONFLICT (code) DO NOTHING;

INSERT INTO menus (id, parent_id, name, path, icon, sort_order, permission_code, is_visible)
VALUES (
  gen_random_uuid()::text,
  NULL,
  'Backlog',
  '/backlog',
  'list',
  110,
  'backlog:view',
  1
)
ON CONFLICT DO NOTHING;
