import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async findAll(tenantId: string): Promise<PermissionItem[]> {
    if (!this.pool) return [];
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT id, code, name, module, description FROM permissions ORDER BY module, code',
      );
      return result.rows as PermissionItem[];
    });
  }

  async findByModule(tenantId: string, module: string): Promise<PermissionItem[]> {
    if (!this.pool) return [];
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
        [module],
      );
      return result.rows as PermissionItem[];
    });
  }

  private async withTenantContext<T>(tenantId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool!.connect();

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
}
