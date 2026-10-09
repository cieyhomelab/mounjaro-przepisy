import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { trustedSiteActiveInputSchema } from '../../shared/contracts/trustedSite';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { deleteSite, setSiteActive } from '../services/trustedSites';

const idParams = z.object({ id: z.uuid() });

export function registerTrustedSiteRoutes(app: FastifyInstance, deps: { database: Database }) {
  app.patch('/api/trusted-sites/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = trustedSiteActiveInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', { active: 'invalid' });
    const changed = await setSiteActive(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      body.data.active,
    );
    return changed ? reply.send(changed) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/trusted-sites/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteSite(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
