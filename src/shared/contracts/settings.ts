import { z } from 'zod';
import { settingsSchema } from './snapshot';

export const THRESHOLD_MAX = 100_000;

export const THRESHOLD_MIN = 0.1;

/** True when the value has at most one decimal place, the precision the database column stores. */
export const hasAtMostOneDecimal = (value: number): boolean =>
  Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

const thresholdValue = z
  .number()
  .min(THRESHOLD_MIN)
  .max(THRESHOLD_MAX)
  .refine(hasAtMostOneDecimal, { message: 'too_many_decimals' });

/** Request body of PUT /api/settings/thresholds: every value is at least 0.1 with one decimal place at most. */
export const thresholdsInputSchema = z.object({
  proteinG: thresholdValue,
  fatG: thresholdValue,
  fiberG: thresholdValue,
  kcal: thresholdValue,
  smallPortionKcal: thresholdValue,
});
export type ThresholdsInput = z.infer<typeof thresholdsInputSchema>;

/** Response of the operations that change settings. */
export const settingsResponseSchema = z.object({
  settings: settingsSchema,
  dataVersion: z.number().int(),
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
