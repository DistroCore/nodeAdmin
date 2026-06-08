-- Backlog plugin: grant its permission codes to the default roles.
-- The codes are seeded into `permissions` by 0002, but no role grant existed — core's 0016 "grant
-- role-admin everything" ran before the plugin perms were inserted, so a pure DB-driven permission
-- check denied backlog to everyone. These grants make the plugin's RBAC self-contained in the DB and
-- mirror the behaviour the hardcoded frontend map used to provide (admin/super-admin manage; viewer
-- view-only).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.id
FROM (VALUES
  ('role-admin', 'backlog:view'),
  ('role-admin', 'backlog:manage'),
  ('role-super-admin', 'backlog:view'),
  ('role-super-admin', 'backlog:manage'),
  ('role-viewer', 'backlog:view')
) AS r(role_id, code)
JOIN permissions p ON p.code = r.code
ON CONFLICT DO NOTHING;
