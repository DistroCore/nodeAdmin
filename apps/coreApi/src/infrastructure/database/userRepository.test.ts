import { describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import type { MockClient, MockPool } from '../../__tests__/helpers';

setupTestEnv();

import { UserRepository } from './userRepository';

describe('UserRepository', () => {
  describe('findByEmail', () => {
    it('returns null when the pool is unavailable (dev fallback)', async () => {
      const repo = new UserRepository(null);
      await expect(repo.findByEmail('tenant-1', 'a@b.com')).resolves.toBeNull();
    });

    it('selects by tenant + email and maps columns to the typed row', async () => {
      const pool = createMockPool([
        {
          rows: [
            {
              id: 'user-1',
              email: 'a@b.com',
              isActive: true,
              name: 'A',
              passwordHash: 'hash',
            },
          ],
          rowCount: 1,
        },
      ]);

      const repo = new UserRepository(pool);
      const user = await repo.findByEmail('tenant-1', 'a@b.com');

      expect(user).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        isActive: true,
        name: 'A',
        passwordHash: 'hash',
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1\n          AND email = $2'),
        ['tenant-1', 'a@b.com'],
      );
    });

    it('returns null when no row matches', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 0 }]);
      const repo = new UserRepository(pool);
      await expect(repo.findByEmail('tenant-1', 'nobody@b.com')).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('scopes by id + tenant', async () => {
      const pool = createMockPool([
        { rows: [{ id: 'user-1', email: 'a@b.com', isActive: true, name: null, passwordHash: 'h' }], rowCount: 1 },
      ]);
      const repo = new UserRepository(pool);

      await repo.findById('tenant-1', 'user-1');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1\n          AND tenant_id = $2'), [
        'user-1',
        'tenant-1',
      ]);
    });
  });

  describe('getRoleNames', () => {
    it('joins user_roles + roles and returns role names', async () => {
      const pool = createMockPool([{ rows: [{ name: 'admin' }, { name: 'viewer' }], rowCount: 2 }]);
      const repo = new UserRepository(pool);

      const roles = await repo.getRoleNames('user-1', 'tenant-1');

      expect(roles).toEqual(['admin', 'viewer']);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN user_roles ur'), ['user-1', 'tenant-1']);
    });

    it('returns an empty array when the pool is unavailable', async () => {
      const repo = new UserRepository(null);
      await expect(repo.getRoleNames('user-1', 'tenant-1')).resolves.toEqual([]);
    });
  });

  describe('createUserWithDefaultRole', () => {
    it('runs the user insert and role grant inside one transaction with RLS context', async () => {
      const client = createMockClient([]);
      const pool = createMockPool();
      (pool as MockPool).connect = vi.fn(async () => client);
      const repo = new UserRepository(pool);

      await repo.createUserWithDefaultRole('tenant-1', 'user-1', 'a@b.com', 'hash', 'A');

      const sqls = client.calls.map((c) => c.sql);
      expect(sqls).toEqual(
        expect.arrayContaining([
          'BEGIN',
          expect.stringContaining("set_config('app.current_tenant'"),
          expect.stringContaining('INSERT INTO users'),
          expect.stringContaining('INSERT INTO user_roles'),
          'COMMIT',
        ]),
      );
      // set_config must be transaction-scoped (3rd arg true) so it doesn't leak to the pool.
      const setConfigCall = client.calls.find((c) => c.sql.includes('set_config'));
      expect(setConfigCall?.sql).toContain(', true)');

      const insertUser = client.calls.find((c) => c.sql.includes('INSERT INTO users'));
      expect(insertUser?.params).toEqual(['user-1', 'tenant-1', 'a@b.com', 'hash', 'A']);
    });

    it('rolls back and rethrows when the user insert fails', async () => {
      const client = createMockClient([]);
      client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        client.calls.push({ sql, params: params ?? [] });
        if (sql.includes('INSERT INTO users')) throw new Error('constraint violation');
        return { rows: [], rowCount: 0 };
      });
      const pool = createMockPool();
      (pool as MockPool).connect = vi.fn(async () => client);
      const repo = new UserRepository(pool);

      await expect(repo.createUserWithDefaultRole('tenant-1', 'user-1', 'a@b.com', 'hash', null)).rejects.toThrow(
        'constraint violation',
      );
      const sqls = client.calls.map((c) => c.sql);
      expect(sqls).toEqual(expect.arrayContaining(['ROLLBACK']));
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('acquireClient', () => {
    it('connects, sets tenant context, and returns the client for the caller to own', async () => {
      const client = createMockClient([]) as unknown as MockClient;
      const pool = createMockPool();
      (pool as MockPool).connect = vi.fn(async () => client);
      const repo = new UserRepository(pool);

      const acquired = await repo.acquireClient('tenant-1');

      expect(acquired).toBe(client);
      expect(client.calls.some((c) => c.sql.includes('set_config') && c.params[0] === 'tenant-1')).toBe(true);
    });
  });

  describe('updatePassword', () => {
    it('reuses the caller-supplied client when provided (no inner BEGIN/COMMIT)', async () => {
      const client = createMockClient([]);
      const repo = new UserRepository(createMockPool());

      await repo.updatePassword('tenant-1', 'user-1', 'newhash', client);

      // No BEGIN/COMMIT — the caller owns the transaction.
      const sqls = client.calls.map((c) => c.sql);
      expect(sqls).not.toContain('BEGIN');
      expect(sqls).not.toContain('COMMIT');
      expect(sqls).toEqual(
        expect.arrayContaining([
          expect.stringContaining('set_config'),
          expect.stringContaining('UPDATE users SET password_hash'),
        ]),
      );
      const updateCall = client.calls.find((c) => c.sql.includes('UPDATE users'));
      expect(updateCall?.params).toEqual(['newhash', 'user-1']);
    });
  });
});
