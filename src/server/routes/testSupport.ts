import type { FastifyInstance } from 'fastify';
import { clockRequestSchema } from '../../shared/contracts/testSupport';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { MOCK_LOGIN_PATH } from '../integrations/auth';
import { deleteAllData } from '../services/testSupport';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Routes under /api/__test. Registered only when APP_ENV is not "production". */
export function registerTestSupportRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock; mockLogin: boolean },
) {
  app.post('/api/__test/reset', async (_request, reply) => {
    await deleteAllData(deps.database);
    deps.clock.set(null);
    return reply.code(204).send();
  });

  app.put('/api/__test/clock', (request, reply) => {
    const parsed = clockRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, 'validation', { now: 'invalid' });
    deps.clock.set(parsed.data.now ? new Date(parsed.data.now) : null);
    return reply.send({ now: deps.clock.now().toISOString() });
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
