import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://nodeadmin:nodeadmin@localhost:5432/nodeadmin';

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './Src/Infrastructure/Database/schema.ts',
  strict: true,
  verbose: true,
});
