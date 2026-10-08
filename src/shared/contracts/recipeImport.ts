import { z } from 'zod';
import { ingredientInputSchema, sourceImportSchema } from './recipe';

/** Request body of POST /api/recipes/import-preview. */
export const importPreviewRequestSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

/** Fields a recipe must have to be saved; `missing` lists those the page did not give. */
export const importMissingFieldSchema = z.enum(['title', 'servings', 'ingredients', 'steps']);
export type ImportMissingField = z.infer<typeof importMissingFieldSchema>;

/**
 * What was read from the page, in the shape of the recipe form. Fields the page did not give are
 * empty ("" for the title, null for the servings, empty lists) instead of absent.
 */
export const importDraftSchema = z.object({
  title: z.string(),
  servings: z.number().nullable(),
  ingredients: z.array(ingredientInputSchema),
  steps: z.array(z.string()),
  sourceUrl: z.string(),
  /** The downloaded photo, not yet attached to a recipe. */
  photoId: z.uuid().nullable(),
  /** Rating and nutrition read from the page; null when the draft is partial. */
  sourceImport: sourceImportSchema.nullable(),
});
export type ImportDraft = z.infer<typeof importDraftSchema>;

/**
 * "complete": title, ingredients and steps were read (the servings may be missing and are then
 * listed in `missing`); "partial": something else was missing, the user finishes it by hand.
 */
export const importPreviewResponseSchema = z.object({
  status: z.enum(['complete', 'partial']),
  draft: importDraftSchema,
  missing: z.array(importMissingFieldSchema),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;
