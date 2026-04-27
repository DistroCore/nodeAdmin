import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv, createMockClient, createMockPool } from '../../__tests__/helpers';
import type { MockPool } from '../../__tests__/helpers';

setupTestEnv();

import { PermissionsService } from './permissionsService';

function setPermissionsServicePool(service: PermissionsService, pool: MockPool): void {
  (service as unknown as { pool: MockPool }).pool = pool;
}

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(() => {
    service = new PermissionsService();
  });

  it('returns an empty array from findAll when the database pool is unavailable', async () => {
    await expect(service.findAll('tenant-1')).resolves.toEqual([]);
  });

  it('returns all permissions inside a tenant-scoped session', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      {
        rowCount: 2,
        rows: [
          {
            code: 'users:read',
            description: 'Read users',
            id: 'permission-1',
            module: 'users',
            name: 'Read Users',
          },
          {
            code: 'users:write',
            description: null,
            id: 'permission-2',
            module: 'users',
            name: 'Write Users',
          },
        ],
      },
      { rows: [], rowCount: 0 },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    setPermissionsServicePool(service, pool);

    const result = await service.findAll('tenant-1');

    expect(client.calls[0]).toEqual({ params: [], sql: 'BEGIN' });
    expect(client.calls[1]).toEqual({
      params: ['tenant-1'],
      sql: `SELECT set_config('app.current_tenant', $1, true)`,
    });
    expect(client.calls[2]).toEqual({
      params: [],
      sql: 'SELECT id, code, name, module, description FROM permissions ORDER BY module, code',
    });
    expect(client.calls[3]).toEqual({ params: [], sql: 'COMMIT' });
    expect(result).toHaveLength(2);
    expect(result[0]?.code).toBe('users:read');
  });

  it('returns an empty array from findByModule when the database pool is unavailable', async () => {
    await expect(service.findByModule('tenant-1', 'users')).resolves.toEqual([]);
  });

  it('filters permissions by module within a tenant-scoped session', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      {
        rowCount: 1,
        rows: [
          {
            code: 'im:send',
            description: 'Send IM messages',
            id: 'permission-3',
            module: 'im',
            name: 'Send Message',
          },
        ],
      },
      { rows: [], rowCount: 0 },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    setPermissionsServicePool(service, pool);

    const result = await service.findByModule('tenant-1', 'im');

    expect(client.calls[1]).toEqual({
      params: ['tenant-1'],
      sql: `SELECT set_config('app.current_tenant', $1, true)`,
    });
    expect(client.calls[2]).toEqual({
      params: ['im'],
      sql: 'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
    });
    expect(result).toEqual([
      {
        code: 'im:send',
        description: 'Send IM messages',
        id: 'permission-3',
        module: 'im',
        name: 'Send Message',
      },
    ]);
  });

  it('returns an empty list when no permissions exist in the database', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rowCount: 0, rows: [] },
      { rows: [], rowCount: 0 },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    setPermissionsServicePool(service, pool);

    await expect(service.findAll('tenant-1')).resolves.toEqual([]);
  });

  it('passes the requested module string through unchanged for filtering', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rowCount: 0, rows: [] },
      { rows: [], rowCount: 0 },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    setPermissionsServicePool(service, pool);

    await service.findByModule('tenant-1', 'im:admin');

    expect(client.calls[2]).toEqual({
      params: ['im:admin'],
      sql: 'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
    });
  });

  it('rolls back and surfaces database query errors from findByModule', async () => {
    const client = createMockClient();
    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      client.calls.push({ sql, params: params ?? [] });
      if (sql.includes('WHERE module = $1')) {
        throw new Error('query failed');
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    setPermissionsServicePool(service, pool);

    await expect(service.findByModule('tenant-1', 'users')).rejects.toThrow('query failed');
    expect(client.calls.at(-1)).toEqual({ params: [], sql: 'ROLLBACK' });
  });
});
