import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// The runner is a standalone CommonJS script; it only runs main() under require.main,
// so importing it here just exposes the pure discovery helpers.
import runner from './applySqlMigration.cjs';

const { splitStatements, discoverCoreMigrations, discoverPluginMigrations } = runner as {
  splitStatements: (sql: string) => string[];
  discoverCoreMigrations: (dir?: string) => Array<{ key: string; source: string; sql: string }>;
  discoverPluginMigrations: (scopeDir?: string) => Array<{ key: string; source: string; sql: string }>;
};

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'migrate-test-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function writePluginMigration(scope: string, pluginName: string, filename: string, sql: string): void {
  const dir = join(scope, pluginName, 'migrations');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), sql, 'utf8');
}

describe('discoverPluginMigrations', () => {
  it('namespaces each plugin migration by plugin id and sorts deterministically', () => {
    writePluginMigration(workspace, 'plugin-backlog', '0002_indexes.sql', 'CREATE INDEX b;');
    writePluginMigration(workspace, 'plugin-backlog', '0001_init.sql', 'CREATE TABLE b ();');
    writePluginMigration(workspace, 'plugin-analytics', '0001_init.sql', 'CREATE TABLE a ();');

    const result = discoverPluginMigrations(workspace);

    expect(result.map((m) => m.key)).toEqual([
      '@nodeadmin/plugin-analytics:0001_init.sql',
      '@nodeadmin/plugin-backlog:0001_init.sql',
      '@nodeadmin/plugin-backlog:0002_indexes.sql',
    ]);
    expect(result[0].source).toBe('@nodeadmin/plugin-analytics');
    expect(result[1].sql).toBe('CREATE TABLE b ();');
  });

  it('lets two plugins reuse the same filename without ledger collision', () => {
    writePluginMigration(workspace, 'plugin-a', '0001_init.sql', 'CREATE TABLE a ();');
    writePluginMigration(workspace, 'plugin-b', '0001_init.sql', 'CREATE TABLE b ();');

    const keys = discoverPluginMigrations(workspace).map((m) => m.key);

    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain('@nodeadmin/plugin-a:0001_init.sql');
    expect(keys).toContain('@nodeadmin/plugin-b:0001_init.sql');
  });

  it('ignores non-plugin dirs, plugins without a migrations dir, and stray files', () => {
    writePluginMigration(workspace, 'plugin-real', '0001_init.sql', 'CREATE TABLE r ();');
    mkdirSync(join(workspace, 'shared-types'), { recursive: true }); // not a plugin-* dir
    mkdirSync(join(workspace, 'plugin-empty'), { recursive: true }); // no migrations/
    writeFileSync(join(workspace, 'plugin-stray.txt'), 'noise', 'utf8'); // file, not a dir

    const result = discoverPluginMigrations(workspace);

    expect(result.map((m) => m.key)).toEqual(['@nodeadmin/plugin-real:0001_init.sql']);
  });

  it('returns an empty list when the scope dir does not exist', () => {
    expect(discoverPluginMigrations(join(workspace, 'nope'))).toEqual([]);
  });
});

describe('discoverCoreMigrations', () => {
  it('keys core migrations by bare filename for backward compatibility', () => {
    const dir = join(workspace, 'core');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '0002_b.sql'), 'SELECT 2;', 'utf8');
    writeFileSync(join(dir, '0001_a.sql'), 'SELECT 1;', 'utf8');

    const result = discoverCoreMigrations(dir);

    expect(result.map((m) => m.key)).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(result.every((m) => m.source === 'core')).toBe(true);
  });
});

describe('splitStatements', () => {
  it('does not split on semicolons inside dollar-quoted function bodies', () => {
    // Plugin RLS migrations wrap policy creation in DO $$ ... $$ blocks.
    const sql = `
      CREATE TABLE t ();
      DO $$ BEGIN
        EXECUTE 'CREATE POLICY p ON t USING (true)';
        EXECUTE 'ALTER TABLE t ENABLE ROW LEVEL SECURITY';
      END $$;
    `;

    const statements = splitStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[1]).toContain('DO $$');
    expect(statements[1]).toContain('END $$');
  });
});
