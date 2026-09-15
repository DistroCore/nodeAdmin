DO $role_check$
DECLARE
  app_role_valid boolean;
  outbox_role_valid boolean;
BEGIN
  SELECT NOT rolsuper AND NOT rolbypassrls
    INTO app_role_valid
    FROM pg_roles
   WHERE rolname = 'nodeadmin_app';

  SELECT NOT rolsuper AND rolbypassrls
    INTO outbox_role_valid
    FROM pg_roles
   WHERE rolname = 'nodeadmin_outbox';

  IF app_role_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'nodeadmin_app is missing or has unsafe role attributes';
  END IF;
  IF outbox_role_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'nodeadmin_outbox is missing or has unsafe role attributes';
  END IF;
END
$role_check$;

GRANT USAGE ON SCHEMA public TO nodeadmin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nodeadmin_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nodeadmin_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nodeadmin_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nodeadmin_app;

GRANT USAGE ON SCHEMA public TO nodeadmin_outbox;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM nodeadmin_outbox;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM nodeadmin_outbox;
GRANT SELECT, UPDATE, DELETE ON TABLE outbox_events TO nodeadmin_outbox;

DO $rls_check$
DECLARE
  protected_table_count integer;
BEGIN
  SELECT COUNT(*)::integer
    INTO protected_table_count
    FROM pg_class AS table_metadata
    JOIN pg_namespace AS schema_metadata ON schema_metadata.oid = table_metadata.relnamespace
   WHERE schema_metadata.nspname = 'public'
     AND table_metadata.relname IN ('audit_logs', 'conversations', 'messages', 'outbox_events')
     AND table_metadata.relrowsecurity
     AND table_metadata.relforcerowsecurity;

  IF protected_table_count <> 4 THEN
    RAISE EXCEPTION 'expected four core tables with FORCE RLS, found %', protected_table_count;
  END IF;
END
$rls_check$;
