import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { PluginManifest } from '@nodeadmin/shared-types';
import { validatePluginManifest } from './manifestValidator';

interface PluginRegistryRow {
  author_email?: string | null;
  author_name?: string | null;
  description: string | null;
  display_name: string;
  download_count: number;
  id: string;
  is_public: boolean;
  latest_version: string;
  min_platform_version?: string | null;
}

interface PluginVersionRow {
  bundle_url: string;
  changelog: string | null;
  min_platform_version: string | null;
  published_at: Date | string;
  server_package: string;
  version: string;
}

interface InstallableVersion {
  minPlatformVersion: string | null;
  version: string;
}

interface InstallPluginVersionRow {
  manifest: PluginManifest;
  min_platform_version: string | null;
  server_package: string;
  version: string;
}

interface PublishPluginInput {
  bundleUrl: string;
  changelog?: string;
  manifest: PluginManifest;
  serverPackage: string;
}

interface InstalledPluginLifecycleRow {
  installed_version: string | null;
  manifest: PluginManifest | null;
  server_package: string | null;
}

interface PluginLifecycleContext {
  client: PoolClient;
  manifest: PluginManifest;
  pluginId: string;
  tenantId: string;
  version: string;
}

type HookModuleLoader = (modulePath: string) => unknown;
type PackageJsonResolver = (packageName: string) => string;
type PluginLifecycleHandler = (context: PluginLifecycleContext) => Promise<unknown> | unknown;

