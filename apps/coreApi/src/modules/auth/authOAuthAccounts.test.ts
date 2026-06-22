import { describe, it, expect } from 'vitest';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

describe('AuthService — OAuth Account Management', () => {
  describe('listOAuthAccounts', () => {
    it('returns linked OAuth accounts for a user', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.oauthAccountRepository.listByUserId.mockResolvedValue([
        { provider: 'github', providerId: 'gh-123', createdAt: '2026-01-01' },
        { provider: 'google', providerId: 'gl-456', createdAt: '2026-01-02' },
      ]);

      const accounts = await service.listOAuthAccounts('user-1');

      expect(mocks.oauthAccountRepository.listByUserId).toHaveBeenCalledWith('user-1');
      expect(accounts).toHaveLength(2);
      expect(accounts[0].provider).toBe('github');
      expect(accounts[1].provider).toBe('google');
    });

    it('returns an empty array when no accounts are linked', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.oauthAccountRepository.listByUserId.mockResolvedValue([]);

      const accounts = await service.listOAuthAccounts('user-1');
      expect(accounts).toEqual([]);
    });
  });

  describe('unlinkOAuthAccount', () => {
    it('deletes a linked OAuth account when the repository reports a removal', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.oauthAccountRepository.deleteByUserAndProvider.mockResolvedValue(1);

      await service.unlinkOAuthAccount('user-1', 'github');

      expect(mocks.oauthAccountRepository.deleteByUserAndProvider).toHaveBeenCalledWith('user-1', 'github');
    });

    it('throws when the account is not linked (repository removed 0 rows)', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.oauthAccountRepository.deleteByUserAndProvider.mockResolvedValue(0);

      await expect(service.unlinkOAuthAccount('user-1', 'github')).rejects.toThrow('Linked account not found.');
    });
  });
});
