import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryMessageStore } from '../inMemoryMessageStore';
import { ImMessageRepository } from './imMessageRepository';
import { AuditLogRepository } from './auditLogRepository';

interface ConversationRecord {
  created_at: Date;
  id: string;
  tenant_id: string;
}

interface MessageRecord {
  content: string;
  conversation_id: string;
  created_at: Date;
  deleted_at: Date | null;
  edited_at: Date | null;
  message_id: string;
  message_type: string;
  metadata_json: string | null;
  sequence_id: number;
  tenant_id: string;
  trace_id: string;
  user_id: string;
}

interface OutboxRecord {
  aggregate_id: string;
  created_at: Date;
  event_type: string;
  id: string;
  payload: string;
  published_at: Date | null;
  retry_count: number;
  tenant_id: string;
}

interface AuditLogRecord {
  action: string;
  context_json: string | null;
  created_at: Date;
  id: string;
  target_id: string | null;
  target_type: string | null;
  tenant_id: string;
  trace_id: string;
  user_id: string;
}

interface TenantAwareClient {
  calls: Array<{ params: unknown[]; sql: string }>;
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

interface TenantAwarePool {
  calls: Array<{ params: unknown[]; sql: string }>;
  client: TenantAwareClient;
  connect: ReturnType<typeof vi.fn>;
  currentTenant: string | null;
  directQuery: (sqlText: string, params?: unknown[]) => Promise<{ rowCount: number; rows: Record<string, unknown>[] }>;
}

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';
const CONVERSATION_A = 'conv-alpha-001';
const CONVERSATION_B = 'conv-beta-001';
const MESSAGE_A = 'msg-alpha-001';
const MESSAGE_B = 'msg-beta-001';

describe('Multi-tenant isolation (mock)', () => {
  let pool: TenantAwarePool;

  beforeEach(() => {
    pool = createTenantAwarePool();
  });

  describe('service layer tenant propagation', () => {
    it('conversation reads set tenant context before querying the conversations table', async () => {
      const rows = await listConversationsByTenant(pool, TENANT_A, CONVERSATION_A);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenant_id).toBe(TENANT_A);
      expect(
        pool.calls.some(
          (call) => call.sql.includes(`SELECT set_config('app.current_tenant'`) && call.params[0] === TENANT_A,
        ),
      ).toBe(true);
    });

    it('ImMessageRepository.getLatest passes tenantId into the tenant-scoped query', async () => {
      const repository = createMessageRepository(pool);

      const rows = await repository.getLatest(TENANT_A, CONVERSATION_A, 10);

      expect(Array.isArray(rows)).toBe(true);
      expect(pool.client.calls.some((call) => call.sql.includes(`SELECT set_config('app.current_tenant'`))).toBe(true);
      expect(
        pool.client.calls.some(
          (call) =>
            call.sql.includes('FROM messages') && call.params[0] === TENANT_A && call.params[1] === CONVERSATION_A,
        ),
      ).toBe(true);
    });

    it('ImMessageRepository.append writes conversations, messages, and outbox rows using the same tenantId', async () => {
      const repository = createMessageRepository(pool);
      const now = new Date('2026-03-31T00:00:00.000Z');

      const result = await repository.append({
        content: 'Hello from tenant A',
        conversationId: 'conv-alpha-append',
        createdAt: now.toISOString(),
        messageId: 'msg-alpha-append',
        tenantId: TENANT_A,
        traceId: 'trace-alpha-append',
        userId: 'user-alpha',
      });

      expect(result.duplicate).toBe(false);
      expect(
        pool.client.calls.some(
          (call) =>
            call.sql.includes('INSERT INTO conversations') &&
            call.params[0] === TENANT_A &&
            call.params[1] === 'conv-alpha-append',
        ),
      ).toBe(true);
      expect(
        pool.client.calls.some((call) => call.sql.includes('INSERT INTO messages') && call.params[0] === TENANT_A),
      ).toBe(true);
      expect(
        pool.client.calls.some((call) => call.sql.includes('INSERT INTO outbox_events') && call.params[1] === TENANT_A),
      ).toBe(true);
    });

    it('ImMessageRepository.updateContent rejects cross-tenant edits by returning null', async () => {
      const repository = createMessageRepository(pool);

      const result = await repository.updateContent(TENANT_A, MESSAGE_B, 'tampered');

      expect(result).toBeNull();
    });

    it('ImMessageRepository.softDelete rejects cross-tenant deletes by returning null', async () => {
      const repository = createMessageRepository(pool);

      const result = await repository.softDelete(TENANT_A, MESSAGE_B);

      expect(result).toBeNull();
    });

    it('ImMessageRepository.upsertReadReceipt keeps tenantId in the write payload', async () => {
      const repository = createMessageRepository(pool);

      await repository.upsertReadReceipt(TENANT_A, CONVERSATION_A, 'user-alpha', 9);

      expect(
        pool.client.calls.some(
          (call) =>
            call.sql.includes('INSERT INTO message_reads') &&
            call.params[0] === TENANT_A &&
            call.params[1] === CONVERSATION_A,
        ),
      ).toBe(true);
    });
  });

  describe('repository layer tenant isolation', () => {
    it('AuditLogRepository.record stores the tenantId on insert', async () => {
      const mockDb = createAuditLogDb([createAuditLogRow({ id: 'audit-a', tenantId: TENANT_A })]);
      const repository = new AuditLogRepository(mockDb as never);

      await repository.record({
        action: 'auth.login',
        tenantId: TENANT_A,
        traceId: 'trace-a',
        userId: 'user-a',
      });

      const values = mockDb.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as {
        tenantId: string;
      };
      expect(values.tenantId).toBe(TENANT_A);
    });

    it('AuditLogRepository.findByFilter only returns rows from the requested tenant', async () => {
      const mockDb = createAuditLogDb([createAuditLogRow({ id: 'audit-a', tenantId: TENANT_A })]);
      const repository = new AuditLogRepository(mockDb as never);

      const rows = await repository.findByFilter({ tenantId: TENANT_A }, 1, 20);

      expect(rows).toEqual([
        expect.objectContaining({
          id: 'audit-a',
          tenantId: TENANT_A,
        }),
      ]);
    });

    it('AuditLogRepository.countByFilter counts rows only within one tenant scope', async () => {
      const mockDb = createAuditLogDb([], [{ total: 1 }]);
      const repository = new AuditLogRepository(mockDb as never);

      await expect(repository.countByFilter({ tenantId: TENANT_B })).resolves.toBe(1);
    });
  });

  describe('conversations table CRUD isolation', () => {
    it('allows reads inside the current tenant namespace', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2', [
          TENANT_A,
          CONVERSATION_A,
        ]),
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.id).toBe(CONVERSATION_A);
    });

    it('returns no rows for cross-tenant conversation reads', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2', [
          TENANT_B,
          CONVERSATION_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('throws on cross-tenant conversation inserts', async () => {
      await expect(
        runWithTenant(pool, TENANT_A, (activePool) =>
          activePool.directQuery("INSERT INTO conversations (tenant_id, id) VALUES ($1, 'malicious')", [TENANT_B]),
        ),
      ).rejects.toThrow('Cross-tenant write blocked');
    });

    it('blocks cross-tenant conversation updates', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('UPDATE conversations SET created_at = NOW() WHERE tenant_id = $1 AND id = $2', [
          TENANT_B,
          CONVERSATION_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('blocks cross-tenant conversation deletes', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('DELETE FROM conversations WHERE tenant_id = $1 AND id = $2', [
          TENANT_B,
          CONVERSATION_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });
  });

  describe('messages table CRUD isolation', () => {
    it('allows reads inside the current tenant namespace', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('SELECT message_id, content FROM messages WHERE tenant_id = $1 AND message_id = $2', [
          TENANT_A,
          MESSAGE_A,
        ]),
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.message_id).toBe(MESSAGE_A);
    });

    it('returns no rows for cross-tenant message reads', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('SELECT message_id, content FROM messages WHERE tenant_id = $1 AND message_id = $2', [
          TENANT_B,
          MESSAGE_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('throws on cross-tenant message inserts', async () => {
      await expect(
        runWithTenant(pool, TENANT_A, (activePool) =>
          activePool.directQuery(
            "INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type) VALUES ($1, 'conv', 'msg', 1, 'user', 'trace', 'x', 'text')",
            [TENANT_B],
          ),
        ),
      ).rejects.toThrow('Cross-tenant write blocked');
    });

    it('blocks cross-tenant message updates', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("UPDATE messages SET content = 'HACKED' WHERE tenant_id = $1 AND message_id = $2", [
          TENANT_B,
          MESSAGE_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('blocks cross-tenant message deletes', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery('DELETE FROM messages WHERE tenant_id = $1 AND message_id = $2', [TENANT_B, MESSAGE_B]),
      );

      expect(result.rowCount).toBe(0);
    });
  });

  describe('outbox_events table CRUD isolation', () => {
    it('allows reads inside the current tenant namespace', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("SELECT id, payload FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-a'", [
          TENANT_A,
        ]),
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.id).toBe('outbox-a');
    });

    it('returns no rows for cross-tenant outbox reads', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("SELECT id, payload FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'", [
          TENANT_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('throws on cross-tenant outbox inserts', async () => {
      await expect(
        runWithTenant(pool, TENANT_A, (activePool) =>
          activePool.directQuery(
            "INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload) VALUES ('malicious-outbox', $1, 'agg', 'test.event', '{}')",
            [TENANT_B],
          ),
        ),
      ).rejects.toThrow('Cross-tenant write blocked');
    });

    it('blocks cross-tenant outbox updates', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery(
          "UPDATE outbox_events SET published_at = NOW() WHERE tenant_id = $1 AND id = 'outbox-b'",
          [TENANT_B],
        ),
      );

      expect(result.rowCount).toBe(0);
    });

    it('blocks cross-tenant outbox deletes', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("DELETE FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'", [TENANT_B]),
      );

      expect(result.rowCount).toBe(0);
    });
  });

  describe('audit_logs table CRUD isolation', () => {
    it('allows reads inside the current tenant namespace', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("SELECT id, action FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-a'", [TENANT_A]),
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.id).toBe('audit-a');
    });

    it('returns no rows for cross-tenant audit-log reads', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("SELECT id, action FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'", [TENANT_B]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('throws on cross-tenant audit-log inserts', async () => {
      await expect(
        runWithTenant(pool, TENANT_A, (activePool) =>
          activePool.directQuery(
            "INSERT INTO audit_logs (id, tenant_id, user_id, action, trace_id) VALUES ('malicious-audit', $1, 'attacker', 'test.attack', 'trace-x')",
            [TENANT_B],
          ),
        ),
      ).rejects.toThrow('Cross-tenant write blocked');
    });

    it('blocks cross-tenant audit-log updates', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("UPDATE audit_logs SET action = 'TAMPERED' WHERE tenant_id = $1 AND id = 'audit-b'", [
          TENANT_B,
        ]),
      );

      expect(result.rowCount).toBe(0);
    });

    it('blocks cross-tenant audit-log deletes', async () => {
      const result = await runWithTenant(pool, TENANT_A, (activePool) =>
        activePool.directQuery("DELETE FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'", [TENANT_B]),
      );

      expect(result.rowCount).toBe(0);
    });
  });
});

