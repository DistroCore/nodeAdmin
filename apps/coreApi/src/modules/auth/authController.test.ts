import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { AuthController } from './authController';

function createMockAuthService() {
  return {
    register: vi.fn(),
    login: vi.fn(),
    refreshTokens: vi.fn(),
    issueTokens: vi.fn(),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn(),
    listByTenant: vi.fn(),
  };
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof createMockAuthService>;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;

  beforeEach(() => {
    authService = createMockAuthService();
    auditLogService = createMockAuditLogService();
    controller = new AuthController(
      authService as any,
      auditLogService as any
    );
  });

  describe('register', () => {
    it('should delegate to authService and return identity + tokens', async () => {
      authService.register.mockResolvedValue({
        name: 'Test',
        roles: ['viewer'],
        userId: 'user-1',
        tokens: { accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer' },
      });

      const result = await controller.register({
        email: 'test@example.com',
        password: 'pass',
        tenantId: 't-1',
        name: 'Test',
      } as any);

      expect(authService.register).toHaveBeenCalledWith(
        'test@example.com', 'pass', 't-1', 'Test'
      );
      expect(result.identity).toEqual({ roles: ['viewer'], userId: 'user-1', tenantId: 't-1' });
      expect(result.name).toBe('Test');
      expect(result.accessToken).toBe('at');
      expect(result.refreshToken).toBe('rt');
    });
  });

  describe('login', () => {
    it('should delegate to authService and record audit log', async () => {
      authService.login.mockResolvedValue({
        name: 'Test User',
        roles: ['admin'],
        userId: 'user-1',
        tokens: { accessToken: 'access-token-123456', refreshToken: 'rt', tokenType: 'Bearer' },
      });

      const result = await controller.login({
        email: 'test@example.com',
        password: 'pass',
        tenantId: 't-1',
      } as any);

      expect(authService.login).toHaveBeenCalledWith('test@example.com', 'pass', 't-1');
      expect(result.identity).toEqual({ roles: ['admin'], userId: 'user-1', tenantId: 't-1' });
      expect(result.name).toBe('Test User');
      expect(auditLogService.record).toHaveBeenCalled();
    });

    it('should not block login when audit log fails', async () => {
      authService.login.mockResolvedValue({
        name: null,
        roles: ['viewer'],
        userId: 'user-1',
        tokens: { accessToken: 'at-123456789', refreshToken: 'rt', tokenType: 'Bearer' },
      });
      auditLogService.record.mockRejectedValue(new Error('audit fail'));

      const result = await controller.login({
        email: 'test@example.com',
        password: 'pass',
        tenantId: 't-1',
      } as any);

      expect(result.identity).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('should delegate to authService.refreshTokens', async () => {
      authService.refreshTokens.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        tokenType: 'Bearer',
      });

      const result = await controller.refresh({ refreshToken: 'old-rt' } as any);

      expect(authService.refreshTokens).toHaveBeenCalledWith('old-rt');
      expect(result.accessToken).toBe('new-at');
    });
  });

  describe('issueDevToken', () => {
    it('should return tokens when dev token is enabled', async () => {
      authService.issueTokens.mockReturnValue({
        accessToken: 'dev-at',
        refreshToken: 'dev-rt',
        tokenType: 'Bearer',
      });

      const result = await controller.issueDevToken({
        roles: ['admin'],
        tenantId: 't-1',
        userId: 'dev-user',
      } as any);

      expect(authService.issueTokens).toHaveBeenCalledWith({
        roles: ['admin'],
        tenantId: 't-1',
        userId: 'dev-user',
      });
      expect(result.identity.roles).toEqual(['admin']);
      expect(result.accessToken).toBe('dev-at');
    });

    it('should use super-admin as default role when roles not provided', async () => {
      authService.issueTokens.mockReturnValue({
        accessToken: 'dev-at',
        refreshToken: 'dev-rt',
        tokenType: 'Bearer',
      });

      await controller.issueDevToken({
        tenantId: 't-1',
        userId: 'dev-user',
      } as any);

      expect(authService.issueTokens).toHaveBeenCalledWith(
        expect.objectContaining({ roles: ['super-admin'] })
      );
    });

    it('should throw ForbiddenException when dev token is disabled', async () => {
      // runtimeConfig.auth.enableDevTokenIssue defaults to true in test env
      // Override it temporarily
      const original = process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE;
      process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE = 'false';

      // Need to re-import to pick up the env change — but runtimeConfig is already cached.
      // Instead, test the controller behavior by creating a new instance with mocked config.
      // Since runtimeConfig is a module-level const, we test via the controller directly.
      // The default test env has AUTH_ENABLE_DEV_TOKEN_ISSUE=true, so we test the happy path above.
      // For the disabled case, we test the logic inline:

      const { runtimeConfig } = await import('../../app/runtimeConfig');
      const originalValue = runtimeConfig.auth.enableDevTokenIssue;
      (runtimeConfig.auth as any).enableDevTokenIssue = false;

      await expect(
        controller.issueDevToken({
          roles: ['admin'],
          tenantId: 't-1',
          userId: 'dev-user',
        } as any)
      ).rejects.toThrow(ForbiddenException);

      (runtimeConfig.auth as any).enableDevTokenIssue = originalValue;
      process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE = original;
    });
  });
});
