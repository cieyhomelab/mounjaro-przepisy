import type { FastifyInstance } from 'fastify';
import { deleteAccountInputSchema } from '../../shared/contracts/account';
import { warsawDate } from '../../shared/domain/cookStats';
import type { Clock } from '../clock';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { buildAccountExport, deleteAccount } from '../services/accountData';
import { createZip } from '../zip';
import { SESSION_COOKIE, sessionCookieOptions } from './auth';

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: { config: Config; database: Database; clock: Clock },
) {
  app.get('/api/account/export', async (request, reply) => {
    const now = deps.clock.now();
    const result = await buildAccountExport(deps.database, request.session?.accountId ?? '', now);
    if (!result) return sendError(reply, 404, 'not_found');
    const archive = createZip([
      {
        name: 'dane.json',
        data: Buffer.from(JSON.stringify(result.data, null, 2), 'utf8'),
        compress: true,
      },
      ...result.photos.map((photo) => ({ name: photo.path, data: photo.content })),
    ]);
    request.log.info({ event: 'account_exported', photos: result.photos.length });
    return reply
      .header('Content-Type', 'application/zip')
      .header(
        'Content-Disposition',
        `attachment; filename="mounjaro-przepisy-dane-${warsawDate(now)}.zip"`,
      )
      .header('Cache-Control', 'no-store')
      .send(archive);
  });

  app.delete('/api/account', async (request, reply) => {
    const body = deleteAccountInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', { confirmation: 'invalid' });
    await deleteAccount(deps.database, request.session?.accountId ?? '');
    reply.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(deps.config), maxAge: 0 });
    request.log.info({ event: 'account_deleted' });
    return reply.code(204).send();
  });
}
