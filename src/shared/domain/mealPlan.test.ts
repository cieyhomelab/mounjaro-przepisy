import { describe, expect, it } from 'vitest';
import type { MealPlanEntry } from '../contracts/mealPlan';
import {
  dayOfMonth,
  formatPlanDay,
  formatWeekHeading,
  formatWeekRange,
  parseWeekParam,
  plannedCount,
  plannedProtein,
  planWeek,
  weekdayShort,
  withoutDataNote,
} from './mealPlan';

const entry = (overrides: Partial<MealPlanEntry>): MealPlanEntry => ({
  id: '00000000-0000-4000-8000-000000000001',
  date: '2026-10-12',
  slot: 'lunch',
  recipeId: '00000000-0000-4000-8000-0000000000a1',
  servings: 1,
  createdAt: '2026-10-10T10:00:00.000Z',
  ...overrides,
});

describe('planWeek', () => {
  it('gives seven days from Monday, each with four meals', () => {
    const week = planWeek([], '2026-10-12');
    expect(week.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(week[0]?.slots.map((slot) => slot.slot)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
    ]);
  });

  it('puts entries in their meal, oldest first, and leaves out other weeks', () => {
    const first = entry({ id: '00000000-0000-4000-8000-000000000001' });
    const second = entry({
      id: '00000000-0000-4000-8000-000000000002',
      createdAt: '2026-10-10T11:00:00.000Z',
    });
    const other = entry({ id: '00000000-0000-4000-8000-000000000003', date: '2026-10-19' });
    const week = planWeek([second, other, first], '2026-10-12');
    expect(week[0]?.slots[1]?.entries.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(week.flatMap((day) => day.slots).flatMap((slot) => slot.entries)).toHaveLength(2);
  });
});

describe('plannedCount', () => {
  it('counts meals of one recipe', () => {
    expect(plannedCount([entry({}), entry({ id: 'x' })], entry({}).recipeId)).toBe(2);
    expect(plannedCount([entry({})], 'other')).toBe(0);
  });
});

describe('parseWeekParam', () => {
  it('accepts a Monday only', () => {
    expect(parseWeekParam('2026-10-12')).toBe('2026-10-12');
    expect(parseWeekParam('2026-10-13')).toBeNull();
    expect(parseWeekParam('2026-02-30')).toBeNull();
    expect(parseWeekParam('abc')).toBeNull();
    expect(parseWeekParam(null)).toBeNull();
  });
});

describe('formatPlanDay', () => {
  it('names the weekday and the date in Polish', () => {
    expect(formatPlanDay('2026-10-12')).toBe('poniedziałek, 12 października');
  });
});

describe('weekdayShort and dayOfMonth', () => {
  it('abbreviates the weekday and drops the leading zero', () => {
    const days = [
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ];
    expect(days.map(weekdayShort)).toEqual(['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.']);
    expect(dayOfMonth('2026-10-05')).toBe('5');
    expect(dayOfMonth('2026-10-18')).toBe('18');
  });
});

describe('formatWeekRange', () => {
  it('writes one month once', () => {
    expect(formatWeekRange('2026-10-12')).toBe('12–18 października 2026');
  });

  it('writes both months when the week crosses a month', () => {
    expect(formatWeekRange('2026-09-28')).toBe('28 września – 4 października 2026');
  });

  it('writes both years when the week crosses a new year', () => {
    expect(formatWeekRange('2026-12-28')).toBe('28 grudnia 2026 – 3 stycznia 2027');
  });
});

describe('formatWeekHeading', () => {
  it('says "Ten tydzień" for the current week and the range for any other', () => {
    expect(formatWeekHeading('2026-10-12', '2026-10-12')).toBe('Ten tydzień');
    expect(formatWeekHeading('2026-10-19', '2026-10-12')).toBe('19–25 października 2026');
  });
});

describe('plannedProtein', () => {
  const protein = new Map<string, number | null>([
    ['a', 30],
    ['b', 20],
    ['c', 25],
    ['none', null],
  ]);

  it('is zero for an empty day', () => {
    expect(plannedProtein([], protein)).toEqual({ grams: 0, withoutData: 0 });
  });

  it('multiplies protein per serving by the planned servings', () => {
    const entries = [
      { recipeId: 'a', servings: 2 },
      { recipeId: 'b', servings: 1 },
    ];
    expect(plannedProtein(entries, protein)).toEqual({ grams: 80, withoutData: 0 });
  });

  it('rounds the sum to whole grams', () => {
    expect(plannedProtein([{ recipeId: 'c', servings: 0.5 }], protein).grams).toBe(13);
    expect(
      plannedProtein(
        [
          { recipeId: 'c', servings: 0.5 },
          { recipeId: 'c', servings: 0.5 },
        ],
        protein,
      ).grams,
    ).toBe(25);
  });

  it('leaves out recipes without data, and unknown recipes, and counts them', () => {
    const entries = [
      { recipeId: 'a', servings: 1 },
      { recipeId: 'none', servings: 3 },
      { recipeId: 'gone', servings: 1 },
    ];
    expect(plannedProtein(entries, protein)).toEqual({ grams: 30, withoutData: 2 });
  });
});

describe('withoutDataNote', () => {
  it('declines the noun for one and for more recipes', () => {
    expect(withoutDataNote(0)).toBe('');
    expect(withoutDataNote(1)).toBe('bez 1 przepisu bez danych');
    expect(withoutDataNote(2)).toBe('bez 2 przepisów bez danych');
    expect(withoutDataNote(5)).toBe('bez 5 przepisów bez danych');
  });
});
