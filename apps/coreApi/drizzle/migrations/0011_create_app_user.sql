-- Migration: Create non-superuser application user for RLS enforcement
-- Purpose: Superusers bypass ALL RLS policies - need dedicated app user
-- Issue: nodeadmin is bootstrap superuser, cannot be demoted
-- Solution: Create nodeadmin_app user without superuser privileges

-- Create application user
CREATE USER nodeadmin_app WITH PASSWORD 'nodeadmin';

-- Grant connection privileges
GRANT CONNECT ON DATABASE nodeadmin TO nodeadmin_app;
GRANT USAGE ON SCHEMA public TO nodeadmin_app;

-- Grant table privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nodeadmin_app;

-- Grant sequence privileges (for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nodeadmin_app;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nodeadmin_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nodeadmin_app;

-- Verify user is NOT a superuser
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nodeadmin_app';
