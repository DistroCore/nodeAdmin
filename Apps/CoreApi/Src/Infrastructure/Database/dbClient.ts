import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDbClient(databaseUrl: string): ReturnType<typeof drizzle<typeof schema>> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
  });

  return drizzle(pool, {
    schema,
  });
}
