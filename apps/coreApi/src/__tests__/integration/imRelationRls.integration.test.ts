import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import * as schema from '../../infrastructure/database/schema';

const databaseUrl = process.env.RLS_DATABASE_URL?.trim();
const tenantA = 'rls-relation-tenant-a';
const tenantB = 'rls-relation-tenant-b';
const conversationA = 'rls-relation-conversation-a';
const conversationB = 'rls-relation-conversation-b';
const userA = 'rls-relation-user-a';
const userB = 'rls-relation-user-b';

describe('IM relation table RLS', () => {
  let pool: Pool;
  let conversationRepository: ConversationRepository;
  const seededTenants: Array<{ conversationId: string; tenantId: string }> = [];

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('RLS_DATABASE_URL is required for the IM relation RLS suite.');
    }

    pool = new Pool({ connectionString: databaseUrl, max: 3 });
    conversationRepository = new ConversationRepository(drizzle(pool, { schema }));
    const roleResult = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    expect(roleResult.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });

    await seedTenant(tenantA, conversationA, userA);
    seededTenants.push({ conversationId: conversationA, tenantId: tenantA });
    await seedTenant(tenantB, conversationB, userB);
    seededTenants.push({ conversationId: conversationB, tenantId: tenantB });
  });

  afterAll(async () => {
    if (!pool) return;

    const cleanupResults = await Promise.allSettled(
      seededTenants.map(({ conversationId, tenantId }) => cleanupTenant(tenantId, conversationId)),
    );
    await pool.end();

    const failures = cleanupResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Failed to clean up one or more RLS integration tenants.');
    }
  });

  it('has enabled, forced, all-command policies with read and write predicates', async () => {
    const result = await pool.query<{
      cmd: string;
      has_using: boolean;
      has_with_check: boolean;
      policyname: string;
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `SELECT c.relname,
              c.relrowsecurity,
              c.relforcerowsecurity,
              p.policyname,
              p.cmd,
              (p.qual IS NOT NULL) AS has_using,
              (p.with_check IS NOT NULL) AS has_with_check
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
       WHERE n.nspname = 'public'
         AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [['conversation_members', 'message_reads']],
    );

    expect(result.rows).toEqual([
      {
        cmd: 'ALL',
        has_using: true,
        has_with_check: true,
        policyname: 'conversation_members_tenant_isolation',
        relforcerowsecurity: true,
        relname: 'conversation_members',
        relrowsecurity: true,
      },
      {
        cmd: 'ALL',
        has_using: true,
        has_with_check: true,
        policyname: 'message_reads_tenant_isolation',
        relforcerowsecurity: true,
        relname: 'message_reads',
        relrowsecurity: true,
      },
    ]);
  });

  it.each([
    ['conversation_members', 'user_id'],
    ['message_reads', 'user_id'],
  ] as const)('shows own rows and hides cross-tenant rows in %s', async (tableName, idColumn) => {
    const result = await runWithTenant(tenantA, (client) =>
      client.query(
        `SELECT tenant_id, ${idColumn}
         FROM ${tableName}
         WHERE tenant_id IN ($1, $2)
         ORDER BY tenant_id`,
        [tenantA, tenantB],
      ),
    );

    expect(result.rows).toEqual([{ tenant_id: tenantA, user_id: userA }]);
  });

  it('enforces member visibility through the real ConversationRepository query', async () => {
    await expect(conversationRepository.findById(tenantA, conversationA, userA)).resolves.toMatchObject({
      conversationId: conversationA,
      tenantId: tenantA,
    });
    await expect(conversationRepository.findById(tenantA, conversationA, userB)).resolves.toBeNull();
  });

  it.each(['conversation_members', 'message_reads'])('rejects %s reads without a tenant context', async (tableName) => {
    await expect(pool.query(`SELECT tenant_id FROM ${tableName} LIMIT 1`)).rejects.toThrow(/tenant context/i);
  });

  it.each(['conversation_members', 'message_reads'])(
    'rejects %s reads with an empty tenant context',
    async (tableName) => {
      await expect(
        runWithTenant('', (client) => client.query(`SELECT tenant_id FROM ${tableName} LIMIT 1`)),
      ).rejects.toThrow(/tenant context/i);
    },
  );

  it('blocks cross-tenant membership inserts, updates, and deletes', async () => {
    await expect(
      runWithTenant(tenantA, (client) =>
        client.query(
          `INSERT INTO conversation_members (tenant_id, conversation_id, user_id)
           VALUES ($1, $2, 'rls-relation-attacker')`,
          [tenantB, conversationB],
        ),
      ),
    ).rejects.toThrow();

    const updateResult = await runWithTenant(tenantA, (client) =>
      client.query(
        `UPDATE conversation_members SET role = 'admin'
         WHERE tenant_id = $1 AND conversation_id = $2 AND user_id = $3`,
        [tenantB, conversationB, userB],
      ),
    );
    const deleteResult = await runWithTenant(tenantA, (client) =>
      client.query(
        `DELETE FROM conversation_members
         WHERE tenant_id = $1 AND conversation_id = $2 AND user_id = $3`,
        [tenantB, conversationB, userB],
      ),
    );

    expect(updateResult.rowCount).toBe(0);
    expect(deleteResult.rowCount).toBe(0);
  });

  it('blocks cross-tenant read-receipt inserts, updates, and deletes', async () => {
    await expect(
      runWithTenant(tenantA, (client) =>
        client.query(
          `INSERT INTO message_reads (tenant_id, conversation_id, user_id, last_read_sequence_id)
           VALUES ($1, $2, 'rls-relation-attacker', 2)`,
          [tenantB, conversationB],
        ),
      ),
    ).rejects.toThrow();

    const updateResult = await runWithTenant(tenantA, (client) =>
      client.query(
        `UPDATE message_reads SET last_read_sequence_id = 99
         WHERE tenant_id = $1 AND conversation_id = $2 AND user_id = $3`,
        [tenantB, conversationB, userB],
      ),
    );
    const deleteResult = await runWithTenant(tenantA, (client) =>
      client.query(
        `DELETE FROM message_reads
         WHERE tenant_id = $1 AND conversation_id = $2 AND user_id = $3`,
        [tenantB, conversationB, userB],
      ),
    );

    expect(updateResult.rowCount).toBe(0);
    expect(deleteResult.rowCount).toBe(0);
  });

  async function seedTenant(tenantId: string, conversationId: string, userId: string): Promise<void> {
    await runWithTenant(tenantId, async (client) => {
      await client.query(
        `INSERT INTO conversations (tenant_id, id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, id) DO NOTHING`,
        [tenantId, conversationId],
      );
      await client.query(
        `INSERT INTO conversation_members (tenant_id, conversation_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, conversation_id, user_id) DO NOTHING`,
        [tenantId, conversationId, userId],
      );
      await client.query(
        `INSERT INTO message_reads (tenant_id, conversation_id, user_id, last_read_sequence_id)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (tenant_id, conversation_id, user_id) DO NOTHING`,
        [tenantId, conversationId, userId],
      );
    });
  }

  async function cleanupTenant(tenantId: string, conversationId: string): Promise<void> {
    await runWithTenant(tenantId, async (client) => {
      await client.query(`DELETE FROM message_reads WHERE tenant_id = $1 AND conversation_id = $2`, [
        tenantId,
        conversationId,
      ]);
      await client.query(`DELETE FROM conversation_members WHERE tenant_id = $1 AND conversation_id = $2`, [
        tenantId,
        conversationId,
      ]);
      await client.query(`DELETE FROM conversations WHERE tenant_id = $1 AND id = $2`, [tenantId, conversationId]);
    });
  }

  async function runWithTenant<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }
});
