import { MEAL_SLOTS, type MealPlanEntry, type MealSlot } from '../contracts/mealPlan';
import { addDays } from './cookStats';

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Śniadanie',
  lunch: 'Obiad',
  dinner: 'Kolacja',
  snack: 'Przekąska',
};

export type PlannerDay = {
  date: string;
  slots: { slot: MealSlot; entries: MealPlanEntry[] }[];
};

/** The seven days starting at `weekStart` (a Monday), each with its four meals and the entries planned for them. */
export function planWeek(entries: readonly MealPlanEntry[], weekStart: string): PlannerDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      date,
      slots: MEAL_SLOTS.map((slot) => ({
        slot,
        entries: entries
          .filter((entry) => entry.date === date && entry.slot === slot)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      })),
    };
  });
}

/** How many planned meals use the recipe. */
export const plannedCount = (
  entries: readonly Pick<MealPlanEntry, 'recipeId'>[],
  recipeId: string,
) => entries.filter((entry) => entry.recipeId === recipeId).length;

const dayFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "poniedziałek, 12 października" for `2026-10-12`. */
export function formatPlanDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** The Monday given in the address when it is one, else null (any other value is ignored by the planner). */
export function parseWeekParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return new Date(time).getUTCDay() === 1 ? value : null;
}

const WEEKDAY_SHORT = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'] as const;

/** "pon." … "niedz." for a calendar day (`YYYY-MM-DD`). */
export function weekdayShort(day: string): string {
  const index = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return WEEKDAY_SHORT[index] ?? '';
}

/** The day of the month without a leading zero: "5" for `2026-10-05`. */
export const dayOfMonth = (day: string): string => String(Number(day.slice(8, 10)));

// With a day beside it, ICU gives the genitive ("października"); the day itself is cut off.
const monthFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});
const monthName = (day: string) =>
  monthFormat
    .format(new Date(`${day}T00:00:00Z`))
    .replace(/^\d+\s*/, '')
    .trim();

/**
 * The span of the week starting at `weekStart` (a Monday): "12–18 października 2026",
 * "28 września – 4 października 2026" or, across a new year, "28 grudnia 2026 – 3 stycznia 2027".
 */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [startYear, endYear] = [weekStart.slice(0, 4), end.slice(0, 4)];
  const [startMonth, endMonth] = [monthName(weekStart), monthName(end)];
  if (startYear !== endYear) {
    return `${dayOfMonth(weekStart)} ${startMonth} ${startYear} – ${dayOfMonth(end)} ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${dayOfMonth(weekStart)} ${startMonth} – ${dayOfMonth(end)} ${endMonth} ${endYear}`;
  }
  return `${dayOfMonth(weekStart)}–${dayOfMonth(end)} ${endMonth} ${endYear}`;
}

/** "Ten tydzień" for the current week, else its date range. */
export const formatWeekHeading = (weekStart: string, currentWeekStart: string): string =>
  weekStart === currentWeekStart ? 'Ten tydzień' : formatWeekRange(weekStart);

export type PlannedProtein = {
  /** Whole grams planned for the day: protein per serving times planned servings, rounded once. */
  grams: number;
  /** Planned meals left out of the sum because their recipe has no protein value. */
  withoutData: number;
};

/** The protein planned in `entries` (one day), given the protein per serving of each recipe. */
export function plannedProtein(
  entries: readonly Pick<MealPlanEntry, 'recipeId' | 'servings'>[],
  proteinPerServing: ReadonlyMap<string, number | null>,
): PlannedProtein {
  let total = 0;
  let withoutData = 0;
  for (const entry of entries) {
    const perServing = proteinPerServing.get(entry.recipeId) ?? null;
    if (perServing === null) withoutData += 1;
    else total += perServing * entry.servings;
  }
  return { grams: Math.round(total), withoutData };
}

/** "bez 1 przepisu bez danych", "bez 3 przepisów bez danych"; empty when nothing was left out. */
export function withoutDataNote(withoutData: number): string {
  if (withoutData <= 0) return '';
  return `bez ${withoutData} ${withoutData === 1 ? 'przepisu' : 'przepisów'} bez danych`;
}
