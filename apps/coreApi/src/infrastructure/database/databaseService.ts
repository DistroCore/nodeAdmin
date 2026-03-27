import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createDbClient } from './dbClient';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
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

    if (!databaseClient || typeof databaseClient.end !== 'function') {
      return;
    }

    await databaseClient.end();
  }
}
