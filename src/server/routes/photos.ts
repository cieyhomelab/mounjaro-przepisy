import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { sendError } from '../errors';
import { processPhoto, readPhoto, setRecipePhoto, UnsupportedImageError } from '../services/photos';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const idParams = z.object({ id: z.uuid() });

export function registerPhotoRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  // The upload is the one binary body of the API. The parser lives in its own scope so the
  // JSON routes keep their strict content-type handling.
  return app.register((scope, _options, done) => {
    scope.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
      (_request, body, next) => next(null, body),
    );

    scope.put('/api/recipes/:id/photo', async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return sendError(reply, 404, 'not_found');
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return sendError(reply, 400, 'unsupported_image');
      }
      let photo;
      try {
        photo = await processPhoto(request.body);
      } catch (error) {
        if (error instanceof UnsupportedImageError) {
          return sendError(reply, 400, 'unsupported_image');
        }
        throw error;
      }
      const saved = await setRecipePhoto(
        deps.database,
        request.session?.accountId ?? '',
        params.data.id,
        photo,
        deps.clock.now(),
      );
      return saved ? reply.send(saved) : sendError(reply, 404, 'not_found');
    });

    scope.get('/api/photos/:id', async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return sendError(reply, 404, 'not_found');
      const photo = await readPhoto(
        deps.database,
        request.session?.accountId ?? '',
        params.data.id,
      );
      if (!photo) return sendError(reply, 404, 'not_found');
      return reply
        .header('Content-Type', photo.contentType)
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .send(photo.content);
    });

    done();
  });
}
