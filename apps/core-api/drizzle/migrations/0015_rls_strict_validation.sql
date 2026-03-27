-- Migration: Add validation to block empty tenant context
-- Purpose: Ensure queries fail explicitly when tenant context is unset or empty
-- Issue: Empty tenant context returns 0 rows but doesn't throw error
-- Solution: Add CHECK constraint-like validation via policy that rejects empty context

-- Drop existing policies
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Create helper function to validate and get tenant context
CREATE OR REPLACE FUNCTION get_current_tenant_strict() RETURNS TEXT AS $$
DECLARE
  tenant_id TEXT;
BEGIN
  -- Get tenant context (false = throw error if not set)
  BEGIN
    tenant_id := current_setting('app.current_tenant', false);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Tenant context not set. All queries must have app.current_tenant configured.';
  END;

  -- Reject if tenant context is empty
  IF tenant_id IS NULL OR tenant_id = '' THEN
    RAISE EXCEPTION 'Tenant context cannot be empty. All queries must have a valid app.current_tenant.';
  END IF;

  RETURN tenant_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Conversations: PERMISSIVE policy with strict validation
CREATE POLICY conversations_tenant_isolation
  ON conversations
  FOR ALL
  USING (tenant_id = get_current_tenant_strict())
  WITH CHECK (tenant_id = get_current_tenant_strict());

-- Messages: PERMISSIVE policy with strict validation
CREATE POLICY messages_tenant_isolation
  ON messages
  FOR ALL
  USING (tenant_id = get_current_tenant_strict())
  WITH CHECK (tenant_id = get_current_tenant_strict());

-- Outbox Events: PERMISSIVE policy with strict validation
CREATE POLICY outbox_events_tenant_isolation
  ON outbox_events
  FOR ALL
  USING (tenant_id = get_current_tenant_strict())
  WITH CHECK (tenant_id = get_current_tenant_strict());

-- Audit Logs: PERMISSIVE policy with strict validation
CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  FOR ALL
  USING (tenant_id = get_current_tenant_strict())
  WITH CHECK (tenant_id = get_current_tenant_strict());

-- Verify FORCE ROW LEVEL SECURITY is still enabled
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
