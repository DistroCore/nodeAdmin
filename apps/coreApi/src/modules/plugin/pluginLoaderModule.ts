import { Logger, Module, type DynamicModule, type Type } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { PluginRegistryService } from './pluginRegistryService';
import { PluginSandboxModule } from './pluginSandboxModule';

@Module({})
export class PluginLoaderModule {
  private static readonly logger = new Logger(PluginLoaderModule.name);

  static async forRootAsync(registry: PluginRegistryService = new PluginRegistryService()): Promise<DynamicModule> {
    const registrations = await registry.scanInstalledPlugins();

    const sandboxModules: DynamicModule[] = [];
    const pluginModules: Type<unknown>[] = [];
    const pluginRoutes: { module: Type<unknown>; path: string }[] = [];

    // Load each plugin independently: a single broken plugin (invalid permissions, missing/unbuilt
    // server entrypoint) must not take down the whole host — log it and skip.
    for (const registration of registrations) {
      try {
        const sandbox = PluginSandboxModule.forPlugin({
          permissions: registration.manifest.permissions,
          definedPermissions: (registration.manifest.contributes?.permissions ?? []).map(
            (permission) => permission.code,
          ),
          pluginId: registration.id,
          tenantContext: {
            pluginId: registration.id,
            tenantId: 'bootstrap',
            userId: 'bootstrap',
          },
        });
        const pluginModule = registry.getPluginModule(registration.id) as Type<unknown>;

        sandboxModules.push(sandbox);
        pluginModules.push(pluginModule);
        pluginRoutes.push({ module: pluginModule, path: registration.routePrefix.replace(/^\//, '') });
      } catch (error) {
        this.logger.warn(
          `Skipping plugin ${registration.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

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
