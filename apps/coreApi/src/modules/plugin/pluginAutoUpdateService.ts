import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
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

@Injectable()
export class PluginAutoUpdateService implements OnModuleInit, OnModuleDestroy {
  private static readonly pollIntervalMs = 300_000;

  private readonly logger = new Logger(PluginAutoUpdateService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly pool: Pool | null;

  constructor(private readonly pluginMarketService: PluginMarketService) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.runAutoUpdateCycle();
    this.intervalHandle = setInterval(() => {
      void this.runAutoUpdateCycle();
    }, PluginAutoUpdateService.pollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    if (this.pool) {
      await this.pool.end().catch(() => {
        this.logger.warn('Failed to close plugin auto-update database pool cleanly.');
      });
    }
  }

  async runAutoUpdateCycle(): Promise<void> {
    if (!this.pool) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const installedPlugins = await client.query<AutoUpdateRow>(
        `SELECT tenant_id, plugin_name, installed_version
         FROM tenant_plugins
         WHERE auto_update = true AND installed_version IS NOT NULL`,
      );

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

        await client.query(
          `UPDATE tenant_plugins
           SET installed_version = $1,
               installed_at = now(),
               enabled = true
           WHERE tenant_id = $2 AND plugin_name = $3`,
          [compatibleVersion.version, installedPlugin.tenant_id, installedPlugin.plugin_name],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
