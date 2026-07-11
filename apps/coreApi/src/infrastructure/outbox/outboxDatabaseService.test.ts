import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool } from '../../__tests__/helpers';
import { OutboxDatabaseService } from './outboxDatabaseService';

const originalOutboxDatabaseUrl = process.env.OUTBOX_DATABASE_URL;

afterEach(() => {
  if (originalOutboxDatabaseUrl === undefined) {
    delete process.env.OUTBOX_DATABASE_URL;
  } else {
    process.env.OUTBOX_DATABASE_URL = originalOutboxDatabaseUrl;
  }
});

describe('OutboxDatabaseService', () => {
  it('rejects a missing dedicated database URL', async () => {
    delete process.env.OUTBOX_DATABASE_URL;
    const service = new OutboxDatabaseService();

    await expect(service.assertSafeRole()).rejects.toThrow('OUTBOX_DATABASE_URL is required');
  });

  it('accepts only a non-superuser BYPASSRLS role with narrow table privileges', async () => {
    delete process.env.OUTBOX_DATABASE_URL;
    const service = new OutboxDatabaseService();
    const client = createMockClient([
      {
        rowCount: 1,
        rows: [
          {
            can_access_audit_logs: false,
            can_access_messages: false,
            can_access_outbox: true,
            can_access_users: false,
            rolbypassrls: true,
            rolname: 'nodeadmin_outbox',
            rolsuper: false,
          },
        ],
      },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    (service as unknown as { pool: typeof pool }).pool = pool;

    await expect(service.assertSafeRole()).resolves.toBeUndefined();
    expect(client.release).toHaveBeenCalledWith();
  });

  it('rejects a superuser even when it can access the outbox table', async () => {
    delete process.env.OUTBOX_DATABASE_URL;
    const service = new OutboxDatabaseService();
    const client = createMockClient([
      {
        rowCount: 1,
        rows: [
          {
            can_access_audit_logs: true,
            can_access_messages: true,
            can_access_outbox: true,
            can_access_users: true,
            rolbypassrls: true,
            rolname: 'nodeadmin',
            rolsuper: true,
          },
        ],
      },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    (service as unknown as { pool: typeof pool }).pool = pool;

    await expect(service.assertSafeRole()).rejects.toThrow('restricted cross-tenant outbox role');
    expect(client.release).toHaveBeenCalledWith();
  });

  it('closes its dedicated pool on module destroy', async () => {
    delete process.env.OUTBOX_DATABASE_URL;
    const service = new OutboxDatabaseService();
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    (service as unknown as { pool: typeof pool }).pool = pool;

    await service.onModuleDestroy();

    expect(pool.end).toHaveBeenCalledWith();
  });
});
