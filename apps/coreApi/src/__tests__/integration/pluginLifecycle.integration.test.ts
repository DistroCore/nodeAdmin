import { mkdtemp, readFile, symlink, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from './integrationHarness';

const FIXTURE_PLUGIN_ID = '@nodeadmin/plugin-lifecycle-fixture';
const FIXTURE_VERSION = '1.0.0';
const FIXTURE_ROOT = resolve(
  process.cwd(),
  'apps/coreApi/src/__tests__/integration/fixtures/pluginLifecycle'
);
const FIXTURE_LINK_PATH = resolve(
  process.cwd(),
  'node_modules/@nodeadmin/plugin-lifecycle-fixture'
);

describe('plugin lifecycle integration', () => {
  let context: IntegrationContext;
  let pool: Pool;
  let uninstallMarkerPath: string;

  beforeAll(async () => {
    uninstallMarkerPath = join(
      await mkdtemp(join(tmpdir(), 'nodeadmin-plugin-lifecycle-')),
      'uninstall.json'
    );

    await symlink(FIXTURE_ROOT, FIXTURE_LINK_PATH, 'dir').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    });

    context = await createIntegrationContext({
      PLUGIN_LIFECYCLE_UNINSTALL_MARKER: uninstallMarkerPath,
    });
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    await seedMarketplacePlugin(pool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM tenant_plugins WHERE plugin_name = $1', [FIXTURE_PLUGIN_ID]);
      await pool.query('DELETE FROM plugin_versions WHERE plugin_id = $1', [FIXTURE_PLUGIN_ID]);
      await pool.query('DELETE FROM plugin_registry WHERE id = $1', [FIXTURE_PLUGIN_ID]);
      await pool.end();
    }
    if (context) {
      await context.close();
    }
    await unlink(FIXTURE_LINK_PATH).catch(() => undefined);
  });

  it('runs lifecycle hooks when a tenant installs and uninstalls a plugin', async () => {
    const accessToken = await context.issueDevToken('plugin-admin', ['super-admin'], 'default');

    const installResponse = await context.http
      .post('/api/v1/admin/plugins/install')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        pluginId: FIXTURE_PLUGIN_ID,
        version: FIXTURE_VERSION,
      });

    expect(installResponse.status).toBe(201);

    const installedRow = await pool.query<{
      config: Record<string, unknown>;
      enabled: boolean;
      installed_version: string | null;
    }>(
      `SELECT enabled, installed_version, config
       FROM tenant_plugins
       WHERE tenant_id = $1 AND plugin_name = $2`,
      ['default', FIXTURE_PLUGIN_ID]
    );

    expect(installedRow.rows[0]).toMatchObject({
      enabled: true,
      installed_version: FIXTURE_VERSION,
    });
    expect(installedRow.rows[0]?.config.lifecycleInstalled).toBe(true);

    const uninstallResponse = await context.http
      .delete(`/api/v1/admin/plugins/${encodeURIComponent(FIXTURE_PLUGIN_ID)}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(uninstallResponse.status).toBe(200);

    const remainingRow = await pool.query(
      `SELECT 1
       FROM tenant_plugins
       WHERE tenant_id = $1 AND plugin_name = $2`,
      ['default', FIXTURE_PLUGIN_ID]
    );

    expect(remainingRow.rowCount).toBe(0);

    const uninstallMarker = JSON.parse(await readFile(uninstallMarkerPath, 'utf8')) as {
      pluginId: string;
      tenantId: string;
    };

    expect(uninstallMarker).toEqual({
      pluginId: FIXTURE_PLUGIN_ID,
      tenantId: 'default',
    });
  });
});

async function seedMarketplacePlugin(pool: Pool): Promise<void> {
  const manifest = await readFile(join(FIXTURE_ROOT, 'nodeadmin-plugin.json'), 'utf8');

  await pool.query(
    `INSERT INTO plugin_registry (id, display_name, description, author_name, author_email, latest_version, is_public, download_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, $5, true, 0, now(), now())
     ON CONFLICT (id)
     DO UPDATE SET display_name = EXCLUDED.display_name,
                   description = EXCLUDED.description,
                   author_name = EXCLUDED.author_name,
                   latest_version = EXCLUDED.latest_version,
                   updated_at = now()`,
    [
      FIXTURE_PLUGIN_ID,
      'Plugin Lifecycle Fixture',
      'Integration fixture for plugin install and uninstall lifecycle hooks',
      'nodeAdmin Test Suite',
      FIXTURE_VERSION,
    ]
  );

  await pool.query(
    `INSERT INTO plugin_versions (plugin_id, version, manifest, bundle_url, server_package, min_platform_version, changelog, published_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, NULL, now())
     ON CONFLICT (plugin_id, version)
     DO NOTHING`,
    [
      FIXTURE_PLUGIN_ID,
      FIXTURE_VERSION,
      manifest,
      'https://example.invalid/plugin-lifecycle-fixture.js',
      `${FIXTURE_PLUGIN_ID}@${FIXTURE_VERSION}`,
      '>=0.1.0',
    ]
  );
}
