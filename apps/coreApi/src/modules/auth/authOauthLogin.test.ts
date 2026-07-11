import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';
import { AuthService } from './authService';

setupTestEnv();

// exchangeOAuthCode is private; tests still need to stub it (the real impl hits GitHub over HTTP).
type AuthServiceWithExchange = AuthService & {
  exchangeOAuthCode: (
    provider: string,
    code: string,
  ) => Promise<{ providerId: string; email: string | null; name: string | null } | null>;
};

describe('AuthService OAuth Login', () => {
  let service: AuthServiceWithExchange;
  let mocks: ReturnType<typeof createAuthServiceWithMocks>['mocks'];

  beforeEach(() => {
    vi.restoreAllMocks();
    const harness = createAuthServiceWithMocks();
    service = harness.service as AuthServiceWithExchange;
    mocks = harness.mocks;
  });

  it('creates + links an oauth account and returns tokens for a new OAuth user', async () => {
    vi.spyOn(service, 'exchangeOAuthCode').mockResolvedValue({
      email: 'octocat@example.com',
      name: 'Octo Cat',
      providerId: '12345',
    });
    // No existing link → registration path.
    mocks.oauthAccountRepository.findByProvider.mockResolvedValue(null);

    // The new-user path acquires a client to run a cross-repo transaction (users + user_roles +
    // oauth_accounts). We hand it a fake client that records queries so we can assert all three
    // inserts participate in the same transaction.
    const clientCalls: Array<{ sql: string; params?: unknown[] }> = [];
    const fakeClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        clientCalls.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    mocks.userRepository.acquireClient.mockResolvedValue(fakeClient as never);
    mocks.userRepository.assignDefaultRole.mockResolvedValue(undefined);
    mocks.oauthAccountRepository.insert.mockResolvedValue(undefined);
    mocks.userRepository.getRoleNames.mockResolvedValue(['viewer']);

    const result = await service.loginWithOAuth('github', 'new-user-code', 'tenant-1');

    expect(result.userId).toEqual(expect.any(String));
    expect(result.roles).toEqual(['viewer']);
    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(result.tokens.refreshToken).toEqual(expect.any(String));

    // The transaction must BEGIN, INSERT the user, then COMMIT. The role grant and oauth link
    // insert run through their repository mocks (so they don't hit the fake client) — what we
    // verify here is the outer transaction shell that the service orchestrates.
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls).toEqual(expect.arrayContaining(['BEGIN', expect.stringContaining('INSERT INTO users'), 'COMMIT']));
    expect(mocks.userRepository.assignDefaultRole).toHaveBeenCalledWith('tenant-1', result.userId, fakeClient);
    // oauthAccountRepository.insert receives the SAME client so the link row shares the transaction.
    expect(mocks.oauthAccountRepository.insert).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(String),
      result.userId,
      'github',
      '12345',
      fakeClient,
    );
  });

  it('logs in the existing user when the oauth account is already linked', async () => {
    mocks.oauthAccountRepository.findByProvider.mockResolvedValue({
      userId: 'user-1',
      name: 'Existing User',
      isActive: true,
    });
    mocks.userRepository.getRoleNames.mockResolvedValue(['admin']);

    const result = await service.loginWithOAuth('google', 'existing-user-code', 'tenant-1');

    expect(result.userId).toBe('user-1');
    expect(result.name).toBe('Existing User');
    expect(result.roles).toEqual(['admin']);
    // Existing-user path must NOT open a registration transaction.
    expect(mocks.userRepository.acquireClient).not.toHaveBeenCalled();
  });

  it('rejects unsupported providers before any DB work', async () => {
    await expect(service.loginWithOAuth('wechat', 'oauth-code', 'tenant-1')).rejects.toThrow(/provider/i);
    expect(mocks.oauthAccountRepository.findByProvider).not.toHaveBeenCalled();
    expect(mocks.userRepository.acquireClient).not.toHaveBeenCalled();
  });

  it('rejects when OAuth code exchange fails', async () => {
    vi.spyOn(service, 'exchangeOAuthCode').mockResolvedValue(null);

    await expect(service.loginWithOAuth('github', 'fail-exchange', 'tenant-1')).rejects.toThrow(/exchange/i);
    expect(mocks.oauthAccountRepository.findByProvider).not.toHaveBeenCalled();
  });

  it('refuses login for a linked but disabled account', async () => {
    // The code must exchange successfully first; otherwise we never reach the linked-account check.
    vi.spyOn(service, 'exchangeOAuthCode').mockResolvedValue({
      email: 'disabled@example.com',
      name: 'Disabled User',
      providerId: '99999',
    });
    mocks.oauthAccountRepository.findByProvider.mockResolvedValue({
      userId: 'user-1',
      name: 'Disabled User',
      isActive: false,
    });

    await expect(service.loginWithOAuth('github', 'any-code', 'tenant-1')).rejects.toThrow(/disabled/i);
    expect(mocks.userRepository.getRoleNames).not.toHaveBeenCalled();
  });
});
