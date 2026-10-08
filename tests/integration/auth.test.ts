import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { sessionResponseSchema } from '../../src/shared/contracts/session';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every route that requires a session. Add new protected routes here. */
const protectedRoutes = [
  { method: 'GET', url: '/api/session' },
  { method: 'GET', url: '/api/snapshot' },
  { method: 'POST', url: '/api/recipes', headers: originHeaders, payload: {} },
  {
    method: 'PUT',
    url: '/api/recipes/00000000-0000-4000-8000-000000000000/photo',
    headers: originHeaders,
  },
  { method: 'GET', url: '/api/photos/00000000-0000-4000-8000-000000000000' },
] as const;

describe('session and mock login', () => {
  const harness = useApp();

  const session = (jar: CookieJar) =>
    harness.app.inject({ method: 'GET', url: '/api/session', headers: jar.header() });

  it.each(protectedRoutes)('answers $method $url with 401 without a session', async (route) => {
    const response = await harness.app.inject(route);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: 'unauthenticated' } });
  });

  it('keeps the public routes open', async () => {
    const health = await harness.app.inject({ method: 'GET', url: '/api/health' });
    const start = await harness.app.inject({ method: 'GET', url: '/api/auth/google/start' });

    expect(health.statusCode).toBe(200);
    expect(start.statusCode).toBe(302);
  });

  it('rejects a session cookie that was never issued', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: 'session=forged' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('logs the allowed address in, redirects to returnTo and creates the account', async () => {
    const jar = new CookieJar();

    const location = await loginWithMock(harness.app, jar, 'Owner@Example.test', '/przepisy/1?a=b');

    expect(location).toBe('/przepisy/1?a=b');
    const response = await session(jar);
    expect(response.statusCode).toBe(200);
    expect(sessionResponseSchema.parse(response.json()).email).toBe(OWNER_EMAIL);
  });

  it('stores only a hash of the session token and sets a hardened cookie', async () => {
    const jar = new CookieJar();
    const start = await harness.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    jar.store(start);
    const state = new URL(start.headers.location as string, 'http://x').searchParams.get('state');
    const callback = await harness.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${OWNER_EMAIL}&state=${state}`,
      headers: jar.header(),
    });

    const cookie = callback.cookies.find((c) => c.name === 'session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const { rows } = await harness.database.pool.query<{ id: string }>('select id from sessions');
    expect(rows.map((row) => row.id)).not.toContain(cookie?.value);
    expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.id))).toBe(true);
  });

  it('falls back to the home screen for an unsafe returnTo', async () => {
    const jar = new CookieJar();

    const location = await loginWithMock(harness.app, jar, OWNER_EMAIL, 'https://evil.example/');

    expect(location).toBe('/');
  });

  it('treats a repeated returnTo parameter as absent instead of failing', async () => {
    const start = await harness.app.inject({
      method: 'GET',
      url: '/api/auth/google/start?returnTo=a&returnTo=b',
    });

    expect(start.statusCode).toBe(302);
    const raw = start.cookies.find((c) => c.name === 'login')?.value ?? '{}';
    const login = z.object({ returnTo: z.string() }).parse(JSON.parse(decodeURIComponent(raw)));
    expect(login.returnTo).toBe('/');
  });

  it('refuses another address without creating a session or account', async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();

    const location = await loginWithMock(harness.app, jar, 'stranger@example.test');

    expect(location).toBe('/logowanie?blad=konto');
    expect((await session(jar)).statusCode).toBe(401);
    const { rows } = await harness.database.pool.query('select 1 from accounts');
    expect(rows).toHaveLength(0);
  });

  it('refuses a callback whose state does not match the login attempt', async () => {
    const jar = new CookieJar();
    const start = await harness.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    jar.store(start);

    const callback = await harness.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${OWNER_EMAIL}&state=wrong`,
      headers: jar.header(),
    });

    expect(callback.headers.location).toBe('/logowanie?blad=logowanie');
    expect((await session(jar)).statusCode).toBe(401);
  });

  it('refuses a callback without the login cookie', async () => {
    const callback = await harness.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${OWNER_EMAIL}&state=x`,
    });

    expect(callback.headers.location).toBe('/logowanie?blad=logowanie');
  });

  it('logout ends the session', async () => {
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    const before = jar.header();

    const logout = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...before, ...originHeaders },
    });

    expect(logout.statusCode).toBe(204);
    const reused = await harness.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: before,
    });
    expect(reused.statusCode).toBe(401);
  });

  it('expires 30 days after the last use and slides the window on use', async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    const start = harness.clock.now();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);

    harness.clock.set(new Date(start.getTime() + 29 * DAY_MS));
    expect((await session(jar)).statusCode).toBe(200);

    // 29 days after login plus 29 days: only valid because the use at day 29 moved the expiry.
    harness.clock.set(new Date(start.getTime() + 58 * DAY_MS));
    expect((await session(jar)).statusCode).toBe(200);

    harness.clock.set(new Date(start.getTime() + 89 * DAY_MS));
    const expired = await session(jar);
    expect(expired.statusCode).toBe(401);
    expect(expired.cookies.find((c) => c.name === 'session')?.value).toBe('');
    harness.clock.set(null);
  });

  it('rejects a session unused for more than 30 days and deletes it', async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);

    harness.clock.set(new Date(Date.now() + 31 * DAY_MS));

    expect((await session(jar)).statusCode).toBe(401);
    const { rows } = await harness.database.pool.query('select 1 from sessions');
    expect(rows).toHaveLength(0);
    harness.clock.set(null);
  });

  it('creates default settings for the new account', async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    await loginWithMock(harness.app, new CookieJar(), OWNER_EMAIL);

    const { rows } =
      await harness.database.pool.query<Record<string, string>>('select * from settings');

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.['threshold_protein_g'])).toBe(25);
    expect(Number(rows[0]?.['threshold_small_portion_kcal'])).toBe(300);
  });
});