@Injectable()
export class PluginMarketService {
  private readonly platformVersion = '0.1.0';
  private readonly pool: Pool | null;
  private readonly requireFromRoot = createRequire(resolve(process.cwd(), 'package.json'));
  private hookModuleLoader: HookModuleLoader = (modulePath) => this.requireFromRoot(modulePath);
  private packageJsonResolver: PackageJsonResolver = (packageName) =>
    this.requireFromRoot.resolve(`${packageName}/package.json`);

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async listMarketplacePlugins(page = 1, pageSize = 20, search?: string) {
    if (!this.pool) {
      return { items: [], total: 0, page, pageSize };
    }

    const offset = (page - 1) * pageSize;
    const searchClause = search?.trim() ? `AND (pr.display_name ILIKE $1 OR pr.id ILIKE $1)` : '';
    const searchParams = search?.trim() ? [`%${search.trim()}%`] : [];

    const countResult = await this.pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM plugin_registry pr
       WHERE pr.is_public = true ${searchClause}`,
      searchParams,
    );

    const rowsResult = await this.pool.query<PluginRegistryRow>(
      `SELECT pr.id,
              pr.display_name,
              pr.description,
              pr.author_name,
              pr.latest_version,
              pr.is_public,
              pr.download_count,
              pv.min_platform_version
       FROM plugin_registry pr
       LEFT JOIN plugin_versions pv
         ON pv.plugin_id = pr.id
        AND pv.version = pr.latest_version
       WHERE pr.is_public = true ${searchClause}
       ORDER BY pr.display_name ASC
       LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}`,
      [...searchParams, pageSize, offset],
    );

    return {
      items: rowsResult.rows.map((row) => ({
        authorName: row.author_name ?? null,
        description: row.description,
        displayName: row.display_name,
        downloadCount: row.download_count,
        id: row.id,
        isCompatible: this.isVersionCompatible(
          this.platformVersion,
          row.min_platform_version ?? `>=${this.platformVersion}`,
        ),
        latestVersion: row.latest_version,
        minPlatformVersion: row.min_platform_version ?? null,
      })),
      page,
      pageSize,
      total: countResult.rows[0]?.count ?? 0,
    };
  }

  async getPluginDetails(pluginId: string) {
    if (!this.pool) {
      throw new NotFoundException('Plugin not found');
    }

    const pluginResult = await this.pool.query<PluginRegistryRow>(
      `SELECT id,
              display_name,
              description,
              author_name,
              author_email,
              latest_version,
              is_public,
              download_count
       FROM plugin_registry
       WHERE id = $1`,
      [pluginId],
    );

    const plugin = pluginResult.rows[0];
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    const versionsResult = await this.pool.query<PluginVersionRow>(
      `SELECT version,
              bundle_url,
              server_package,
              min_platform_version,
              changelog,
              published_at
       FROM plugin_versions
       WHERE plugin_id = $1
       ORDER BY published_at DESC`,
      [pluginId],
    );

    return {
      authorEmail: plugin.author_email ?? null,
      authorName: plugin.author_name ?? null,
      description: plugin.description,
      displayName: plugin.display_name,
      downloadCount: plugin.download_count,
      id: plugin.id,
      isPublic: plugin.is_public,
      latestVersion: plugin.latest_version,
      versions: versionsResult.rows.map((row) => ({
        bundleUrl: row.bundle_url,
        changelog: row.changelog,
        isCompatible: this.isVersionCompatible(
          this.platformVersion,
          row.min_platform_version ?? `>=${this.platformVersion}`,
        ),
        minPlatformVersion: row.min_platform_version,
        publishedAt: this.toIsoString(row.published_at),
        serverPackage: row.server_package,
        version: row.version,
      })),
    };
  }

  async installPlugin(tenantId: string, pluginId: string, version: string) {
    if (!this.pool) {
      throw new Error('Database not available');
    }

    return this.withTenantContext(tenantId, async (client) => {
      const versionResult = await client.query<InstallPluginVersionRow>(
        `SELECT version, min_platform_version, manifest, server_package
         FROM plugin_versions
         WHERE plugin_id = $1 AND version = $2`,
        [pluginId, version],
      );

      const selectedVersion = versionResult.rows[0];
      if (!selectedVersion) {
        throw new NotFoundException('Plugin version not found');
      }

      if (
        selectedVersion.min_platform_version &&
        !this.isVersionCompatible(this.platformVersion, selectedVersion.min_platform_version)
      ) {
        throw new Error('Plugin version is not compatible with this platform');
      }

      await client.query(
        `INSERT INTO tenant_plugins (tenant_id, plugin_name, enabled, config, enabled_at, installed_version, auto_update, installed_at)
         VALUES ($1, $2, true, '{}'::jsonb, now(), $3, true, now())
         ON CONFLICT (tenant_id, plugin_name)
         DO UPDATE SET enabled = true,
                       installed_version = EXCLUDED.installed_version,
                       auto_update = EXCLUDED.auto_update,
                       installed_at = EXCLUDED.installed_at,
                       enabled_at = now()`,
        [tenantId, pluginId, version],
      );

      await this.runLifecycleHook(client, {
        hookPath: selectedVersion.manifest.lifecycle?.onInstall,
        manifest: selectedVersion.manifest,
        pluginId,
        serverPackage: selectedVersion.server_package,
        tenantId,
        version,
      });

      return {
        enabled: true,
        pluginId,
        tenantId,
        version,
      };
    });
  }

  async updatePlugin(tenantId: string, pluginId: string, version: string) {
    return this.installPlugin(tenantId, pluginId, version);
  }

  async uninstallPlugin(tenantId: string, pluginId: string) {
    if (!this.pool) {
      throw new Error('Database not available');
    }

    return this.withTenantContext(tenantId, async (client) => {
      const lifecycleResult = await client.query<InstalledPluginLifecycleRow>(
        `SELECT tp.installed_version, pv.manifest, pv.server_package
         FROM tenant_plugins tp
         LEFT JOIN plugin_versions pv
           ON pv.plugin_id = tp.plugin_name
          AND pv.version = tp.installed_version
         WHERE tp.tenant_id = $1 AND tp.plugin_name = $2`,
        [tenantId, pluginId],
      );

      const installedPlugin = lifecycleResult.rows[0];

      await this.runLifecycleHook(client, {
        hookPath: installedPlugin?.manifest?.lifecycle?.onUninstall,
        manifest: installedPlugin?.manifest ?? null,
        pluginId,
        serverPackage: installedPlugin?.server_package ?? null,
        tenantId,
        version: installedPlugin?.installed_version ?? null,
      });

      await client.query(
        `DELETE FROM tenant_plugins
         WHERE tenant_id = $1 AND plugin_name = $2
         RETURNING plugin_name`,
        [tenantId, pluginId],
      );

      return {
        pluginId,
        removed: true,
        tenantId,
      };
    });
  }

  async publishPlugin(input: PublishPluginInput) {
    if (!this.pool) {
      throw new Error('Database not available');
    }

    const manifest = validatePluginManifest(input.manifest);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const currentVersionResult = await client.query<{ latest_version: string }>(
        `SELECT latest_version FROM plugin_registry WHERE id = $1`,
        [manifest.id],
      );
      const currentLatestVersion = currentVersionResult.rows[0]?.latest_version ?? null;
      const nextLatestVersion =
        currentLatestVersion === null ||
        this.compareVersions(this.parseVersion(manifest.version), this.parseVersion(currentLatestVersion)) > 0
          ? manifest.version
          : currentLatestVersion;

      await client.query(
        `INSERT INTO plugin_registry (id, display_name, description, author_name, author_email, latest_version, is_public, download_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, 0, now(), now())
         ON CONFLICT (id)
         DO UPDATE SET display_name = EXCLUDED.display_name,
                       description = EXCLUDED.description,
                       author_name = EXCLUDED.author_name,
                       author_email = EXCLUDED.author_email,
                       latest_version = EXCLUDED.latest_version,
                       updated_at = now()`,
        [
          manifest.id,
          manifest.displayName,
          manifest.description,
          manifest.author.name,
          manifest.author.email ?? null,
          nextLatestVersion,
        ],
      );

      await client.query(
        `INSERT INTO plugin_versions (plugin_id, version, manifest, bundle_url, server_package, min_platform_version, changelog, published_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, now())`,
        [
          manifest.id,
          manifest.version,
          JSON.stringify(manifest),
          input.bundleUrl,
          input.serverPackage,
          manifest.engines.nodeAdmin,
          input.changelog ?? null,
        ],
      );

      await client.query('COMMIT');
      return {
        pluginId: manifest.id,
        publishedVersion: manifest.version,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  resolveInstallableVersion<T extends InstallableVersion>(versions: T[]): T | null {
    for (const version of versions) {
      if (
        version.minPlatformVersion === null ||
        version.minPlatformVersion === undefined ||
        this.isVersionCompatible(this.platformVersion, version.minPlatformVersion)
      ) {
        return version;
      }
    }

    return null;
  }

  isVersionCompatible(platformVersion: string, range: string): boolean {
    const version = this.parseVersion(platformVersion);
    const normalizedRange = range.trim();

    if (normalizedRange.startsWith('>=')) {
      return this.compareVersions(version, this.parseVersion(normalizedRange.slice(2))) >= 0;
    }
    if (normalizedRange.startsWith('>')) {
      return this.compareVersions(version, this.parseVersion(normalizedRange.slice(1))) > 0;
    }
    if (normalizedRange.startsWith('<=')) {
      return this.compareVersions(version, this.parseVersion(normalizedRange.slice(2))) <= 0;
    }
    if (normalizedRange.startsWith('<')) {
      return this.compareVersions(version, this.parseVersion(normalizedRange.slice(1))) < 0;
    }
    if (normalizedRange.startsWith('^')) {
      const base = this.parseVersion(normalizedRange.slice(1));
      const upper: [number, number, number] = [base[0] + 1, 0, 0];
      return this.compareVersions(version, base) >= 0 && this.compareVersions(version, upper) < 0;
    }
    if (normalizedRange.startsWith('~')) {
      const base = this.parseVersion(normalizedRange.slice(1));
      const upper: [number, number, number] = [base[0], base[1] + 1, 0];
      return this.compareVersions(version, base) >= 0 && this.compareVersions(version, upper) < 0;
    }

    return this.compareVersions(version, this.parseVersion(normalizedRange)) === 0;
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

  private parseVersion(value: string): [number, number, number] {
    const [major = '0', minor = '0', patch = '0'] = value.split('.');
    return [Number(major), Number(minor), Number(patch)];
  }

  private compareVersions(left: [number, number, number], right: [number, number, number]): number {
    if (left[0] !== right[0]) {
      return left[0] - right[0];
    }
    if (left[1] !== right[1]) {
      return left[1] - right[1];
    }
    return left[2] - right[2];
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }

  private async runLifecycleHook(
    client: PoolClient,
    input: {
      hookPath?: string;
      manifest: PluginManifest | null;
      pluginId: string;
      serverPackage: string | null;
      tenantId: string;
      version: string | null;
    },
  ): Promise<void> {
    const hookPath = input.hookPath?.trim();

    if (!hookPath || !input.manifest || !input.serverPackage || !input.version) {
      return;
    }

    const packageRoot = dirname(this.packageJsonResolver(this.extractPackageName(input.serverPackage)));
    const handler = this.resolveLifecycleHandler(this.hookModuleLoader(resolve(packageRoot, hookPath)), hookPath);

    await handler({
      client,
      manifest: input.manifest,
      pluginId: input.pluginId,
      tenantId: input.tenantId,
      version: input.version,
    });
  }

  private extractPackageName(serverPackage: string): string {
    const versionSeparatorIndex = serverPackage.lastIndexOf('@');

    if (versionSeparatorIndex > 0) {
      return serverPackage.slice(0, versionSeparatorIndex);
    }

    return serverPackage;
  }

  private resolveLifecycleHandler(loadedModule: unknown, hookPath: string): PluginLifecycleHandler {
    if (typeof loadedModule === 'function') {
      return loadedModule as PluginLifecycleHandler;
    }

    if (isRecord(loadedModule) && typeof loadedModule.default === 'function') {
      return loadedModule.default as PluginLifecycleHandler;
    }

    throw new Error(`Lifecycle hook '${hookPath}' must export a function`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
