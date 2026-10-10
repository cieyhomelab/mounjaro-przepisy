import { z } from 'zod';

/** The heaviest weight the journal accepts, in kg; it only bounds the column. */
export const WEIGHT_KG_MAX = 500;
/** Decimal places kept of a weight. */
export const WEIGHT_KG_DECIMALS = 2;

export const moodSchema = z.number().int().min(1).max(5);

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** True for a real calendar day: dates that roll over (30 February) parse but are not that day. */
export const isCalendarDay = (value: string) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

/** The entry of one day of the weight and mood journal. `date` is a calendar day in Europe/Warsaw. */
export const wellbeingEntrySchema = z.object({
  date: dayString,
  weightKg: z.number().nullable(),
  mood: moodSchema.nullable(),
  note: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type WellbeingEntry = z.infer<typeof wellbeingEntrySchema>;

const scale = 10 ** WEIGHT_KG_DECIMALS;

/** Path parameter of PUT and DELETE /api/wellbeing/:date. */
export const wellbeingDateSchema = dayString.refine(isCalendarDay, { message: 'invalid_date' });

/** Request body of PUT /api/wellbeing/:date: a weight or a mood is required. */
export const wellbeingInputSchema = z
  .object({
    weightKg: z
      .number()
      .positive()
      .max(WEIGHT_KG_MAX)
      .refine((value) => Math.round(value * scale) / scale === value, { message: 'too_precise' })
      .nullish()
      .transform((value) => value ?? null),
    mood: moodSchema.nullish().transform((value) => value ?? null),
    note: z
      .string()
      .max(500)
      .nullish()
      .transform((value) => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : null;
      }),
  })
  .refine((value) => value.weightKg !== null || value.mood !== null, {
    message: 'weight_or_mood_required',
  });
export type WellbeingInput = z.input<typeof wellbeingInputSchema>;

/** Response of PUT /api/wellbeing/:date. */
export const wellbeingEntryResponseSchema = z.object({
  entry: wellbeingEntrySchema,
  dataVersion: z.number().int(),
});

/** Response of DELETE /api/wellbeing/:date. */
export const wellbeingDeletedResponseSchema = z.object({ dataVersion: z.number().int() });
