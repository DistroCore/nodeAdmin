import { Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

export interface TenantPluginListItem {
  config: Record<string, unknown>;
  enabled: boolean;
  enabledAt: string;
  name: string;
}

interface TenantPluginRow {
  config: Record<string, unknown> | null;
  enabled: boolean;
  enabled_at: Date | string;
  plugin_name: string;
}

@Injectable()
export class PluginService {
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async listTenantPlugins(tenantId: string): Promise<TenantPluginListItem[]> {
    this.assertTenantId(tenantId);

    if (!this.pool) {
      return [];
    }

    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query<TenantPluginRow>(
        `SELECT plugin_name, enabled, config, enabled_at
         FROM tenant_plugins
         WHERE tenant_id = $1
         ORDER BY plugin_name ASC`,
        [tenantId],
      );

      return result.rows.map((row) => ({
        config: row.config ?? {},
        enabled: row.enabled,
        enabledAt: this.toIsoString(row.enabled_at),
        name: row.plugin_name,
      }));
    });
  }

  async isPluginEnabled(tenantId: string, pluginName: string): Promise<boolean> {
    this.assertTenantId(tenantId);

    if (!this.pool) {
      return false;
    }

    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query<{ enabled: boolean }>(
        `SELECT enabled
         FROM tenant_plugins
         WHERE tenant_id = $1 AND plugin_name = $2 AND enabled = true
         LIMIT 1`,
        [tenantId, pluginName],
      );

      return result.rows[0]?.enabled === true;
    });
  }

  private assertTenantId(tenantId: string): void {
    if (tenantId.trim().length === 0) {
      throw new Error('tenantId is required');
    }
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

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
