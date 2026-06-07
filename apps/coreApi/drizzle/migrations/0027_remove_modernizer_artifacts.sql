-- The modernizer feature was downsized from a product page to a dev CLI (apps/coreApi/tools/modernizer)
-- per docs/architecture/coreVsPluginBoundary.md. Its frontend route, module and shared types were
-- already removed, but the seeded sidebar menu (/modernizer) and RBAC permission (modernizer:view)
-- lingered as dead data — a menu pointing at a non-existent route and a permission no code reads.
-- Remove all of it, respecting foreign keys (grants first, then the rows they reference).

DELETE FROM role_menus WHERE menu_id = 'menu-modernizer';
DELETE FROM menus WHERE id = 'menu-modernizer';

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'modernizer:view');
DELETE FROM permissions WHERE code = 'modernizer:view';
