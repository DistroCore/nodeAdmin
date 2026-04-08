import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import { PluginMarketService } from './pluginMarketService';

setupTestEnv();

describe('PluginMarketService', () => {
  let service: PluginMarketService;

  beforeEach(() => {
    service = new PluginMarketService();
  });

  describe('listMarketplacePlugins', () => {
    it('returns an empty page when the database pool is unavailable', async () => {
      await expect(service.listMarketplacePlugins()).resolves.toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });
    });

    it('returns paginated marketplace plugins with compatibility flags', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 2 }], rowCount: 1 },
        {
          rows: [
            {
              id: '@nodeadmin/plugin-kanban',
              display_name: 'Kanban',
              description: 'Board view',
              author_name: 'NodeAdmin Team',
              latest_version: '1.2.0',
              is_public: true,
              download_count: 42,
              min_platform_version: '>=0.1.0',
            },
            {
              id: '@nodeadmin/plugin-legacy',
              display_name: 'Legacy',
              description: 'Old plugin',
              author_name: 'Compat Team',
              latest_version: '0.8.0',
              is_public: true,
              download_count: 3,
              min_platform_version: '>=2.0.0',
            },
          ],
          rowCount: 2,
        },
      ]);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.listMarketplacePlugins(1, 20, 'kan')).resolves.toEqual({
        items: [
          {
            authorName: 'NodeAdmin Team',
            description: 'Board view',
            displayName: 'Kanban',
            downloadCount: 42,
            id: '@nodeadmin/plugin-kanban',
            isCompatible: true,
            latestVersion: '1.2.0',
            minPlatformVersion: '>=0.1.0',
          },
          {
            authorName: 'Compat Team',
            description: 'Old plugin',
            displayName: 'Legacy',
            downloadCount: 3,
            id: '@nodeadmin/plugin-legacy',
            isCompatible: false,
            latestVersion: '0.8.0',
            minPlatformVersion: '>=2.0.0',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      });

      expect(mockPool.query.mock.calls[0]?.[0]).toContain('FROM plugin_registry');
      expect(mockPool.query.mock.calls[1]?.[0]).toContain('LEFT JOIN plugin_versions');
    });
  });

  describe('getPluginDetails', () => {
    it('throws when the plugin cannot be found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.getPluginDetails('@nodeadmin/plugin-missing')).rejects.toThrow(
        'Plugin not found'
      );
    });

    it('returns plugin details with version history and compatibility', async () => {
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: '@nodeadmin/plugin-kanban',
              display_name: 'Kanban',
              description: 'Board view',
              author_name: 'NodeAdmin Team',
              author_email: 'team@nodeadmin.dev',
              latest_version: '1.2.0',
              is_public: true,
              download_count: 42,
            },
          ],
          rowCount: 1,
        },
        {
          rows: [
            {
              bundle_url: 'https://cdn.example.com/kanban-1.2.0.js',
              changelog: 'Stable release',
              min_platform_version: '>=0.1.0',
              published_at: new Date('2026-04-06T12:00:00.000Z'),
              server_package: '@nodeadmin/plugin-kanban@1.2.0',
              version: '1.2.0',
            },
            {
              bundle_url: 'https://cdn.example.com/kanban-1.1.0.js',
              changelog: 'Initial release',
              min_platform_version: '>=0.1.0',
              published_at: new Date('2026-04-05T12:00:00.000Z'),
              server_package: '@nodeadmin/plugin-kanban@1.1.0',
              version: '1.1.0',
            },
          ],
          rowCount: 2,
        },
      ]);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(service.getPluginDetails('@nodeadmin/plugin-kanban')).resolves.toEqual({
        authorEmail: 'team@nodeadmin.dev',
        authorName: 'NodeAdmin Team',
        description: 'Board view',
        displayName: 'Kanban',
        downloadCount: 42,
        id: '@nodeadmin/plugin-kanban',
        isPublic: true,
        latestVersion: '1.2.0',
        versions: [
          {
            bundleUrl: 'https://cdn.example.com/kanban-1.2.0.js',
            changelog: 'Stable release',
            isCompatible: true,
            minPlatformVersion: '>=0.1.0',
            publishedAt: '2026-04-06T12:00:00.000Z',
            serverPackage: '@nodeadmin/plugin-kanban@1.2.0',
            version: '1.2.0',
          },
          {
            bundleUrl: 'https://cdn.example.com/kanban-1.1.0.js',
            changelog: 'Initial release',
            isCompatible: true,
            minPlatformVersion: '>=0.1.0',
            publishedAt: '2026-04-05T12:00:00.000Z',
            serverPackage: '@nodeadmin/plugin-kanban@1.1.0',
            version: '1.1.0',
          },
        ],
      });
    });
  });

  describe('isVersionCompatible', () => {
    it('supports exact, >=, >, <=, <, ^ and ~ ranges', () => {
      expect(service.isVersionCompatible('0.1.0', '0.1.0')).toBe(true);
      expect(service.isVersionCompatible('0.1.0', '>=0.1.0')).toBe(true);
      expect(service.isVersionCompatible('0.1.0', '>0.1.0')).toBe(false);
      expect(service.isVersionCompatible('0.1.0', '<=0.2.0')).toBe(true);
      expect(service.isVersionCompatible('0.1.0', '<0.1.0')).toBe(false);
      expect(service.isVersionCompatible('1.4.2', '^1.2.0')).toBe(true);
      expect(service.isVersionCompatible('1.4.2', '~1.4.0')).toBe(true);
      expect(service.isVersionCompatible('1.5.0', '~1.4.0')).toBe(false);
    });
  });

  describe('resolveInstallableVersion', () => {
    it('selects the newest compatible version from a descending version list', () => {
      const versions = [
        { minPlatformVersion: '>=2.0.0', version: '2.0.0' },
        { minPlatformVersion: '>=0.1.0', version: '1.3.0' },
        { minPlatformVersion: '>=0.1.0', version: '1.2.0' },
      ];

      expect(service.resolveInstallableVersion(versions)).toEqual({
        minPlatformVersion: '>=0.1.0',
        version: '1.3.0',
      });
    });
  });

  describe('installPlugin', () => {
    it('writes the selected plugin version into tenant_plugins with lifecycle-safe transaction setup', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
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
              min_platform_version: '>=0.1.0',
              server_package: '@nodeadmin/plugin-kanban@1.2.0',
              version: '1.2.0',
            },
          ],
          rowCount: 1,
        },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(
        service.installPlugin('tenant-1', '@nodeadmin/plugin-kanban', '1.2.0')
      ).resolves.toEqual({
        enabled: true,
        pluginId: '@nodeadmin/plugin-kanban',
        tenantId: 'tenant-1',
        version: '1.2.0',
      });

      expect(mockClient.calls[1]).toEqual({
        params: ['tenant-1'],
        sql: "SELECT set_config('app.current_tenant', $1, true)",
      });
      expect(mockClient.calls[3]?.sql).toContain('INSERT INTO tenant_plugins');
      expect(mockClient.calls[3]?.sql).toContain('installed_version');
    });
  });

  describe('updatePlugin', () => {
    it('updates a tenant to a newer compatible plugin version', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              manifest: {
                author: { name: 'NodeAdmin Team' },
                description: 'Board view',
                displayName: 'Kanban',
                engines: { nodeAdmin: '>=0.1.0' },
                entrypoints: { server: './dist/server/index.js' },
                id: '@nodeadmin/plugin-kanban',
                permissions: ['backlog:view'],
                version: '1.3.0',
              },
              min_platform_version: '>=0.1.0',
              server_package: '@nodeadmin/plugin-kanban@1.3.0',
              version: '1.3.0',
            },
          ],
          rowCount: 1,
        },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(
        service.updatePlugin('tenant-1', '@nodeadmin/plugin-kanban', '1.3.0')
      ).resolves.toEqual({
        enabled: true,
        pluginId: '@nodeadmin/plugin-kanban',
        tenantId: 'tenant-1',
        version: '1.3.0',
      });
    });
  });

  describe('uninstallPlugin', () => {
    it('removes the tenant plugin record inside a tenant-scoped transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              installed_version: '1.2.0',
              manifest: null,
              server_package: null,
            },
          ],
          rowCount: 1,
        },
        { rows: [{ plugin_name: '@nodeadmin/plugin-kanban' }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(
        service.uninstallPlugin('tenant-1', '@nodeadmin/plugin-kanban')
      ).resolves.toEqual({
        pluginId: '@nodeadmin/plugin-kanban',
        removed: true,
        tenantId: 'tenant-1',
      });

      expect(mockClient.calls[2]?.sql).toContain('FROM tenant_plugins tp');
      expect(mockClient.calls[3]?.sql).toContain('DELETE FROM tenant_plugins');
      expect(mockClient.calls[3]?.params).toEqual(['tenant-1', '@nodeadmin/plugin-kanban']);
    });

    it('runs lifecycle hooks before removing an installed plugin', async () => {
      const lifecycleHook = vi.fn(async () => undefined);
      const hookModuleLoader = vi.fn(() => lifecycleHook);
      const packageJsonResolver = vi.fn(
        () => '/repo/node_modules/@nodeadmin/plugin-kanban/package.json'
      );
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              installed_version: '1.2.0',
              manifest: {
                author: { name: 'NodeAdmin Team' },
                description: 'Board view',
                displayName: 'Kanban',
                engines: { nodeAdmin: '>=0.1.0' },
                entrypoints: { server: './dist/server/index.js' },
                id: '@nodeadmin/plugin-kanban',
                lifecycle: { onUninstall: './scripts/uninstall.cjs' },
                permissions: ['backlog:view'],
                version: '1.2.0',
              },
              server_package: '@nodeadmin/plugin-kanban@1.2.0',
            },
          ],
          rowCount: 1,
        },
        { rows: [{ plugin_name: '@nodeadmin/plugin-kanban' }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;
      (service as unknown as { hookModuleLoader: typeof hookModuleLoader }).hookModuleLoader =
        hookModuleLoader;
      (
        service as unknown as { packageJsonResolver: typeof packageJsonResolver }
      ).packageJsonResolver = packageJsonResolver;

      await service.uninstallPlugin('tenant-1', '@nodeadmin/plugin-kanban');

      expect(packageJsonResolver).toHaveBeenCalledWith('@nodeadmin/plugin-kanban');
      expect(hookModuleLoader).toHaveBeenCalledWith(
        '/repo/node_modules/@nodeadmin/plugin-kanban/scripts/uninstall.cjs'
      );
      expect(lifecycleHook).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: '@nodeadmin/plugin-kanban',
          tenantId: 'tenant-1',
          version: '1.2.0',
        })
      );
      expect(mockClient.calls[3]?.sql).toContain('DELETE FROM tenant_plugins');
    });
  });

  describe('install lifecycle', () => {
    it('runs lifecycle hooks after persisting an installed plugin', async () => {
      const lifecycleHook = vi.fn(async () => undefined);
      const hookModuleLoader = vi.fn(() => lifecycleHook);
      const packageJsonResolver = vi.fn(
        () => '/repo/node_modules/@nodeadmin/plugin-kanban/package.json'
      );
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [
            {
              manifest: {
                author: { name: 'NodeAdmin Team' },
                description: 'Board view',
                displayName: 'Kanban',
                engines: { nodeAdmin: '>=0.1.0' },
                entrypoints: { server: './dist/server/index.js' },
                id: '@nodeadmin/plugin-kanban',
                lifecycle: { onInstall: './scripts/install.cjs' },
                permissions: ['backlog:view'],
                version: '1.2.0',
              },
              min_platform_version: '>=0.1.0',
              server_package: '@nodeadmin/plugin-kanban@1.2.0',
              version: '1.2.0',
            },
          ],
          rowCount: 1,
        },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;
      (service as unknown as { hookModuleLoader: typeof hookModuleLoader }).hookModuleLoader =
        hookModuleLoader;
      (
        service as unknown as { packageJsonResolver: typeof packageJsonResolver }
      ).packageJsonResolver = packageJsonResolver;

      await service.installPlugin('tenant-1', '@nodeadmin/plugin-kanban', '1.2.0');

      expect(packageJsonResolver).toHaveBeenCalledWith('@nodeadmin/plugin-kanban');
      expect(hookModuleLoader).toHaveBeenCalledWith(
        '/repo/node_modules/@nodeadmin/plugin-kanban/scripts/install.cjs'
      );
      expect(lifecycleHook).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: '@nodeadmin/plugin-kanban',
          tenantId: 'tenant-1',
          version: '1.2.0',
        })
      );
      expect(mockClient.calls[3]?.sql).toContain('INSERT INTO tenant_plugins');
    });
  });

  describe('publishPlugin', () => {
    it('upserts plugin registry metadata and inserts a plugin version row', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        {
          rows: [{ latest_version: '1.1.0' }],
          rowCount: 1,
        },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as unknown as { pool: typeof mockPool }).pool = mockPool;

      await expect(
        service.publishPlugin({
          bundleUrl: 'https://cdn.example.com/kanban-1.2.0.js',
          changelog: 'Stable release',
          manifest: {
            author: { email: 'team@nodeadmin.dev', name: 'NodeAdmin Team' },
            description: 'Board view',
            displayName: 'Kanban',
            engines: { nodeAdmin: '>=0.1.0' },
            entrypoints: { server: './dist/server/index.js' },
            id: '@nodeadmin/plugin-kanban',
            permissions: ['backlog:view'],
            version: '1.2.0',
          },
          serverPackage: '@nodeadmin/plugin-kanban@1.2.0',
        })
      ).resolves.toEqual({
        pluginId: '@nodeadmin/plugin-kanban',
        publishedVersion: '1.2.0',
      });

      expect(mockClient.calls[1]?.sql).toContain('SELECT latest_version FROM plugin_registry');
      expect(mockClient.calls[2]?.sql).toContain('INSERT INTO plugin_registry');
      expect(mockClient.calls[3]?.sql).toContain('INSERT INTO plugin_versions');
    });
  });
});
