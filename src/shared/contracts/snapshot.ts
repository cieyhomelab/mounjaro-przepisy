import { z } from 'zod';
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
 * Response of GET /api/snapshot: the whole account state. `collections` and `cookEvents` are
 * always empty until the stages that introduce them.
 */
export const snapshotSchema = z.object({
  apiVersion: z.number().int(),
  dataVersion: z.number().int(),
  generatedAt: z.iso.datetime(),
  settings: settingsSchema,
  recipes: z.array(recipeSchema),
  collections: z.array(z.unknown()),
  cookEvents: z.array(z.unknown()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** The ETag of a snapshot is its data version, quoted as HTTP requires. */
export const snapshotEtag = (dataVersion: number) => `"${dataVersion}"`;
