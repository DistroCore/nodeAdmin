import { DynamicModule, Module } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/databaseService';

export const PLUGIN_TENANT_CONTEXT = Symbol('PLUGIN_TENANT_CONTEXT');

export interface PluginTenantContext {
  pluginId: string;
  tenantId: string;
  userId: string;
}

export interface PluginSandboxOptions {
  permissions: string[];
  pluginId: string;
  tenantContext: PluginTenantContext;
  /** Permission codes the plugin defines itself (manifest contributes.permissions). Always trusted. */
  definedPermissions?: string[];
}

/**
 * Core permissions a plugin is allowed to piggyback on. Kept deliberately small: only platform-wide
 * capabilities that are safe for any plugin to gate its UI/routes on. Module-specific permissions are
 * NOT listed here — a plugin that needs its own permission codes declares them via
 * `contributes.permissions` and seeds them with its own migration.
 */
export const PLUGIN_PERMISSION_WHITELIST = ['audit:view', 'overview:view', 'settings:view'] as const;

@Module({})
export class PluginSandboxModule {
  static forPlugin(options: PluginSandboxOptions): DynamicModule {
    this.validatePermissions(options.permissions, options.definedPermissions);

    return {
      module: PluginSandboxModule,
      providers: [
        DatabaseService,
        {
          provide: PLUGIN_TENANT_CONTEXT,
          useValue: options.tenantContext,
        },
      ],
      exports: [DatabaseService, PLUGIN_TENANT_CONTEXT],
    };
  }

  static validatePermissions(permissions: string[], definedPermissions: string[] = []): void {
    const defined = new Set(definedPermissions);

    for (const permission of permissions) {
      const isCorePermission = PLUGIN_PERMISSION_WHITELIST.includes(
        permission as (typeof PLUGIN_PERMISSION_WHITELIST)[number],
      );

      if (!isCorePermission && !defined.has(permission)) {
        throw new Error(
          `Plugin permission '${permission}' is not allowed: it must be a shareable core permission or declared in contributes.permissions`,
        );
      }
    }
  }
}
