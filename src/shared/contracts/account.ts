import { z } from 'zod';
import { collectionSchema } from './collection';
import { cookEventSchema } from './cookEvent';
import { doseEntrySchema } from './dose';
import { wellbeingEntrySchema } from './wellbeing';
import { mealPlanEntrySchema } from './mealPlan';
import { recipeSchema } from './recipe';
import {
  exportedShoppingListSchema,
  shoppingCheckSchema,
  shoppingCustomItemSchema,
} from './shopping';
import { settingsSchema } from './snapshot';
import { trustedSiteSchema } from './trustedSite';

/** The word the user types to confirm deleting the account (S16). */
export const DELETE_CONFIRMATION = 'USUŃ';

/** Request body of DELETE /api/account. The word is compared after Unicode normalisation (NFC). */
export const deleteAccountInputSchema = z.object({
  confirmation: z
    .string()
    .transform((value) => value.normalize('NFC'))
    .pipe(z.literal(DELETE_CONFIRMATION)),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/** Version of the `dane.json` layout; bumped on incompatible changes. */
export const EXPORT_FORMAT_VERSION = 1;

/** Directory of the photos inside the export archive. */
export const EXPORT_PHOTO_DIR = 'zdjecia';

/** Path of a recipe photo inside the export archive. */
export const exportPhotoPath = (photoId: string) => `${EXPORT_PHOTO_DIR}/${photoId}.webp`;

/**
 * `dane.json` of the export archive (GET /api/account/export): every object of the account.
 * Each stage adds its own collections here when it adds data.
 */
export const accountExportSchema = z.object({
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.iso.datetime(),
  account: z.object({ email: z.string(), createdAt: z.iso.datetime() }),
  settings: settingsSchema,
  recipes: z.array(recipeSchema),
  /** Which file of the archive holds the photo of which recipe. */
  photos: z.array(z.object({ recipeId: z.uuid(), photoId: z.uuid(), file: z.string() })),
  collections: z.array(collectionSchema),
  cookEvents: z.array(cookEventSchema),
  /** The trusted sites with their state (active or not). */
  trustedSites: z.array(trustedSiteSchema),
  /** The planned meals: a recipe on a day and a meal, with the number of servings. */
  mealPlan: z.array(mealPlanEntrySchema),
  /** The ticks of the shopping lists and the user's own items; the lists themselves are computed from the plan. */
  shoppingChecks: z.array(shoppingCheckSchema),
  shoppingCustomItems: z.array(shoppingCustomItemSchema),
  /** The shopping list of every week that has a plan, own items or ticks, as the app shows it. */
  shoppingLists: z.array(exportedShoppingListSchema),
  /** The dose journal: date, dose in mg, injection site and note of every entry. */
  doseEntries: z.array(doseEntrySchema),
  /** The weight and mood journal: date, weight, mood and note of every entry. */
  wellbeingEntries: z.array(wellbeingEntrySchema),
});
export type AccountExport = z.infer<typeof accountExportSchema>;
