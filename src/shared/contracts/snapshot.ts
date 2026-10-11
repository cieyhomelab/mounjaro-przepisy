import { z } from 'zod';
import { collectionSchema } from './collection';
import { cookEventSchema } from './cookEvent';
import { doseEntrySchema } from './dose';
import { proteinEntrySchema, waterEntrySchema } from './intake';
import { wellbeingEntrySchema } from './wellbeing';
import { mealPlanEntrySchema } from './mealPlan';
import { recipeSchema } from './recipe';
import { shoppingCheckSchema, shoppingCustomItemSchema } from './shopping';
import { trustedSiteSchema } from './trustedSite';
import { API_VERSION } from './session';

export const settingsSchema = z.object({
  thresholdProteinG: z.number(),
  thresholdFatG: z.number(),
  thresholdFiberG: z.number(),
  thresholdKcal: z.number(),
  thresholdSmallPortionKcal: z.number(),
  /** The injection reminder (S23): on or off, weekday 1–7 (Monday = 1) and `HH:MM` in Warsaw time. */
  reminderEnabled: z.boolean(),
  reminderWeekday: z.number().int().min(1).max(7),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/),
  /** The daily goals of the counters (S25): empty until the user sets them; the app never proposes them. */
  proteinGoalG: z.number().nullable(),
  waterGoalMl: z.number().nullable(),
  /** The size of the glass the water button adds, in ml. */
  glassMl: z.number().int(),
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
  mealPlan: z.array(mealPlanEntrySchema),
  shoppingChecks: z.array(shoppingCheckSchema),
  shoppingCustomItems: z.array(shoppingCustomItemSchema),
  doseEntries: z.array(doseEntrySchema),
  wellbeingEntries: z.array(wellbeingEntrySchema),
  proteinEntries: z.array(proteinEntrySchema),
  waterEntries: z.array(waterEntrySchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/**
 * The ETag of a snapshot is the API version and the data version, quoted as HTTP requires. The API
 * version is part of it so that a client built for another API version never gets a 304 (which
 * carries no `apiVersion`) and learns about the new server from the full response.
 */
export const snapshotEtag = (dataVersion: number, apiVersion: number = API_VERSION) =>
  `"${apiVersion}.${dataVersion}"`;
