-- Backlog became a plugin served at /plugins/backlog. The legacy core seed left menu-backlog pointing
-- at the now-dead /backlog route, and the develop i18n rename set its name to the key `nav.backlog`,
-- which this refactor removed (so the sidebar rendered the raw key). Repath it to the plugin route and
-- give it a literal label so the DB-driven sidebar shows a working entry.
UPDATE menus
SET path = '/plugins/backlog', name = '需求管理'
WHERE id = 'menu-backlog';
