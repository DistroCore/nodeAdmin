#!/bin/bash
# RLS Validation Script - Runs inside PostgreSQL container
# Tests multi-tenant isolation directly via SQL

set -e

echo "=== RLS Multi-Tenant Isolation Validation ==="
echo ""

TENANT_A="tenant-alpha"
TENANT_B="tenant-beta"
CONV_A="conv-alpha-001"
CONV_B="conv-beta-001"
MSG_A="msg-alpha-001"
MSG_B="msg-beta-001"

# Seed test data
echo "1. Seeding test data..."
psql -U nodeadmin -d nodeadmin <<EOF
BEGIN;

-- Set tenant A context and insert data
SELECT set_config('app.current_tenant', '$TENANT_A', true);
INSERT INTO conversations (tenant_id, id) VALUES ('$TENANT_A', '$CONV_A') ON CONFLICT DO NOTHING;
INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type)
VALUES ('$TENANT_A', '$CONV_A', '$MSG_A', 1, 'user-a', 'trace-a', 'Secret from Tenant A', 'text')
ON CONFLICT DO NOTHING;

-- Set tenant B context and insert data
SELECT set_config('app.current_tenant', '$TENANT_B', true);
INSERT INTO conversations (tenant_id, id) VALUES ('$TENANT_B', '$CONV_B') ON CONFLICT DO NOTHING;
INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type)
VALUES ('$TENANT_B', '$CONV_B', '$MSG_B', 1, 'user-b', 'trace-b', 'Secret from Tenant B', 'text')
ON CONFLICT DO NOTHING;

COMMIT;
EOF

echo "✅ Test data seeded"
echo ""

# Test 1: Tenant A can read own data
echo "2. Test: Tenant A can read own conversations"
RESULT=$(psql -U nodeadmin -d nodeadmin -t -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
SELECT COUNT(*) FROM conversations WHERE tenant_id = '$TENANT_A' AND id = '$CONV_A';
COMMIT;
" | tr -d ' ')

if [ "$RESULT" = "1" ]; then
    echo "✅ PASS: Tenant A can read own conversations"
else
    echo "❌ FAIL: Tenant A cannot read own conversations (expected 1, got $RESULT)"
    exit 1
fi

# Test 2: Tenant A CANNOT read Tenant B data
echo "3. Test: Tenant A CANNOT read Tenant B conversations"
RESULT=$(psql -U nodeadmin -d nodeadmin -t -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
SELECT COUNT(*) FROM conversations WHERE tenant_id = '$TENANT_B' AND id = '$CONV_B';
COMMIT;
" | tr -d ' ')

if [ "$RESULT" = "0" ]; then
    echo "✅ PASS: Tenant A blocked from reading Tenant B conversations"
else
    echo "❌ FAIL: Tenant A can read Tenant B conversations (expected 0, got $RESULT)"
    exit 1
fi

# Test 3: Tenant A can read own messages
echo "4. Test: Tenant A can read own messages"
RESULT=$(psql -U nodeadmin -d nodeadmin -t -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
SELECT COUNT(*) FROM messages WHERE tenant_id = '$TENANT_A' AND message_id = '$MSG_A';
COMMIT;
" | tr -d ' ')

if [ "$RESULT" = "1" ]; then
    echo "✅ PASS: Tenant A can read own messages"
else
    echo "❌ FAIL: Tenant A cannot read own messages (expected 1, got $RESULT)"
    exit 1
fi

# Test 4: Tenant A CANNOT read Tenant B messages
echo "5. Test: Tenant A CANNOT read Tenant B messages"
RESULT=$(psql -U nodeadmin -d nodeadmin -t -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
SELECT COUNT(*) FROM messages WHERE tenant_id = '$TENANT_B' AND message_id = '$MSG_B';
COMMIT;
" | tr -d ' ')

if [ "$RESULT" = "0" ]; then
    echo "✅ PASS: Tenant A blocked from reading Tenant B messages"
else
    echo "❌ FAIL: Tenant A can read Tenant B messages (expected 0, got $RESULT)"
    exit 1
fi

# Test 5: Tenant A CANNOT insert into Tenant B namespace
echo "6. Test: Tenant A CANNOT insert into Tenant B namespace"
ERROR_OCCURRED=0
psql -U nodeadmin -d nodeadmin -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
INSERT INTO conversations (tenant_id, id) VALUES ('$TENANT_B', 'malicious-conv');
COMMIT;
" 2>&1 | grep -q "new row violates row-level security policy" && ERROR_OCCURRED=1 || ERROR_OCCURRED=0

if [ "$ERROR_OCCURRED" = "1" ]; then
    echo "✅ PASS: Tenant A blocked from inserting into Tenant B namespace"
else
    echo "❌ FAIL: Tenant A can insert into Tenant B namespace"
    exit 1
fi

# Test 6: Tenant A CANNOT update Tenant B data
echo "7. Test: Tenant A CANNOT update Tenant B messages"
RESULT=$(psql -U nodeadmin -d nodeadmin -t -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
UPDATE messages SET content = 'HACKED' WHERE tenant_id = '$TENANT_B' AND message_id = '$MSG_B';
SELECT ROW_COUNT();
COMMIT;
" 2>&1 | grep "UPDATE" | awk '{print $2}')

if [ "$RESULT" = "0" ]; then
    echo "✅ PASS: Tenant A blocked from updating Tenant B messages"
else
    echo "❌ FAIL: Tenant A can update Tenant B messages (affected $RESULT rows)"
    exit 1
fi

# Test 7: Tenant A CANNOT delete Tenant B data
echo "8. Test: Tenant A CANNOT delete Tenant B messages"
RESULT=$(psql -U nodeadmin -d nodeadmin -t -c "
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
DELETE FROM messages WHERE tenant_id = '$TENANT_B' AND message_id = '$MSG_B';
SELECT ROW_COUNT();
COMMIT;
" 2>&1 | grep "DELETE" | awk '{print $2}')

if [ "$RESULT" = "0" ]; then
    echo "✅ PASS: Tenant A blocked from deleting Tenant B messages"
else
    echo "❌ FAIL: Tenant A can delete Tenant B messages (deleted $RESULT rows)"
    exit 1
fi

# Cleanup
echo ""
echo "9. Cleaning up test data..."
psql -U nodeadmin -d nodeadmin <<EOF
BEGIN;
SELECT set_config('app.current_tenant', '$TENANT_A', true);
DELETE FROM messages WHERE tenant_id = '$TENANT_A' AND message_id = '$MSG_A';
DELETE FROM conversations WHERE tenant_id = '$TENANT_A' AND id = '$CONV_A';

SELECT set_config('app.current_tenant', '$TENANT_B', true);
DELETE FROM messages WHERE tenant_id = '$TENANT_B' AND message_id = '$MSG_B';
DELETE FROM conversations WHERE tenant_id = '$TENANT_B' AND id = '$CONV_B';
COMMIT;
EOF

echo "✅ Cleanup complete"
echo ""
echo "=== RLS Validation Summary ==="
echo "✅ ALL TESTS PASSED (7/7)"
echo "✅ Multi-tenant isolation is working correctly"
echo "✅ Production deployment block can be LIFTED"
