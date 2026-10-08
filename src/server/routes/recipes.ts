import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { validateRecipeInput } from '../../shared/domain/recipeValidation';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { createManualRecipe, deleteRecipe, updateRecipe } from '../services/recipes';

const idParams = z.object({ id: z.uuid() });

export function registerRecipeRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  app.post('/api/recipes', async (request, reply) => {
    const validation = validateRecipeInput(request.body);
    if (!validation.ok) return sendError(reply, 400, 'validation', validation.fields);
    const created = await createManualRecipe(
      deps.database,
      request.session?.accountId ?? '',
      validation.input,
      deps.clock.now(),
    );
    return reply.code(201).send(created);
  });

  app.put('/api/recipes/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const validation = validateRecipeInput(request.body);
    if (!validation.ok) return sendError(reply, 400, 'validation', validation.fields);
    const updated = await updateRecipe(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      validation.input,
      deps.clock.now(),
    );
    return updated ? reply.send(updated) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/recipes/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteRecipe(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
