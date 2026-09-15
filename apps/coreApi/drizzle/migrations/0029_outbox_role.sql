-- Dedicated cross-tenant role for the outbox publisher. It may bypass RLS only on the
-- outbox table and is deliberately denied access to application data.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nodeadmin_outbox') THEN
    CREATE ROLE nodeadmin_outbox
      LOGIN
      PASSWORD 'nodeadmin'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      BYPASSRLS;
  ELSE
    ALTER ROLE nodeadmin_outbox
      WITH LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      BYPASSRLS;
  END IF;
END
$role$;

GRANT CONNECT ON DATABASE nodeadmin TO nodeadmin_outbox;
GRANT USAGE ON SCHEMA public TO nodeadmin_outbox;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM nodeadmin_outbox;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM nodeadmin_outbox;
GRANT SELECT, UPDATE, DELETE ON TABLE outbox_events TO nodeadmin_outbox;
