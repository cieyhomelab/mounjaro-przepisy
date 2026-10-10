import type { FastifyInstance } from 'fastify';
import { subscriptionInputSchema, unsubscribeInputSchema } from '../../shared/contracts/push';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import type { PushSender } from '../integrations/push';
import { deleteSubscription, saveSubscription } from '../services/reminders';

export function registerPushRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock; sender: PushSender },
) {
  app.get('/api/push/public-key', (_request, reply) => {
    if (!deps.sender.publicKey) return sendError(reply, 503, 'push_unavailable');
    return reply.send({ publicKey: deps.sender.publicKey });
  });

  app.post('/api/push/subscriptions', async (request, reply) => {
    const body = subscriptionInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation');
    await saveSubscription(
      deps.database,
      request.session?.accountId ?? '',
      body.data,
      deps.clock.now(),
    );
    return reply.code(201).send({});
  });

  app.delete('/api/push/subscriptions', async (request, reply) => {
    const body = unsubscribeInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation');
    await deleteSubscription(deps.database, request.session?.accountId ?? '', body.data.endpoint);
    return reply.code(204).send();
  });
}
