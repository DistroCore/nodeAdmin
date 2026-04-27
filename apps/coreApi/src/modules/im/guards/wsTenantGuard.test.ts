import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/authService';
import type { TenantContextResolver } from '../../../infrastructure/tenant/tenantContextResolver';
import { WsTenantGuard } from './wsTenantGuard';

function createExecutionContext(
  client: {
    data?: Record<string, unknown>;
    handshake: {
      auth?: Record<string, unknown>;
      headers: Record<string, unknown>;
    };
  },
  data: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToWs: () => ({
      getClient: () => client,
      getData: () => data,
    }),
  } as unknown as ExecutionContext;
}

describe('WsTenantGuard', () => {
  it('accepts valid socket token and attaches identity', () => {
    const verifyAccessPrincipal = vi.fn().mockReturnValue({
      jti: 'jti-1',
      principalId: 'user-1',
      principalType: 'user',
      roles: ['tenant:admin'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    const authService = {
      verifyAccessPrincipal,
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);

    const client = {
      data: {},
      handshake: {
        auth: {
          token: 'token-1',
        },
        headers: {},
      },
    };

    const context = createExecutionContext(client, {
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    const allowed = guard.canActivate(context);
    expect(allowed).toBe(true);
    expect(verifyAccessPrincipal).toHaveBeenCalledWith('token-1');
    expect((client.data as { identity?: unknown }).identity).toEqual({
      jti: 'jti-1',
      principalId: 'user-1',
      principalType: 'user',
      roles: ['tenant:admin'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
  });

  it('rejects request when token is missing', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn(),
    } as unknown as AuthService;
    const tenantContextResolver = { resolve: vi.fn() } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {},
        headers: {},
      },
    };

    const context = createExecutionContext(client, {});
    expect(() => guard.canActivate(context)).toThrowError(WsException);
  });

  it('rejects tenant mismatch', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockReturnValue({
        jti: 'jti-1',
        principalId: 'user-1',
        principalType: 'user',
        roles: [],
        tenantId: 'tenant-1',
        userId: 'user-1',
      }),
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {
          token: 'token-1',
        },
        headers: {},
      },
    };

    const context = createExecutionContext(client, {
      tenantId: 'tenant-2',
    });

    expect(() => guard.canActivate(context)).toThrowError(WsException);
  });

  it('falls back to the bearer authorization header when handshake auth token is absent', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockReturnValue({
        jti: 'jti-2',
        principalId: 'user-2',
        principalType: 'user',
        roles: [],
        tenantId: 'tenant-1',
        userId: 'user-2',
      }),
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {},
        headers: {
          authorization: 'Bearer header-token',
        },
      },
    };

    const context = createExecutionContext(client, {});

    expect(guard.canActivate(context)).toBe(true);
    expect(authService.verifyAccessPrincipal).toHaveBeenCalledWith('header-token');
  });

  it('prefers the socket auth token over the authorization header', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockReturnValue({
        jti: 'jti-3',
        principalId: 'user-3',
        principalType: 'user',
        roles: [],
        tenantId: 'tenant-1',
        userId: 'user-3',
      }),
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {
          token: ' socket-token ',
        },
        headers: {
          authorization: 'Bearer header-token',
        },
      },
    };

    const context = createExecutionContext(client, {});

    expect(guard.canActivate(context)).toBe(true);
    expect(authService.verifyAccessPrincipal).toHaveBeenCalledWith('socket-token');
  });

  it('rejects malformed authorization headers when no auth token is provided', () => {
    const guard = new WsTenantGuard(
      { verifyAccessPrincipal: vi.fn() } as unknown as AuthService,
      { resolve: vi.fn() } as unknown as TenantContextResolver,
    );
    const client = {
      data: {},
      handshake: {
        auth: {},
        headers: {
          authorization: 'Basic abc123',
        },
      },
    };

    const context = createExecutionContext(client, {});

    expect(() => guard.canActivate(context)).toThrowError(WsException);
  });

  it('rejects user mismatch between auth token and event payload', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockReturnValue({
        jti: 'jti-4',
        principalId: 'user-1',
        principalType: 'user',
        roles: [],
        tenantId: 'tenant-1',
        userId: 'user-1',
      }),
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {
          token: 'token-1',
        },
        headers: {},
      },
    };

    const context = createExecutionContext(client, {
      userId: 'user-2',
    });

    expect(() => guard.canActivate(context)).toThrowError(WsException);
  });

  it('allows events that do not provide tenantId or userId in the payload', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockReturnValue({
        jti: 'jti-5',
        principalId: 'user-1',
        principalType: 'user',
        roles: [],
        tenantId: 'tenant-1',
        userId: 'user-1',
      }),
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: { preserved: true },
      handshake: {
        auth: {
          token: 'token-1',
        },
        headers: {},
      },
    };

    const context = createExecutionContext(client, {
      conversationId: 'conversation-1',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect((client.data as Record<string, unknown>).preserved).toBe(true);
  });

  it('propagates access-token verification errors from AuthService', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockImplementation(() => {
        throw new WsException('Invalid access token.');
      }),
    } as unknown as AuthService;
    const tenantContextResolver = { resolve: vi.fn() } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {
          token: 'bad-token',
        },
        headers: {},
      },
    };

    const context = createExecutionContext(client, {});

    expect(() => guard.canActivate(context)).toThrowError(WsException);
  });

  it('injects the default tenant when single-tenant resolution overrides a missing token tenant', () => {
    const authService = {
      verifyAccessPrincipal: vi.fn().mockReturnValue({
        jti: 'jti-6',
        principalId: 'user-1',
        principalType: 'user',
        roles: [],
        userId: 'user-1',
      }),
    } as unknown as AuthService;
    const tenantContextResolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'default',
        tenantId: 'default',
      }),
    } as unknown as TenantContextResolver;

    const guard = new WsTenantGuard(authService, tenantContextResolver);
    const client = {
      data: {},
      handshake: {
        auth: {
          token: 'token-1',
        },
        headers: {},
      },
    };

    const context = createExecutionContext(client, {
      tenantId: 'default',
      userId: 'user-1',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect((client.data as { identity?: unknown }).identity).toEqual({
      jti: 'jti-6',
      principalId: 'user-1',
      principalType: 'user',
      roles: [],
      tenantId: 'default',
      userId: 'user-1',
    });
  });
});
