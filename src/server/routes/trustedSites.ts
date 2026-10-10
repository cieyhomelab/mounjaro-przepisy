import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  trustedSiteActiveInputSchema,
  trustedSiteCreateInputSchema,
} from '../../shared/contracts/trustedSite';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import type { Clock } from '../clock';
import type { PageFetcher } from '../integrations/pageFetcher';
import { addSite, deleteSite, setSiteActive } from '../services/trustedSites';

const idParams = z.object({ id: z.uuid() });

export function registerTrustedSiteRoutes(
  app: FastifyInstance,
  deps: {
    database: Database;
    clock: Clock;
    fetcher: PageFetcher;
    fetchTimeoutMs: number;
  },
) {
  app.post('/api/trusted-sites', async (request, reply) => {
    const body = trustedSiteCreateInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_url');
    const outcome = await addSite(
      deps.database,
      deps.fetcher,
      request.session?.accountId ?? '',
      body.data.url,
      deps.fetchTimeoutMs,
      deps.clock.now(),
    );
    switch (outcome.kind) {
      case 'invalid_url':
        return sendError(reply, 400, 'invalid_url');
      case 'duplicate':
        return sendError(reply, 409, 'duplicate_site');
      case 'not_searchable':
        return sendError(reply, 422, 'not_searchable');
      case 'unavailable':
        return sendError(reply, 502, 'source_unavailable');
      case 'added':
        return reply.code(201).send({ site: outcome.site, dataVersion: outcome.dataVersion });
    }
  });
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
