-- Plugin menus are provisioned from a plugin manifest's contributes.menus and must be hidden when
-- the plugin is disabled and removed when it is uninstalled. The sidebar already filters menu items
-- by `menu.plugin_code` against the tenant's enabled plugins, but the column never existed, so the
-- filter was a no-op. Add the column and back-fill the backlog plugin's seeded menu so it joins the
-- lifecycle-managed set.
ALTER TABLE menus ADD COLUMN IF NOT EXISTS plugin_code varchar(128);

CREATE INDEX IF NOT EXISTS menus_plugin_code_idx ON menus (plugin_code);

UPDATE menus
SET plugin_code = '@nodeadmin/plugin-backlog'
WHERE id = 'menu-backlog' AND plugin_code IS NULL;
