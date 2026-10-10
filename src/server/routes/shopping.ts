import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  checksInputSchema,
  customItemInputSchema,
  weekStartSchema,
} from '../../shared/contracts/shopping';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { addCustomItem, applyChecks, deleteCustomItem } from '../services/shopping';

const weekParams = z.object({ weekStart: weekStartSchema });
const idParams = z.object({ id: z.uuid() });

const invalid = (error: z.ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? 'body')] = 'invalid';
  return fields;
};

export function registerShoppingRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  app.post('/api/shopping/:weekStart/custom-items', async (request, reply) => {
    const params = weekParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 400, 'validation', { weekStart: 'invalid' });
    const body = customItemInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', invalid(body.error));
    const added = await addCustomItem(
      deps.database,
      request.session?.accountId ?? '',
      params.data.weekStart,
      body.data.name,
      deps.clock.now(),
    );
    return reply.code(201).send(added);
  });

  app.delete('/api/shopping/custom-items/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteCustomItem(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });

  app.put('/api/shopping/:weekStart/checks', async (request, reply) => {
    const params = weekParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 400, 'validation', { weekStart: 'invalid' });
    const body = checksInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', invalid(body.error));
    return reply.send(
      await applyChecks(
        deps.database,
        request.session?.accountId ?? '',
        params.data.weekStart,
        body.data.changes,
        deps.clock.now(),
      ),
    );
  });
}
