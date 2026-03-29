import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditLogRepository, StoredAuditLog } from '../database/auditLogRepository';

export interface AuditLogRecord {
  action: string;
  context?: Record<string, unknown>;
  targetId?: string | null;
  targetType?: string | null;
  tenantId: string;
  traceId: string;
  userId: string;
}

@Injectable()
export class AuditLogService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly fallbackRows: StoredAuditLog[] = [];

  constructor(
    @Optional() private readonly repository?: AuditLogRepository,
  ) {
    if (!this.repository) {
      this.logger.warn('AuditLogRepository not available. Audit logs will use in-memory fallback.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Repository manages its own lifecycle via DatabaseService
  }

  async record(input: AuditLogRecord): Promise<void> {
    if (!this.repository) {
      const row: StoredAuditLog = {
        action: input.action,
        context: input.context ?? null,
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        tenantId: input.tenantId,
        traceId: input.traceId,
        userId: input.userId,
      };
      this.fallbackRows.unshift(row);
      if (this.fallbackRows.length > 200) {
        this.fallbackRows.pop();
      }
      return;
    }

    await this.repository.record(input);
  }

  async listByFilter(
    filter: { tenantId: string; userId?: string; action?: string; targetType?: string; startDate?: string; endDate?: string },
    page: number,
    pageSize: number,
  ): Promise<{ items: StoredAuditLog[]; total: number }> {
    if (!this.repository) {
      const filtered = this.fallbackRows.filter((row) => {
        if (row.tenantId !== filter.tenantId) return false;
        if (filter.userId && row.userId !== filter.userId) return false;
        if (filter.action && row.action !== filter.action) return false;
        if (filter.targetType && row.targetType !== filter.targetType) return false;
        return true;
      });

      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
      };
    }

    const [items, total] = await Promise.all([
      this.repository.findByFilter(filter, page, pageSize),
      this.repository.countByFilter(filter),
    ]);

    return { items, total };
  }

  /**
   * Compatibility wrapper for consoleController.
   * Task 4 will migrate the controller to use listByFilter directly.
   */
  async listByTenant(tenantId: string, limit: number, offset: number = 0): Promise<StoredAuditLog[]> {
    const page = Math.floor(offset / Math.max(limit, 1)) + 1;
    const { items } = await this.listByFilter({ tenantId }, page, limit);
    return items;
  }
}
