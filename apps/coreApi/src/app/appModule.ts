import { Module } from '@nestjs/common';
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
import { UsersModule } from '../modules/users/usersModule';

@Module({
  imports: [
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
  ],
  providers: [
    OutboxPublisherService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
