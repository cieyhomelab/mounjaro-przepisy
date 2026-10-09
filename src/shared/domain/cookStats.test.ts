import { describe, expect, it } from 'vitest';
import {
  addDays,
  cookedThisWeek,
  formatCookedOn,
  recipeCookStats,
  warsawDate,
  weekStart,
  weeklyHistory,
} from './cookStats';

const on = (cookedOn: string, recipeId: string | null = 'r1') => ({ cookedOn, recipeId });

describe('warsawDate', () => {
  it('uses the Warsaw calendar day, not the UTC one', () => {
    // 22:30 UTC on Sunday is already Monday 00:30 in Warsaw during summer time (UTC+2).
    expect(warsawDate(new Date('2026-10-18T22:30:00Z'))).toBe('2026-10-19');
    expect(warsawDate(new Date('2026-10-18T21:30:00Z'))).toBe('2026-10-18');
  });

  it('follows the winter offset (UTC+1) after the clocks change', () => {
    expect(warsawDate(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
    expect(warsawDate(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-01');
  });
});

describe('weekStart', () => {
  it.each([
    ['2026-10-19', '2026-10-19'],
    ['2026-10-20', '2026-10-19'],
    ['2026-10-25', '2026-10-19'],
    ['2026-10-26', '2026-10-26'],
    ['2026-01-01', '2025-12-29'],
  ])('the week of %s starts on Monday %s', (day, monday) => {
    expect(weekStart(day)).toBe(monday);
  });
});

describe('cookedThisWeek', () => {
  const events = [on('2026-10-18'), on('2026-10-19'), on('2026-10-25'), on('2026-10-26')];

  it('counts Monday to Sunday of the current week only', () => {
    expect(cookedThisWeek(events, '2026-10-21')).toBe(2);
  });

  it('counts the Sunday of the week and not the next Monday', () => {
    expect(cookedThisWeek(events, '2026-10-25')).toBe(2);
    expect(cookedThisWeek(events, '2026-10-18')).toBe(1);
  });

  it('is 0 in a week without cookings', () => {
    expect(cookedThisWeek(events, '2026-11-10')).toBe(0);
  });

  it('counts cookings whose recipe was deleted', () => {
    expect(cookedThisWeek([on('2026-10-20', null)], '2026-10-20')).toBe(1);
  });
});

describe('weeklyHistory', () => {
  it('lists the current week and the seven before it, newest first', () => {
    const history = weeklyHistory([on('2026-10-20'), on('2026-09-01')], '2026-10-21');

    expect(history).toHaveLength(8);
    expect(history[0]).toEqual({ weekStart: '2026-10-19', count: 1 });
    expect(history[7]?.weekStart).toBe('2026-08-31');
    expect(history[7]?.count).toBe(1);
    expect(history.slice(1, 7).every((week) => week.count === 0)).toBe(true);
  });

  it('leaves out cookings older than eight weeks', () => {
    const history = weeklyHistory([on('2026-08-30')], '2026-10-21');

    expect(history.reduce((sum, week) => sum + week.count, 0)).toBe(0);
  });
});

describe('recipeCookStats', () => {
  it('counts the cookings of one recipe and finds the latest day', () => {
    const stats = recipeCookStats(
      [on('2026-10-01'), on('2026-10-09'), on('2026-10-05'), on('2026-10-10', 'other')],
      'r1',
    );

    expect(stats).toEqual({ count: 3, lastCookedOn: '2026-10-09' });
  });

  it('has no last day for a recipe never cooked', () => {
    expect(recipeCookStats([], 'r1')).toEqual({ count: 0, lastCookedOn: null });
  });
});

describe('dates', () => {
  it('addDays crosses month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formatCookedOn writes a Polish long date', () => {
    expect(formatCookedOn('2026-10-09')).toBe('9 października 2026');
  });
});
