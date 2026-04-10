import { Module, type DynamicModule } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginSandboxModule } from './pluginSandboxModule';
import { PluginLoaderModule } from './pluginLoaderModule';

@Module({})
class KanbanPluginModule {}

@Module({})
class ImPluginModule {}

describe('PluginLoaderModule', () => {
  let routerRegisterSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    routerRegisterSpy = vi.spyOn(RouterModule, 'register').mockReturnValue({ module: RouterModule } as DynamicModule);
  });

  it('scans installed plugins before building dynamic imports', async () => {
    const registry = {
      getPluginModule: vi.fn().mockReturnValueOnce(KanbanPluginModule).mockReturnValueOnce(ImPluginModule),
      scanInstalledPlugins: vi.fn().mockResolvedValue([
        {
          id: '@nodeadmin/plugin-kanban',
          manifest: {
            permissions: ['backlog:view'],
          },
          packageRoot: '/plugins/kanban',
          routePrefix: '/plugins/kanban',
        },
        {
          id: '@nodeadmin/plugin-im',
          manifest: {
            permissions: ['im:view'],
          },
          packageRoot: '/plugins/im',
          routePrefix: '/plugins/im',
        },
      ]),
    };

    const permissionSpy = vi.spyOn(PluginSandboxModule, 'validatePermissions');

    const dynamicModule = await PluginLoaderModule.forRootAsync(registry as never);

    expect(registry.scanInstalledPlugins).toHaveBeenCalledWith();
    expect(registry.getPluginModule).toHaveBeenNthCalledWith(1, '@nodeadmin/plugin-kanban');
    expect(registry.getPluginModule).toHaveBeenNthCalledWith(2, '@nodeadmin/plugin-im');
    expect(permissionSpy).toHaveBeenNthCalledWith(1, ['backlog:view']);
    expect(permissionSpy).toHaveBeenNthCalledWith(2, ['im:view']);
    expect(dynamicModule.imports).toEqual(
      expect.arrayContaining([{ module: RouterModule }, KanbanPluginModule, ImPluginModule]),
    );
  });

  it('registers plugin route prefixes under /plugins/<name>', async () => {
    const registry = {
      getPluginModule: vi.fn().mockReturnValue(KanbanPluginModule),
      scanInstalledPlugins: vi.fn().mockResolvedValue([
        {
          id: '@nodeadmin/plugin-kanban',
          manifest: {
            permissions: ['backlog:view'],
          },
          packageRoot: '/plugins/kanban',
          routePrefix: '/plugins/kanban',
        },
      ]),
    };

    await PluginLoaderModule.forRootAsync(registry as never);

    expect(routerRegisterSpy).toHaveBeenCalledWith([
      {
        module: KanbanPluginModule,
        path: 'plugins/kanban',
      },
    ]);
  });
});
