import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sanitizeReturnTo } from '../../shared/domain/returnTo';
import type { Clock } from '../clock';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { createLoginChecks, type AuthProvider } from '../integrations/auth';
import { findOrCreateAccount } from '../services/accounts';
import { SESSION_MAX_AGE_SECONDS, createSession, deleteSession } from '../services/sessions';

export const SESSION_COOKIE = 'session';
const LOGIN_COOKIE = 'login';
const LOGIN_COOKIE_PATH = '/api/auth';
const LOGIN_MAX_AGE_SECONDS = 10 * 60;

const loginStateSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  codeVerifier: z.string(),
  returnTo: z.string(),
});

type AuthRoutesDeps = {
  config: Config;
  database: Database;
  clock: Clock;
  provider: AuthProvider;
};

export function sessionCookieOptions(config: Config) {
  return {
    path: '/',
    httpOnly: true,
    // Browsers refuse Secure cookies on plain http; production is always https.
    secure: config.appBaseUrl.startsWith('https://'),
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps) {
  const { config, database, clock, provider } = deps;
  const redirectUri = `${config.appBaseUrl}/api/auth/google/callback`;
  const loginCookieOptions = {
    path: LOGIN_COOKIE_PATH,
    httpOnly: true,
    secure: config.appBaseUrl.startsWith('https://'),
    sameSite: 'lax' as const,
  };

  const failLogin = (reply: FastifyReply, reason: 'konto' | 'logowanie') => {
    reply.clearCookie(LOGIN_COOKIE, loginCookieOptions);
    return reply.redirect(`/logowanie?blad=${reason}`);
  };

  app.get('/api/auth/google/start', async (request, reply) => {
    const { returnTo } = request.query as { returnTo?: string };
    const { codeVerifier, ...checks } = createLoginChecks();
    const url = await provider.authorizationUrl({ ...checks, redirectUri });
    reply.setCookie(
      LOGIN_COOKIE,
      JSON.stringify({
        state: checks.state,
        nonce: checks.nonce,
        codeVerifier,
        returnTo: sanitizeReturnTo(returnTo),
      }),
      { ...loginCookieOptions, maxAge: LOGIN_MAX_AGE_SECONDS },
    );
    return reply.redirect(url);
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    let login: z.infer<typeof loginStateSchema>;
    try {
      login = loginStateSchema.parse(JSON.parse(request.cookies[LOGIN_COOKIE] ?? ''));
    } catch {
      return failLogin(reply, 'logowanie');
    }

    let identity: Awaited<ReturnType<AuthProvider['completeLogin']>>;
    try {
      const callbackUrl = new URL(request.url, config.appBaseUrl);
      identity = await provider.completeLogin({ callbackUrl, ...login });
    } catch (error) {
      // Log the kind of failure only: provider errors can carry the address or tokens.
      request.log.warn({ event: 'login_failed', errorName: (error as Error).name });
      return failLogin(reply, 'logowanie');
    }

    if (!identity.emailVerified || identity.email.toLowerCase() !== config.allowedEmail) {
      request.log.info({ event: 'login_rejected' });
      return failLogin(reply, 'konto');
    }

    const now = clock.now();
    const accountId = await findOrCreateAccount(database, config.allowedEmail, now);
    const token = await createSession(database, accountId, now);
    reply.clearCookie(LOGIN_COOKIE, loginCookieOptions);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config));
    request.log.info({ event: 'login_succeeded' });
    return reply.redirect(sanitizeReturnTo(login.returnTo));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(database, token);
    reply.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(config), maxAge: 0 });
    return reply.code(204).send();
  });
}
