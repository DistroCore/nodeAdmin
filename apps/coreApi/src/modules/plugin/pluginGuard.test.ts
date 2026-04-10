import { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '../auth/authIdentity';
import type { TenantContextResolver } from '../../infrastructure/tenant/tenantContextResolver';
import { PluginGuard } from './pluginGuard';
import { PLUGIN_METADATA_KEY } from './plugin.decorator';

function createHttpExecutionContext(user?: AuthIdentity): ExecutionContext {
  const request = { user } as { user?: AuthIdentity };

  return {
    getClass: () => PluginGuard,
    getHandler: () => PluginGuard.prototype.canActivate,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createMockPluginService() {
  return {
    isPluginEnabled: vi.fn(),
  };
}

function createMockReflector(pluginName?: string) {
  return {
    getAllAndOverride: vi.fn().mockImplementation((metadataKey: string) => {
      if (metadataKey === PLUGIN_METADATA_KEY) {
        return pluginName;
      }
      return undefined;
    }),
  } as unknown as Reflector;
}

describe('PluginGuard', () => {
  let pluginService: ReturnType<typeof createMockPluginService>;
  let tenantContextResolver: TenantContextResolver;

  beforeEach(() => {
    pluginService = createMockPluginService();
    tenantContextResolver = {
      resolve: vi.fn().mockImplementation((user?: AuthIdentity) => ({
        source: 'jwt',
        tenantId: user?.tenantId ?? '',
      })),
    } as unknown as TenantContextResolver;
  });

  it('allows routes without plugin metadata', async () => {
    const reflector = createMockReflector();
    const guard = new PluginGuard(reflector, pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext({
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(pluginService.isPluginEnabled).not.toHaveBeenCalled();
  });

  it('allows a request when the plugin is enabled for the tenant', async () => {
    const reflector = createMockReflector('im');
    pluginService.isPluginEnabled.mockResolvedValue(true);

    const guard = new PluginGuard(reflector, pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext({
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(pluginService.isPluginEnabled).toHaveBeenCalledWith('tenant-1', 'im');
  });

  it('rejects a request when the plugin is disabled for the tenant', async () => {
    const reflector = createMockReflector('modernizer');
    pluginService.isPluginEnabled.mockResolvedValue(false);

    const guard = new PluginGuard(reflector, pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext({
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow("Plugin 'modernizer' is not enabled for this tenant");
  });

  it('rejects plugin-protected routes when tenant context is missing', async () => {
    const reflector = createMockReflector('backlog');
    (tenantContextResolver.resolve as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Tenant context is missing for the authenticated principal.');
    });
    const guard = new PluginGuard(reflector, pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow('Tenant context is required for plugin-protected routes');
  });

  it('uses the resolved default tenant in single-tenant mode', async () => {
    const reflector = createMockReflector('backlog');
    pluginService.isPluginEnabled.mockResolvedValue(true);
    (tenantContextResolver.resolve as ReturnType<typeof vi.fn>).mockReturnValue({
      source: 'default',
      tenantId: 'default',
    });
    const guard = new PluginGuard(reflector, pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext({
      jti: 'jti-1',
      roles: ['viewer'],
      userId: 'user-1',
    } as AuthIdentity);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(pluginService.isPluginEnabled).toHaveBeenCalledWith('default', 'backlog');
  });
});
