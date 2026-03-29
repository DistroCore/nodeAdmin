import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { verify } from 'jsonwebtoken';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import type { QueryResult } from '../../__tests__/helpers';

// Must set env before importing runtimeConfig (loaded at import time)
setupTestEnv();

import { AuthService } from './authService';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    // Pool is null because DATABASE_URL is empty
  });

  // ─── issueTokens ──────────────────────────────────────────────

  describe('issueTokens', () => {
    it('should return accessToken, refreshToken, and tokenType', () => {
      const result = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tokenType).toBe('Bearer');
    });

    it('should sign accessToken with correct claims', () => {
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

    it('should sign refreshToken with correct claims', () => {
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

    it('should deduplicate and trim roles', () => {
      const { accessToken } = service.issueTokens({
        roles: [' admin ', 'admin', 'viewer', 'viewer '],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      const decoded = verify(accessToken, 'test-access-secret-key') as Record<string, unknown>;
      expect(decoded.roles).toEqual(['admin', 'viewer']);
    });

    it('should filter out empty roles', () => {
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
    it('should return AuthIdentity for a valid token', () => {
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

    it('should throw UnauthorizedException for a tampered token', () => {
      const { accessToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(() => service.verifyAccessToken(accessToken + 'x')).toThrow(
        'Invalid or expired access token.'
      );
    });

    it('should throw for a token with wrong type (refresh token)', () => {
      const { refreshToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Refresh token is signed with refreshSecret, not accessSecret.
      // verify() fails with "invalid signature" which maps to
      // "Invalid or expired access token." — the type-check is never reached.
      expect(() => service.verifyAccessToken(refreshToken)).toThrow(
        'Invalid or expired access token.'
      );
    });
  });

  // ─── register ─────────────────────────────────────────────────

  describe('register', () => {
    it('should throw when pool is null (no DATABASE_URL)', async () => {
      await expect(service.register('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Database not available.'
      );
    });

    it('should throw when email already exists', async () => {
      const mockPool = createMockPool([{ rows: [{ id: 'existing-user' }], rowCount: 1 }]);
      (service as any).pool = mockPool;

      await expect(service.register('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Email already registered'
      );
    });

    it('should return userId and tokens on success', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // email check
        { rows: [], rowCount: 1 }, // INSERT user
        { rows: [], rowCount: 1 }, // INSERT user_roles
        { rows: [{ name: 'viewer' }], rowCount: 1 }, // getUserRoles
      ]);
      // Override pool.query for the email check, and pool.connect for the transaction
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      mockPool.connect = vi.fn(async () => mockClient);

      (service as any).pool = mockPool;

      const result = await service.register('test@example.com', 'password123', 'tenant-1', 'Test');

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should rollback on INSERT failure', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // email check - no existing
      ]);
      // Make the INSERT fail but still track all calls
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        mockClient.calls.push({ sql, params: params ?? [] });
        if (sql.includes('INSERT INTO users')) {
          throw new Error('DB insert error');
        }
        return { rows: [], rowCount: 0 };
      });

      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      mockPool.connect = vi.fn(async () => mockClient);

      (service as any).pool = mockPool;

      await expect(service.register('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'DB insert error'
      );

      // Verify ROLLBACK was called
      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  // ─── login ────────────────────────────────────────────────────

  describe('login', () => {
    it('should throw when pool is null', async () => {
      await expect(service.login('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Database not available.'
      );
    });

    it('should throw for unknown email', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.login('unknown@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Invalid email or password.'
      );
    });

    it('should throw for inactive user', async () => {
      const passwordHash = await hash('password123', 4);
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: 'user-1',
              email: 'test@example.com',
              password_hash: passwordHash,
              name: 'Test',
              is_active: 0,
            },
          ],
          rowCount: 1,
        },
      ] as QueryResult[]);
      (service as any).pool = mockPool;

      await expect(service.login('test@example.com', 'password123', 'tenant-1')).rejects.toThrow(
        'Account is disabled.'
      );
    });

    it('should throw for wrong password', async () => {
      const passwordHash = await hash('correct-password', 4);
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: 'user-1',
              email: 'test@example.com',
              password_hash: passwordHash,
              name: 'Test',
              is_active: 1,
            },
          ],
          rowCount: 1,
        },
        { rows: [{ name: 'admin' }], rowCount: 1 }, // getUserRoles
      ]);

      (service as any).pool = mockPool;

      await expect(service.login('test@example.com', 'wrong-password', 'tenant-1')).rejects.toThrow(
        'Invalid email or password.'
      );
    });

    it('should return userId and tokens for valid credentials', async () => {
      const passwordHash = await hash('password123', 4);
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: 'user-1',
              email: 'test@example.com',
              password_hash: passwordHash,
              name: 'Test',
              is_active: 1,
            },
          ],
          rowCount: 1,
        },
        { rows: [{ name: 'admin' }], rowCount: 1 }, // getUserRoles
      ]);

      (service as any).pool = mockPool;

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
    it('should return new tokens for a valid refresh token', () => {
      const { refreshToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // refreshTokens is async because of getUserRoles, but pool is null so it returns []
      const result = service.refreshTokens(refreshToken);

      return expect(result).resolves.toHaveProperty('accessToken');
    });

    it('should throw for an invalid refresh token', async () => {
      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        'Invalid or expired refresh token.'
      );
    });

    it('should throw for a token with wrong type (access token used as refresh)', async () => {
      const { accessToken } = service.issueTokens({
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Access token was signed with accessSecret but refreshTokens verifies with refreshSecret.
      // This means verify() fails with "invalid signature" which maps to
      // "Invalid or expired refresh token." — the type-check is never reached.
      await expect(service.refreshTokens(accessToken)).rejects.toThrow(
        'Invalid or expired refresh token.'
      );
    });
  });

  // ─── changePassword ──────────────────────────────────────────

  describe('changePassword', () => {
    it('should throw when pool is null', async () => {
      await expect(
        service.changePassword('user-1', 'tenant-1', 'old', 'newpass123')
      ).rejects.toThrow('Database not available.');
    });

    it('should throw when user not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(
        service.changePassword('nonexistent', 'tenant-1', 'old', 'newpass123')
      ).rejects.toThrow('User not found.');
    });

    it('should throw when current password is incorrect', async () => {
      const passwordHash = await hash('correct-password', 4);
      const mockPool = createMockPool([
        {
          rows: [{ id: 'user-1', password_hash: passwordHash, is_active: 1 }],
          rowCount: 1,
        },
      ]);
      (service as any).pool = mockPool;

      await expect(
        service.changePassword('user-1', 'tenant-1', 'wrong-password', 'newpass123')
      ).rejects.toThrow('Current password is incorrect.');
    });

    it('should update password when current password is correct', async () => {
      const passwordHash = await hash('old-password', 4);
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // UPDATE
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        {
          rows: [{ id: 'user-1', password_hash: passwordHash, is_active: 1 }],
          rowCount: 1,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await service.changePassword('user-1', 'tenant-1', 'old-password', 'newpass123');

      // Verify UPDATE was called
      const updateCall = mockClient.calls.find((c) => c.sql.includes('UPDATE users'));
      expect(updateCall).toBeDefined();
      // Verify COMMIT was called
      const commitCall = mockClient.calls.find((c) => c.sql === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('should rollback on UPDATE failure', async () => {
      const passwordHash = await hash('old-password', 4);
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        mockClient.calls.push({ sql, params: params ?? [] });
        if (sql.includes('UPDATE users')) {
          throw new Error('DB update error');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([
        {
          rows: [{ id: 'user-1', password_hash: passwordHash, is_active: 1 }],
          rowCount: 1,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(
        service.changePassword('user-1', 'tenant-1', 'old-password', 'newpass123')
      ).rejects.toThrow('DB update error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });
});
