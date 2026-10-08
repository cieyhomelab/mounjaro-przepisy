import { z } from 'zod';

export const SERVINGS_MIN = 0.5;
export const SERVINGS_MAX = 99;
export const SERVINGS_STEP = 0.5;
export const MAX_INGREDIENTS = 100;
export const MAX_STEPS = 100;

export const nutritionOriginSchema = z.enum(['source', 'estimated', 'manual', 'none']);
export type NutritionOrigin = z.infer<typeof nutritionOriginSchema>;

/**
 * An ingredient as stored. `originalText` is always kept; a line that could not be split has
 * only `originalText` (no quantity, unit or name) and is not scaled.
 */
export const ingredientSchema = z.object({
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  name: z.string().nullable(),
  originalText: z.string(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

/** An ingredient in a request: when quantity, unit and name are all absent the server splits `originalText`. */
export const ingredientInputSchema = z.object({
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  originalText: z.string().trim().min(1).max(300),
});

const manualNutritionValue = z.number().min(0).max(100_000).nullable().optional();

/** Request body of POST /api/recipes and PUT /api/recipes/:id. */
export const recipeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  servings: z.number().min(SERVINGS_MIN).max(SERVINGS_MAX).multipleOf(SERVINGS_STEP),
  ingredients: z.array(ingredientInputSchema).min(1).max(MAX_INGREDIENTS),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(MAX_STEPS),
  sourceUrl: z
    .url({ protocol: /^https?$/, hostname: z.regexes.domain })
    .max(2000)
    .nullable()
    .optional(),
  photoId: z.uuid().nullable().optional(),
  nutritionManual: z
    .object({
      kcal: manualNutritionValue,
      proteinG: manualNutritionValue,
      fatG: manualNutritionValue,
      fiberG: manualNutritionValue,
    })
    .default({}),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

const nutritionValueSchema = z.object({
  value: z.number().nullable(),
  origin: nutritionOriginSchema,
});

export const recipeSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.enum(['link', 'manual']),
  servings: z.number(),
  ingredients: z.array(ingredientSchema),
  steps: z.array(z.string()),
  sourceUrl: z.string().nullable(),
  sourceSiteName: z.string().nullable(),
  sourceRating: z.number().nullable(),
  sourceRatingCount: z.number().int().nullable(),
  nutrition: z.object({
    kcal: nutritionValueSchema,
    proteinG: nutritionValueSchema,
    fatG: nutritionValueSchema,
    fiberG: nutritionValueSchema,
  }),
  unrecognizedIngredients: z.array(z.string()),
  ownRating: z.number().int().min(1).max(5).nullable(),
  tolerance: z.enum(['good', 'medium', 'bad']).nullable(),
  toleranceSymptoms: z.array(z.enum(['nausea', 'heartburn', 'bloating', 'other'])),
  toleranceNote: z.string().nullable(),
  worseDays: z.boolean(),
  photoId: z.uuid().nullable(),
  collectionIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Recipe = z.infer<typeof recipeSchema>;

/** Response of the operations that change one recipe. */
export const recipeResponseSchema = z.object({
  recipe: recipeSchema,
  dataVersion: z.number().int(),
});
export type RecipeResponse = z.infer<typeof recipeResponseSchema>;
