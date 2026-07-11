import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/auditLogService';
import { ConnectionRegistry } from './connectionRegistry';
import { DatabaseService } from './database/databaseService';
import { OutboxDatabaseService } from './outbox/outboxDatabaseService';
import { TenantContextResolver } from './tenant/tenantContextResolver';
import { TenantScopedExecutor } from './tenant/tenantScopedExecutor';

@Module({
  providers: [
    ConnectionRegistry,
    DatabaseService,
    OutboxDatabaseService,
    TenantContextResolver,
    TenantScopedExecutor,
    // AuditLogService builds its AuditLogRepository lazily from the injected (and exported)
    // DatabaseService, so audit logs persist whenever a DB is configured — including when the
    // service is resolved from the global APP_INTERCEPTOR scope.
    AuditLogService,
  ],
  exports: [
    AuditLogService,
    ConnectionRegistry,
    DatabaseService,
    OutboxDatabaseService,
    TenantContextResolver,
    TenantScopedExecutor,
  ],
})
export class InfrastructureModule {}
