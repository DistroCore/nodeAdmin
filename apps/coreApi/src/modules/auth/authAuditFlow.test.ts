import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { AuditInterceptor } from '../../infrastructure/audit/auditInterceptor';
import type { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { AuthController } from './authController';
import type { AuthIdentity } from './authIdentity';

function createHttpContext(
  method: string,
  url: string,
  user?: AuthIdentity,
  body?: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url, user, body }),
      getResponse: () => ({}),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

function createCallHandler(response: unknown = { success: true }): CallHandler {
  return {
    handle: () => of(response),
  };
}

describe('Auth audit flows', () => {
  const mockIdentity: AuthIdentity = {
    jti: 'trace-jti-1',
    roles: ['admin'],
    tenantId: 'tenant-a',
    userId: 'user-1',
  };

  let recordMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recordMock = vi.fn().mockResolvedValue(undefined);
  });

  it('records auth.login audit entries with a trace derived from the access token', async () => {
    const authService = {
      changePassword: vi.fn(),
      issueTokens: vi.fn(),
      login: vi.fn().mockResolvedValue({
        name: 'Tenant User',
        roles: ['admin'],
        tokens: {
          accessToken: 'access-token-1234567890',
          refreshToken: 'refresh-token-1234567890',
          tokenType: 'Bearer',
        },
        userId: 'user-1',
      }),
      refreshTokens: vi.fn(),
      register: vi.fn(),
    };
    const auditLogService = {
      listByTenant: vi.fn(),
      record: recordMock,
    };
    const controller = new AuthController(authService as never, auditLogService as never);

    await controller.login({
      email: 'tenant@example.com',
      password: 'TenantP@ss1',
      tenantId: 'tenant-a',
    });

    expect(recordMock).toHaveBeenCalledWith({
      action: 'auth.login',
      targetId: 'user-1',
      targetType: 'user',
      tenantId: 'tenant-a',
      traceId: 'access-token',
      userId: 'user-1',
    });
  });

  it('automatically records authenticated change-password requests without persisting passwords', async () => {
    const interceptor = new AuditInterceptor({
      record: recordMock,
    } as unknown as AuditLogService);

    const context = createHttpContext('POST', '/api/v1/auth/change-password', mockIdentity, {
      currentPassword: 'OldP@ssword1',
      newPassword: 'NewP@ssword2',
    });

    await firstValueFrom(interceptor.intercept(context, createCallHandler()));

    expect(recordMock).toHaveBeenCalledOnce();
    expect(recordMock).toHaveBeenCalledWith({
      action: 'auth.create',
      context: undefined,
      targetId: 'change-password',
      targetType: 'auth',
      tenantId: 'tenant-a',
      traceId: 'trace-jti-1',
      userId: 'user-1',
    });
  });
});
