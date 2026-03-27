-- Migration: Add RESTRICTIVE modifier to RLS policies
-- Purpose: Fix cross-tenant READ access vulnerability
-- Issue: Migration 0008 fixed INSERT but SELECT operations still allow cross-tenant access
-- Solution: Use AS RESTRICTIVE to force policy evaluation on ALL queries

-- Drop existing policies
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Recreate policies with RESTRICTIVE modifier
-- RESTRICTIVE policies are combined with AND logic, preventing bypass

-- Conversations table
CREATE POLICY conversations_tenant_isolation
  ON conversations
  AS RESTRICTIVE
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

-- Messages table
CREATE POLICY messages_tenant_isolation
  ON messages
  AS RESTRICTIVE
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

-- Outbox events table
CREATE POLICY outbox_events_tenant_isolation
  ON outbox_events
  AS RESTRICTIVE
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

-- Audit logs table
CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  AS RESTRICTIVE
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

-- Verify policies are RESTRICTIVE
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('conversations', 'messages', 'outbox_events', 'audit_logs')
ORDER BY tablename, policyname;
