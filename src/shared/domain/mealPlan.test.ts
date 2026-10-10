import { describe, expect, it } from 'vitest';
import type { MealPlanEntry } from '../contracts/mealPlan';
import { formatPlanDay, parseWeekParam, plannedCount, planWeek } from './mealPlan';

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
