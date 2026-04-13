import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import { PluginService } from './pluginService';

setupTestEnv();

function createMockDatabaseService(pool?: ReturnType<typeof createMockPool> | null) {
  return {
    drizzle: pool
      ? {
          $client: pool,
        }
      : null,
  };
}

describe('PluginService', () => {
  let service: PluginService;

  beforeEach(() => {
    service = new PluginService(createMockDatabaseService() as never);
  });

  describe('listTenantPlugins', () => {
    it('returns an empty list when the database pool is unavailable', async () => {
      await expect(service.listTenantPlugins('tenant-1')).resolves.toEqual([]);
    });

    it('rejects when tenantId is missing', async () => {
      await expect(service.listTenantPlugins('')).rejects.toThrow('tenantId is required');
    });

    it('returns plugin rows scoped to the requested tenant', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              plugin_name: 'im',
              enabled: true,
              config: { uploadLimitMb: 5 },
              auto_update: true,
              enabled_at: new Date('2026-04-06T09:00:00.000Z'),
              installed_at: new Date('2026-04-06T09:30:00.000Z'),
              installed_version: '1.2.0',
            },
            {
              plugin_name: 'modernizer',
              enabled: false,
              config: {},
              auto_update: false,
              enabled_at: new Date('2026-04-06T10:00:00.000Z'),
              installed_at: new Date('2026-04-06T10:15:00.000Z'),
              installed_version: null,
            },
          ],
          rowCount: 2,
        },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.listTenantPlugins('tenant-1')).resolves.toEqual([
        {
          autoUpdate: true,
          config: { uploadLimitMb: 5 },
          enabled: true,
          enabledAt: '2026-04-06T09:00:00.000Z',
          installedAt: '2026-04-06T09:30:00.000Z',
          installedVersion: '1.2.0',
          name: 'im',
        },
        {
          autoUpdate: false,
          config: {},
          enabled: false,
          enabledAt: '2026-04-06T10:00:00.000Z',
          installedAt: '2026-04-06T10:15:00.000Z',
          installedVersion: null,
          name: 'modernizer',
        },
      ]);

      expect(mockClient.calls[1]).toEqual({
        params: ['tenant-1'],
        sql: "SELECT set_config('app.current_tenant', $1, true)",
      });
      expect(mockClient.calls[2]?.sql).toContain('FROM tenant_plugins');
      expect(mockClient.calls[2]?.sql).toContain('installed_at');
      expect(mockClient.calls[2]?.sql).toContain('auto_update');
      expect(mockClient.calls[2]?.sql).toContain('installed_version');
      expect(mockClient.calls[2]?.sql).toContain('WHERE tenant_id = $1');
      expect(mockClient.calls[2]?.params).toEqual(['tenant-1']);
    });
  });

  describe('isPluginEnabled', () => {
    it('returns false when the database pool is unavailable', async () => {
      await expect(service.isPluginEnabled('tenant-1', 'im')).resolves.toBe(false);
    });

    it('rejects when tenantId is missing', async () => {
      await expect(service.isPluginEnabled('', 'im')).rejects.toThrow('tenantId is required');
    });

    it('returns true when the tenant has the plugin enabled', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ enabled: true }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.isPluginEnabled('tenant-1', 'im')).resolves.toBe(true);
      expect(mockClient.calls[2]?.params).toEqual(['tenant-1', 'im']);
    });

    it('returns false when the plugin row is absent or disabled', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.isPluginEnabled('tenant-2', 'backlog')).resolves.toBe(false);
      expect(mockClient.calls[2]?.sql).toContain('enabled = true');
      expect(mockClient.calls[2]?.params).toEqual(['tenant-2', 'backlog']);
    });
  });

  describe('updatePluginConfig', () => {
    it('upserts tenant plugin configuration inside a tenant-scoped transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ plugin_name: '@nodeadmin/plugin-kanban' }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(
        service.updatePluginConfig('tenant-1', '@nodeadmin/plugin-kanban', {
          boardLimit: 10,
        }),
      ).resolves.toEqual({
        pluginId: '@nodeadmin/plugin-kanban',
        success: true,
      });

      expect(mockClient.calls[1]).toEqual({
        params: ['tenant-1'],
        sql: "SELECT set_config('app.current_tenant', $1, true)",
      });
      expect(mockClient.calls[2]?.sql).toContain('INSERT INTO tenant_plugins');
      expect(mockClient.calls[2]?.sql).toContain('DO UPDATE SET config = EXCLUDED.config');
      expect(mockClient.calls[2]?.params).toEqual([
        'tenant-1',
        '@nodeadmin/plugin-kanban',
        '{"boardLimit":10}',
      ]);
    });
  });

  describe('togglePluginEnabled', () => {
    it('flips tenant plugin enabled state inside a tenant-scoped transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [{ enabled: false, plugin_name: '@nodeadmin/plugin-kanban' }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.togglePluginEnabled('tenant-1', '@nodeadmin/plugin-kanban')).resolves.toEqual({
        enabled: false,
        pluginId: '@nodeadmin/plugin-kanban',
        success: true,
      });

      expect(mockClient.calls[1]).toEqual({
        params: ['tenant-1'],
        sql: "SELECT set_config('app.current_tenant', $1, true)",
      });
      expect(mockClient.calls[2]?.sql).toContain('UPDATE tenant_plugins');
      expect(mockClient.calls[2]?.sql).toContain('enabled = NOT enabled');
      expect(mockClient.calls[2]?.params).toEqual(['tenant-1', '@nodeadmin/plugin-kanban']);
    });
  });
});
