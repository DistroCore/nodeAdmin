import { describe, it, expect, vi } from 'vitest';
import { setupTestEnv } from '../../__tests__/helpers';
import { AuthService } from './authService';

setupTestEnv();

interface MockQueryResult {
  rowCount?: number;
  rows: Array<Record<string, string | number | null>>;
}

interface MockPool {
  query: (sql: string, params?: readonly unknown[]) => Promise<MockQueryResult>;
}

type AuthServiceWithPool = AuthService & { pool: MockPool | null };

function createMockPool(queryResults: MockQueryResult[] = []) {
  const mockQuery = vi.fn<(sql: string, params?: readonly unknown[]) => Promise<MockQueryResult>>();
  for (const result of queryResults) {
    mockQuery.mockResolvedValueOnce(result);
  }
  mockQuery.mockResolvedValue({ rows: [] });

  return {
    mockQuery,
    pool: {
      query: mockQuery,
    } satisfies MockPool,
  };
}

describe('AuthService — OAuth Account Management', () => {
  describe('listOAuthAccounts', () => {
    it('should return linked OAuth accounts for a user', async () => {
      const { pool, mockQuery } = createMockPool();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { provider: 'github', provider_id: 'gh-123', created_at: '2026-01-01' },
          { provider: 'google', provider_id: 'gl-456', created_at: '2026-01-02' },
        ],
      });

      const service = new AuthService() as AuthServiceWithPool;
      service.pool = pool;

      const accounts = await service.listOAuthAccounts('user-1');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('oauth_accounts'), ['user-1']);
      expect(accounts).toHaveLength(2);
      expect(accounts[0].provider).toBe('github');
      expect(accounts[1].provider).toBe('google');
    });

    it('should return empty array if no accounts linked', async () => {
      const { pool, mockQuery } = createMockPool();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const service = new AuthService() as AuthServiceWithPool;
      service.pool = pool;

      const accounts = await service.listOAuthAccounts('user-1');
      expect(accounts).toEqual([]);
    });

    it('should throw if database is not available', async () => {
      const service = new AuthService() as AuthServiceWithPool;
      service.pool = null;

      await expect(service.listOAuthAccounts('user-1')).rejects.toThrow('Database not available.');
    });
  });

  describe('unlinkOAuthAccount', () => {
    it('should delete a linked OAuth account', async () => {
      const { pool, mockQuery } = createMockPool();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const service = new AuthService() as AuthServiceWithPool;
      service.pool = pool;

      await service.unlinkOAuthAccount('user-1', 'github');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM oauth_accounts'), [
        'user-1',
        'github',
      ]);
    });

    it('should throw if account not found', async () => {
      const { pool, mockQuery } = createMockPool();
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const service = new AuthService() as AuthServiceWithPool;
      service.pool = pool;

      await expect(service.unlinkOAuthAccount('user-1', 'github')).rejects.toThrow('Linked account not found.');
    });

    it('should throw if database is not available', async () => {
      const service = new AuthService() as AuthServiceWithPool;
      service.pool = null;

      await expect(service.unlinkOAuthAccount('user-1', 'github')).rejects.toThrow('Database not available.');
    });
  });
});
