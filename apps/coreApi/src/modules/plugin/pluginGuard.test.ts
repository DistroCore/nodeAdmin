import { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '../auth/authIdentity';
import type { TenantContextResolver } from '../../infrastructure/tenant/tenantContextResolver';
import { PluginGuard } from './pluginGuard';

function createHttpExecutionContext(path: string, user?: AuthIdentity): ExecutionContext {
  const request = { url: path, user } as { url: string; user?: AuthIdentity };

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

  it('allows routes outside the plugin url prefix', async () => {
    const guard = new PluginGuard(pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext('/api/v1/admin/plugins', {
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(pluginService.isPluginEnabled).not.toHaveBeenCalled();
  });

  it('allows a request when the plugin route is enabled for the tenant', async () => {
    pluginService.isPluginEnabled.mockResolvedValue(true);

    const guard = new PluginGuard(pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext('/api/v1/plugins/kanban/boards', {
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(pluginService.isPluginEnabled).toHaveBeenCalledWith('tenant-1', '@nodeadmin/plugin-kanban');
  });

  it('rejects a request when the plugin route is disabled for the tenant', async () => {
    pluginService.isPluginEnabled.mockResolvedValue(false);

    const guard = new PluginGuard(pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext('/api/v1/plugins/modernizer', {
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      "Plugin '@nodeadmin/plugin-modernizer' is not enabled for this tenant",
    );
  });

  it('rejects plugin routes when tenant context is missing', async () => {
    (tenantContextResolver.resolve as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Tenant context is missing for the authenticated principal.');
    });
    const guard = new PluginGuard(pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext('/api/v1/plugins/backlog');

    await expect(guard.canActivate(context)).rejects.toThrow('Tenant context is required for plugin-protected routes');
  });

  it('uses the resolved default tenant in single-tenant mode', async () => {
    pluginService.isPluginEnabled.mockResolvedValue(true);
    (tenantContextResolver.resolve as ReturnType<typeof vi.fn>).mockReturnValue({
      source: 'default',
      tenantId: 'default',
    });
    const guard = new PluginGuard(pluginService as never, tenantContextResolver);
    const context = createHttpExecutionContext('/api/v1/plugins/backlog', {
      jti: 'jti-1',
      roles: ['viewer'],
      userId: 'user-1',
    } as AuthIdentity);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(pluginService.isPluginEnabled).toHaveBeenCalledWith('default', '@nodeadmin/plugin-backlog');
  });
});
