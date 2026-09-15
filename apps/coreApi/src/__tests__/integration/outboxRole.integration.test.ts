import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl =
  process.env.OUTBOX_DATABASE_URL?.trim() || 'postgres://nodeadmin_outbox:nodeadmin@127.0.0.1:55432/nodeadmin';

describe('Outbox database role integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('uses a non-superuser BYPASSRLS role that can process all outbox rows', async () => {
    const roleResult = await pool.query<{
      rolbypassrls: boolean;
      rolname: string;
      rolsuper: boolean;
    }>('SELECT current_user AS rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');

    expect(roleResult.rows[0]).toEqual({
      rolbypassrls: true,
      rolname: 'nodeadmin_outbox',
      rolsuper: false,
    });
    await expect(pool.query('SELECT id FROM outbox_events LIMIT 1')).resolves.toBeDefined();
  });

  it.each(['audit_logs', 'messages', 'users'])('cannot read application table %s', async (tableName) => {
    await expect(pool.query(`SELECT 1 FROM ${tableName} LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
  });
});
