import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { PluginRegistryService } from './pluginRegistryService';
import { PluginSandboxModule } from './pluginSandboxModule';

@Module({})
export class PluginLoaderModule {
  static async forRootAsync(registry: PluginRegistryService = new PluginRegistryService()): Promise<DynamicModule> {
    const registrations = await registry.scanInstalledPlugins();
    const pluginModules = registrations.map((registration) => {
      PluginSandboxModule.validatePermissions(registration.manifest.permissions);
      return registry.getPluginModule(registration.id) as Type<unknown>;
    });

    const pluginRoutes = registrations.map((registration, index) => ({
      module: pluginModules[index],
      path: registration.routePrefix.replace(/^\//, ''),
    }));

    return {
      module: PluginLoaderModule,
      imports: [RouterModule.register(pluginRoutes), ...pluginModules],
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
