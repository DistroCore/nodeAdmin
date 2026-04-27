import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { PluginMarketService } from './pluginMarketService';

interface AutoUpdateRow {
  installed_version: string;
  plugin_name: string;
  tenant_id: string;
}

interface PluginVersionCandidateRow {
  min_platform_version: string | null;
  version: string;
}

interface TenantRow {
  id: string;
}

@Injectable()
export class PluginAutoUpdateService implements OnModuleInit, OnModuleDestroy {
  private static readonly pollIntervalMs = 300_000;

  private readonly logger = new Logger(PluginAutoUpdateService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly pool: Pool | null;

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    private readonly pluginMarketService: PluginMarketService,
  ) {
    this.pool = (this.databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      await this.runAutoUpdateCycle();
    } catch (error) {
      this.logCycleError('Initial plugin auto-update cycle failed.', error);
    }

    this.intervalHandle = setInterval(() => {
      void this.runAutoUpdateCycle().catch((error) => {
        this.logCycleError('Scheduled plugin auto-update cycle failed.', error);
      });
    }, PluginAutoUpdateService.pollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runAutoUpdateCycle(): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      if (this.isRunning) {
        this.logger.warn('Skipping plugin auto-update cycle because a previous run is still in progress.');
        return;
      }

      this.isRunning = true;

      const tenantsResult = await this.pool.query<TenantRow>(
        `SELECT id
         FROM tenants
         ORDER BY id ASC`,
      );

      for (const tenant of tenantsResult.rows) {
        const pendingUpdates = await this.collectPendingUpdatesForTenant(tenant.id);

        for (const update of pendingUpdates) {
          await this.pluginMarketService.installPlugin(tenant.id, update.pluginId, update.version);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async collectPendingUpdatesForTenant(
    tenantId: string,
  ): Promise<Array<{ pluginId: string; version: string }>> {
    return this.withTenantContext(tenantId, async (client) => {
      const installedPlugins = await client.query<AutoUpdateRow>(
        `SELECT tenant_id, plugin_name, installed_version
         FROM tenant_plugins
         WHERE tenant_id = $1
           AND auto_update = true
           AND installed_version IS NOT NULL`,
        [tenantId],
      );

      const updates: Array<{ pluginId: string; version: string }> = [];

      for (const installedPlugin of installedPlugins.rows) {
        const versionsResult = await client.query<PluginVersionCandidateRow>(
          `SELECT version, min_platform_version
           FROM plugin_versions
           WHERE plugin_id = $1
           ORDER BY published_at DESC`,
          [installedPlugin.plugin_name],
        );

        const compatibleVersion = this.pluginMarketService.resolveInstallableVersion(
          versionsResult.rows.map((row) => ({
            minPlatformVersion: row.min_platform_version,
            version: row.version,
          })),
        );

        if (
          !compatibleVersion ||
          compatibleVersion.version === installedPlugin.installed_version ||
          this.compareVersions(compatibleVersion.version, installedPlugin.installed_version) <= 0
        ) {
          continue;
        }

        updates.push({
          pluginId: installedPlugin.plugin_name,
          version: compatibleVersion.version,
        });
      }

      return updates;
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

  private logCycleError(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : String(error));
  }

  private compareVersions(left: string, right: string): number {
    const [leftMajor, leftMinor, leftPatch] = this.parseVersion(left);
    const [rightMajor, rightMinor, rightPatch] = this.parseVersion(right);

    if (leftMajor !== rightMajor) {
      return leftMajor - rightMajor;
    }
    if (leftMinor !== rightMinor) {
      return leftMinor - rightMinor;
    }
    return leftPatch - rightPatch;
  }

  private parseVersion(version: string): [number, number, number] {
    const [major = '0', minor = '0', patch = '0'] = version.split('.');
    return [Number(major), Number(minor), Number(patch)];
  }
}
