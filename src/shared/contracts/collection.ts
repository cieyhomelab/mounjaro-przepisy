import { z } from 'zod';

export const COLLECTION_NAME_MAX = 60;

export const collectionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});
export type OwnCollection = z.infer<typeof collectionSchema>;

/** Request body of POST /api/collections and PUT /api/collections/:id. */
export const collectionInputSchema = z.object({ name: z.string() });
export type CollectionInput = z.infer<typeof collectionInputSchema>;

/** Response of the operations that create or rename one own collection. */
export const collectionResponseSchema = z.object({
  collection: collectionSchema,
  dataVersion: z.number().int(),
});
export type CollectionResponse = z.infer<typeof collectionResponseSchema>;

/** Response of DELETE /api/collections/:id. */
export const collectionDeletedResponseSchema = z.object({ dataVersion: z.number().int() });
