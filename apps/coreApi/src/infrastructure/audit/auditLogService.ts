import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditLogRepository, type StoredAuditLog } from '../database/auditLogRepository';
import { DatabaseService } from '../database/databaseService';

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
  private hasWarnedAboutActiveFallback = false;
  private lazyRepository: AuditLogRepository | null = null;

  // `repository` is only passed directly by unit tests. In production we inject the *exported*
  // DatabaseService and build the repository lazily — `AuditLogRepository` itself is not exported
  // from InfrastructureModule, so resolving it from the global APP_INTERCEPTOR scope yields
  // undefined and would silently force the in-memory fallback (logs lost on restart).
  constructor(
    @Optional() private readonly explicitRepository?: AuditLogRepository,
    @Optional() private readonly databaseService?: DatabaseService,
  ) {}

  /**
   * Resolve a repository at call time so we pick up the live drizzle client even if it became
   * available after this provider was constructed.
   */
  private resolveRepository(): AuditLogRepository | null {
    if (this.explicitRepository) {
      return this.explicitRepository;
    }
    const drizzle = this.databaseService?.drizzle;
    if (!drizzle) {
      return null;
    }
    if (!this.lazyRepository) {
      this.lazyRepository = new AuditLogRepository(drizzle);
    }
    return this.lazyRepository;
  }

  async onModuleDestroy(): Promise<void> {
    // Repository manages its own lifecycle via DatabaseService
  }

  async record(input: AuditLogRecord): Promise<void> {
    const repository = this.resolveRepository();
    if (!repository) {
      this.warnAboutActiveFallback();
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

    await repository.record(input);
  }

  async listByFilter(
    filter: {
      tenantId: string;
      userId?: string;
      action?: string;
      targetType?: string;
      startDate?: string;
      endDate?: string;
    },
    page: number,
    pageSize: number,
  ): Promise<{ items: StoredAuditLog[]; total: number }> {
    const repository = this.resolveRepository();
    if (!repository) {
      this.warnAboutActiveFallback();
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
      repository.findByFilter(filter, page, pageSize),
      repository.countByFilter(filter),
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

  private warnAboutActiveFallback(): void {
    if (this.hasWarnedAboutActiveFallback) {
      return;
    }

    this.hasWarnedAboutActiveFallback = true;
    this.logger.warn('Audit log database unavailable — using in-memory fallback. Logs will be lost on restart.');
  }
}
