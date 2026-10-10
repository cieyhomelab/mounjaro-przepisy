import type { FastifyInstance } from 'fastify';
import { clockRequestSchema, testSitesRequestSchema } from '../../shared/contracts/testSupport';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { MOCK_LOGIN_PATH } from '../integrations/auth';
import { isMockPushSender, type PushSender } from '../integrations/push';
import { runReminderTick } from '../services/reminders';
import { deleteAllData, firstAccountId } from '../services/testSupport';
import { replaceSitesForTests } from '../services/trustedSites';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Routes under /api/__test. Registered only when APP_ENV is not "production". */
export function registerTestSupportRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock; mockLogin: boolean; sender: PushSender },
) {
  app.post('/api/__test/reset', async (_request, reply) => {
    await deleteAllData(deps.database);
    deps.clock.set(null);
    if (isMockPushSender(deps.sender)) deps.sender.clear();
    return reply.code(204).send();
  });

  // What the mock push service has sent (PUSH_MODE=mock).
  app.get('/api/__test/push-outbox', (_request, reply) => {
    if (!isMockPushSender(deps.sender)) return sendError(reply, 404, 'not_found');
    return reply.send({ notifications: deps.sender.outbox() });
  });

  // One run of the reminder scheduler, as the 30-second timer would do it.
  app.post('/api/__test/scheduler/tick', async (request, reply) => {
    const sent = await runReminderTick(deps.database, deps.clock, deps.sender, request.log);
    return reply.send({ sent });
  });

  app.put('/api/__test/clock', (request, reply) => {
    const parsed = clockRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, 'validation', { now: 'invalid' });
    deps.clock.set(parsed.data.now ? new Date(parsed.data.now) : null);
    return reply.send({ now: deps.clock.now().toISOString() });
  });

  // The app has one user: the sites replaced are those of the only account (log in first).
  app.put('/api/__test/trusted-sites', async (request, reply) => {
    const parsed = testSitesRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, 'validation', { sites: 'invalid' });
    const accountId = await firstAccountId(deps.database);
    if (!accountId) return sendError(reply, 404, 'not_found');
    await replaceSitesForTests(deps.database, accountId, parsed.data.sites, deps.clock.now());
    return reply.code(204).send();
  });

  if (deps.mockLogin) {
    // Stand-in for Google's account chooser: the test types an address and submits.
    app.get(MOCK_LOGIN_PATH, (request, reply) => {
      const { state = '' } = request.query as { state?: string };
      return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Logowanie Google (atrapa)</title></head>
<body>
<h1>Logowanie Google (atrapa)</h1>
<form method="get" action="/api/auth/google/callback">
<input type="hidden" name="state" value="${escapeHtml(state)}">
<label>Adres e-mail <input type="email" name="code" required></label>
<button type="submit">Zaloguj</button>
</form>
</body></html>`);
    });
  }
}
