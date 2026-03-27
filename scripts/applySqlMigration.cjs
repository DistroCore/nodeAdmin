const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const defaultDatabaseUrl = 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin';
const databaseUrl = (process.env.DATABASE_URL || defaultDatabaseUrl).trim();
const migrationsDir = path.resolve(__dirname, '..', 'Apps', 'CoreApi', 'drizzle', 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function readMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .map((filename) => ({
      filename,
      sql: fs.readFileSync(path.join(migrationsDir, filename), 'utf8'),
    }));
}

async function wasApplied(client, filename) {
  const result = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1;',
    [filename]
  );
  return result.rowCount > 0;
}

async function applyMigration(client, migration) {
  await client.query('BEGIN');

  try {
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [
      migration.filename,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();
  await ensureMigrationTable(client);

  const migrations = readMigrationFiles();
  if (migrations.length === 0) {
    console.log('[db:migrate] no migration files found.');
    await client.end();
    return;
  }

  for (const migration of migrations) {
    const alreadyApplied = await wasApplied(client, migration.filename);
    if (alreadyApplied) {
      console.log(`[db:migrate] skip ${migration.filename}`);
      continue;
    }

    await applyMigration(client, migration);
    console.log(`[db:migrate] applied ${migration.filename}`);
  }

  await client.end();
}

run().catch((error) => {
  console.error('[db:migrate] failed:', error);
  process.exit(1);
});
