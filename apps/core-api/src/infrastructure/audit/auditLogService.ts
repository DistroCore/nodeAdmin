import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';

export interface AuditLogRecord {
  action: string;
  context?: Record<string, unknown>;
  targetId?: string | null;
  targetType?: string | null;
  tenantId: string;
  traceId: string;
  userId: string;
}

interface StoredAuditLog {
  action: string;
  context: Record<string, unknown> | null;
  createdAt: string;
  id: string;
  targetId: string | null;
  targetType: string | null;
  tenantId: string;
  traceId: string;
  userId: string;
}

interface AuditLogRow {
  action: string;
  context_json: string | null;
  created_at: Date;
  id: string;
  target_id: string | null;
  target_type: string | null;
  tenant_id: string;
  trace_id: string;
  user_id: string;
}

@Injectable()
export class AuditLogService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditLogService.name);

  private readonly databaseUrl = process.env.DATABASE_URL?.trim();
  private readonly fallbackRows: StoredAuditLog[] = [];
  private readonly pool: Pool | null;

  constructor() {
    if (!this.databaseUrl) {
      this.pool = null;
      this.logger.warn('DATABASE_URL is not set. Audit logs will use in-memory fallback.');
      return;
    }

    this.pool = new Pool({
      connectionString: this.databaseUrl,
      max: 10,
      idleTimeoutMillis: 300000,
      connectionTimeoutMillis: 15000,
      statement_timeout: 30000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.end();
  }

  async record(input: AuditLogRecord): Promise<void> {
    if (!this.pool) {
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

    await this.runWithTenant(input.tenantId, async (client) => {
      await client.query(
        `
          INSERT INTO audit_logs (
            id,
            tenant_id,
            user_id,
            action,
            target_type,
            target_id,
            trace_id,
            context_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
        [
          randomUUID(),
          input.tenantId,
          input.userId,
          input.action,
          input.targetType ?? null,
          input.targetId ?? null,
          input.traceId,
          input.context ? JSON.stringify(input.context) : null,
        ]
      );
    });
  }

  async listByTenant(
    tenantId: string,
    limit: number,
    offset: number = 0
  ): Promise<StoredAuditLog[]> {
    if (!this.pool) {
      return this.fallbackRows
        .slice(offset, offset + limit)
        .filter((row) => row.tenantId === tenantId);
    }

    return this.runWithTenant(tenantId, async (client) => {
      const result = await client.query<AuditLogRow>(
        `
          SELECT action,
                 context_json,
                 created_at,
                 id,
                 target_id,
                 target_type,
                 tenant_id,
                 trace_id,
                 user_id
          FROM audit_logs
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT $2
          OFFSET $3;
        `,
        [tenantId, limit, offset]
      );

      return result.rows.map((row) => ({
        action: row.action,
        context: this.parseContext(row.context_json),
        createdAt: row.created_at.toISOString(),
        id: row.id,
        targetId: row.target_id,
        targetType: row.target_type,
        tenantId: row.tenant_id,
        traceId: row.trace_id,
        userId: row.user_id,
      }));
    });
  }

  private async runWithTenant<T>(
    tenantId: string,
    work: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool is not initialized.');
    }

    const client = await this.pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, true);`, [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private parseContext(rawContext: string | null): Record<string, unknown> | null {
    if (!rawContext) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawContext) as Record<string, unknown>;
      return typeof parsed === 'object' && parsed ? parsed : null;
    } catch {
      return null;
    }
  }
}
