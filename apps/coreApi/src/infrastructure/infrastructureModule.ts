import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/auditLogService';
import { DatabaseService } from './database/databaseService';
import { TenantContextResolver } from './tenant/tenantContextResolver';
import { TenantScopedExecutor } from './tenant/tenantScopedExecutor';

@Module({
  providers: [
    DatabaseService,
    TenantContextResolver,
    TenantScopedExecutor,
    // AuditLogService builds its AuditLogRepository lazily from the injected (and exported)
    // DatabaseService, so audit logs persist whenever a DB is configured — including when the
    // service is resolved from the global APP_INTERCEPTOR scope.
    AuditLogService,
  ],
  exports: [AuditLogService, DatabaseService, TenantContextResolver, TenantScopedExecutor],
})
export class InfrastructureModule {}
