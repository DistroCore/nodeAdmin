import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { setupTestEnv } from '../../__tests__/helpers';
import type { AuditLogService } from '../../infrastructure/audit/auditLogService';

setupTestEnv();

import { AuthController } from './authController';
import type { AuthIdentity } from './authIdentity';
import type { AuthService } from './authService';
import type { ChangePasswordDto } from './dto/changePasswordDto';
import type { IssueDevTokenDto } from './dto/issueDevTokenDto';
import type { LoginDto } from './dto/loginDto';
import type { RefreshTokenDto } from './dto/refreshTokenDto';
import type { RegisterDto } from './dto/registerDto';

type MockAuthService = Pick<AuthService, 'register' | 'login' | 'refreshTokens' | 'issueTokens' | 'changePassword'>;

type MockAuditLogService = Pick<AuditLogService, 'record' | 'listByTenant'>;

function createMockAuthService() {
  return {
    register: vi.fn<AuthService['register']>(),
    login: vi.fn<AuthService['login']>(),
    refreshTokens: vi.fn<AuthService['refreshTokens']>(),
    issueTokens: vi.fn<AuthService['issueTokens']>(),
    changePassword: vi.fn<AuthService['changePassword']>(),
  } satisfies MockAuthService;
}

function createMockAuditLogService() {
  return {
    record: vi.fn<AuditLogService['record']>(),
    listByTenant: vi.fn<AuditLogService['listByTenant']>(),
  } satisfies MockAuditLogService;
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof createMockAuthService>;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;

  beforeEach(() => {
    authService = createMockAuthService();
    auditLogService = createMockAuditLogService();
    controller = new AuthController(
      authService as unknown as AuthService,
      auditLogService as unknown as AuditLogService,
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

      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'pass',
        tenantId: 't-1',
        name: 'Test',
      };

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith('test@example.com', 'pass', 't-1', 'Test');
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

      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'pass',
        tenantId: 't-1',
      };

      const result = await controller.login(dto);

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

      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'pass',
        tenantId: 't-1',
      };

      const result = await controller.login(dto);

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

      const dto: RefreshTokenDto = { refreshToken: 'old-rt' };

      const result = await controller.refresh(dto);

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

      const dto: IssueDevTokenDto = {
        roles: ['admin'],
        tenantId: 't-1',
        userId: 'dev-user',
      };

      const result = await controller.issueDevToken(dto);

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

      const dto: IssueDevTokenDto = {
        tenantId: 't-1',
        userId: 'dev-user',
      };

      await controller.issueDevToken(dto);

      expect(authService.issueTokens).toHaveBeenCalledWith(expect.objectContaining({ roles: ['super-admin'] }));
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
      runtimeConfig.auth.enableDevTokenIssue = false;

      const dto: IssueDevTokenDto = {
        roles: ['admin'],
        tenantId: 't-1',
        userId: 'dev-user',
      };

      await expect(controller.issueDevToken(dto)).rejects.toThrow(ForbiddenException);

      runtimeConfig.auth.enableDevTokenIssue = originalValue;
      process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE = original;
    });
  });

  describe('changePassword', () => {
    it('should delegate to authService.changePassword with user identity', async () => {
      authService.changePassword.mockResolvedValue(undefined);

      const dto: ChangePasswordDto = { currentPassword: 'oldPass', newPassword: 'newPass' };
      const user: AuthIdentity = {
        jti: 'jti-1',
        principalId: 'user-1',
        principalType: 'user',
        roles: ['admin'],
        tenantId: 't-1',
        userId: 'user-1',
      };
      const result = await controller.changePassword(dto, user);

      expect(authService.changePassword).toHaveBeenCalledWith('user-1', 't-1', 'oldPass', 'newPass');
      expect(result).toEqual({ success: true });
    });

    it('should propagate error from authService', async () => {
      authService.changePassword.mockRejectedValue(new Error('DB down'));

      const dto: ChangePasswordDto = { currentPassword: 'oldPass', newPassword: 'newPass' };
      const user: AuthIdentity = {
        jti: 'jti-1',
        principalId: 'user-1',
        principalType: 'user',
        roles: ['admin'],
        tenantId: 't-1',
        userId: 'user-1',
      };

      await expect(controller.changePassword(dto, user)).rejects.toThrow('DB down');
    });
  });
});
