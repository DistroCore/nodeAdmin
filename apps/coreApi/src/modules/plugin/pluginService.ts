import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';

export interface TenantPluginListItem {
  autoUpdate: boolean;
  config: Record<string, unknown>;
  enabled: boolean;
  enabledAt: string;
  installedAt: string | null;
  installedVersion: string | null;
  name: string;
}

interface TenantPluginRow {
  auto_update: boolean;
  config: Record<string, unknown> | null;
  enabled: boolean;
  enabled_at: Date | string;
  installed_at: Date | string | null;
  installed_version: string | null;
  plugin_name: string;
}

@Injectable()
export class PluginService {
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {
    this.pool = (this.databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async listTenantPlugins(tenantId: string): Promise<TenantPluginListItem[]> {
    this.assertTenantId(tenantId);

    if (!this.pool) {
      return [];
    }

    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query<TenantPluginRow>(
        `SELECT plugin_name, enabled, config, auto_update, enabled_at, installed_at, installed_version
         FROM tenant_plugins
         WHERE tenant_id = $1
         ORDER BY plugin_name ASC`,
        [tenantId],
      );

      return result.rows.map((row) => ({
        autoUpdate: row.auto_update,
        config: row.config ?? {},
        enabled: row.enabled,
        enabledAt: this.toIsoString(row.enabled_at),
        installedAt: this.toOptionalIsoString(row.installed_at),
        installedVersion: row.installed_version,
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

  async updatePluginConfig(tenantId: string, pluginId: string, config: Record<string, unknown>) {
    this.assertTenantId(tenantId);

    if (!this.pool) {
      throw new Error('Database not available');
    }

    return this.withTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_plugins (tenant_id, plugin_name, enabled, config)
         VALUES ($1, $2, false, $3::jsonb)
         ON CONFLICT (tenant_id, plugin_name)
         DO UPDATE SET config = EXCLUDED.config`,
        [tenantId, pluginId, JSON.stringify(config)],
      );

      return {
        pluginId,
        success: true,
      };
    });
  }

  async togglePluginEnabled(tenantId: string, pluginId: string) {
    this.assertTenantId(tenantId);

    if (!this.pool) {
      throw new Error('Database not available');
    }

    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query<{ enabled: boolean; plugin_name: string }>(
        `UPDATE tenant_plugins
         SET enabled = NOT enabled,
             enabled_at = CASE WHEN NOT enabled THEN now() ELSE enabled_at END
         WHERE tenant_id = $1 AND plugin_name = $2
         RETURNING plugin_name, enabled`,
        [tenantId, pluginId],
      );

      const updatedRow = result.rows[0];
      if (!updatedRow) {
        throw new NotFoundException('Tenant plugin not found');
      }

      return {
        enabled: updatedRow.enabled,
        pluginId: updatedRow.plugin_name,
        success: true,
      };
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

  private toOptionalIsoString(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }

    return this.toIsoString(value);
  }
}
