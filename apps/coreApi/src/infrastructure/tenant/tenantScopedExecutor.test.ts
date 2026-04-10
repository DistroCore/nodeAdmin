import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import type { AuthPrincipal } from './authPrincipal';
import type { TenantContextResolver } from './tenantContextResolver';

function createPrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    principalId: 'user-1',
    principalType: 'user',
    roles: ['admin'],
    jti: 'jti-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('TenantScopedExecutor', () => {
  beforeEach(() => {
    setupTestEnv();
  });

  it('opens a transaction, sets app.current_tenant, commits, and releases the client', async () => {
    const { TenantScopedExecutor } = await import('./tenantScopedExecutor');
    const mockClient = createMockClient();
    const mockPool = createMockPool();
    mockPool.connect = vi.fn(async () => mockClient);
    const resolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;
    const databaseService = {
      drizzle: {
        $client: mockPool,
      },
    };

    const executor = new TenantScopedExecutor(databaseService as never, resolver);

    const result = await executor.executeForPrincipal(createPrincipal(), async (client) => {
      await client.query('SELECT 1');
      return 'done';
    });

    expect(result).toBe('done');
    expect(mockClient.calls).toEqual([
      { params: [], sql: 'BEGIN' },
      { params: ['tenant-1'], sql: `SELECT set_config('app.current_tenant', $1, true)` },
      { params: [], sql: 'SELECT 1' },
      { params: [], sql: 'COMMIT' },
    ]);
    expect(mockClient.release).toHaveBeenCalled();
    expect(resolver.resolve as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(createPrincipal());
  });

  it('rolls back and releases the client when the callback throws', async () => {
    const { TenantScopedExecutor } = await import('./tenantScopedExecutor');
    const mockClient = createMockClient();
    const mockPool = createMockPool();
    mockPool.connect = vi.fn(async () => mockClient);
    const resolver = {
      resolve: vi.fn().mockReturnValue({
        source: 'jwt',
        tenantId: 'tenant-1',
      }),
    } as unknown as TenantContextResolver;
    const databaseService = {
      drizzle: {
        $client: mockPool,
      },
    };

    const executor = new TenantScopedExecutor(databaseService as never, resolver);

    await expect(
      executor.execute('tenant-1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(mockClient.calls).toEqual([
      { params: [], sql: 'BEGIN' },
      { params: ['tenant-1'], sql: `SELECT set_config('app.current_tenant', $1, true)` },
      { params: [], sql: 'ROLLBACK' },
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
