import type { FastifyInstance } from 'fastify';
import { API_VERSION, type SessionResponse } from '../../shared/contracts/session';

export function registerSessionRoutes(app: FastifyInstance) {
  app.get('/api/session', (request): SessionResponse => {
    // The session hook has already rejected requests without a valid session.
    return { email: request.session?.email ?? '', apiVersion: API_VERSION };
  });
}
