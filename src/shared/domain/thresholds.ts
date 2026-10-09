import { THRESHOLD_MAX, thresholdsInputSchema, type ThresholdsInput } from '../contracts/settings';
import { parseDecimalText } from './recipeForm';

export const THRESHOLD_FIELDS = ['proteinG', 'fatG', 'fiberG', 'kcal', 'smallPortionKcal'] as const;
export type ThresholdField = (typeof THRESHOLD_FIELDS)[number];

export type ThresholdsFormValues = Record<ThresholdField, string>;

export type ThresholdsFormResult =
  | { ok: true; input: ThresholdsInput }
  | { ok: false; errors: Partial<Record<ThresholdField, string>> };

/** Checks the five texts typed in "Progi filtrów": each must be a number greater than zero. */
export function validateThresholdsForm(values: ThresholdsFormValues): ThresholdsFormResult {
  const errors: Partial<Record<ThresholdField, string>> = {};
  const numbers: Partial<Record<ThresholdField, number>> = {};
  for (const field of THRESHOLD_FIELDS) {
    const parsed = parseDecimalText(values[field]);
    if (parsed === undefined || !Number.isFinite(parsed)) errors[field] = 'Podaj liczbę.';
    else if (parsed <= 0) errors[field] = 'Podaj liczbę większą od zera.';
    else if (parsed > THRESHOLD_MAX) errors[field] = 'Ta liczba jest za duża.';
    else numbers[field] = parsed;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: thresholdsInputSchema.parse(numbers) };
}
