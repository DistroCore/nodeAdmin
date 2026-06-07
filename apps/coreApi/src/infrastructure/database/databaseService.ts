import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createDbClient } from './dbClient';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private isClosed = false;
  readonly drizzle: ReturnType<typeof createDbClient> | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      this.drizzle = null;
      this.logger.warn('DATABASE_URL is not set. DatabaseService is disabled.');
      return;
    }

    this.drizzle = createDbClient(databaseUrl);
  }

  async onModuleDestroy(): Promise<void> {
    const databaseClient = this.drizzle?.$client;

    // Guard against a double shutdown (Nest can invoke the hook more than once across module scopes),
    // which would throw "Called end on pool more than once".
    if (this.isClosed || !databaseClient || typeof databaseClient.end !== 'function') {
      return;
    }

    this.isClosed = true;
    await databaseClient.end();
  }
}
