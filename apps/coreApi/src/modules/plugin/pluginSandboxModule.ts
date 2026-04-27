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
}

export const PLUGIN_PERMISSION_WHITELIST = [
  'audit:view',
  'backlog:manage',
  'backlog:view',
  'im:send',
  'im:view',
  'menus:manage',
  'menus:view',
  'modernizer:view',
  'overview:view',
  'release:view',
  'roles:manage',
  'roles:view',
  'settings:view',
  'task:read',
  'task:write',
  'tenants:view',
  'users:manage',
  'users:view',
] as const;

@Module({})
export class PluginSandboxModule {
  static forPlugin(options: PluginSandboxOptions): DynamicModule {
    this.validatePermissions(options.permissions);

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

  static validatePermissions(permissions: string[]): void {
    for (const permission of permissions) {
      if (!PLUGIN_PERMISSION_WHITELIST.includes(permission as (typeof PLUGIN_PERMISSION_WHITELIST)[number])) {
        throw new Error(`Plugin permission '${permission}' is not allowed`);
      }
    }
  }
}
