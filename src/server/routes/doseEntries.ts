import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { doseInputSchema } from '../../shared/contracts/dose';
import { warsawDate } from '../../shared/domain/cookStats';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { addDoseEntry, deleteDoseEntry, updateDoseEntry } from '../services/doseEntries';

const idParams = z.object({ id: z.uuid() });

export function registerDoseEntryRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  /** The valid input, or null after the 400 answer: unknown shape, or a day that has not come yet. */
  const parseInput = (body: unknown, reply: FastifyReply) => {
    const parsed = doseInputSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'body')] = 'invalid';
      sendError(reply, 400, 'validation', fields);
      return null;
    }
    if (parsed.data.date > warsawDate(deps.clock.now())) {
      sendError(reply, 400, 'validation', { date: 'future' });
      return null;
    }
    return parsed.data;
  };

  app.post('/api/dose-entries', async (request, reply) => {
    const input = parseInput(request.body, reply);
    if (!input) return reply;
    const added = await addDoseEntry(
      deps.database,
      request.session?.accountId ?? '',
      input,
      deps.clock.now(),
    );
    return reply.code(201).send(added);
  });

  app.put('/api/dose-entries/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const input = parseInput(request.body, reply);
    if (!input) return reply;
    const updated = await updateDoseEntry(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      input,
    );
    return updated ? reply.send(updated) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/dose-entries/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteDoseEntry(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
