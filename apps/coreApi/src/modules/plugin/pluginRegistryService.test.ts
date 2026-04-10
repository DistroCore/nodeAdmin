import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalize } from 'node:path';
import type { PluginManifest } from '@nodeadmin/shared-types';
import { ManifestValidationError } from './manifestValidator';
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
  let moduleLoader: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new PluginRegistryService();
    mockFs = {
      readdir: vi.fn(),
      readFile: vi.fn(),
    };
    moduleLoader = vi.fn();

    (service as unknown as { fs: typeof mockFs }).fs = mockFs;
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

  it('throws a ManifestValidationError when a manifest file contains invalid JSON', async () => {
    mockFs.readdir.mockResolvedValue([createDirectoryEntry('plugin-kanban')]);
    mockFs.readFile.mockResolvedValueOnce('{invalid json');

    await expect(service.scanInstalledPlugins()).rejects.toThrow(ManifestValidationError);
    await expect(service.scanInstalledPlugins()).rejects.toThrow('nodeadmin-plugin.json contains invalid JSON');
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
