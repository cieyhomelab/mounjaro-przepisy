import { z } from 'zod';

/** The injection sites, in the fixed order of the rotation (S22). */
export const INJECTION_SITES = [
  'abdomen_left',
  'abdomen_right',
  'thigh_left',
  'thigh_right',
  'arm_left',
  'arm_right',
] as const;
export const injectionSiteSchema = z.enum(INJECTION_SITES);
export type InjectionSite = z.infer<typeof injectionSiteSchema>;

/** The largest dose the journal accepts, in mg; far above any prescription, it only bounds the column. */
export const DOSE_MG_MAX = 1000;
/** Decimal places kept of a dose. */
export const DOSE_MG_DECIMALS = 3;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One injection of the journal. `date` is a calendar day in Europe/Warsaw. */
export const doseEntrySchema = z.object({
  id: z.uuid(),
  date: dayString,
  doseMg: z.number(),
  site: injectionSiteSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type DoseEntry = z.infer<typeof doseEntrySchema>;

const scale = 10 ** DOSE_MG_DECIMALS;

/** Request body of POST /api/dose-entries and PUT /api/dose-entries/:id. */
export const doseInputSchema = z.object({
  date: dayString.refine(
    (value) => {
      const time = Date.parse(`${value}T00:00:00Z`);
      // Dates that roll over (30 February) parse but are not the day that was written.
      return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
    },
    { message: 'invalid_date' },
  ),
  doseMg: z
    .number()
    .positive()
    .max(DOSE_MG_MAX)
    .refine((value) => Math.round(value * scale) / scale === value, { message: 'too_precise' }),
  site: injectionSiteSchema,
  note: z
    .string()
    .max(500)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    }),
});
export type DoseInput = z.input<typeof doseInputSchema>;

/** Response of POST and PUT /api/dose-entries. */
export const doseEntryResponseSchema = z.object({
  entry: doseEntrySchema,
  dataVersion: z.number().int(),
});

/** Response of DELETE /api/dose-entries/:id. */
export const doseDeletedResponseSchema = z.object({ dataVersion: z.number().int() });
