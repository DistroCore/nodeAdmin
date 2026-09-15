import { describe, expect, it } from 'vitest';
import { hash } from 'bcryptjs';
import { verify } from 'jsonwebtoken';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

// Must set env before importing runtimeConfig (loaded at import time)
setupTestEnv();

describe('AuthService', () => {
  // ─── issueTokens ──────────────────────────────────────────────

  describe('issueTokens', () => {
    it('returns accessToken, refreshToken, and tokenType', () => {
      const { service } = createAuthServiceWithMocks();
      const result = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tokenType).toBe('Bearer');
    });

    it('signs accessToken with correct claims', () => {
      const { service } = createAuthServiceWithMocks();
      const { accessToken } = service.issueTokens({
        roles: ['admin', 'viewer'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const decoded = verify(accessToken, 'test-access-secret-key') as Record<string, unknown>;
      expect(decoded.sub).toBe('user-1');
      expect(decoded.tid).toBe('tenant-1');
      expect(decoded.type).toBe('access');
      expect(decoded.roles).toEqual(['admin', 'viewer']);
      expect(decoded.jti).toBeDefined();
    });

    it('signs refreshToken with correct claims', () => {
      const { service } = createAuthServiceWithMocks();
      const { refreshToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const decoded = verify(refreshToken, 'test-refresh-secret-key') as Record<string, unknown>;
      expect(decoded.sub).toBe('user-1');
      expect(decoded.tid).toBe('tenant-1');
      expect(decoded.type).toBe('refresh');
      expect(decoded).not.toHaveProperty('roles');
    });

    it('deduplicates and trims roles', () => {
      const { service } = createAuthServiceWithMocks();
      const { accessToken } = service.issueTokens({
        roles: [' admin ', 'admin', 'viewer', 'viewer '],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const decoded = verify(accessToken, 'test-access-secret-key') as Record<string, unknown>;
      expect(decoded.roles).toEqual(['admin', 'viewer']);
    });

    it('filters out empty roles', () => {
      const { service } = createAuthServiceWithMocks();
      const { accessToken } = service.issueTokens({
        roles: ['admin', '', '  ', 'viewer'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const decoded = verify(accessToken, 'test-access-secret-key') as Record<string, unknown>;
      expect(decoded.roles).toEqual(['admin', 'viewer']);
    });
  });

  // ─── verifyAccessToken ────────────────────────────────────────

  describe('verifyAccessToken', () => {
    it('returns AuthIdentity for a valid token', () => {
      const { service } = createAuthServiceWithMocks();
      const { accessToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const identity = service.verifyAccessToken(accessToken);
      expect(identity.userId).toBe('user-1');
      expect(identity.tenantId).toBe('tenant-1');
      expect(identity.roles).toEqual(['admin']);
      expect(identity.jti).toBeDefined();
    });

    it('throws UnauthorizedException for a tampered token', () => {
      const { service } = createAuthServiceWithMocks();
      const { accessToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(() => service.verifyAccessToken(accessToken + 'x')).toThrow('Invalid or expired access token.');
    });

    it('throws for a refresh token presented as an access token', () => {
      const { service } = createAuthServiceWithMocks();
      const { refreshToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Signed with refreshSecret, not accessSecret → verify() fails with "invalid signature",
      // which maps to "Invalid or expired access token." before the type-check is reached.
      expect(() => service.verifyAccessToken(refreshToken)).toThrow('Invalid or expired access token.');
    });
  });

  // ─── register ─────────────────────────────────────────────────

  describe('register', () => {
    it('throws when the email already exists in the tenant', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findByEmail.mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
        isActive: true,
        name: null,
        passwordHash: 'hash',
      });

      await expect(service.register('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Email already registered',
      );
      expect(mocks.userRepository.createUserWithDefaultRole).not.toHaveBeenCalled();
    });

    it('returns userId and tokens on success', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findByEmail.mockResolvedValue(null);
      mocks.userRepository.createUserWithDefaultRole.mockResolvedValue(undefined);
      mocks.userRepository.getRoleNames.mockResolvedValue(['viewer']);

      const result = await service.register('test@example.com', 'password123', 'tenant-1', 'Test');

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
      expect(result.roles).toEqual(['viewer']);
    });
  });

  // ─── login ────────────────────────────────────────────────────

  describe('login', () => {
    it('throws for an unknown email', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login('unknown@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Invalid email or password.',
      );
      expect(mocks.userRepository.getRoleNames).not.toHaveBeenCalled();
    });

    it('throws for an inactive user', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isActive: false,
        name: 'Test',
        passwordHash: await hash('password123', 4),
      });

      await expect(service.login('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Account is disabled.',
      );
      expect(mocks.userRepository.getRoleNames).not.toHaveBeenCalled();
    });

    it('throws for a wrong password', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isActive: true,
        name: 'Test',
        passwordHash: await hash('correct-password', 4),
      });

      await expect(service.login('test@example.com', 'wrong-password', 'tenant-1')).rejects.toThrow(
        'Invalid email or password.',
      );
      expect(mocks.userRepository.getRoleNames).not.toHaveBeenCalled();
    });

    it('returns userId and tokens for valid credentials', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isActive: true,
        name: 'Test',
        passwordHash: await hash('password123', 4),
      });
      mocks.userRepository.getRoleNames.mockResolvedValue(['admin']);

      const result = await service.login('test@example.com', 'password123', 'tenant-1');
      expect(result.userId).toBe('user-1');
      expect(result.name).toBe('Test');
      expect(result.roles).toEqual(['admin']);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });
  });

  // ─── refreshTokens ────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('returns new tokens for a valid refresh token on an active account', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isActive: true,
        name: null,
        passwordHash: 'hash',
      });
      mocks.userRepository.getRoleNames.mockResolvedValue(['admin']);

      const { refreshToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const result = await service.refreshTokens(refreshToken);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws for an invalid refresh token', async () => {
      const { service } = createAuthServiceWithMocks();
      await expect(service.refreshTokens('invalid-token')).rejects.toThrow('Invalid or expired refresh token.');
    });

    it('throws for an access token presented as a refresh token', async () => {
      const { service } = createAuthServiceWithMocks();
      const { accessToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Signed with accessSecret; refreshTokens verifies with refreshSecret → "invalid signature".
      await expect(service.refreshTokens(accessToken)).rejects.toThrow('Invalid or expired refresh token.');
    });
  });

  // ─── changePassword ──────────────────────────────────────────

  describe('changePassword', () => {
    it('throws when the user is not found in the tenant', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findById.mockResolvedValue(null);

      await expect(service.changePassword('nonexistent', 'tenant-1', 'old', 'newpass123')).rejects.toThrow(
        'User not found.',
      );
      expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('throws when the current password is incorrect', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isActive: true,
        name: null,
        passwordHash: await hash('correct-password', 4),
      });

      await expect(service.changePassword('user-1', 'tenant-1', 'wrong-password', 'newpass123')).rejects.toThrow(
        'Current password is incorrect.',
      );
      expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('updates the password when the current password is correct', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.userRepository.findById.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isActive: true,
        name: null,
        passwordHash: await hash('old-password', 4),
      });
      mocks.userRepository.updatePassword.mockResolvedValue(undefined);

      await service.changePassword('user-1', 'tenant-1', 'old-password', 'newpass123');

      expect(mocks.userRepository.updatePassword).toHaveBeenCalledWith('tenant-1', 'user-1', expect.any(String));
    });
  });
});
