import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { mealPlanInputSchema } from '../../shared/contracts/mealPlan';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { addMealPlanEntry, deleteMealPlanEntry } from '../services/mealPlan';

const idParams = z.object({ id: z.uuid() });

export function registerMealPlanRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  app.post('/api/meal-plan', async (request, reply) => {
    const body = mealPlanInputSchema.safeParse(request.body);
    if (!body.success) {
      const fields: Record<string, string> = {};
      for (const issue of body.error.issues) fields[String(issue.path[0] ?? 'body')] = 'invalid';
      return sendError(reply, 400, 'validation', fields);
    }
    const added = await addMealPlanEntry(
      deps.database,
      request.session?.accountId ?? '',
      body.data,
      deps.clock.now(),
    );
    return added ? reply.code(201).send(added) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/meal-plan/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteMealPlanEntry(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
