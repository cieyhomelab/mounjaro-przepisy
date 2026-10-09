import type { FastifyInstance } from 'fastify';
import { thresholdsInputSchema } from '../../shared/contracts/settings';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { resetThresholds, saveThresholds } from '../services/settings';

export function registerSettingsRoutes(app: FastifyInstance, deps: { database: Database }) {
  app.put('/api/settings/thresholds', async (request, reply) => {
    const body = thresholdsInputSchema.safeParse(request.body);
    if (!body.success) {
      const fields = Object.fromEntries(
        body.error.issues.map((issue) => [String(issue.path[0] ?? 'body'), 'invalid']),
      );
      return sendError(reply, 400, 'validation', fields);
    }
    return reply.send(
      await saveThresholds(deps.database, request.session?.accountId ?? '', body.data),
    );
  });

  app.post('/api/settings/thresholds/reset', async (request, reply) =>
    reply.send(await resetThresholds(deps.database, request.session?.accountId ?? '')),
  );
}
