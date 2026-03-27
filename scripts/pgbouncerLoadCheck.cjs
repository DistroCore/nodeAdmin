const { Pool } = require('pg');

const defaultDatabaseUrl = 'postgres://nodeadmin:nodeadmin@localhost:6432/nodeadmin';
const databaseUrl = (process.env.PGBOUNCER_DATABASE_URL || defaultDatabaseUrl).trim();
const totalRequests = Number(process.env.PGBOUNCER_SMOKE_REQUESTS || 200);
const concurrency = Number(process.env.PGBOUNCER_SMOKE_CONCURRENCY || 25);

async function run() {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 50,
  });

  const startedAt = Date.now();

  let completed = 0;
  let failed = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = completed + failed;
      if (current >= totalRequests) {
        return;
      }

      const requestIndex = current + 1;
      completed += 1;

      try {
        await pool.query('SELECT $1::int AS request_id, now() AS ts', [requestIndex]);
      } catch {
        failed += 1;
      }
    }
  });

  await Promise.all(workers);

  const finishedAt = Date.now();
  await pool.end();

  const elapsedMs = finishedAt - startedAt;
  console.log(
    JSON.stringify(
      {
        concurrency,
        elapsedMs,
        failed,
        requests: totalRequests,
        rps: Math.round((totalRequests / Math.max(elapsedMs, 1)) * 1000),
      },
      null,
      2
    )
  );

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('[pgbouncerLoadCheck] failed:', error);
  process.exit(1);
});
