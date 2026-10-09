import type { CookEvent } from '../contracts/cookEvent';

export const WARSAW_TIME_ZONE = 'Europe/Warsaw';
export const HISTORY_WEEKS = 8;

const warsawDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: WARSAW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar day (`YYYY-MM-DD`) it is in Warsaw at `instant`. */
export function warsawDate(instant: Date): string {
  return warsawDay.format(instant);
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday (`YYYY-MM-DD`) of the week, Monday to Sunday, that contains `day`. */
export function weekStart(day: string): string {
  const ms = toUtc(day);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return fromUtc(ms - sinceMonday * DAY_MS);
}

/** `day` moved by a whole number of days. */
export function addDays(day: string, days: number): string {
  return fromUtc(toUtc(day) + days * DAY_MS);
}

export type WeekCount = { weekStart: string; count: number };

/** Number of cookings in the week that contains `today`; history of deleted recipes counts too. */
export function cookedThisWeek(events: readonly Pick<CookEvent, 'cookedOn'>[], today: string) {
  const start = weekStart(today);
  const end = addDays(start, 6);
  return events.filter((event) => event.cookedOn >= start && event.cookedOn <= end).length;
}

/** Cookings per week for the current week and the seven before it, newest week first. */
export function weeklyHistory(
  events: readonly Pick<CookEvent, 'cookedOn'>[],
  today: string,
  weeks: number = HISTORY_WEEKS,
): WeekCount[] {
  const current = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(current, -7 * index);
    const end = addDays(start, 6);
    const count = events.filter((event) => event.cookedOn >= start && event.cookedOn <= end).length;
    return { weekStart: start, count };
  });
}

export type RecipeCookStats = { count: number; lastCookedOn: string | null };

/** How many times a recipe was cooked and the day of the latest cooking. */
export function recipeCookStats(
  events: readonly Pick<CookEvent, 'recipeId' | 'cookedOn'>[],
  recipeId: string,
): RecipeCookStats {
  let count = 0;
  let lastCookedOn: string | null = null;
  for (const event of events) {
    if (event.recipeId !== recipeId) continue;
    count += 1;
    if (lastCookedOn === null || event.cookedOn > lastCookedOn) lastCookedOn = event.cookedOn;
  }
  return { count, lastCookedOn };
}

const longDate = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "9 października 2026" for `2026-10-09`. */
export function formatCookedOn(day: string): string {
  return longDate.format(new Date(toUtc(day)));
}
