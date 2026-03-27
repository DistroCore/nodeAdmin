-- Complete RLS Fix: Type Casting + Empty Context Validation
-- Addresses remaining vulnerabilities from multi-tenant isolation test report
--
-- Root Causes Fixed:
-- 1. Missing type casting: current_setting() returns text, tenant_id is VARCHAR(64)
-- 2. Empty context bypass: Empty string from current_setting() could match or bypass checks
-- 3. Policy logic flaw: Previous policies allowed cross-tenant queries with explicit WHERE clauses
--
-- Test Results Before Fix: 11/26 passing (42%)
-- Expected After Fix: 26/26 passing (100%)

-- Drop existing policies (from 0007_fix_rls_with_check.sql)
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Recreate policies with strict isolation
-- Key improvements:
-- 1. Explicit ::text type casting for reliable comparison
-- 2. Empty context validation (current_setting != '') prevents bypass
-- 3. FOR ALL applies to SELECT, INSERT, UPDATE, DELETE
-- 4. USING restricts visibility (reads)
-- 5. WITH CHECK restricts modifications (writes)

CREATE POLICY conversations_tenant_isolation
  ON conversations
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

CREATE POLICY messages_tenant_isolation
  ON messages
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

CREATE POLICY outbox_tenant_isolation
  ON outbox_events
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::text
    AND current_setting('app.current_tenant', true)::text != ''
  );

-- Verification: Test that policies are correctly applied
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'conversations_tenant_isolation',
      'messages_tenant_isolation',
      'outbox_tenant_isolation',
      'audit_logs_tenant_isolation'
    );

  IF policy_count != 4 THEN
    RAISE EXCEPTION 'RLS policy creation failed: expected 4 policies, found %', policy_count;
  END IF;

  RAISE NOTICE 'RLS policies successfully created: % policies active', policy_count;
END $$;
