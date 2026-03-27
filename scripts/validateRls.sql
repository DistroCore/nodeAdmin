-- RLS Multi-Tenant Isolation Validation SQL Script
-- Run this inside PostgreSQL to validate RLS policies

\echo '=== RLS Multi-Tenant Isolation Validation ==='
\echo ''

-- Seed test data
\echo '1. Seeding test data...'
BEGIN;

SELECT set_config('app.current_tenant', 'tenant-alpha', true);
INSERT INTO conversations (tenant_id, id) VALUES ('tenant-alpha', 'conv-alpha-test') ON CONFLICT DO NOTHING;
INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type)
VALUES ('tenant-alpha', 'conv-alpha-test', 'msg-alpha-test', 999, 'user-a', 'trace-a', 'Secret from Tenant A', 'text')
ON CONFLICT DO NOTHING;

SELECT set_config('app.current_tenant', 'tenant-beta', true);
INSERT INTO conversations (tenant_id, id) VALUES ('tenant-beta', 'conv-beta-test') ON CONFLICT DO NOTHING;
INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type)
VALUES ('tenant-beta', 'conv-beta-test', 'msg-beta-test', 999, 'user-b', 'trace-b', 'Secret from Tenant B', 'text')
ON CONFLICT DO NOTHING;

COMMIT;
\echo 'Test data seeded'
\echo ''

-- Test 1: Tenant A can read own data
\echo '2. Test: Tenant A can read own conversations'
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-alpha', true);
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN '✅ PASS: Tenant A can read own conversations'
    ELSE '❌ FAIL: Tenant A cannot read own conversations'
  END as result
FROM conversations WHERE tenant_id = 'tenant-alpha' AND id = 'conv-alpha-test';
COMMIT;

-- Test 2: Tenant A CANNOT read Tenant B data
\echo '3. Test: Tenant A CANNOT read Tenant B conversations'
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-alpha', true);
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS: Tenant A blocked from reading Tenant B'
    ELSE '❌ FAIL: Tenant A can read Tenant B (RLS BROKEN!)'
  END as result
FROM conversations WHERE tenant_id = 'tenant-beta' AND id = 'conv-beta-test';
COMMIT;

-- Test 3: Tenant A can read own messages
\echo '4. Test: Tenant A can read own messages'
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-alpha', true);
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN '✅ PASS: Tenant A can read own messages'
    ELSE '❌ FAIL: Tenant A cannot read own messages'
  END as result
FROM messages WHERE tenant_id = 'tenant-alpha' AND message_id = 'msg-alpha-test';
COMMIT;

-- Test 4: Tenant A CANNOT read Tenant B messages
\echo '5. Test: Tenant A CANNOT read Tenant B messages'
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-alpha', true);
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS: Tenant A blocked from reading Tenant B messages'
    ELSE '❌ FAIL: Tenant A can read Tenant B messages (RLS BROKEN!)'
  END as result
FROM messages WHERE tenant_id = 'tenant-beta' AND message_id = 'msg-beta-test';
COMMIT;

-- Test 5: Wildcard query isolation
\echo '6. Test: Wildcard queries do not leak cross-tenant data'
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-alpha', true);
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS: Wildcard queries properly isolated'
    ELSE '❌ FAIL: Wildcard queries leak cross-tenant data (RLS BROKEN!)'
  END as result
FROM messages WHERE content LIKE '%Tenant B%';
COMMIT;

-- Test 6: INSERT isolation (will fail with RLS error if working)
\echo '7. Test: Tenant A CANNOT insert into Tenant B namespace'
DO $$
DECLARE
  insert_blocked BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM set_config('app.current_tenant', 'tenant-alpha', true);
    INSERT INTO conversations (tenant_id, id) VALUES ('tenant-beta', 'malicious-conv-test');
  EXCEPTION
    WHEN OTHERS THEN
      insert_blocked := TRUE;
  END;

  IF insert_blocked THEN
    RAISE NOTICE '✅ PASS: Tenant A blocked from inserting into Tenant B';
  ELSE
    RAISE NOTICE '❌ FAIL: Tenant A can insert into Tenant B (RLS BROKEN!)';
  END IF;
END $$;

-- Cleanup
\echo ''
\echo '8. Cleaning up test data...'
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-alpha', true);
DELETE FROM messages WHERE tenant_id = 'tenant-alpha' AND message_id = 'msg-alpha-test';
DELETE FROM conversations WHERE tenant_id = 'tenant-alpha' AND id = 'conv-alpha-test';

SELECT set_config('app.current_tenant', 'tenant-beta', true);
DELETE FROM messages WHERE tenant_id = 'tenant-beta' AND message_id = 'msg-beta-test';
DELETE FROM conversations WHERE tenant_id = 'tenant-beta' AND id = 'conv-beta-test';
COMMIT;
\echo 'Cleanup complete'
\echo ''
\echo '=== RLS Validation Complete ==='
