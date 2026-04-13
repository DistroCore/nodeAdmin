import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';
import { PluginAutoUpdateService } from './pluginAutoUpdateService';

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

function createMockPluginMarketService() {
  return {
    installPlugin: vi.fn(),
    resolveInstallableVersion: vi.fn(),
  };
}

describe('PluginAutoUpdateService', () => {
  let service: PluginAutoUpdateService;
  let marketService: ReturnType<typeof createMockPluginMarketService>;

  beforeEach(() => {
    marketService = createMockPluginMarketService();
    service = new PluginAutoUpdateService(createMockDatabaseService() as never, marketService as never);
  });

  it('catches bootstrap and interval errors on module init instead of crashing', async () => {
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation((callback) => {
      intervalCallbacks.push(callback as () => void);
      return {} as NodeJS.Timeout;
    });
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const runSpy = vi.spyOn(service, 'runAutoUpdateCycle').mockRejectedValue(new Error('boom'));

    (service as unknown as { logger: typeof logger }).logger = logger;
    (service as unknown as { pool: { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> } }).pool = {
      connect: vi.fn(),
      query: vi.fn(),
    };

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);

    intervalCallbacks[0]?.();
    await Promise.resolve();

    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('updates tenant plugins via pluginMarketService.installPlugin after setting tenant context', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      {
        rows: [
          {
            installed_version: '1.1.0',
            plugin_name: '@nodeadmin/plugin-kanban',
            tenant_id: 'tenant-1',
          },
        ],
        rowCount: 1,
      },
      {
        rows: [
          { min_platform_version: '>=2.0.0', version: '2.0.0' },
          { min_platform_version: '>=0.1.0', version: '1.3.0' },
        ],
        rowCount: 2,
      },
      { rows: [], rowCount: 0 },
    ]);
    const mockPool = createMockPool([
      {
        rows: [{ id: 'tenant-1' }],
        rowCount: 1,
      },
    ]);
    mockPool.connect = vi.fn(async () => client);
    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    marketService.resolveInstallableVersion.mockReturnValue({
      minPlatformVersion: '>=0.1.0',
      version: '1.3.0',
    });
    marketService.installPlugin.mockResolvedValue({
      installedVersion: '1.3.0',
      pluginId: '@nodeadmin/plugin-kanban',
      success: true,
    });

    await service.runAutoUpdateCycle();

    expect(mockPool.query).toHaveBeenCalledWith(
      `SELECT id
         FROM tenants
         ORDER BY id ASC`,
    );
    expect(client.calls[1]).toEqual({
      params: ['tenant-1'],
      sql: "SELECT set_config('app.current_tenant', $1, true)",
    });
    expect(client.calls[2]?.sql).toContain('FROM tenant_plugins');
    expect(client.calls[2]?.params).toEqual(['tenant-1']);
    expect(client.calls[3]?.sql).toContain('FROM plugin_versions');
    expect(marketService.installPlugin).toHaveBeenCalledWith('tenant-1', '@nodeadmin/plugin-kanban', '1.3.0');
    expect(client.calls.some((call) => call.sql.includes('UPDATE tenant_plugins'))).toBe(false);
  });

  it('skips updates when no newer compatible version exists', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      {
        rows: [
          {
            installed_version: '1.3.0',
            plugin_name: '@nodeadmin/plugin-kanban',
            tenant_id: 'tenant-1',
          },
        ],
        rowCount: 1,
      },
      {
        rows: [{ min_platform_version: '>=0.1.0', version: '1.3.0' }],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
    ]);
    const mockPool = createMockPool([
      {
        rows: [{ id: 'tenant-1' }],
        rowCount: 1,
      },
    ]);
    mockPool.connect = vi.fn(async () => client);
    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    marketService.resolveInstallableVersion.mockReturnValue({
      minPlatformVersion: '>=0.1.0',
      version: '1.3.0',
    });

    await service.runAutoUpdateCycle();

    expect(marketService.installPlugin).not.toHaveBeenCalled();
    expect(client.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
  });

  it('skips overlapping cycles when one is already running', async () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const mockPool = createMockPool([
      {
        rows: [{ id: 'tenant-1' }],
        rowCount: 1,
      },
    ]);

    (service as unknown as { isRunning: boolean }).isRunning = true;
    (service as unknown as { logger: typeof logger }).logger = logger;
    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    await service.runAutoUpdateCycle();

    expect(mockPool.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
