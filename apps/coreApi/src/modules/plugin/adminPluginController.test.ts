import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '../auth/authIdentity';
import { AdminPluginController } from './adminPluginController';

function createMockPluginMarketService() {
  return {
    getPluginDetails: vi.fn(),
    installPlugin: vi.fn(),
    listMarketplacePlugins: vi.fn(),
    publishPlugin: vi.fn(),
    uninstallPlugin: vi.fn(),
    updatePlugin: vi.fn(),
  };
}

function createAdminIdentity(): AuthIdentity {
  return {
    jti: 'jti-admin',
    roles: ['admin'],
    tenantId: 'tenant-1',
    userId: 'user-1',
  };
}

describe('AdminPluginController', () => {
  let controller: AdminPluginController;
  let service: ReturnType<typeof createMockPluginMarketService>;

  beforeEach(() => {
    service = createMockPluginMarketService();
    controller = new AdminPluginController(service as never);
  });

  it('lists marketplace plugins for an admin user', async () => {
    service.listMarketplacePlugins.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await expect(controller.list(createAdminIdentity(), 1, 20, 'kanban')).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(service.listMarketplacePlugins).toHaveBeenCalledWith(1, 20, 'kanban');
  });

  it('returns plugin details for an admin user', async () => {
    service.getPluginDetails.mockResolvedValue({ id: '@nodeadmin/plugin-kanban' });

    await expect(controller.getDetails(createAdminIdentity(), '@nodeadmin/plugin-kanban')).resolves.toEqual({
      id: '@nodeadmin/plugin-kanban',
    });
  });

  it('installs a plugin for the current tenant', async () => {
    service.installPlugin.mockResolvedValue({
      enabled: true,
      pluginId: '@nodeadmin/plugin-kanban',
      tenantId: 'tenant-1',
      version: '1.2.0',
    });

    await expect(
      controller.install(createAdminIdentity(), {
        pluginId: '@nodeadmin/plugin-kanban',
        version: '1.2.0',
      }),
    ).resolves.toEqual({
      enabled: true,
      pluginId: '@nodeadmin/plugin-kanban',
      tenantId: 'tenant-1',
      version: '1.2.0',
    });

    expect(service.installPlugin).toHaveBeenCalledWith('tenant-1', '@nodeadmin/plugin-kanban', '1.2.0');
  });

  it('updates an installed plugin to a specified version', async () => {
    service.updatePlugin.mockResolvedValue({
      enabled: true,
      pluginId: '@nodeadmin/plugin-kanban',
      tenantId: 'tenant-1',
      version: '1.3.0',
    });

    await expect(
      controller.update(createAdminIdentity(), '@nodeadmin/plugin-kanban', {
        version: '1.3.0',
      }),
    ).resolves.toEqual({
      enabled: true,
      pluginId: '@nodeadmin/plugin-kanban',
      tenantId: 'tenant-1',
      version: '1.3.0',
    });
  });

  it('uninstalls a plugin for the current tenant', async () => {
    service.uninstallPlugin.mockResolvedValue({
      pluginId: '@nodeadmin/plugin-kanban',
      removed: true,
      tenantId: 'tenant-1',
    });

    await expect(controller.remove(createAdminIdentity(), '@nodeadmin/plugin-kanban')).resolves.toEqual({
      pluginId: '@nodeadmin/plugin-kanban',
      removed: true,
      tenantId: 'tenant-1',
    });
  });

  it('publishes a plugin version for an admin user', async () => {
    service.publishPlugin.mockResolvedValue({
      pluginId: '@nodeadmin/plugin-kanban',
      publishedVersion: '1.2.0',
    });

    await expect(
      controller.publish(createAdminIdentity(), {
        bundleUrl: 'https://cdn.example.com/kanban-1.2.0.js',
        changelog: 'Stable release',
        manifest: {
          author: { name: 'NodeAdmin Team' },
          description: 'Board view',
          displayName: 'Kanban',
          engines: { nodeAdmin: '>=0.1.0' },
          entrypoints: { server: './dist/server/index.js' },
          id: '@nodeadmin/plugin-kanban',
          permissions: ['backlog:view'],
          version: '1.2.0',
        },
        serverPackage: '@nodeadmin/plugin-kanban@1.2.0',
      }),
    ).resolves.toEqual({
      pluginId: '@nodeadmin/plugin-kanban',
      publishedVersion: '1.2.0',
    });
  });

  it('rejects non-admin users on admin plugin endpoints', async () => {
    const viewer: AuthIdentity = {
      jti: 'jti-viewer',
      roles: ['viewer'],
      tenantId: 'tenant-1',
      userId: 'user-2',
    };

    await expect(controller.list(viewer)).rejects.toThrow(ForbiddenException);
    expect(service.listMarketplacePlugins).not.toHaveBeenCalled();
  });
});
