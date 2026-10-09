import { z } from 'zod';
import { collectionSchema } from './collection';
import { cookEventSchema } from './cookEvent';
import { recipeSchema } from './recipe';

export const settingsSchema = z.object({
  thresholdProteinG: z.number(),
  thresholdFatG: z.number(),
  thresholdFiberG: z.number(),
  thresholdKcal: z.number(),
  thresholdSmallPortionKcal: z.number(),
});
export type Settings = z.infer<typeof settingsSchema>;

/**
 * Response of GET /api/snapshot: the whole account state.
 */
export const snapshotSchema = z.object({
  apiVersion: z.number().int(),
  dataVersion: z.number().int(),
  generatedAt: z.iso.datetime(),
  settings: settingsSchema,
  recipes: z.array(recipeSchema),
  collections: z.array(collectionSchema),
  cookEvents: z.array(cookEventSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** The ETag of a snapshot is its data version, quoted as HTTP requires. */
export const snapshotEtag = (dataVersion: number) => `"${dataVersion}"`;
