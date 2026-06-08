import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';

const { auditLogs, users } = schema;
// Separate alias so we can join the users table twice in one query: once for the actor (who
// performed the action) and once for the target (when the target is itself a user).
const targetUsers = alias(users, 'target_users');

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
  // Human-readable display name for the actor (user name or email); null if the user was deleted.
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  // Human-readable display name for the target when it is a user; null otherwise / if deleted.
  targetName: string | null;
  traceId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export class AuditLogRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

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
      .select({
        id: auditLogs.id,
        tenantId: auditLogs.tenantId,
        userId: auditLogs.userId,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        traceId: auditLogs.traceId,
        contextJson: auditLogs.contextJson,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
        actorEmail: users.email,
        targetUserName: targetUsers.name,
        targetUserEmail: targetUsers.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .leftJoin(targetUsers, eq(targetUsers.id, auditLogs.targetId))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      actorName: row.actorName ?? row.actorEmail ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      // Only meaningful when the target is a user row; other target types won't match the join.
      targetName: row.targetType === 'user' ? (row.targetUserName ?? row.targetUserEmail ?? null) : null,
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
