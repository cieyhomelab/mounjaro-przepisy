import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { collectionInputSchema } from '../../shared/contracts/collection';
import { checkCollectionName } from '../../shared/domain/collectionName';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { createCollection, deleteCollection, renameCollection } from '../services/collections';

const idParams = z.object({ id: z.uuid() });

export function registerCollectionRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  app.post('/api/collections', async (request, reply) => {
    const body = collectionInputSchema.safeParse(request.body);
    const checked = body.success ? checkCollectionName(body.data.name, []) : null;
    if (!checked?.ok)
      return sendError(reply, 400, 'validation', { name: checked?.problem ?? 'invalid' });
    const created = await createCollection(
      deps.database,
      request.session?.accountId ?? '',
      checked.name,
      deps.clock.now(),
    );
    if (created === 'duplicate_name') return sendError(reply, 409, 'duplicate_name');
    return reply.code(201).send(created);
  });

  app.put('/api/collections/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = collectionInputSchema.safeParse(request.body);
    const checked = body.success ? checkCollectionName(body.data.name, []) : null;
    if (!checked?.ok)
      return sendError(reply, 400, 'validation', { name: checked?.problem ?? 'invalid' });
    const renamed = await renameCollection(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      checked.name,
    );
    if (renamed === 'duplicate_name') return sendError(reply, 409, 'duplicate_name');
    return renamed ? reply.send(renamed) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/collections/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteCollection(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
