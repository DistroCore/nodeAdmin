import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './auditInterceptor';
import type { AuditLogService } from './auditLogService';
import type { AuthIdentity } from '../../modules/auth/authIdentity';

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
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createCallHandler(response: unknown = { id: 'result-id' }): CallHandler {
  return {
    handle: () => of(response),
  };
}

describe('AuditInterceptor', () => {
  let recordMock: ReturnType<typeof vi.fn>;
  let auditLogService: AuditLogService;
  let interceptor: AuditInterceptor;

  const mockIdentity: AuthIdentity = {
    jti: 'jti-1',
    roles: ['admin'],
    tenantId: 'tenant-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    recordMock = vi.fn().mockResolvedValue(undefined);
    auditLogService = { record: recordMock } as unknown as AuditLogService;
    interceptor = new AuditInterceptor(auditLogService);
  });

  it('records audit log for POST request', async () => {
    const ctx = createHttpContext('POST', '/api/v1/users', mockIdentity, { name: 'Alice' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('user.create');
    expect(call.targetType).toBe('user');
    expect(call.tenantId).toBe('tenant-1');
    expect(call.userId).toBe('user-1');
  });

  it('records audit log for PUT request with targetId from URL', async () => {
    const ctx = createHttpContext('PUT', '/api/v1/users/user-123', mockIdentity, { name: 'Bob' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('user.update');
    expect(call.targetId).toBe('user-123');
  });

  it('records audit log for DELETE request', async () => {
    const ctx = createHttpContext('DELETE', '/api/v1/roles/role-456', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('role.delete');
    expect(call.targetId).toBe('role-456');
  });

  it('records audit log for PATCH request', async () => {
    const ctx = createHttpContext('PATCH', '/api/v1/tenants/tenant-1', mockIdentity, { name: 'Updated' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('tenant.update');
  });

  it('skips GET requests', async () => {
    const ctx = createHttpContext('GET', '/api/v1/users', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('skips auth login endpoint', async () => {
    const ctx = createHttpContext('POST', '/api/v1/auth/login', mockIdentity, { email: 'test@test.com', password: 'secret' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('skips auth register endpoint', async () => {
    const ctx = createHttpContext('POST', '/api/v1/auth/register', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('skips auth refresh endpoint', async () => {
    const ctx = createHttpContext('POST', '/api/v1/auth/refresh', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('filters sensitive fields from body context', async () => {
    const ctx = createHttpContext('POST', '/api/v1/users', mockIdentity, {
      email: 'test@test.com',
      password: 'secret123',
      passwordHash: 'hashed',
      token: 'jwt-token',
      secret: 'api-key',
      name: 'Alice',
    });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    const call = recordMock.mock.calls[0][0];
    expect(call.context).toEqual({ email: 'test@test.com', name: 'Alice' });
  });

  it('does not block response when audit recording fails', async () => {
    recordMock.mockRejectedValue(new Error('DB error'));
    const ctx = createHttpContext('POST', '/api/v1/users', mockIdentity, { name: 'Test' });
    const next = createCallHandler();

    // Should NOT throw
    const result = await interceptor.intercept(ctx, next).toPromise();
    expect(result).toEqual({ id: 'result-id' });
  });

  it('skips when no user on request (unauthenticated internal routes)', async () => {
    const ctx = createHttpContext('POST', '/api/v1/users', undefined, { name: 'Test' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('handles URL with trailing path segments beyond targetId', async () => {
    const ctx = createHttpContext('POST', '/api/v1/conversations/conv-1/messages', mockIdentity, { content: 'hi' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    const call = recordMock.mock.calls[0][0];
    expect(call.targetType).toBe('conversation');
    expect(call.targetId).toBe('conv-1');
  });

  it('strips query string when parsing targetId from URL', async () => {
    const ctx = createHttpContext('PUT', '/api/v1/users/user-123?fields=name', mockIdentity, { name: 'Bob' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    const call = recordMock.mock.calls[0][0];
    expect(call.targetId).toBe('user-123');
    expect(call.targetType).toBe('user');
  });
});
