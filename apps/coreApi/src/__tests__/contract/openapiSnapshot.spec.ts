import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SNAPSHOT_PATH = resolve(process.cwd(), 'apps/coreApi/__snapshots__/openapi.json');
const UPDATE_SNAPSHOT = process.env.UPDATE_OPENAPI_SNAPSHOT === '1';

describe('OpenAPI snapshot contract', () => {
  let app: NestFastifyApplication;
  const bootstrapTimeoutMs = 120_000;

  beforeAll(async () => {
    process.env.OTEL_ENABLED = 'false';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.DATABASE_URL = '';
    process.env.REDIS_URL = '';

    const { createApp } = await import('../../app/createApp');

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, bootstrapTimeoutMs);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, bootstrapTimeoutMs);

  it('matches the checked-in /api/docs-json snapshot', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs-json',
    });

    expect(response.statusCode).toBe(200);

    const actualDocument = JSON.parse(response.body) as unknown;

    if (UPDATE_SNAPSHOT) {
      await mkdir(resolve(process.cwd(), 'apps/coreApi/__snapshots__'), { recursive: true });
      await writeFile(`${SNAPSHOT_PATH}`, `${JSON.stringify(actualDocument, null, 2)}\n`, 'utf8');
      return;
    }

    const expectedDocument = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')) as unknown;

    expect(actualDocument).toStrictEqual(expectedDocument);
  });
});
