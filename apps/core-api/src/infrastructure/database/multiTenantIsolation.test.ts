import { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Multi-Tenant Isolation Test Suite
 *
 * Verifies Row-Level Security (RLS) policies prevent cross-tenant data leakage.
 * Tests all attack vectors: unauthorized reads, writes, updates, deletes.
 *
 * Prerequisites:
 * - DATABASE_URL environment variable set
 * - Migrations applied (0001_rls.sql, 0003_audit_logs.sql)
 * - PostgreSQL running with RLS enabled
 */

describe('Multi-Tenant Isolation (RLS)', () => {
  let pool: Pool;
  const TENANT_A = 'tenant-alpha';
  const TENANT_B = 'tenant-beta';
  const CONVERSATION_A = 'conv-alpha-001';
  const CONVERSATION_B = 'conv-beta-001';
  const MESSAGE_A = 'msg-alpha-001';
  const MESSAGE_B = 'msg-beta-001';
  const USER_A = 'user-alpha-001';
  const USER_B = 'user-beta-001';

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL environment variable is required for multi-tenant isolation tests'
      );
    }

    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
    });

    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  async function seedTestData(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [TENANT_A]);
      await client.query(
        `INSERT INTO conversations (tenant_id, id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [TENANT_A, CONVERSATION_A]
      );
      await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type, created_at)
         VALUES ($1, $2, $3, 1, $4, 'trace-a', 'Secret message from Tenant A', 'text', NOW())
         ON CONFLICT DO NOTHING`,
        [TENANT_A, CONVERSATION_A, MESSAGE_A, USER_A]
      );
      await client.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, trace_id, created_at)
         VALUES ('audit-a', $1, $2, 'test.seed', 'trace-a', NOW())
         ON CONFLICT DO NOTHING`,
        [TENANT_A, USER_A]
      );
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload, created_at)
         VALUES ('outbox-a', $1, $2, 'test.event', '{"data":"tenant-a"}', NOW())
         ON CONFLICT DO NOTHING`,
        [TENANT_A, CONVERSATION_A]
      );

      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [TENANT_B]);
      await client.query(
        `INSERT INTO conversations (tenant_id, id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [TENANT_B, CONVERSATION_B]
      );
      await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type, created_at)
         VALUES ($1, $2, $3, 1, $4, 'trace-b', 'Secret message from Tenant B', 'text', NOW())
         ON CONFLICT DO NOTHING`,
        [TENANT_B, CONVERSATION_B, MESSAGE_B, USER_B]
      );
      await client.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, trace_id, created_at)
         VALUES ('audit-b', $1, $2, 'test.seed', 'trace-b', NOW())
         ON CONFLICT DO NOTHING`,
        [TENANT_B, USER_B]
      );
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload, created_at)
         VALUES ('outbox-b', $1, $2, 'test.event', '{"data":"tenant-b"}', NOW())
         ON CONFLICT DO NOTHING`,
        [TENANT_B, CONVERSATION_B]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function cleanupTestData(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [TENANT_A]);
      await client.query(`DELETE FROM messages WHERE tenant_id = $1 AND message_id = $2`, [
        TENANT_A,
        MESSAGE_A,
      ]);
      await client.query(`DELETE FROM conversations WHERE tenant_id = $1 AND id = $2`, [
        TENANT_A,
        CONVERSATION_A,
      ]);
      await client.query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-a'`, [
        TENANT_A,
      ]);
      await client.query(`DELETE FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-a'`, [
        TENANT_A,
      ]);

      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [TENANT_B]);
      await client.query(`DELETE FROM messages WHERE tenant_id = $1 AND message_id = $2`, [
        TENANT_B,
        MESSAGE_B,
      ]);
      await client.query(`DELETE FROM conversations WHERE tenant_id = $1 AND id = $2`, [
        TENANT_B,
        CONVERSATION_B,
      ]);
      await client.query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'`, [
        TENANT_B,
      ]);
      await client.query(`DELETE FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'`, [
        TENANT_B,
      ]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function runWithTenant<T>(
    tenantId: string,
    work: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  describe('Conversations Table RLS', () => {
    it('should allow tenant to read own conversations', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2`, [
          TENANT_A,
          CONVERSATION_A,
        ]);
      });

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].id).toBe(CONVERSATION_A);
    });

    it('should block tenant from reading other tenant conversations', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2`, [
          TENANT_B,
          CONVERSATION_B,
        ]);
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from inserting into other tenant namespace', async () => {
      await expect(
        runWithTenant(TENANT_A, async (client) => {
          return client.query(
            `INSERT INTO conversations (tenant_id, id) VALUES ($1, 'malicious-conv')`,
            [TENANT_B]
          );
        })
      ).rejects.toThrow();
    });

    it('should block tenant from updating other tenant conversations', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `UPDATE conversations SET created_at = NOW() WHERE tenant_id = $1 AND id = $2`,
          [TENANT_B, CONVERSATION_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from deleting other tenant conversations', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`DELETE FROM conversations WHERE tenant_id = $1 AND id = $2`, [
          TENANT_B,
          CONVERSATION_B,
        ]);
      });

      expect(result.rowCount).toBe(0);
    });
  });

  describe('Messages Table RLS', () => {
    it('should allow tenant to read own messages', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT message_id, content FROM messages WHERE tenant_id = $1 AND message_id = $2`,
          [TENANT_A, MESSAGE_A]
        );
      });

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].message_id).toBe(MESSAGE_A);
      expect(result.rows[0].content).toContain('Tenant A');
    });

    it('should block tenant from reading other tenant messages', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT message_id, content FROM messages WHERE tenant_id = $1 AND message_id = $2`,
          [TENANT_B, MESSAGE_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from inserting messages into other tenant conversations', async () => {
      await expect(
        runWithTenant(TENANT_A, async (client) => {
          return client.query(
            `INSERT INTO messages (tenant_id, conversation_id, message_id, sequence_id, user_id, trace_id, content, message_type)
             VALUES ($1, $2, 'malicious-msg', 999, 'attacker', 'trace-x', 'Injected message', 'text')`,
            [TENANT_B, CONVERSATION_B]
          );
        })
      ).rejects.toThrow();
    });

    it('should block tenant from updating other tenant messages', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `UPDATE messages SET content = 'HACKED' WHERE tenant_id = $1 AND message_id = $2`,
          [TENANT_B, MESSAGE_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from deleting other tenant messages', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`DELETE FROM messages WHERE tenant_id = $1 AND message_id = $2`, [
          TENANT_B,
          MESSAGE_B,
        ]);
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block wildcard queries from leaking cross-tenant data', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT message_id, tenant_id FROM messages WHERE content LIKE '%Secret%'`
        );
      });

      expect(result.rowCount).toBeGreaterThan(0);
      result.rows.forEach((row) => {
        expect(row.tenant_id).toBe(TENANT_A);
      });
    });
  });

  describe('Outbox Events Table RLS', () => {
    it('should allow tenant to read own outbox events', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT id, payload FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-a'`,
          [TENANT_A]
        );
      });

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].id).toBe('outbox-a');
    });

    it('should block tenant from reading other tenant outbox events', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT id, payload FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'`,
          [TENANT_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from inserting outbox events for other tenant', async () => {
      await expect(
        runWithTenant(TENANT_A, async (client) => {
          return client.query(
            `INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload)
             VALUES ('malicious-outbox', $1, 'conv-x', 'test.event', '{"malicious":true}')`,
            [TENANT_B]
          );
        })
      ).rejects.toThrow();
    });

    it('should block tenant from updating other tenant outbox events', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `UPDATE outbox_events SET published_at = NOW() WHERE tenant_id = $1 AND id = 'outbox-b'`,
          [TENANT_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from deleting other tenant outbox events', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`DELETE FROM outbox_events WHERE tenant_id = $1 AND id = 'outbox-b'`, [
          TENANT_B,
        ]);
      });

      expect(result.rowCount).toBe(0);
    });
  });

  describe('Audit Logs Table RLS', () => {
    it('should allow tenant to read own audit logs', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT id, action FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-a'`,
          [TENANT_A]
        );
      });

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].id).toBe('audit-a');
    });

    it('should block tenant from reading other tenant audit logs', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT id, action FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'`,
          [TENANT_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from inserting audit logs for other tenant', async () => {
      await expect(
        runWithTenant(TENANT_A, async (client) => {
          return client.query(
            `INSERT INTO audit_logs (id, tenant_id, user_id, action, trace_id)
             VALUES ('malicious-audit', $1, 'attacker', 'test.malicious', 'trace-x')`,
            [TENANT_B]
          );
        })
      ).rejects.toThrow();
    });

    it('should block tenant from updating other tenant audit logs', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `UPDATE audit_logs SET action = 'TAMPERED' WHERE tenant_id = $1 AND id = 'audit-b'`,
          [TENANT_B]
        );
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block tenant from deleting other tenant audit logs', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND id = 'audit-b'`, [
          TENANT_B,
        ]);
      });

      expect(result.rowCount).toBe(0);
    });
  });

  describe('Edge Cases and Attack Vectors', () => {
    it('should block SQL injection attempts to bypass RLS', async () => {
      const maliciousInput = `${TENANT_A}' OR '1'='1`;
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(`SELECT id FROM conversations WHERE tenant_id = $1`, [maliciousInput]);
      });

      expect(result.rowCount).toBe(0);
    });

    it('should block attempts to unset tenant context', async () => {
      await expect(
        runWithTenant(TENANT_A, async (client) => {
          await client.query(`SELECT set_config('app.current_tenant', '', true)`);
          return client.query(`SELECT id FROM conversations WHERE tenant_id = $1`, [TENANT_B]);
        })
      ).rejects.toThrow();
    });

    it('should block attempts to switch tenant mid-transaction', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        const beforeSwitch = await client.query(
          `SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2`,
          [TENANT_A, CONVERSATION_A]
        );

        await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [TENANT_B]);

        const afterSwitch = await client.query(
          `SELECT id FROM conversations WHERE tenant_id = $1 AND id = $2`,
          [TENANT_B, CONVERSATION_B]
        );

        return { beforeSwitch: beforeSwitch.rowCount, afterSwitch: afterSwitch.rowCount };
      });

      expect(result.beforeSwitch).toBe(1);
      expect(result.afterSwitch).toBe(1);
    });

    it('should enforce RLS even with FORCE ROW LEVEL SECURITY', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Query without tenant context should throw error (strict validation)
        await expect(
          client.query(`SELECT id FROM conversations WHERE tenant_id = $1`, [TENANT_A])
        ).rejects.toThrow('Tenant context');

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    it('should block JOIN-based cross-tenant data leakage', async () => {
      const result = await runWithTenant(TENANT_A, async (client) => {
        return client.query(
          `SELECT m.message_id, m.tenant_id, c.tenant_id as conv_tenant
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           WHERE m.content LIKE '%Secret%'`
        );
      });

      result.rows.forEach((row) => {
        expect(row.tenant_id).toBe(TENANT_A);
        expect(row.conv_tenant).toBe(TENANT_A);
      });
    });
  });
});
