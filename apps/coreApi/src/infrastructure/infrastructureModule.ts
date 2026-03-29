import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/auditLogService';
import { AuditLogRepository } from './database/auditLogRepository';
import { DatabaseService } from './database/databaseService';

@Module({
  providers: [
    DatabaseService,
    {
      provide: AuditLogRepository,
      useFactory: (databaseService: DatabaseService) => {
        if (!databaseService.drizzle) {
          return null;
        }
        return new AuditLogRepository(databaseService.drizzle);
      },
      inject: [DatabaseService],
    },
    AuditLogService,
  ],
  exports: [AuditLogService, DatabaseService],
})
export class InfrastructureModule {}
