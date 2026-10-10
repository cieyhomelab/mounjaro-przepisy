import type { FastifyInstance } from 'fastify';
import { wellbeingDateSchema, wellbeingInputSchema } from '../../shared/contracts/wellbeing';
import { warsawDate } from '../../shared/domain/cookStats';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { deleteWellbeingEntry, saveWellbeingEntry } from '../services/wellbeing';

export function registerWellbeingRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  app.put('/api/wellbeing/:date', async (request, reply) => {
    const date = wellbeingDateSchema.safeParse((request.params as { date?: string }).date);
    if (!date.success) return sendError(reply, 404, 'not_found');
    const parsed = wellbeingInputSchema.safeParse(request.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0] ?? 'weightKg')] =
          issue.path.length === 0 ? 'required' : 'invalid';
      return sendError(reply, 400, 'validation', fields);
    }
    if (date.data > warsawDate(deps.clock.now()))
      return sendError(reply, 400, 'validation', { date: 'future' });
    const saved = await saveWellbeingEntry(
      deps.database,
      request.session?.accountId ?? '',
      date.data,
      parsed.data,
      deps.clock.now(),
    );
    return reply.send(saved);
  });

  app.delete('/api/wellbeing/:date', async (request, reply) => {
    const date = wellbeingDateSchema.safeParse((request.params as { date?: string }).date);
    if (!date.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteWellbeingEntry(
      deps.database,
      request.session?.accountId ?? '',
      date.data,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
