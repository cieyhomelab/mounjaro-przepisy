import type { WellbeingEntry } from '../contracts/wellbeing';
import { formatCookedOn } from './cookStats';

/** The labels of the mood scale (S24): 1 is "bardzo źle", 5 is "bardzo dobrze". */
export const MOOD_LABELS: Record<number, string> = {
  1: 'bardzo źle',
  2: 'źle',
  3: 'średnio',
  4: 'dobrze',
  5: 'bardzo dobrze',
};

/** The entries of the journal in the order it shows them: newest day first. */
export const sortWellbeingEntries = <T extends Pick<WellbeingEntry, 'date'>>(
  entries: readonly T[],
): T[] => [...entries].sort((a, b) => b.date.localeCompare(a.date));

/** "9 października 2026" for `2026-10-09`. */
export const formatWellbeingDay = formatCookedOn;

/** "82,5" for a weight of 82.5 kg. */
export const formatWeight = (weightKg: number) => String(weightKg).replace('.', ',');

const WEIGHT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

/** The weight typed in the form (comma or dot), or null when it is not a number. */
export function parseWeightInput(text: string): number | null {
  const trimmed = text.trim();
  if (!WEIGHT_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export type ChartPoint = { date: string; weightKg: number; x: number; y: number };
export type WeightChart = {
  points: ChartPoint[];
  /** The weights at the bottom and the top of the plot, for the axis labels. */
  minKg: number;
  maxKg: number;
};

export type ChartBox = { width: number; height: number; padding: number };

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/**
 * The points of the weight chart (S24), oldest day on the left: x follows the calendar days, so a
 * gap between measurements shows as a gap. Null when fewer than two entries carry a weight.
 */
export function weightChart(
  entries: readonly Pick<WellbeingEntry, 'date' | 'weightKg'>[],
  box: ChartBox,
): WeightChart | null {
  const weighed = entries
    .flatMap((entry) =>
      entry.weightKg === null ? [] : [{ date: entry.date, weightKg: entry.weightKg }],
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (weighed.length < 2) return null;
  const weights = weighed.map((entry) => entry.weightKg);
  const minKg = Math.min(...weights);
  const maxKg = Math.max(...weights);
  const first = dayNumber(weighed[0]?.date ?? '');
  const span = dayNumber(weighed[weighed.length - 1]?.date ?? '') - first;
  const innerWidth = box.width - 2 * box.padding;
  const innerHeight = box.height - 2 * box.padding;
  const points = weighed.map(({ date, weightKg }) => ({
    date,
    weightKg,
    x: box.padding + (span === 0 ? 0 : ((dayNumber(date) - first) / span) * innerWidth),
    // Equal weights draw a level line in the middle.
    y:
      maxKg === minKg
        ? box.height / 2
        : box.padding + (1 - (weightKg - minKg) / (maxKg - minKg)) * innerHeight,
  }));
  return { points, minKg, maxKg };
}
