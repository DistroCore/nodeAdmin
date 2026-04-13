import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalize } from 'node:path';
import type { PluginManifest } from '@nodeadmin/shared-types';
import { PluginRegistryService } from './pluginRegistryService';

interface MockDirent {
  isDirectory: () => boolean;
  name: string;
}

function createDirectoryEntry(name: string): MockDirent {
  return {
    isDirectory: () => true,
    name,
  };
}

function createFileEntry(name: string): MockDirent {
  return {
    isDirectory: () => false,
    name,
  };
}

function createManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: '@nodeadmin/plugin-kanban',
    version: '1.0.0',
    displayName: 'Kanban',
    description: 'Visual board',
    author: {
      name: 'NodeAdmin Team',
    },
    engines: {
      nodeAdmin: '>=1.0.0',
    },
    permissions: ['backlog:view'],
    entrypoints: {
      server: './dist/server/index.js',
    },
    ...overrides,
  };
}

describe('PluginRegistryService', () => {
  let service: PluginRegistryService;
  let mockFs: {
    readdir: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
  };
  let logger: {
    warn: ReturnType<typeof vi.fn>;
  };
  let moduleLoader: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new PluginRegistryService();
    mockFs = {
      readdir: vi.fn(),
      readFile: vi.fn(),
    };
    logger = {
      warn: vi.fn(),
    };
    moduleLoader = vi.fn();

    (service as unknown as { fs: typeof mockFs }).fs = mockFs;
    (service as unknown as { logger: typeof logger }).logger = logger;
    (service as unknown as { moduleLoader: typeof moduleLoader }).moduleLoader = moduleLoader;
    (service as unknown as { nodeModulesScopePath: string }).nodeModulesScopePath =
      '/workspace/node_modules/@nodeadmin';
  });

  it('scans installed plugin packages and returns validated registrations', async () => {
    mockFs.readdir.mockResolvedValue([
      createDirectoryEntry('plugin-kanban'),
      createDirectoryEntry('plugin-im'),
      createFileEntry('README.md'),
      createDirectoryEntry('shared-types'),
    ]);
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(createManifest())).mockResolvedValueOnce(
      JSON.stringify(
        createManifest({
          id: '@nodeadmin/plugin-im',
          displayName: 'IM',
          entrypoints: {
            server: './dist/server/imModule.js',
          },
        }),
      ),
    );

    const result = await service.scanInstalledPlugins();

    expect(mockFs.readdir).toHaveBeenCalledWith('/workspace/node_modules/@nodeadmin', {
      withFileTypes: true,
    });
    expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    expect(result.map((plugin) => plugin.id)).toEqual(['@nodeadmin/plugin-im', '@nodeadmin/plugin-kanban']);
    expect(result[0]).toMatchObject({
      packageRoot: normalize('/workspace/node_modules/@nodeadmin/plugin-im'),
      routePrefix: '/plugins/im',
    });
  });

  it('skips packages whose manifest fails validation', async () => {
    mockFs.readdir.mockResolvedValue([createDirectoryEntry('plugin-kanban'), createDirectoryEntry('plugin-broken')]);
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify(createManifest()))
      .mockResolvedValueOnce(JSON.stringify({ id: 'broken-plugin' }));

    const result = await service.scanInstalledPlugins();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('@nodeadmin/plugin-kanban');
  });

  it('skips plugins whose manifest file contains invalid JSON instead of crashing the scan', async () => {
    mockFs.readdir.mockResolvedValue([createDirectoryEntry('plugin-broken'), createDirectoryEntry('plugin-kanban')]);
    mockFs.readFile.mockResolvedValueOnce('{invalid json').mockResolvedValueOnce(JSON.stringify(createManifest()));

    await expect(service.scanInstalledPlugins()).resolves.toEqual([
      expect.objectContaining({
        id: '@nodeadmin/plugin-kanban',
      }),
    ]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping plugin plugin-broken'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
  });

  it('clears stale registrations before each rescan', async () => {
    mockFs.readdir.mockResolvedValueOnce([createDirectoryEntry('plugin-kanban')]).mockResolvedValueOnce([
      createDirectoryEntry('plugin-im'),
    ]);
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify(createManifest()))
      .mockResolvedValueOnce(
        JSON.stringify(
          createManifest({
            id: '@nodeadmin/plugin-im',
            displayName: 'IM',
          }),
        ),
      );

    await service.scanInstalledPlugins();
    await service.scanInstalledPlugins();

    expect(service.getRegisteredPlugins()).toEqual([
      expect.objectContaining({
        id: '@nodeadmin/plugin-im',
      }),
    ]);
  });

  it('loads the server module for a scanned plugin via require()', async () => {
    mockFs.readdir.mockResolvedValue([createDirectoryEntry('plugin-kanban')]);
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(createManifest()));

    class KanbanPluginModule {}

    moduleLoader.mockReturnValue({
      default: KanbanPluginModule,
    });

    await service.scanInstalledPlugins();

    expect(service.getPluginModule('@nodeadmin/plugin-kanban')).toBe(KanbanPluginModule);
    expect(moduleLoader).toHaveBeenCalledWith(
      normalize('/workspace/node_modules/@nodeadmin/plugin-kanban/dist/server/index.js'),
    );
  });

  it('throws when loading an unknown plugin module', () => {
    expect(() => service.getPluginModule('@nodeadmin/plugin-missing')).toThrow(
      "Plugin '@nodeadmin/plugin-missing' is not registered",
    );
  });
});
