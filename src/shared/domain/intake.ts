import { addDays } from './cookStats';

/** The glass the water button adds until the user sets another size. */
export const DEFAULT_GLASS_ML = 250;

export type IntakeGoals = {
  proteinGoalG: number | null;
  waterGoalMl: number | null;
  glassMl: number;
};

/** No goals (the app never proposes any) and the standard glass. */
export const DEFAULT_GOALS: IntakeGoals = {
  proteinGoalG: null,
  waterGoalMl: null,
  glassMl: DEFAULT_GLASS_ML,
};

/** Entries of one calendar day, oldest first. */
export const entriesOnDay = <T extends { date: string; createdAt: string }>(
  entries: readonly T[],
  day: string,
): T[] =>
  entries
    .filter((entry) => entry.date === day)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Sum of the amounts, without the noise of binary fractions (amounts have one decimal at most). */
export const sumAmounts = (amounts: readonly number[]): number =>
  Math.round(amounts.reduce((total, amount) => total + amount, 0) * 10) / 10;

/** "60" or "12,5": an amount as the counter shows it. */
export const formatAmount = (value: number): string => String(value).replace('.', ',');

export type GoalProgress = {
  /** "60 / 100 g" with a goal, "60 g" without. */
  text: string;
  reached: boolean;
};

/** The state of a counter against its goal; with no goal there is only the sum. */
export function goalProgress(total: number, goal: number | null, unit: string): GoalProgress {
  if (goal === null) return { text: `${formatAmount(total)} ${unit}`, reached: false };
  return {
    text: `${formatAmount(total)} / ${formatAmount(goal)} ${unit}`,
    reached: total >= goal,
  };
}

/** The protein of an entry for a recipe: the protein of one serving times the servings eaten. */
export const proteinOfServings = (proteinPerServingG: number, servings: number): number =>
  Math.round(proteinPerServingG * servings * 10) / 10;

const NUMBER_PATTERN = /^\d+(?:[.,]\d+)?$/;

/** A number typed in a field (comma or dot); null for anything but a positive number. */
export function parsePositiveInput(text: string): number | null {
  const trimmed = text.trim();
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The day before `day`, for the read-only "Poprzedni dzień" view. */
export const previousDay = (day: string): string => addDays(day, -1);
