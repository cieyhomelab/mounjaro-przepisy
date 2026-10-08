import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { importPreviewRequestSchema } from '../../shared/contracts/recipeImport';
import { validateRecipeInput } from '../../shared/domain/recipeValidation';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import type { PageFetcher } from '../integrations/pageFetcher';
import { previewImport } from '../services/recipeImport';
import { createRecipe, deleteRecipe, updateRecipe } from '../services/recipes';

const idParams = z.object({ id: z.uuid() });

export function registerRecipeRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock; fetcher: PageFetcher; fetchTimeoutMs: number },
) {
  app.post('/api/recipes/import-preview', async (request, reply) => {
    const body = importPreviewRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_url');
    const outcome = await previewImport(
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
        return sendError(reply, 409, 'duplicate_source', undefined, outcome.recipeId);
      case 'unavailable':
        return sendError(reply, 502, 'source_unavailable');
      case 'preview':
        return reply.send(outcome.preview);
    }
  });

  app.post('/api/recipes', async (request, reply) => {
    const validation = validateRecipeInput(request.body);
    if (!validation.ok) return sendError(reply, 400, 'validation', validation.fields);
    const created = await createRecipe(
      deps.database,
      request.session?.accountId ?? '',
      validation.input,
      deps.clock.now(),
    );
    if ('duplicateOf' in created) {
      return sendError(reply, 409, 'duplicate_source', undefined, created.duplicateOf);
    }
    return reply.code(201).send(created);
  });

  app.put('/api/recipes/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const validation = validateRecipeInput(request.body);
    if (!validation.ok) return sendError(reply, 400, 'validation', validation.fields);
    const updated = await updateRecipe(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      validation.input,
      deps.clock.now(),
    );
    if (updated && 'duplicateOf' in updated) {
      return sendError(reply, 409, 'duplicate_source', undefined, updated.duplicateOf);
    }
    return updated ? reply.send(updated) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/recipes/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const dataVersion = await deleteRecipe(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return dataVersion === null ? sendError(reply, 404, 'not_found') : reply.send({ dataVersion });
  });
}
