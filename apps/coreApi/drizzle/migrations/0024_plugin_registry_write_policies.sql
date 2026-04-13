DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plugin_registry'
      AND policyname = 'plugin_registry_public_read'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plugin_registry'
      AND policyname = 'plugin_registry_read'
  ) THEN
    ALTER POLICY plugin_registry_public_read ON plugin_registry RENAME TO plugin_registry_read;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plugin_registry'
      AND policyname = 'plugin_registry_write'
  ) THEN
    CREATE POLICY plugin_registry_write
      ON plugin_registry
      FOR INSERT
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plugin_registry'
      AND policyname = 'plugin_registry_update'
  ) THEN
    CREATE POLICY plugin_registry_update
      ON plugin_registry
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plugin_versions'
      AND policyname = 'plugin_versions_write'
  ) THEN
    CREATE POLICY plugin_versions_write
      ON plugin_versions
      FOR INSERT
      WITH CHECK (true);
  END IF;
END
$$;
