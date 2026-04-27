import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { OutboxPublisherService } from '../infrastructure/outbox/outboxPublisherService';
import { AuditInterceptor } from '../infrastructure/audit/auditInterceptor';
import { InfrastructureModule } from '../infrastructure/infrastructureModule';
import { AuthModule } from '../modules/auth/authModule';
import { JwtAuthGuard } from '../modules/auth/jwtAuthGuard';
import { ConsoleModule } from '../modules/console/consoleModule';
import { HealthModule } from '../modules/health/healthModule';
import { ImModule } from '../modules/im/imModule';
import { MenusModule } from '../modules/menus/menusModule';
import { PermissionsModule } from '../modules/permissions/permissionsModule';
import { RolesModule } from '../modules/roles/rolesModule';
import { TenantsModule } from '../modules/tenants/tenantsModule';
import { BacklogModule } from '../modules/backlog/backlogModule';
import { ModernizerModule } from '../modules/modernizer/modernizerModule';
import { PluginGuard } from '../modules/plugin/pluginGuard';
import { PluginLoaderModule } from '../modules/plugin/pluginLoaderModule';
import { PluginModule } from '../modules/plugin/pluginModule';
import { PluginRegistryService } from '../modules/plugin/pluginRegistryService';
import { UsersModule } from '../modules/users/usersModule';

const APP_IMPORTS = [
  ConfigModule.forRoot({ cache: true, isGlobal: true }),
  InfrastructureModule,
  AuthModule,
  HealthModule,
  ImModule,
  ConsoleModule,
  UsersModule,
  RolesModule,
  PermissionsModule,
  MenusModule,
  TenantsModule,
  ModernizerModule,
  BacklogModule,
  PluginModule,
];

const APP_PROVIDERS = [
  OutboxPublisherService,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: PluginGuard },
  { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
];

@Module({
  imports: APP_IMPORTS,
  providers: APP_PROVIDERS,
})
export class AppModule {
  static async forRootAsync(registry: PluginRegistryService = new PluginRegistryService()): Promise<DynamicModule> {
    const pluginLoaderModule = await PluginLoaderModule.forRootAsync(registry);

    return {
      module: AppModule,
      imports: [...APP_IMPORTS, pluginLoaderModule],
      providers: APP_PROVIDERS,
    };
  }
}
