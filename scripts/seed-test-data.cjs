#!/usr/bin/env node
/**
 * Seed test data for IM module integration testing
 * Creates conversations and messages for tenant-demo
 */

const { Client } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin';
const TENANT_ID = 'tenant-demo';

async function seedData() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('Connected to database');

    // Set tenant context for RLS
    await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [TENANT_ID]);
    console.log(`Set tenant context: ${TENANT_ID}`);

    // Create test conversations
    const conversations = [
      { id: 'conv-general', tenantId: TENANT_ID },
      { id: 'conv-support', tenantId: TENANT_ID },
      { id: 'conv-dev-team', tenantId: TENANT_ID },
    ];

    for (const conv of conversations) {
      await client.query(
        `INSERT INTO conversations (tenant_id, id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (tenant_id, id) DO NOTHING`,
        [conv.tenantId, conv.id]
      );
      console.log(`✓ Created conversation: ${conv.id}`);
    }

    // Create test messages
    const messages = [
      {
        tenantId: TENANT_ID,
        conversationId: 'conv-general',
        messageId: 'msg-001',
        userId: 'user-admin',
        content: 'Welcome to the general channel!',
        messageType: 'text',
        sequenceId: 1,
        traceId: 'trace-seed-001',
      },
      {
        tenantId: TENANT_ID,
        conversationId: 'conv-general',
        messageId: 'msg-002',
        userId: 'user-test',
        content: 'Hello everyone!',
        messageType: 'text',
        sequenceId: 2,
        traceId: 'trace-seed-002',
      },
      {
        tenantId: TENANT_ID,
        conversationId: 'conv-support',
        messageId: 'msg-003',
        userId: 'user-admin',
        content: 'Support channel is ready',
        messageType: 'text',
        sequenceId: 1,
        traceId: 'trace-seed-003',
      },
    ];

    for (const msg of messages) {
      await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, message_id, user_id, content, message_type, sequence_id, trace_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (tenant_id, message_id) DO NOTHING`,
        [
          msg.tenantId,
          msg.conversationId,
          msg.messageId,
          msg.userId,
          msg.content,
          msg.messageType,
          msg.sequenceId,
          msg.traceId,
        ]
      );
      console.log(`✓ Created message: ${msg.messageId} in ${msg.conversationId}`);
    }

    // Verify data
    const convResult = await client.query(
      `SELECT id, created_at FROM conversations WHERE tenant_id = $1 ORDER BY created_at`,
      [TENANT_ID]
    );
    console.log(`\n✓ Total conversations: ${convResult.rows.length}`);
    convResult.rows.forEach((row) => {
      console.log(`  - ${row.id}`);
    });

    const msgResult = await client.query(
      `SELECT conversation_id, COUNT(*) as count FROM messages WHERE tenant_id = $1 GROUP BY conversation_id`,
      [TENANT_ID]
    );
    console.log(`\n✓ Messages by conversation:`);
    msgResult.rows.forEach((row) => {
      console.log(`  - ${row.conversation_id}: ${row.count} messages`);
    });

    console.log('\n✅ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedData();
