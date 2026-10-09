import { z } from 'zod';
import { settingsSchema } from './snapshot';

export const THRESHOLD_MAX = 100_000;

const thresholdValue = z.number().positive().max(THRESHOLD_MAX);

/** Request body of PUT /api/settings/thresholds: every value is a number greater than zero. */
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
