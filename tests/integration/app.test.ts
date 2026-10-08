import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from '../../src/shared/contracts/error';
import { createMockAuthProvider } from '../../src/server/integrations/auth';
import { APP_ORIGIN, originHeaders, testConfig, useApp } from './helpers';

describe('error format and request protection', () => {
  const harness = useApp(() => ({
    authProvider: {
      ...createMockAuthProvider(),
      authorizationUrl: () => Promise.reject(new Error('owner@example.test leaked in a message')),
    },
  }));

  it('answers unknown API paths with the shared error body', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json())).toEqual({ error: { code: 'not_found' } });
  });

  it('answers invalid input with validation and per-field codes', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/__test/clock',
      payload: { now: 'yesterday' },
    });

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.parse(response.json())).toEqual({
      error: { code: 'validation', fields: { now: 'invalid' } },
    });
  });

  it('answers malformed JSON with validation', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/__test/clock',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('validation');
  });

  it('answers unexpected failures with internal and no technical text', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/auth/google/start' });

    expect(response.statusCode).toBe(500);
    expect(errorResponseSchema.parse(response.json())).toEqual({ error: { code: 'internal' } });
    expect(response.body).not.toContain('leaked');
  });

  it('sets security headers including a CSP limited to the app itself', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/health' });

    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects mutating requests from another origin or without one', async () => {
    for (const headers of [{}, { origin: 'https://evil.example' }]) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: { code: 'forbidden_origin' } });
    }
    const allowed = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: originHeaders,
    });
    expect(allowed.statusCode).toBe(204);
  });
});

describe('test routes', () => {
  const harness = useApp();

  it('moves the server clock and restores it', async () => {
    const target = '2030-01-02T03:04:05.000Z';
    const set = await harness.app.inject({
      method: 'PUT',
      url: '/api/__test/clock',
      payload: { now: target },
    });
    expect(set.statusCode).toBe(200);
    expect(Math.abs(harness.clock.now().getTime() - Date.parse(target))).toBeLessThan(5000);

    await harness.app.inject({ method: 'PUT', url: '/api/__test/clock', payload: { now: null } });
    expect(Math.abs(harness.clock.now().getTime() - Date.now())).toBeLessThan(5000);
  });

  it('reset restores the clock', async () => {
    harness.clock.set(new Date('2030-01-01T00:00:00Z'));

    const response = await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });

    expect(response.statusCode).toBe(204);
    expect(Math.abs(harness.clock.now().getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('test routes with APP_ENV=production', () => {
  const harness = useApp(() => ({
    config: testConfig({
      APP_ENV: 'production',
      AUTH_MODE: 'google',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    }),
  }));

  it.each([
    ['POST', '/api/__test/reset'],
    ['PUT', '/api/__test/clock'],
    ['GET', '/api/__test/google'],
  ] as const)('does not expose %s %s', async (method, url) => {
    const response = await harness.app.inject({ method, url, headers: { origin: APP_ORIGIN } });

    expect(response.statusCode).toBe(404);
  });
});
