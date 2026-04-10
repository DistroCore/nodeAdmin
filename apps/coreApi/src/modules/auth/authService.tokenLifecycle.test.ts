import { beforeEach, describe, expect, it } from 'vitest';
import { sign } from 'jsonwebtoken';
import { createMockPool, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { runtimeConfig } from '../../app/runtimeConfig';
import { AuthService } from './authService';

describe('AuthService token lifecycle', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  it('round-trips issued access tokens through verification', () => {
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
    const mockPool = createMockPool([
      {
        rows: [{ name: 'admin' }, { name: 'viewer' }],
        rowCount: 2,
      },
    ]);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    const issuedTokens = service.issueTokens({
      roles: ['ignored'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });

    const refreshedTokens = await service.refreshTokens(issuedTokens.refreshToken);
    const identity = service.verifyAccessToken(refreshedTokens.accessToken);

    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT r.name FROM roles r'), [
      'user-1',
      'tenant-a',
    ]);
    expect(identity).toMatchObject({
      roles: ['admin', 'viewer'],
      tenantId: 'tenant-a',
      userId: 'user-1',
    });
  });

  it('keeps tenant claims isolated between issued tokens', () => {
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
