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

  /**
   * Return the subset of `codes` that the user has been granted via their roles' role_permissions.
   * Used to deliver plugin-contributed permission codes to the frontend dynamically (driven by DB
   * grants) so core doesn't hard-code plugin codes like `backlog:*`. Queries by user_id, so it does
   * not depend on how role names are encoded in the JWT.
   */
  async getGrantedCodesForUser(tenantId: string, userId: string, codes: string[]): Promise<string[]> {
    if (!this.pool || codes.length === 0) return [];
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT DISTINCT p.code
         FROM role_permissions rp
         JOIN user_roles ur ON ur.role_id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1 AND p.code = ANY($2::text[])`,
        [userId, codes],
      );
      return result.rows.map((row) => (row as { code: string }).code);
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
