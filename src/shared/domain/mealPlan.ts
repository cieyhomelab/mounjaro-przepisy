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
