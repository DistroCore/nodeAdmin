-- Ensure the built-in IM menu is available in dynamic menus.
-- Existing RBAC seeds created menu-im but never populated role_menus,
-- which keeps /api/v1/menus/user/:userId from returning the IM entry.
-- Also bind ALL menus to admin/super-admin roles, since the original
-- seeds never populated role_menus for any menu item.

INSERT INTO menus (id, parent_id, name, path, icon, sort_order, permission_code, is_visible)
VALUES (
  'menu-im',
  'menu-group-overview',
  'nav.im',
  '/im',
  'chat',
  1,
  'im:view',
  1
)
ON CONFLICT (id) DO UPDATE
SET parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    permission_code = EXCLUDED.permission_code,
    is_visible = EXCLUDED.is_visible;

-- Bind ALL menus to admin and super-admin roles (not just IM).
-- The original seed data created menus but never populated role_menus,
-- so the dynamic menu API returned nothing until this fix.
INSERT INTO role_menus (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menus m
WHERE r.tenant_id = 'default'
  AND r.name IN ('super-admin', 'admin')
ON CONFLICT DO NOTHING;

-- Also bind IM to viewer role (read-only access).
INSERT INTO role_menus (role_id, menu_id)
SELECT r.id, 'menu-im'
FROM roles r
WHERE r.tenant_id = 'default'
  AND r.name = 'viewer'
ON CONFLICT DO NOTHING;
