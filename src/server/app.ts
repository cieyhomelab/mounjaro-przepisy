import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { createClock, type Clock } from './clock';
import type { Config } from './config';
import type { Database } from './db/client';
import { sendError } from './errors';
import { createAuthProvider, type AuthProvider } from './integrations/auth';
import { createPageFetcher, type PageFetcher } from './integrations/pageFetcher';
import { registerAccountRoutes } from './routes/account';
import { SESSION_COOKIE, registerAuthRoutes, sessionCookieOptions } from './routes/auth';
import { registerCollectionRoutes } from './routes/collections';
import { registerHealthRoutes } from './routes/health';
import { registerPhotoRoutes } from './routes/photos';
import { registerRecipeRoutes } from './routes/recipes';
import { registerSearchRoutes } from './routes/search';
import { registerSessionRoutes } from './routes/session';
import { registerSettingsRoutes } from './routes/settings';
import { registerSnapshotRoutes } from './routes/snapshot';
import { registerTestSupportRoutes } from './routes/testSupport';
import { registerTrustedSiteRoutes } from './routes/trustedSites';
import { resolveSession, type ActiveSession } from './services/sessions';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the session hook on every protected route. */
    session: ActiveSession | null;
  }
}

export type AppDeps = {
  config: Config;
  database: Database;
  /** Directory with the built client; omitted in tests that exercise the API only. */
  clientDir?: string;
  clock?: Clock;
  /** Identity provider; defaults to the one selected by `AUTH_MODE`. */
  authProvider?: AuthProvider;
  /** Fetcher of recipe pages; defaults to the real one configured by `FETCH_*`. */
  pageFetcher?: PageFetcher;
};

/** Routes reachable without a session. Everything else under /api is protected by default. */
const isPublicRoute = (url: string) =>
  url === '/api/health' || url.startsWith('/api/auth/') || url.startsWith('/api/__test/');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp({
  config,
  database,
  clientDir,
  clock,
  authProvider,
  pageFetcher,
}: AppDeps) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // User data must never reach the logs: log the route pattern, never the URL,
      // query string, headers or bodies.
      serializers: {
        req: (request) => ({ method: request.method, route: request.routeOptions?.url }),
        res: (reply) => ({ statusCode: reply.statusCode }),
      },
    },
  });
  const appClock = clock ?? createClock();
  const provider = authProvider ?? createAuthProvider(config);
  const allowedOrigin = new URL(config.appBaseUrl).origin;
  const isProduction = config.appEnv === 'production';

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'blob:', 'data:'],
        // Plain-http deployments (local, e2e) must not be upgraded to https.
        'upgrade-insecure-requests': null,
      },
    },
  });
  await app.register(fastifyCookie);

  app.decorateRequest('session', null);

  // Mutating requests must come from the app itself (defence in depth next to SameSite=Lax).
  app.addHook('onRequest', async (request, reply) => {
    const url = request.routeOptions.url ?? '';
    if (request.is404 || !url.startsWith('/api/') || url.startsWith('/api/__test/')) return;
    if (SAFE_METHODS.has(request.method) || request.headers.origin === allowedOrigin) return;
    return sendError(reply, 403, 'forbidden_origin');
  });

  // One hook for the whole API: a route is protected unless it is explicitly public.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.routeOptions.url ?? '';
    if (request.is404 || !url.startsWith('/api/') || isPublicRoute(url)) return;
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await resolveSession(database, token, appClock.now()) : null;
    if (!session) {
      if (token) reply.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(config), maxAge: 0 });
      return sendError(reply, 401, 'unauthenticated');
    }
    request.session = session;
    // Sliding window: keep the browser cookie as long as the server-side session.
    if (token) reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config));
  });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status === 413) return sendError(reply, 413, 'payload_too_large');
    if (status >= 400 && status < 500) return sendError(reply, 400, 'validation');
    // Name and code only: messages can carry user data (SQL values, parsed input).
    request.log.error({ event: 'unhandled_error', errorName: error.name, errorCode: error.code });
    return sendError(reply, 500, 'internal');
  });

  registerHealthRoutes(app, database);
  registerSessionRoutes(app);
  registerSnapshotRoutes(app, { database, clock: appClock });
  registerSettingsRoutes(app, { database });
  registerAccountRoutes(app, { config, database, clock: appClock });
  const fetcher =
    pageFetcher ??
    createPageFetcher({
      timeoutMs: config.fetchTimeoutMs,
      allowPrivateNetwork: config.fetchAllowPrivateNetwork,
    });
  registerRecipeRoutes(app, {
    database,
    clock: appClock,
    fetcher,
    fetchTimeoutMs: config.fetchTimeoutMs,
  });
  registerSearchRoutes(app, { database, fetcher, fetchTimeoutMs: config.fetchTimeoutMs });
  registerTrustedSiteRoutes(app, { database });
  registerCollectionRoutes(app, { database, clock: appClock });
  await registerPhotoRoutes(app, { database, clock: appClock });
  registerAuthRoutes(app, {
    config,
    database,
    clock: appClock,
    provider,
  });
  if (!isProduction) {
    registerTestSupportRoutes(app, {
      database,
      clock: appClock,
      mockLogin: config.authMode === 'mock',
    });
  }

  const spaFallback = clientDir && existsSync(clientDir);
  if (spaFallback) await app.register(fastifyStatic, { root: path.resolve(clientDir) });
  app.setNotFoundHandler((request, reply) => {
    // Client-side routing: unknown non-API paths get the application shell.
    if (spaFallback && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return sendError(reply, 404, 'not_found');
  });

  return app;
}
