-- Migration: Simplify RLS policies to fix INSERT blocking issue
-- Purpose: Remove empty string check that's causing legitimate inserts to fail
-- Issue: WITH CHECK clause blocking all inserts despite correct context
-- Solution: Simplify policy to only check tenant_id match

-- Drop existing policies
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Recreate with simplified logic (no empty string check)
CREATE POLICY conversations_tenant_isolation
  ON conversations
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''));

CREATE POLICY messages_tenant_isolation
  ON messages
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''));

CREATE POLICY outbox_events_tenant_isolation
  ON outbox_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''));

CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id::text = COALESCE(current_setting('app.current_tenant', true), ''));

-- Verify policies
SELECT tablename, policyname, permissive FROM pg_policies
WHERE tablename IN ('conversations', 'messages', 'outbox_events', 'audit_logs')
ORDER BY tablename;
