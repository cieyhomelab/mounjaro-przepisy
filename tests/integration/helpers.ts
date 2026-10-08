import { afterAll, beforeAll } from 'vitest';
import { buildApp, type AppDeps } from '../../src/server/app';
import { createClock, type Clock } from '../../src/server/clock';
import { loadConfig, type Config } from '../../src/server/config';
import { createDatabase, type Database } from '../../src/server/db/client';

export const OWNER_EMAIL = 'owner@example.test';
export const APP_ORIGIN = 'http://localhost:3000';

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

/** Environment for a config: the container's variables plus test defaults and overrides. */
export function testConfig(overrides: Record<string, string | undefined> = {}): Config {
  return loadConfig({
    ...process.env,
    LOG_LEVEL: 'silent',
    AUTH_MODE: 'mock',
    APP_BASE_URL: APP_ORIGIN,
    ALLOWED_EMAIL: OWNER_EMAIL,
    ...overrides,
  });
}

export type Harness = {
  app: TestApp;
  database: Database;
  clock: Clock;
  config: Config;
};

/**
 * Starts an application against the real PostgreSQL for the lifetime of a describe block.
 * `setup` may adjust the dependencies (config, auth provider) before the app is built.
 */
export function useApp(setup?: () => Partial<AppDeps> | Promise<Partial<AppDeps>>): Harness {
  const harness = {} as Harness;

  beforeAll(async () => {
    const extra = (await setup?.()) ?? {};
    harness.config = extra.config ?? testConfig();
    harness.clock = extra.clock ?? createClock();
    harness.database = createDatabase(harness.config.databaseUrl);
    await harness.database.migrate();
    harness.app = await buildApp({
      ...extra,
      config: harness.config,
      database: harness.database,
      clock: harness.clock,
    });
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
  });

  afterAll(async () => {
    await harness.app.close();
    await harness.database.close();
  });

  return harness;
}

export const originHeaders = { origin: APP_ORIGIN };

/** Minimal cookie jar for `app.inject` responses. */
export class CookieJar {
  private cookies = new Map<string, string>();

  store(response: { cookies: { name: string; value: string }[] }) {
    for (const cookie of response.cookies) {
      if (cookie.value === '') this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  header(): { cookie: string } {
    return {
      cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    };
  }
}

/** Logs in through the mock provider the way the browser does: start, "choose account", callback. */
export async function loginWithMock(
  app: TestApp,
  jar: CookieJar,
  email: string,
  returnTo = '/',
): Promise<string> {
  const start = await app.inject({
    method: 'GET',
    url: `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`,
  });
  jar.store(start);
  const location = new URL(start.headers.location as string, APP_ORIGIN);
  const state = location.searchParams.get('state') ?? '';
  const callback = await app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?${new URLSearchParams({ code: email, state }).toString()}`,
    headers: jar.header(),
  });
  jar.store(callback);
  return callback.headers.location as string;
}
