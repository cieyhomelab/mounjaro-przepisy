import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../../src/shared/health';
import { buildApp } from '../../src/server/app';
import { loadConfig } from '../../src/server/config';
import { createDatabase, type Database } from '../../src/server/db/client';

describe('GET /api/health with a real PostgreSQL', () => {
  const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });
  let database: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    database = createDatabase(config.databaseUrl);
    await database.migrate();
    app = await buildApp({ config, database });
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  it('reports the database as up after migrations ran', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: 'ok', database: 'up' });
  });

  it('applies migrations idempotently', async () => {
    await expect(database.migrate()).resolves.toBeUndefined();
  });

  it('answers unknown API paths with 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(404);
  });
});
