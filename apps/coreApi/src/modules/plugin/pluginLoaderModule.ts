import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { PluginRegistryService } from './pluginRegistryService';
import { PluginSandboxModule } from './pluginSandboxModule';

@Module({})
export class PluginLoaderModule {
  static async forRootAsync(registry: PluginRegistryService = new PluginRegistryService()): Promise<DynamicModule> {
    const registrations = await registry.scanInstalledPlugins();
    const sandboxModules = registrations.map((registration) =>
      PluginSandboxModule.forPlugin({
        permissions: registration.manifest.permissions,
        pluginId: registration.id,
        tenantContext: {
          pluginId: registration.id,
          tenantId: 'bootstrap',
          userId: 'bootstrap',
        },
      }),
    );
    const pluginModules = registrations.map((registration) => registry.getPluginModule(registration.id) as Type<unknown>);

    const pluginRoutes = registrations.map((registration, index) => ({
      module: pluginModules[index],
      path: registration.routePrefix.replace(/^\//, ''),
    }));

    return {
      module: PluginLoaderModule,
      imports: [RouterModule.register(pluginRoutes), ...sandboxModules, ...pluginModules],
      providers: [
        {
          provide: PluginRegistryService,
          useValue: registry,
        },
      ],
      exports: [PluginRegistryService],
    };
  }
}
