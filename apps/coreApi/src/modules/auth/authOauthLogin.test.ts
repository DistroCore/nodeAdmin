import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv, type MockPool } from '../../__tests__/helpers';
import { AuthService } from './authService';

setupTestEnv();

type AuthServiceWithPool = AuthService & { pool: MockPool };
type AuthServiceWithExchange = AuthServiceWithPool & {
  exchangeOAuthCode: (
    provider: string,
    code: string,
  ) => Promise<{ providerId: string; email: string | null; name: string | null } | null>;
};

describe('AuthService OAuth Login', () => {
  let service: AuthServiceWithExchange;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new AuthService() as AuthServiceWithExchange;
  });

  it('should create/link oauth account and return tokens for new OAuth user', async () => {
    vi.spyOn(service, 'exchangeOAuthCode').mockResolvedValue({
      email: 'octocat@example.com',
      name: 'Octo Cat',
      providerId: '12345',
    });

    const mockClient = createMockClient([]);
    const mockPool = createMockPool([
      { rows: [], rowCount: 0 },
      { rows: [{ name: 'viewer' }], rowCount: 1 },
    ]);
    mockPool.connect = vi.fn(async () => mockClient);
    service.pool = mockPool;

    const result = await service.loginWithOAuth('github', 'new-user-code', 'tenant-1');

    expect(result.userId).toEqual(expect.any(String));
    expect(result.roles).toEqual(['viewer']);
    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(result.tokens.refreshToken).toEqual(expect.any(String));

    const insertUserCall = mockClient.calls.find((call) => call.sql.includes('INSERT INTO users'));
    expect(insertUserCall).toBeDefined();

    const insertOauthCall = mockClient.calls.find((call) => call.sql.includes('INSERT INTO oauth_accounts'));
    expect(insertOauthCall).toBeDefined();
    expect(insertOauthCall?.params[2]).toBe('github');
  });

  it('should login existing user if oauth account already linked', async () => {
    const mockPool = createMockPool([
      {
        rows: [{ user_id: 'user-1', name: 'Existing User', is_active: 1 }],
        rowCount: 1,
      },
      { rows: [{ name: 'admin' }], rowCount: 1 },
    ]);
    service.pool = mockPool;

    const result = await service.loginWithOAuth('google', 'existing-user-code', 'tenant-1');

    expect(result.userId).toBe('user-1');
    expect(result.name).toBe('Existing User');
    expect(result.roles).toEqual(['admin']);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('should reject invalid provider (only github and google)', async () => {
    const mockPool = createMockPool();
    service.pool = mockPool;

    await expect(service.loginWithOAuth('wechat', 'oauth-code', 'tenant-1')).rejects.toThrow(/provider/i);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('should reject if OAuth code exchange fails', async () => {
    vi.spyOn(service, 'exchangeOAuthCode').mockResolvedValue(null);

    const mockPool = createMockPool();
    service.pool = mockPool;

    await expect(service.loginWithOAuth('github', 'fail-exchange', 'tenant-1')).rejects.toThrow(/exchange/i);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});
