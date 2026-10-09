import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { searchQuerySchema } from '../../shared/contracts/trustedSite';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { FetchError, type PageFetcher } from '../integrations/pageFetcher';
import { ImageGrants, searchTrustedSites } from '../services/search';

const tokenParams = z.object({ token: z.string().min(1).max(64) });

export function registerSearchRoutes(
  app: FastifyInstance,
  deps: { database: Database; fetcher: PageFetcher; fetchTimeoutMs: number },
) {
  const grants = new ImageGrants();

  app.get('/api/search', async (request, reply) => {
    const query = searchQuerySchema.safeParse(request.query);
    if (!query.success) return sendError(reply, 400, 'validation', { q: 'invalid' });
    const outcome = await searchTrustedSites(
      deps.database,
      deps.fetcher,
      grants,
      request.session?.accountId ?? '',
      query.data.q,
      deps.fetchTimeoutMs,
    );
    if (outcome === 'no_sites') return sendError(reply, 409, 'no_trusted_sites');
    return reply.header('Cache-Control', 'private, no-store').send(outcome);
  });

  app.get('/api/search/images/:token', async (request, reply) => {
    const params = tokenParams.safeParse(request.params);
    const imageUrl = params.success
      ? grants.resolve(request.session?.accountId ?? '', params.data.token, Date.now())
      : null;
    if (!imageUrl) return sendError(reply, 404, 'not_found');
    try {
      const image = await deps.fetcher.fetch(imageUrl, 'image');
      return reply
        .header('Cache-Control', 'private, max-age=900')
        .type(image.contentType.split(';')[0] ?? 'image/jpeg')
        .send(image.body);
    } catch (error) {
      if (error instanceof FetchError) return sendError(reply, 502, 'source_unavailable');
      throw error;
    }
  });
}
