import { describe, expect, it } from 'vitest';
import {
  entriesOnDay,
  goalProgress,
  parsePositiveInput,
  previousDay,
  proteinOfServings,
  sumAmounts,
} from './intake';

describe('S25: counters', () => {
  it('multiplies the protein of a serving by the servings eaten', () => {
    expect(proteinOfServings(30, 1)).toBe(30);
    expect(proteinOfServings(30, 0.5)).toBe(15);
    expect(proteinOfServings(17.3, 1.5)).toBe(26);
  });

  it('sums amounts without float noise', () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([])).toBe(0);
  });

  it('shows the sum against the goal and flags a reached goal', () => {
    expect(goalProgress(60, 100, 'g')).toEqual({ text: '60 / 100 g', reached: false });
    expect(goalProgress(100, 100, 'g').reached).toBe(true);
    expect(goalProgress(120.5, 100, 'g')).toEqual({ text: '120,5 / 100 g', reached: true });
    expect(goalProgress(500, null, 'ml')).toEqual({ text: '500 ml', reached: false });
  });

  it('accepts only positive numbers from a field', () => {
    expect(parsePositiveInput('20')).toBe(20);
    expect(parsePositiveInput(' 12,5 ')).toBe(12.5);
    for (const bad of ['', '0', '-5', 'abc', '1e3', '1,2,3'])
      expect(parsePositiveInput(bad), bad).toBeNull();
  });

  it('picks the entries of a day and finds the day before', () => {
    const entries = [
      { date: '2026-10-14', createdAt: '2026-10-14T10:00:00Z' },
      { date: '2026-10-13', createdAt: '2026-10-13T10:00:00Z' },
      { date: '2026-10-14', createdAt: '2026-10-14T08:00:00Z' },
    ];
    expect(entriesOnDay(entries, '2026-10-14').map((e) => e.createdAt)).toEqual([
      '2026-10-14T08:00:00Z',
      '2026-10-14T10:00:00Z',
    ]);
    expect(previousDay('2026-10-01')).toBe('2026-09-30');
  });
});
