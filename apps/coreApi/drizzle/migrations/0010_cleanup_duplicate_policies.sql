-- Migration: Clean up duplicate RLS policies
-- Purpose: Remove old PERMISSIVE policies that conflict with new RESTRICTIVE policies
-- Issue: Migration 0009 created RESTRICTIVE policies but old PERMISSIVE policies still exist
-- Solution: Drop all old policies, keep only RESTRICTIVE ones

-- Drop old PERMISSIVE policy on outbox_events (different naming from migration 0007)
DROP POLICY IF EXISTS outbox_tenant_isolation ON outbox_events;

-- Verify only RESTRICTIVE policies remain
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN ('conversations', 'messages', 'outbox_events', 'audit_logs')
ORDER BY tablename, policyname;
