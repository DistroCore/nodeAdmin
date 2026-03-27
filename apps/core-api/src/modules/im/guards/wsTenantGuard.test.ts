import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../Auth/authService';
import { WsTenantGuard } from './wsTenantGuard';

function createExecutionContext(
  client: {
    data?: Record<string, unknown>;
    handshake: {
      auth?: Record<string, unknown>;
      headers: Record<string, unknown>;
    };
  },
  data: Record<string, unknown>
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
    const verifyAccessToken = vi.fn().mockReturnValue({
      jti: 'jti-1',
      roles: ['tenant:admin'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    const authService = {
      verifyAccessToken,
    } as unknown as AuthService;

    const guard = new WsTenantGuard(authService);

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
    expect(verifyAccessToken).toHaveBeenCalledWith('token-1');
    expect((client.data as { identity?: unknown }).identity).toEqual({
      jti: 'jti-1',
      roles: ['tenant:admin'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
  });

  it('rejects request when token is missing', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;

    const guard = new WsTenantGuard(authService);
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
      verifyAccessToken: vi.fn().mockReturnValue({
        jti: 'jti-1',
        roles: [],
        tenantId: 'tenant-1',
        userId: 'user-1',
      }),
    } as unknown as AuthService;

    const guard = new WsTenantGuard(authService);
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
});
