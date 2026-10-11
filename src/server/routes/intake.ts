import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { proteinEntryInputSchema } from '../../shared/contracts/intake';
import { warsawDate } from '../../shared/domain/cookStats';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import {
  addProteinEntry,
  addWaterEntry,
  deleteProteinEntry,
  deleteWaterEntry,
  type DeleteResult,
} from '../services/intake';

const idParams = z.object({ id: z.uuid() });

export function registerIntakeRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  const today = () => warsawDate(deps.clock.now());

  const answerDelete = (reply: FastifyReply, result: DeleteResult) => {
    if (result.status === 'deleted') return reply.send({ dataVersion: result.dataVersion });
    return result.status === 'past_day'
      ? sendError(reply, 409, 'past_day')
      : sendError(reply, 404, 'not_found');
  };

  app.post('/api/protein-entries', async (request, reply) => {
    const parsed = proteinEntryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'body')] = 'invalid';
      return sendError(reply, 400, 'validation', fields);
    }
    const result = await addProteinEntry(
      deps.database,
      request.session?.accountId ?? '',
      parsed.data,
      today(),
      deps.clock.now(),
    );
    if (result.status === 'recipe_not_found') return sendError(reply, 404, 'not_found');
    if (result.status === 'protein_required') return sendError(reply, 422, 'protein_required');
    return reply.code(201).send({ entry: result.entry, dataVersion: result.dataVersion });
  });

  app.delete('/api/protein-entries/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    return answerDelete(
      reply,
      await deleteProteinEntry(
        deps.database,
        request.session?.accountId ?? '',
        params.data.id,
        today(),
      ),
    );
  });

  app.post('/api/water-entries', async (request, reply) => {
    const added = await addWaterEntry(
      deps.database,
      request.session?.accountId ?? '',
      today(),
      deps.clock.now(),
    );
    return reply.code(201).send(added);
  });

  app.delete('/api/water-entries/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    return answerDelete(
      reply,
      await deleteWaterEntry(
        deps.database,
        request.session?.accountId ?? '',
        params.data.id,
        today(),
      ),
    );
  });
}
