import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '../auth/authIdentity';
import { PluginController } from './pluginController';

function createMockPluginService() {
  return {
    listTenantPlugins: vi.fn(),
  };
}

describe('PluginController', () => {
  let controller: PluginController;
  let pluginService: ReturnType<typeof createMockPluginService>;

  beforeEach(() => {
    pluginService = createMockPluginService();
    controller = new PluginController(pluginService as never);
  });

  it('returns the current tenant plugin list from the authenticated identity', async () => {
    pluginService.listTenantPlugins.mockResolvedValue([
      {
        autoUpdate: true,
        config: { uploadLimitMb: 5 },
        enabled: true,
        enabledAt: '2026-04-06T09:00:00.000Z',
        installedAt: '2026-04-06T09:30:00.000Z',
        installedVersion: '1.2.0',
        name: 'im',
      },
    ]);

    const identity: AuthIdentity = {
      jti: 'jti-1',
      roles: ['admin'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    };

    await expect(controller.findMine(identity)).resolves.toEqual({
      plugins: [
        {
          autoUpdate: true,
          config: { uploadLimitMb: 5 },
          enabled: true,
          enabledAt: '2026-04-06T09:00:00.000Z',
          installedAt: '2026-04-06T09:30:00.000Z',
          installedVersion: '1.2.0',
          name: 'im',
        },
      ],
    });
    expect(pluginService.listTenantPlugins).toHaveBeenCalledWith('tenant-1');
  });
});
