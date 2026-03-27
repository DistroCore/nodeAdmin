-- Migration: Fix RLS security vulnerability
-- Purpose: Properly enforce tenant isolation by rejecting queries without valid tenant context
-- Issue: Current policies allow cross-tenant access due to COALESCE defaulting to empty string
-- Solution: Require non-empty tenant context and use proper restrictive policies

-- Drop existing broken policies
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Create helper function to get current tenant (throws error if not set)
CREATE OR REPLACE FUNCTION get_current_tenant() RETURNS TEXT AS $$
DECLARE
  tenant_id TEXT;
BEGIN
  tenant_id := current_setting('app.current_tenant', true);

  -- Reject if tenant context is not set or empty
  IF tenant_id IS NULL OR tenant_id = '' THEN
    RAISE EXCEPTION 'Tenant context not set. All queries must have app.current_tenant configured.';
  END IF;

  RETURN tenant_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Conversations: Restrictive policy for all operations
CREATE POLICY conversations_tenant_isolation
  ON conversations
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- Messages: Restrictive policy for all operations
CREATE POLICY messages_tenant_isolation
  ON messages
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- Outbox Events: Restrictive policy for all operations
CREATE POLICY outbox_events_tenant_isolation
  ON outbox_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- Audit Logs: Restrictive policy for all operations
CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- Verify all tables have FORCE ROW LEVEL SECURITY enabled
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Verify policies are created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN ('conversations', 'messages', 'outbox_events', 'audit_logs')
ORDER BY tablename, policyname;
