import type { FastifyInstance } from 'fastify';
import { validateRecipeInput } from '../../shared/domain/recipeValidation';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { createManualRecipe } from '../services/recipes';

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
}
