import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/auditLogService';

@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class InfrastructureModule {}
