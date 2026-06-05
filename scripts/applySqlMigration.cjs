const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const defaultDatabaseUrl = 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin';
const databaseUrl = (process.env.DATABASE_URL || defaultDatabaseUrl).trim();
const migrationsDir = path.resolve(__dirname, '..', 'apps', 'coreApi', 'drizzle', 'migrations');
// Installed plugins live under node_modules/@nodeadmin/plugin-*; each may carry its own
// migrations/ directory so a plugin can own its tables + RLS policies (see pluginRegistryService).
const pluginScopeDir = path.resolve(__dirname, '..', 'node_modules', '@nodeadmin');

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function listSqlFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

// Core migrations are keyed by bare filename to stay compatible with rows already
// recorded in schema_migrations before plugin support existed.
function discoverCoreMigrations(dir = migrationsDir) {
  return listSqlFiles(dir).map((filename) => ({
    key: filename,
    source: 'core',
    sql: fs.readFileSync(path.join(dir, filename), 'utf8'),
  }));
}

// Each installed plugin may ship a migrations/ directory. We namespace the ledger key by
// plugin id so two plugins (or a plugin and core) can reuse a filename without colliding.
function discoverPluginMigrations(scopeDir = pluginScopeDir) {
  if (!fs.existsSync(scopeDir)) {
    return [];
  }

  const pluginNames = fs
    .readdirSync(scopeDir, { withFileTypes: true })
    // npm workspaces symlink local packages, installed packages are real dirs — accept both.
    .filter((entry) => entry.name.startsWith('plugin-') && !entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations = [];
  for (const pluginName of pluginNames) {
    const pluginId = `@nodeadmin/${pluginName}`;
    const pluginMigrationsDir = path.join(scopeDir, pluginName, 'migrations');
    for (const filename of listSqlFiles(pluginMigrationsDir)) {
      migrations.push({
        key: `${pluginId}:${filename}`,
        source: pluginId,
        sql: fs.readFileSync(path.join(pluginMigrationsDir, filename), 'utf8'),
      });
    }
  }

  return migrations;
}

// Core first, then plugins: a plugin migration may depend on core tables, RLS helpers, or
// the schema_migrations ledger itself.
function discoverAllMigrations() {
  return [...discoverCoreMigrations(), ...discoverPluginMigrations()];
}

async function wasApplied(client, filename) {
  const result = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1;', [filename]);
  return result.rowCount > 0;
}

/**
 * Split SQL into individual statements, respecting dollar-quoted strings
 * and single-quoted strings so that semicolons inside function bodies
 * are not treated as statement delimiters.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // Single-line comment — consume to end of line
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // Block comment — consume to */
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Dollar-quoted string — find matching $tag$
    const dollarMatch = sql.slice(i).match(/^\$([a-zA-Z_]\w*)?\$/);
    if (dollarMatch) {
      const tag = dollarMatch[0];
      current += tag;
      i += tag.length;
      const endIdx = sql.indexOf(tag, i);
      if (endIdx === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, endIdx + tag.length);
      i = endIdx + tag.length;
      continue;
    }

    // Single-quoted string
    if (sql[i] === "'") {
      current += "'";
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          current += "'";
          i++;
          if (sql[i] !== "'") break; // doubled quote = escaped
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }

    // Semicolon — statement boundary
    if (sql[i] === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

async function applyMigration(client, migration) {
  await client.query('BEGIN');

  try {
    const statements = splitStatements(migration.sql);
    for (const stmt of statements) {
      await client.query(stmt);
    }
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [migration.key]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function connectWithRetry(maxAttempts = 30, delayMs = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);

      if (attempt === maxAttempts) {
        break;
      }

      console.log(`[db:migrate] database not ready yet (${attempt}/${maxAttempts}); retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function run() {
  const client = await connectWithRetry();
  await ensureMigrationTable(client);

  const migrations = discoverAllMigrations();
  if (migrations.length === 0) {
    console.log('[db:migrate] no migration files found.');
    await client.end();
    return;
  }

  for (const migration of migrations) {
    const alreadyApplied = await wasApplied(client, migration.key);
    if (alreadyApplied) {
      console.log(`[db:migrate] skip ${migration.key}`);
      continue;
    }

    try {
      await applyMigration(client, migration);
      console.log(`[db:migrate] applied ${migration.key} (${migration.source})`);
    } catch (error) {
      error.message = `${migration.key}: ${error.message}`;
      throw error;
    }
  }

  await client.end();
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[db:migrate] failed:', error);
    process.exit(1);
  });
}

module.exports = {
  splitStatements,
  listSqlFiles,
  discoverCoreMigrations,
  discoverPluginMigrations,
  discoverAllMigrations,
};
