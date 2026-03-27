const { Client } = require('pg');

const databaseUrl = (
  process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin'
).trim();

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  await client.connect();

  try {
    const partitionsResult = await client.query(
      `
        SELECT inhrelid::regclass::text AS partition_name
        FROM pg_inherits
        WHERE inhparent = 'messages_partitioned_rehearsal'::regclass
        ORDER BY inhrelid::regclass::text;
      `
    );

    console.log(
      JSON.stringify(
        {
          partitionCount: partitionsResult.rowCount,
          partitions: partitionsResult.rows.map((row) => row.partition_name),
          result: partitionsResult.rowCount >= 4 ? 'ok' : 'fail',
        },
        null,
        2
      )
    );

    if ((partitionsResult.rowCount || 0) < 4) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('[partitionRehearsalCheck] failed:', error);
  process.exit(1);
});
