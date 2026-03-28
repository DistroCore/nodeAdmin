import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwtAuthGuard';
import type { AuthService } from './authService';
import type { AuthIdentity } from './authIdentity';

// Note: @CurrentUser() decorator is a 12-line createParamDecorator wrapper that
// reads request.user. It cannot be unit-tested outside the NestJS parameter
// resolution pipeline. The guard tests verify request.user is populated correctly.

function createHttpExecutionContext(
  headers: Record<string, string>,
  url: string,
): ExecutionContext {
  const request = { headers, url } as { headers: Record<string, string>; url: string; user?: AuthIdentity };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const mockIdentity: AuthIdentity = {
    jti: 'jti-1',
    roles: ['admin'],
    tenantId: 'tenant-1',
    userId: 'user-1',
  };

  it('allows request with valid Bearer token and attaches user', () => {
    const verifyAccessToken = vi.fn().mockReturnValue(mockIdentity);
    const authService = { verifyAccessToken } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext(
      { authorization: 'Bearer valid-token' },
      '/api/v1/users',
    );

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');

    const request = ctx.switchToHttp().getRequest<{ user?: AuthIdentity }>();
    expect(request.user).toEqual(mockIdentity);
  });

  it('rejects request with missing Authorization header', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/users');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects request with non-Bearer scheme', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext(
      { authorization: 'Basic abc123' },
      '/api/v1/users',
    );

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects request when token verification fails', () => {
    const verifyAccessToken = vi.fn().mockImplementation(() => {
      throw new UnauthorizedException('Invalid or expired access token.');
    });
    const authService = { verifyAccessToken } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext(
      { authorization: 'Bearer bad-token' },
      '/api/v1/users',
    );

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('skips guard for /health endpoint', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/health');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/login', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/login');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/register', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/register');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/refresh', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/refresh');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/dev-token', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/dev-token');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for excluded path with query string', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/health?format=json');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });
});
