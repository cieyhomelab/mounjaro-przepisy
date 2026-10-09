import { z } from 'zod';
import { collectionSchema } from './collection';
import { cookEventSchema } from './cookEvent';
import { recipeSchema } from './recipe';
import { trustedSiteSchema } from './trustedSite';
import { API_VERSION } from './session';

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
  trustedSites: z.array(trustedSiteSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/**
 * The ETag of a snapshot is the API version and the data version, quoted as HTTP requires. The API
 * version is part of it so that a client built for another API version never gets a 304 (which
 * carries no `apiVersion`) and learns about the new server from the full response.
 */
export const snapshotEtag = (dataVersion: number, apiVersion: number = API_VERSION) =>
  `"${apiVersion}.${dataVersion}"`;
