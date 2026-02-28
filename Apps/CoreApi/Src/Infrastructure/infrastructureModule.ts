import { Module } from '@nestjs/common';
import { AuditLogService } from './Audit/auditLogService';

@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class InfrastructureModule {}
