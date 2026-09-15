import { describe, expect, it } from 'vitest';
import { sign } from 'jsonwebtoken';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { runtimeConfig } from '../../app/runtimeConfig';

describe('AuthService token lifecycle', () => {
  it('round-trips issued access tokens through verification', () => {
    const { service } = createAuthServiceWithMocks();

    const issuedTokens = service.issueTokens({
      roles: ['admin', 'viewer'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });

    const identity = service.verifyAccessToken(issuedTokens.accessToken);

    expect(identity).toMatchObject({
      roles: ['admin', 'viewer'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });
    expect(identity.jti).toBeTypeOf('string');
  });

  it('rejects expired access tokens', () => {
    const { service } = createAuthServiceWithMocks();
    const expiredToken = sign(
      {
        jti: 'expired-jti',
        roles: ['admin'],
        sub: 'user-1',
        tid: 'tenant-a',
        type: 'access',
      },
      runtimeConfig.auth.accessSecret,
      { expiresIn: '-1s' },
    );

    expect(() => service.verifyAccessToken(expiredToken)).toThrow('Invalid or expired access token.');
  });

  it('refreshes tokens with roles loaded from the same tenant scope', async () => {
    const { service, mocks } = createAuthServiceWithMocks();
    mocks.userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
      name: null,
      passwordHash: 'hash',
    });
    mocks.userRepository.getRoleNames.mockResolvedValue(['admin', 'viewer']);

    const issuedTokens = service.issueTokens({
      roles: ['ignored'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });

    const refreshedTokens = await service.refreshTokens(issuedTokens.refreshToken);
    const identity = service.verifyAccessToken(refreshedTokens.accessToken);

    // is_active guard runs against the token's tenant, not a default.
    expect(mocks.userRepository.findById).toHaveBeenCalledWith('tenant-a', 'user-1');
    expect(mocks.userRepository.getRoleNames).toHaveBeenCalledWith('user-1', 'tenant-a');
    expect(identity).toMatchObject({
      roles: ['admin', 'viewer'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });
  });

  it('rejects refresh for a disabled account even with a valid refresh token', async () => {
    const { service, mocks } = createAuthServiceWithMocks();
    mocks.userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: false,
      name: null,
      passwordHash: 'hash',
    });

    const issuedTokens = service.issueTokens({
      roles: ['admin'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });

    await expect(service.refreshTokens(issuedTokens.refreshToken)).rejects.toThrow('Account is disabled.');
    // Roles must never be loaded once the account is known to be disabled.
    expect(mocks.userRepository.getRoleNames).not.toHaveBeenCalled();
  });

  it('rejects refresh when the user no longer exists', async () => {
    const { service, mocks } = createAuthServiceWithMocks();
    mocks.userRepository.findById.mockResolvedValue(null);

    const issuedTokens = service.issueTokens({
      roles: ['admin'],
      tenantId: 'tenant-a',
      userId: 'user-gone',
    });

    // Same message as disabled — avoid leaking whether the account existed.
    await expect(service.refreshTokens(issuedTokens.refreshToken)).rejects.toThrow('Account is disabled.');
  });

  it('keeps tenant claims isolated between issued tokens', () => {
    const { service } = createAuthServiceWithMocks();

    const tenantAIdentity = service.verifyAccessToken(
      service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-a',
        userId: 'user-1',
      }).accessToken,
    );

    const tenantBIdentity = service.verifyAccessToken(
      service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-b',
        userId: 'user-1',
      }).accessToken,
    );

    expect(tenantAIdentity.tenantId).toBe('tenant-a');
    expect(tenantBIdentity.tenantId).toBe('tenant-b');
    expect(tenantAIdentity.tenantId).not.toBe(tenantBIdentity.tenantId);
  });
});
