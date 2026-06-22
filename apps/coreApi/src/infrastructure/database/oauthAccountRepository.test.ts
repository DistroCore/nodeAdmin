import { describe, expect, it } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import type { MockPool } from '../../__tests__/helpers';
import { vi } from 'vitest';
import { OAuthAccountRepository } from './oauthAccountRepository';

setupTestEnv();

describe('OAuthAccountRepository', () => {
  describe('findByProvider', () => {
    it('joins users to surface is_active and name in one round-trip', async () => {
      const pool = createMockPool([
        {
          rows: [{ userId: 'user-1', name: 'Octo', isActive: true }],
          rowCount: 1,
        },
      ]);
      const repo = new OAuthAccountRepository(pool);

      const result = await repo.findByProvider('github', '12345');

      expect(result).toEqual({ userId: 'user-1', name: 'Octo', isActive: true });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN users u ON u.id = oa.user_id'),
        ['github', '12345'],
      );
    });

    it('returns null when no link exists', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 0 }]);
      const repo = new OAuthAccountRepository(pool);
      await expect(repo.findByProvider('github', 'unknown')).resolves.toBeNull();
    });
  });

  describe('insert', () => {
    it('sets tenant context on the provided client and inserts the link row', async () => {
      const client = createMockClient([]);
      const repo = new OAuthAccountRepository(createMockPool());

      await repo.insert('tenant-1', 'oa-id', 'user-1', 'github', '12345', client);

      const setConfig = client.calls.find((c) => c.sql.includes('set_config'));
      expect(setConfig?.params).toEqual(['tenant-1']);
      const insertCall = client.calls.find((c) => c.sql.includes('INSERT INTO oauth_accounts'));
      expect(insertCall?.params).toEqual(['oa-id', 'user-1', 'github', '12345']);
    });
  });

  describe('listByUserId', () => {
    it('returns accounts with camelCased field names', async () => {
      const pool = createMockPool([
        {
          rows: [
            { provider: 'github', provider_id: 'gh-1', created_at: '2026-01-01' },
            { provider: 'google', provider_id: 'gl-2', created_at: '2026-01-02' },
          ],
          rowCount: 2,
        },
      ]);
      const repo = new OAuthAccountRepository(pool);

      const accounts = await repo.listByUserId('user-1');

      expect(accounts).toEqual([
        { provider: 'github', providerId: 'gh-1', createdAt: '2026-01-01' },
        { provider: 'google', providerId: 'gl-2', createdAt: '2026-01-02' },
      ]);
    });

    it('returns an empty array when the pool is unavailable', async () => {
      const repo = new OAuthAccountRepository(null);
      await expect(repo.listByUserId('user-1')).resolves.toEqual([]);
    });
  });

  describe('deleteByUserAndProvider', () => {
    it('returns the rowCount from the DELETE', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 1 }]) as MockPool;
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 })) as MockPool['query'];
      const repo = new OAuthAccountRepository(pool);

      const removed = await repo.deleteByUserAndProvider('user-1', 'github');

      expect(removed).toBe(1);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM oauth_accounts'), [
        'user-1',
        'github',
      ]);
    });

    it('returns 0 when the pool is unavailable', async () => {
      const repo = new OAuthAccountRepository(null);
      await expect(repo.deleteByUserAndProvider('user-1', 'github')).resolves.toBe(0);
    });
  });
});
