const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin' });

async function main() {
  await client.connect();

  // Create migrations tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY, 
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Check current state
  const { rows } = await client.query('SELECT name FROM _migrations ORDER BY name');
  console.log('Applied migrations:', rows.map((r) => r.name).join(', '));

  // Mark 0011 as applied (user was created manually)
  await client.query("INSERT INTO _migrations (name) VALUES ('0011_create_app_user.sql') ON CONFLICT DO NOTHING");
  console.log('Marked 0011 as applied');

  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