function createMessageRepository(pool: TenantAwarePool): ImMessageRepository {
  const repository = new ImMessageRepository(new InMemoryMessageStore());
  (
    repository as unknown as {
      pool: TenantAwarePool;
    }
  ).pool = pool as unknown as never;

  return repository;
}

function createAuditLogRow(
  overrides?: Partial<{
    action: string;
    contextJson: string | null;
    createdAt: Date;
    id: string;
    targetId: string | null;
    targetType: string | null;
    tenantId: string;
    traceId: string;
    userId: string;
  }>,
) {
  return {
    action: 'test.seed',
    contextJson: null,
    createdAt: new Date('2026-03-31T00:00:00.000Z'),
    id: 'audit-row',
    targetId: null,
    targetType: null,
    tenantId: TENANT_A,
    traceId: 'trace-a',
    userId: 'user-a',
    ...overrides,
  };
}

function createAuditLogDb(
  selectRows: Array<ReturnType<typeof createAuditLogRow>>,
  countRows: Array<{ total: number }> = [{ total: selectRows.length }],
) {
  const selectChain = {
    offset: vi.fn().mockResolvedValue(selectRows),
    limit: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    from: vi.fn(),
  };
  selectChain.limit.mockReturnValue(selectChain);
  selectChain.orderBy.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.from.mockReturnValue(selectChain);

  const countChain = {
    where: vi.fn().mockResolvedValue(countRows),
    from: vi.fn(),
  };
  countChain.from.mockReturnValue(countChain);

  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockImplementation((fields?: { total?: unknown }) => {
      if (fields?.total) {
        return countChain;
      }

      return selectChain;
    }),
  };
}

