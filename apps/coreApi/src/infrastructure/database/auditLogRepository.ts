import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';

const { auditLogs } = schema;

export interface AuditLogFilter {
  tenantId: string;
  userId?: string;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}

export interface StoredAuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  traceId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export class AuditLogRepository {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async record(input: {
    action: string;
    context?: Record<string, unknown>;
    targetId?: string | null;
    targetType?: string | null;
    tenantId: string;
    traceId: string;
    userId: string;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      traceId: input.traceId,
      contextJson: input.context ? JSON.stringify(input.context) : null,
    });
  }

  async findByFilter(filter: AuditLogFilter, page: number, pageSize: number): Promise<StoredAuditLog[]> {
    const conditions = this.buildConditions(filter);

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      traceId: row.traceId,
      context: this.parseContext(row.contextJson),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async countByFilter(filter: AuditLogFilter): Promise<number> {
    const conditions = this.buildConditions(filter);

    const result = await this.db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(...conditions));

    return Number(result[0]?.total ?? 0);
  }

  private buildConditions(filter: AuditLogFilter): SQL[] {
    const conditions: SQL[] = [eq(auditLogs.tenantId, filter.tenantId)];

    if (filter.userId) {
      conditions.push(eq(auditLogs.userId, filter.userId));
    }
    if (filter.action) {
      conditions.push(eq(auditLogs.action, filter.action));
    }
    if (filter.targetType) {
      conditions.push(eq(auditLogs.targetType, filter.targetType));
    }
    if (filter.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(filter.startDate)));
    }
    if (filter.endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(filter.endDate)));
    }

    return conditions;
  }

  private parseContext(rawContext: string | null): Record<string, unknown> | null {
    if (!rawContext) return null;
    try {
      const parsed = JSON.parse(rawContext) as Record<string, unknown>;
      return typeof parsed === 'object' && parsed ? parsed : null;
    } catch {
      return null;
    }
  }
}
