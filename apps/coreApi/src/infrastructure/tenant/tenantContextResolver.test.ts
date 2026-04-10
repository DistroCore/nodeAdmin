import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestEnv, setupTestEnv } from '../../__tests__/helpers';
import type { AuthPrincipal } from './authPrincipal';

const ORIGINAL_SINGLE_TENANT_MODE = process.env.SINGLE_TENANT_MODE;
const ORIGINAL_DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID;

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

describe('TenantContextResolver', () => {
  beforeEach(() => {
    setupTestEnv();
    delete process.env.SINGLE_TENANT_MODE;
    delete process.env.DEFAULT_TENANT_ID;
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_SINGLE_TENANT_MODE === undefined) {
      delete process.env.SINGLE_TENANT_MODE;
    } else {
      process.env.SINGLE_TENANT_MODE = ORIGINAL_SINGLE_TENANT_MODE;
    }

    if (ORIGINAL_DEFAULT_TENANT_ID === undefined) {
      delete process.env.DEFAULT_TENANT_ID;
    } else {
      process.env.DEFAULT_TENANT_ID = ORIGINAL_DEFAULT_TENANT_ID;
    }

    clearTestEnv();
    vi.resetModules();
  });

  it('resolves tenant context from principal tenantId in multi-tenant mode', async () => {
    const { TenantContextResolver } = await import('./tenantContextResolver');
    const resolver = new TenantContextResolver();

    expect(resolver.resolve(createPrincipal())).toEqual({
      source: 'jwt',
      tenantId: 'tenant-1',
    });
  });

  it('returns the configured default tenant in single-tenant mode', async () => {
    process.env.SINGLE_TENANT_MODE = 'true';
    process.env.DEFAULT_TENANT_ID = 'tenant-system';
    vi.resetModules();

    const { TenantContextResolver } = await import('./tenantContextResolver');
    const resolver = new TenantContextResolver();

    expect(
      resolver.resolve(
        createPrincipal({
          tenantId: undefined,
        }),
      ),
    ).toEqual({
      source: 'default',
      tenantId: 'tenant-system',
    });
  });

  it('throws when tenantId is missing and single-tenant mode is disabled', async () => {
    const { TenantContextResolver } = await import('./tenantContextResolver');
    const resolver = new TenantContextResolver();

    expect(() =>
      resolver.resolve(
        createPrincipal({
          tenantId: undefined,
        }),
      ),
    ).toThrow('Tenant context is missing for the authenticated principal.');
  });
});
