import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createGoogleAuthProvider } from '../../src/server/integrations/auth';
import { CookieJar, OWNER_EMAIL, testConfig, useApp, type TestApp } from './helpers';
import { CLIENT_ID, CLIENT_SECRET, LocalOidcIssuer } from './oidcIssuer';

describe('Google login against a local OpenID Connect issuer', () => {
  const issuer = new LocalOidcIssuer();

  afterAll(() => issuer.stop());
  beforeEach(() => {
    issuer.account = { email: OWNER_EMAIL, emailVerified: true };
    issuer.claimOverrides = {};
  });

  // The issuer must be listening before the provider is configured.
  const harness = useApp(async () => {
    await issuer.start();
    return {
      config: testConfig({
        AUTH_MODE: 'google',
        GOOGLE_CLIENT_ID: CLIENT_ID,
        GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
      }),
      authProvider: createGoogleAuthProvider({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        issuer: issuer.issuer,
        allowInsecureIssuer: true,
      }),
    };
  });

  const signIn = async (app: TestApp, jar: CookieJar) => {
    const start = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start?returnTo=/konto',
    });
    jar.store(start);
    expect(start.statusCode).toBe(302);
    const redirected = await issuer.authorize(start.headers.location as string);
    const callback = await app.inject({
      method: 'GET',
      url: `${redirected.pathname}${redirected.search}`,
      headers: jar.header(),
    });
    jar.store(callback);
    return callback;
  };

  it('asks Google for an authorization code with PKCE and the openid email scope', async () => {
    const start = await harness.app.inject({ method: 'GET', url: '/api/auth/google/start' });

    const target = new URL(start.headers.location as string);
    expect(target.origin).toBe(issuer.issuer);
    expect(target.searchParams.get('response_type')).toBe('code');
    expect(target.searchParams.get('scope')).toBe('openid email');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/google/callback',
    );
  });

  it('logs the allowed, verified address in and returns to returnTo', async () => {
    const jar = new CookieJar();

    const callback = await signIn(harness.app, jar);

    expect(callback.headers.location).toBe('/konto');
    const session = await harness.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: jar.header(),
    });
    expect(session.json<{ email: string }>().email).toBe(OWNER_EMAIL);
  });

  it('refuses another verified address', async () => {
    issuer.account = { email: 'stranger@example.test', emailVerified: true };
    const jar = new CookieJar();

    const callback = await signIn(harness.app, jar);

    expect(callback.headers.location).toBe('/logowanie?blad=konto');
    expect(jar.get('session')).toBeUndefined();
  });

  it('refuses the allowed address when Google has not verified it', async () => {
    issuer.account = { email: OWNER_EMAIL, emailVerified: false };
    const jar = new CookieJar();

    const callback = await signIn(harness.app, jar);

    expect(callback.headers.location).toBe('/logowanie?blad=konto');
    expect(jar.get('session')).toBeUndefined();
  });

  it('refuses an ID token issued for another login attempt (nonce mismatch)', async () => {
    issuer.claimOverrides = { nonce: 'replayed' };
    const jar = new CookieJar();

    const callback = await signIn(harness.app, jar);

    expect(callback.headers.location).toBe('/logowanie?blad=logowanie');
    expect(jar.get('session')).toBeUndefined();
  });

  it('refuses a callback carrying a state from another login attempt', async () => {
    const jar = new CookieJar();
    const start = await harness.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    jar.store(start);
    const redirected = await issuer.authorize(start.headers.location as string);
    redirected.searchParams.set('state', 'other');

    const callback = await harness.app.inject({
      method: 'GET',
      url: `${redirected.pathname}${redirected.search}`,
      headers: jar.header(),
    });

    expect(callback.headers.location).toBe('/logowanie?blad=logowanie');
  });
});
