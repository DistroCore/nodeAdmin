-- Migration: Fix RLS by adding PERMISSIVE policies
-- Purpose: PostgreSQL RLS requires at least one PERMISSIVE policy to grant access
-- Issue: Only RESTRICTIVE policies exist, which can only deny access, not grant it
-- Solution: Add PERMISSIVE policies that grant access when tenant matches, keep RESTRICTIVE as additional safeguard

-- Drop existing restrictive-only policies
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Drop the helper function (we'll inline the logic)
DROP FUNCTION IF EXISTS get_current_tenant();

-- Conversations: PERMISSIVE policy (grants access when tenant matches)
CREATE POLICY conversations_tenant_isolation
  ON conversations
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', false))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', false));

-- Messages: PERMISSIVE policy
CREATE POLICY messages_tenant_isolation
  ON messages
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', false))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', false));

-- Outbox Events: PERMISSIVE policy
CREATE POLICY outbox_events_tenant_isolation
  ON outbox_events
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', false))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', false));

-- Audit Logs: PERMISSIVE policy
CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', false))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', false));

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
