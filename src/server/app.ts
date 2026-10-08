import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { Config } from './config';
import type { Database } from './db/client';
import { registerHealthRoutes } from './routes/health';

export type AppDeps = {
  config: Config;
  database: Database;
  /** Directory with the built client; omitted in tests that exercise the API only. */
  clientDir?: string;
};

export async function buildApp({ config, database, clientDir }: AppDeps) {
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

  registerHealthRoutes(app, database);

  if (clientDir && existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: path.resolve(clientDir) });
    // Client-side routing: unknown non-API paths get the application shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
