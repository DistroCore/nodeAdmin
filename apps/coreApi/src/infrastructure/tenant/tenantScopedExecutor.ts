import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/databaseService';
import type { AuthPrincipal } from './authPrincipal';
import { TenantContextResolver } from './tenantContextResolver';

interface TenantPool {
  connect(): Promise<PoolClient>;
}

@Injectable()
export class TenantScopedExecutor {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantContextResolver: TenantContextResolver,
  ) {}

  async execute<T>(tenantId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (tenantId.trim().length === 0) {
      throw new Error('tenantId is required');
    }

    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async executeForPrincipal<T>(
    principal: AuthPrincipal | undefined,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const tenantContext = this.tenantContextResolver.resolve(principal);
    return this.execute(tenantContext.tenantId, callback);
  }

  private getPool(): TenantPool {
    const pool = this.databaseService.drizzle?.$client as TenantPool | undefined;
    if (!pool || typeof pool.connect !== 'function') {
      throw new Error('Database client is unavailable.');
    }

    return pool;
  }
}
