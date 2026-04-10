import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestEnv, createMockPool } from '../../__tests__/helpers';

setupTestEnv();

import { PermissionsService } from './permissionsService';

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(() => {
    service = new PermissionsService();
  });

  it('returns an empty array from findAll when the database pool is unavailable', async () => {
    await expect(service.findAll()).resolves.toEqual([]);
  });

  it('returns all permissions ordered by module and code', async () => {
    const pool = createMockPool([
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
    ]);
    (
      service as unknown as {
        pool: typeof pool;
      }
    ).pool = pool;

    const result = await service.findAll();

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT id, code, name, module, description FROM permissions ORDER BY module, code',
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.code).toBe('users:read');
  });

  it('returns an empty array from findByModule when the database pool is unavailable', async () => {
    await expect(service.findByModule('users')).resolves.toEqual([]);
  });

  it('filters permissions by module', async () => {
    const pool = createMockPool([
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
    ]);
    (
      service as unknown as {
        pool: typeof pool;
      }
    ).pool = pool;

    const result = await service.findByModule('im');

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
      ['im'],
    );
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
    const pool = createMockPool([{ rowCount: 0, rows: [] }]);
    (service as unknown as { pool: typeof pool }).pool = pool;

    await expect(service.findAll()).resolves.toEqual([]);
  });

  it('returns an empty list when a module has no permissions', async () => {
    const pool = createMockPool([{ rowCount: 0, rows: [] }]);
    (service as unknown as { pool: typeof pool }).pool = pool;

    await expect(service.findByModule('analytics')).resolves.toEqual([]);
  });

  it('passes the requested module string through unchanged for filtering', async () => {
    const pool = createMockPool([{ rowCount: 0, rows: [] }]);
    (service as unknown as { pool: typeof pool }).pool = pool;

    await service.findByModule('im:admin');

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
      ['im:admin'],
    );
  });

  it('surfaces database query errors from findByModule', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValueOnce(new Error('query failed'));
    (service as unknown as { pool: typeof pool }).pool = pool;

    await expect(service.findByModule('users')).rejects.toThrow('query failed');
  });
});
