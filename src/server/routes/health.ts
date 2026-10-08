import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '../../shared/health';
import type { Database } from '../db/client';

export function registerHealthRoutes(app: FastifyInstance, database: Database) {
  app.get('/api/health', async (_request, reply): Promise<HealthResponse> => {
    const up = await database.ping();
    if (!up) reply.code(503);
    return { status: up ? 'ok' : 'degraded', database: up ? 'up' : 'down' };
  });
}
