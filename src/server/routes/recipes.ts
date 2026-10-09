import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  ratingInputSchema,
  recipeCollectionsInputSchema,
  toleranceInputSchema,
  worseDaysInputSchema,
} from '../../shared/contracts/recipe';
import { importPreviewRequestSchema } from '../../shared/contracts/recipeImport';
import { validateRecipeInput } from '../../shared/domain/recipeValidation';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import type { PageFetcher } from '../integrations/pageFetcher';
import { previewImport } from '../services/recipeImport';
import {
  addCookEvent,
  removeLastCookEvent,
  setRating,
  setRecipeCollections,
  setTolerance,
  setWorseDays,
} from '../services/recipeDetails';
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

  app.put('/api/recipes/:id/rating', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = ratingInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', { rating: 'invalid' });
    const changed = await setRating(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      body.data.rating,
      deps.clock.now(),
    );
    return changed ? reply.send(changed) : sendError(reply, 404, 'not_found');
  });

  app.put('/api/recipes/:id/tolerance', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = toleranceInputSchema.safeParse(request.body);
    if (!body.success) {
      const fields = Object.fromEntries(
        body.error.issues.map((issue) => [String(issue.path[0] ?? 'body'), 'invalid']),
      );
      return sendError(reply, 400, 'validation', fields);
    }
    const changed = await setTolerance(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      body.data,
      deps.clock.now(),
    );
    return changed ? reply.send(changed) : sendError(reply, 404, 'not_found');
  });

  app.put('/api/recipes/:id/worse-days', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = worseDaysInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', { enabled: 'invalid' });
    const changed = await setWorseDays(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      body.data.enabled,
      deps.clock.now(),
    );
    return changed ? reply.send(changed) : sendError(reply, 404, 'not_found');
  });

  app.put('/api/recipes/:id/collections', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const body = recipeCollectionsInputSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation', { collectionIds: 'invalid' });
    const changed = await setRecipeCollections(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      body.data.collectionIds,
      deps.clock.now(),
    );
    if (changed === 'unknown_collection') {
      return sendError(reply, 400, 'validation', { collectionIds: 'unknown' });
    }
    return changed ? reply.send(changed) : sendError(reply, 404, 'not_found');
  });

  app.post('/api/recipes/:id/cook-events', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const created = await addCookEvent(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
      deps.clock.now(),
    );
    return created ? reply.code(201).send(created) : sendError(reply, 404, 'not_found');
  });

  app.delete('/api/recipes/:id/cook-events/last', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found');
    const removed = await removeLastCookEvent(
      deps.database,
      request.session?.accountId ?? '',
      params.data.id,
    );
    return removed ? reply.send(removed) : sendError(reply, 404, 'not_found');
  });
}