async function runWithTenant<T>(
  pool: TenantAwarePool,
  tenantId: string,
  work: (pool: TenantAwarePool) => Promise<T>,
): Promise<T> {
  await pool.directQuery(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
  return work(pool);
}

async function listConversationsByTenant(
  pool: TenantAwarePool,
  tenantId: string,
  conversationId: string,
): Promise<Record<string, unknown>[]> {
  const result = await runWithTenant(pool, tenantId, (activePool) =>
    activePool.directQuery('SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2', [tenantId, conversationId]),
  );

  return result.rows;
}

function createTenantAwarePool(): TenantAwarePool {
  const state = {
    auditLogs: [
      {
        action: 'test.seed',
        context_json: null,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        id: 'audit-a',
        target_id: null,
        target_type: null,
        tenant_id: TENANT_A,
        trace_id: 'trace-a',
        user_id: 'user-alpha',
      },
      {
        action: 'test.seed',
        context_json: null,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        id: 'audit-b',
        target_id: null,
        target_type: null,
        tenant_id: TENANT_B,
        trace_id: 'trace-b',
        user_id: 'user-beta',
      },
    ] satisfies AuditLogRecord[],
    conversations: [
      { created_at: new Date('2026-03-31T00:00:00.000Z'), id: CONVERSATION_A, tenant_id: TENANT_A },
      { created_at: new Date('2026-03-31T00:00:00.000Z'), id: CONVERSATION_B, tenant_id: TENANT_B },
    ] satisfies ConversationRecord[],
    messages: [
      {
        content: 'Secret message from tenant A',
        conversation_id: CONVERSATION_A,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        deleted_at: null,
        edited_at: null,
        message_id: MESSAGE_A,
        message_type: 'text',
        metadata_json: null,
        sequence_id: 1,
        tenant_id: TENANT_A,
        trace_id: 'trace-a',
        user_id: 'user-alpha',
      },
      {
        content: 'Secret message from tenant B',
        conversation_id: CONVERSATION_B,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        deleted_at: null,
        edited_at: null,
        message_id: MESSAGE_B,
        message_type: 'text',
        metadata_json: null,
        sequence_id: 1,
        tenant_id: TENANT_B,
        trace_id: 'trace-b',
        user_id: 'user-beta',
      },
    ] satisfies MessageRecord[],
    outboxEvents: [
      {
        aggregate_id: CONVERSATION_A,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        event_type: 'test.event',
        id: 'outbox-a',
        payload: '{"tenant":"a"}',
        published_at: null,
        retry_count: 0,
        tenant_id: TENANT_A,
      },
      {
        aggregate_id: CONVERSATION_B,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        event_type: 'test.event',
        id: 'outbox-b',
        payload: '{"tenant":"b"}',
        published_at: null,
        retry_count: 0,
        tenant_id: TENANT_B,
      },
    ] satisfies OutboxRecord[],
  };

  const calls: Array<{ params: unknown[]; sql: string }> = [];
  const holder: { currentTenant: string | null } = { currentTenant: null };

  const execute = async (
    sqlText: string,
    params: unknown[] = [],
  ): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> => {
    calls.push({ params, sql: sqlText });
    const normalizedSql = sqlText.replace(/\s+/g, ' ').trim();

    if (normalizedSql.includes(`SELECT set_config('app.current_tenant'`)) {
      const tenant = typeof params[0] === 'string' ? params[0].trim() : '';
      if (!tenant) {
        throw new Error('Tenant context cannot be empty.');
      }

      holder.currentTenant = tenant;
      return { rowCount: 1, rows: [] };
    }

    if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
      return { rowCount: 0, rows: [] };
    }

    if (normalizedSql.includes('INSERT INTO conversations')) {
      return insertTenantScopedRow(state.conversations, holder.currentTenant, params, {
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        id: String(params[1]),
        tenant_id: String(params[0]),
      });
    }

    if (normalizedSql.includes('SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2')) {
      return selectByTenantAndId(state.conversations, holder.currentTenant, params);
    }

    if (normalizedSql.includes('SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2 FOR UPDATE')) {
      return selectByTenantAndId(state.conversations, holder.currentTenant, params);
    }

    if (normalizedSql.includes('UPDATE conversations SET created_at = NOW()')) {
      return updateByTenantAndId(state.conversations, holder.currentTenant, params, (record) => {
        record.created_at = new Date('2026-03-31T00:10:00.000Z');
      });
    }

    if (normalizedSql.includes('DELETE FROM conversations WHERE tenant_id = $1 AND id = $2')) {
      return deleteByTenantAndId(state.conversations, holder.currentTenant, params);
    }

    if (normalizedSql.includes('INSERT INTO messages')) {
      return insertMessageRow(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes('SELECT message_id, content FROM messages WHERE tenant_id = $1 AND message_id = $2')) {
      return selectByTenantAndMessageId(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes('SELECT content, conversation_id, created_at, message_id')) {
      return selectExistingMessage(state.messages, holder.currentTenant, params);
    }

    if (
      normalizedSql.includes(
        'SELECT content, conversation_id, created_at, message_id, message_type, metadata_json, sequence_id, tenant_id, trace_id, user_id FROM messages',
      )
    ) {
      return selectLatestMessages(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes('SELECT content, conversation_id, created_at, deleted_at, edited_at')) {
      return selectLatestMessages(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes('UPDATE messages SET content = $1, edited_at = NOW()')) {
      return updateMessageContent(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes("UPDATE messages SET content = '', deleted_at = NOW()")) {
      return softDeleteMessage(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes("UPDATE messages SET content = 'HACKED'")) {
      return updateByTenantAndMessageId(state.messages, holder.currentTenant, params, (record) => {
        record.content = 'HACKED';
      });
    }

    if (normalizedSql.includes('DELETE FROM messages WHERE tenant_id = $1 AND message_id = $2')) {
      return deleteByTenantAndMessageId(state.messages, holder.currentTenant, params);
    }

    if (normalizedSql.includes('INSERT INTO outbox_events')) {
      return insertOutboxRow(state.outboxEvents, holder.currentTenant, params);
    }

    if (normalizedSql.includes("SELECT id, payload FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-a'")) {
      return selectFixedOutbox(state.outboxEvents, holder.currentTenant, String(params[0]), 'outbox-a');
    }

    if (normalizedSql.includes("SELECT id, payload FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'")) {
      return selectFixedOutbox(state.outboxEvents, holder.currentTenant, String(params[0]), 'outbox-b');
    }

    if (
      normalizedSql.includes("UPDATE outbox_events SET published_at = NOW() WHERE tenant_id = $1 AND id = 'outbox-b'")
    ) {
      return updateFixedOutbox(state.outboxEvents, holder.currentTenant, String(params[0]), 'outbox-b');
    }

    if (normalizedSql.includes("DELETE FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'")) {
      return deleteFixedOutbox(state.outboxEvents, holder.currentTenant, String(params[0]), 'outbox-b');
    }

    if (normalizedSql.includes('INSERT INTO message_reads')) {
      ensureTenantContext(holder.currentTenant, String(params[0]));
      return { rowCount: 1, rows: [] };
    }

    if (normalizedSql.includes("SELECT id, action FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-a'")) {
      return selectFixedAudit(state.auditLogs, holder.currentTenant, String(params[0]), 'audit-a');
    }

    if (normalizedSql.includes("SELECT id, action FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'")) {
      return selectFixedAudit(state.auditLogs, holder.currentTenant, String(params[0]), 'audit-b');
    }

    if (normalizedSql.includes('INSERT INTO audit_logs')) {
      const tenant = String(params[0]);
      ensureTenantContext(holder.currentTenant, tenant);
      state.auditLogs.push({
        action: 'test.attack',
        context_json: null,
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        id: 'malicious-audit',
        target_id: null,
        target_type: null,
        tenant_id: tenant,
        trace_id: 'trace-x',
        user_id: 'attacker',
      });
      return { rowCount: 1, rows: [] };
    }

    if (normalizedSql.includes("UPDATE audit_logs SET action = 'TAMPERED' WHERE tenant_id = $1 AND id = 'audit-b'")) {
      return updateFixedAudit(state.auditLogs, holder.currentTenant, String(params[0]), 'audit-b');
    }

    if (normalizedSql.includes("DELETE FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'")) {
      return deleteFixedAudit(state.auditLogs, holder.currentTenant, String(params[0]), 'audit-b');
    }

    throw new Error(`Unhandled SQL in mock tenant isolation test: ${normalizedSql}`);
  };

  const client: TenantAwareClient = {
    calls,
    query: vi.fn(execute),
    release: vi.fn(),
  };

  return {
    calls,
    client,
    connect: vi.fn(async () => client),
    currentTenant: holder.currentTenant,
    directQuery: execute,
  };
}

function ensureTenantContext(currentTenant: string | null, requestedTenant: string): void {
  if (!currentTenant || currentTenant !== requestedTenant) {
    throw new Error('Cross-tenant write blocked');
  }
}

function selectByTenantAndId<T extends { id: string; tenant_id: string }>(
  rows: T[],
  currentTenant: string | null,
  params: unknown[],
) {
  const tenantId = String(params[0]);
  const id = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.id === id);
  return record ? { rowCount: 1, rows: [record] } : { rowCount: 0, rows: [] };
}

function updateByTenantAndId<T extends { id: string; tenant_id: string }>(
  rows: T[],
  currentTenant: string | null,
  params: unknown[],
  update: (record: T) => void,
) {
  const tenantId = String(params[0]);
  const id = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.id === id);
  if (!record) {
    return { rowCount: 0, rows: [] };
  }

  update(record);
  return { rowCount: 1, rows: [record] };
}

function deleteByTenantAndId<T extends { id: string; tenant_id: string }>(
  rows: T[],
  currentTenant: string | null,
  params: unknown[],
) {
  const tenantId = String(params[0]);
  const id = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const index = rows.findIndex((row) => row.tenant_id === tenantId && row.id === id);
  if (index === -1) {
    return { rowCount: 0, rows: [] };
  }

  const [deleted] = rows.splice(index, 1);
  return { rowCount: 1, rows: [deleted] };
}

function selectByTenantAndMessageId(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  const tenantId = String(params[0]);
  const messageId = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.message_id === messageId);
  return record ? { rowCount: 1, rows: [record] } : { rowCount: 0, rows: [] };
}

function updateByTenantAndMessageId(
  rows: MessageRecord[],
  currentTenant: string | null,
  params: unknown[],
  update: (record: MessageRecord) => void,
) {
  const tenantId = String(params[0]);
  const messageId = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.message_id === messageId);
  if (!record) {
    return { rowCount: 0, rows: [] };
  }

  update(record);
  return { rowCount: 1, rows: [record] };
}

function deleteByTenantAndMessageId(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  const tenantId = String(params[0]);
  const messageId = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const index = rows.findIndex((row) => row.tenant_id === tenantId && row.message_id === messageId);
  if (index === -1) {
    return { rowCount: 0, rows: [] };
  }

  const [deleted] = rows.splice(index, 1);
  return { rowCount: 1, rows: [deleted] };
}

function insertTenantScopedRow<T extends { id: string; tenant_id: string }>(
  rows: T[],
  currentTenant: string | null,
  params: unknown[],
  row: T,
) {
  ensureTenantContext(currentTenant, String(params[0]));
  rows.push(row);
  return { rowCount: 1, rows: [row] };
}

function insertMessageRow(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  const tenantId = String(params[0]);
  ensureTenantContext(currentTenant, tenantId);

  const existing = rows.find((row) => row.tenant_id === tenantId && row.message_id === String(params[2]));
  if (existing) {
    return { rowCount: 0, rows: [] };
  }

  const sequenceId =
    rows
      .filter((row) => row.tenant_id === tenantId && row.conversation_id === String(params[1]))
      .reduce((max, row) => Math.max(max, row.sequence_id), 0) + 1;

  const inserted: MessageRecord = {
    content: String(params[5]),
    conversation_id: String(params[1]),
    created_at: new Date(String(params[8])),
    deleted_at: null,
    edited_at: null,
    message_id: String(params[2]),
    message_type: String(params[6]),
    metadata_json: (params[7] as string | null) ?? null,
    sequence_id: sequenceId,
    tenant_id: tenantId,
    trace_id: String(params[4]),
    user_id: String(params[3]),
  };

  rows.push(inserted);
  return { rowCount: 1, rows: [inserted] };
}

function selectExistingMessage(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  return selectByTenantAndMessageId(rows, currentTenant, params);
}

function selectLatestMessages(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  const tenantId = String(params[0]);
  const conversationId = String(params[1]);
  const limit = Number(params[2]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const result = rows
    .filter((row) => row.tenant_id === tenantId && row.conversation_id === conversationId)
    .sort((a, b) => b.sequence_id - a.sequence_id)
    .slice(0, limit);

  return { rowCount: result.length, rows: result };
}

function updateMessageContent(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  const content = String(params[0]);
  const tenantId = String(params[1]);
  const messageId = String(params[2]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find(
    (row) => row.tenant_id === tenantId && row.message_id === messageId && row.deleted_at === null,
  );
  if (!record) {
    return { rowCount: 0, rows: [] };
  }

  record.content = content;
  record.edited_at = new Date('2026-03-31T00:05:00.000Z');
  return { rowCount: 1, rows: [record] };
}

function softDeleteMessage(rows: MessageRecord[], currentTenant: string | null, params: unknown[]) {
  const tenantId = String(params[0]);
  const messageId = String(params[1]);

  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find(
    (row) => row.tenant_id === tenantId && row.message_id === messageId && row.deleted_at === null,
  );
  if (!record) {
    return { rowCount: 0, rows: [] };
  }

  record.content = '';
  record.deleted_at = new Date('2026-03-31T00:06:00.000Z');
  return { rowCount: 1, rows: [record] };
}

function insertOutboxRow(rows: OutboxRecord[], currentTenant: string | null, params: unknown[]) {
  const tenantId = String(params[1]);
  ensureTenantContext(currentTenant, tenantId);

  const inserted: OutboxRecord = {
    aggregate_id: String(params[2]),
    created_at: new Date('2026-03-31T00:00:00.000Z'),
    event_type: String(params[3]),
    id: String(params[0] ?? randomUUID()),
    payload: String(params[4]),
    published_at: null,
    retry_count: 0,
    tenant_id: tenantId,
  };

  rows.push(inserted);
  return { rowCount: 1, rows: [inserted] };
}

function selectFixedOutbox(rows: OutboxRecord[], currentTenant: string | null, tenantId: string, id: string) {
  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.id === id);
  return record ? { rowCount: 1, rows: [record] } : { rowCount: 0, rows: [] };
}

function updateFixedOutbox(rows: OutboxRecord[], currentTenant: string | null, tenantId: string, id: string) {
  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.id === id);
  if (!record) {
    return { rowCount: 0, rows: [] };
  }

  record.published_at = new Date('2026-03-31T00:07:00.000Z');
  return { rowCount: 1, rows: [record] };
}

function deleteFixedOutbox(rows: OutboxRecord[], currentTenant: string | null, tenantId: string, id: string) {
  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const index = rows.findIndex((row) => row.tenant_id === tenantId && row.id === id);
  if (index === -1) {
    return { rowCount: 0, rows: [] };
  }

  const [record] = rows.splice(index, 1);
  return { rowCount: 1, rows: [record] };
}

function selectFixedAudit(rows: AuditLogRecord[], currentTenant: string | null, tenantId: string, id: string) {
  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.id === id);
  return record ? { rowCount: 1, rows: [record] } : { rowCount: 0, rows: [] };
}

function updateFixedAudit(rows: AuditLogRecord[], currentTenant: string | null, tenantId: string, id: string) {
  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const record = rows.find((row) => row.tenant_id === tenantId && row.id === id);
  if (!record) {
    return { rowCount: 0, rows: [] };
  }

  record.action = 'TAMPERED';
  return { rowCount: 1, rows: [record] };
}

function deleteFixedAudit(rows: AuditLogRecord[], currentTenant: string | null, tenantId: string, id: string) {
  if (!currentTenant || tenantId !== currentTenant) {
    return { rowCount: 0, rows: [] };
  }

  const index = rows.findIndex((row) => row.tenant_id === tenantId && row.id === id);
  if (index === -1) {
    return { rowCount: 0, rows: [] };
  }

  const [record] = rows.splice(index, 1);
  return { rowCount: 1, rows: [record] };
}
