import { z } from 'zod';

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The largest amount of protein of one entry, in g; it only bounds the column. */
export const PROTEIN_G_MAX = 10_000;
/** The largest number of servings of one entry. */
export const SERVINGS_EATEN_MAX = 100;

/** An amount of protein with at most one decimal place, the precision the column stores. */
const gramsValue = z
  .number()
  .positive()
  .max(PROTEIN_G_MAX)
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, {
    message: 'too_many_decimals',
  });

/**
 * One entry of the protein counter (S25). It keeps the name of the recipe and the amount of the
 * moment it was added; it does not point to the recipe, so editing or deleting the recipe leaves it.
 * `date` is a calendar day in Europe/Warsaw.
 */
export const proteinEntrySchema = z.object({
  id: z.uuid(),
  date: dayString,
  grams: z.number(),
  sourceKind: z.enum(['recipe', 'manual']),
  recipeTitle: z.string().nullable(),
  servings: z.number().nullable(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ProteinEntry = z.infer<typeof proteinEntrySchema>;

/**
 * Request body of POST /api/protein-entries: a recipe eaten (`grams` is required when the recipe
 * has no protein value) or protein written down by hand.
 */
export const proteinEntryInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('recipe'),
    recipeId: z.uuid(),
    servings: z
      .number()
      .positive()
      .max(SERVINGS_EATEN_MAX)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
        message: 'too_many_decimals',
      }),
    grams: gramsValue.nullish().transform((value) => value ?? null),
  }),
  z.object({
    kind: z.literal('manual'),
    grams: gramsValue,
    description: z
      .string()
      .max(200)
      .transform((value) => value.trim())
      .pipe(z.string().min(1)),
  }),
]);
export type ProteinEntryInput = z.input<typeof proteinEntryInputSchema>;

/** One entry of the water counter: a glass, in ml. */
export const waterEntrySchema = z.object({
  id: z.uuid(),
  date: dayString,
  ml: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type WaterEntry = z.infer<typeof waterEntrySchema>;

/** Response of POST /api/protein-entries. */
export const proteinEntryResponseSchema = z.object({
  entry: proteinEntrySchema,
  dataVersion: z.number().int(),
});

/** Response of POST /api/water-entries. */
export const waterEntryResponseSchema = z.object({
  entry: waterEntrySchema,
  dataVersion: z.number().int(),
});

/** Response of the DELETE routes of both counters. */
export const intakeDeletedResponseSchema = z.object({ dataVersion: z.number().int() });
