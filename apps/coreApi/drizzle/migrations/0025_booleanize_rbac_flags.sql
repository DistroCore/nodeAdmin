-- 0025: Unify boolean-semantic flags to native BOOLEAN (idempotent).
--
-- The 0016 RBAC tables stored these flags as INTEGER 0/1, while the newer
-- tables (0020 tenant_plugins.enabled, 0021 plugin*.is_public) and schema.ts
-- already use native boolean. Live dev DBs are mixed (some columns were already
-- pushed to boolean from schema.ts, others remain integer). This migration
-- converts only the columns still typed `integer`, so it is safe regardless of
-- how the database was provisioned and can be re-run without error.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('tenants', 'is_active',  'true'),
      ('users',   'is_active',  'true'),
      ('roles',   'is_system',  'false'),
      ('menus',   'is_visible', 'true')
    ) AS t(tbl, col_name, bool_default)
  LOOP
    IF (
      SELECT data_type FROM information_schema.columns
      WHERE table_name = rec.tbl AND column_name = rec.col_name
    ) = 'integer' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', rec.tbl, rec.col_name);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE boolean USING (%I <> 0)', rec.tbl, rec.col_name, rec.col_name);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', rec.tbl, rec.col_name, rec.bool_default);
    END IF;
  END LOOP;
END $$;
