import { describe, expect, it } from 'vitest';
import type { Recipe } from '../contracts/recipe';
import { formatKcal, formatProtein, sortByProteinDesc } from './recipeList';

const recipe = (id: string, protein: number | null, createdAt: string, kcal: number | null = 300) =>
  ({
    id,
    createdAt,
    nutrition: {
      kcal: { value: kcal, origin: kcal === null ? 'none' : 'manual' },
      proteinG: { value: protein, origin: protein === null ? 'none' : 'manual' },
      fatG: { value: null, origin: 'none' },
      fiberG: { value: null, origin: 'none' },
    },
  }) as unknown as Recipe;

describe('sortByProteinDesc', () => {
  it('puts the highest protein first, unknown last, and the later added recipe first on a tie', () => {
    const sorted = sortByProteinDesc([
      recipe('none', null, '2026-01-04T00:00:00.000Z'),
      recipe('low', 10, '2026-01-01T00:00:00.000Z'),
      recipe('tie-old', 30, '2026-01-02T00:00:00.000Z'),
      recipe('tie-new', 30, '2026-01-03T00:00:00.000Z'),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['tie-new', 'tie-old', 'low', 'none']);
  });
});

describe('formatting', () => {
  it('shows whole numbers with units and a dash for missing data', () => {
    const known = recipe('a', 27.6, '2026-01-01T00:00:00.000Z', 412.4);
    const unknown = recipe('b', null, '2026-01-01T00:00:00.000Z', null);

    expect(formatProtein(known)).toBe('28 g');
    expect(formatKcal(known)).toBe('412 kcal');
    expect(formatProtein(unknown)).toBe('—');
    expect(formatKcal(unknown)).toBe('—');
  });
});
