import { describe, expect, it } from 'vitest';
import type { Recipe } from '../contracts/recipe';
import {
  DEFAULT_THRESHOLDS,
  applyFilters,
  inOwnCollection,
  buildSearchText,
  formatKcal,
  formatProtein,
  matchesFilter,
  matchesSearch,
  normalizeSearchText,
  sortRecipes,
  type FilterId,
  type Thresholds,
} from './recipeList';

type Values = {
  protein?: number | null;
  kcal?: number | null;
  fat?: number | null;
  fiber?: number | null;
  own?: number | null;
  source?: number | null;
};

const value = (v: number | null | undefined) => ({
  value: v ?? null,
  origin: v == null ? 'none' : 'manual',
});

const recipe = (id: string, createdAt: string, values: Values = {}) =>
  ({
    id,
    createdAt,
    ownRating: values.own ?? null,
    sourceRating: values.source ?? null,
    nutrition: {
      kcal: value(values.kcal),
      proteinG: value(values.protein),
      fatG: value(values.fat),
      fiberG: value(values.fiber),
    },
  }) as unknown as Recipe;

const ids = (recipes: readonly Pick<Recipe, 'id'>[]) => recipes.map((item) => item.id);

describe('sortRecipes', () => {
  it('proteinDesc puts the highest protein first, unknown last, and the later added recipe first on a tie', () => {
    const sorted = sortRecipes(
      [
        recipe('none', '2026-01-04T00:00:00.000Z'),
        recipe('low', '2026-01-01T00:00:00.000Z', { protein: 10 }),
        recipe('tie-old', '2026-01-02T00:00:00.000Z', { protein: 30 }),
        recipe('tie-new', '2026-01-03T00:00:00.000Z', { protein: 30 }),
      ],
      'proteinDesc',
    );

    expect(ids(sorted)).toEqual(['tie-new', 'tie-old', 'low', 'none']);
  });

  it('ownRatingDesc orders by own rating and puts unrated recipes last', () => {
    const sorted = sortRecipes(
      [
        recipe('none', '2026-01-04T00:00:00.000Z'),
        recipe('three', '2026-01-01T00:00:00.000Z', { own: 3 }),
        recipe('five', '2026-01-02T00:00:00.000Z', { own: 5 }),
      ],
      'ownRatingDesc',
    );

    expect(ids(sorted)).toEqual(['five', 'three', 'none']);
  });

  it('sourceRatingDesc orders by the rating from the source and puts unrated recipes last', () => {
    const sorted = sortRecipes(
      [
        recipe('none', '2026-01-04T00:00:00.000Z'),
        recipe('low', '2026-01-01T00:00:00.000Z', { source: 3.5 }),
        recipe('high', '2026-01-02T00:00:00.000Z', { source: 4.8 }),
      ],
      'sourceRatingDesc',
    );

    expect(ids(sorted)).toEqual(['high', 'low', 'none']);
  });

  it('kcalAsc orders by calories ascending, unknown last, later added first on a tie', () => {
    const sorted = sortRecipes(
      [
        recipe('none', '2026-01-04T00:00:00.000Z'),
        recipe('big', '2026-01-01T00:00:00.000Z', { kcal: 600 }),
        recipe('small-old', '2026-01-02T00:00:00.000Z', { kcal: 200 }),
        recipe('small-new', '2026-01-03T00:00:00.000Z', { kcal: 200 }),
      ],
      'kcalAsc',
    );

    expect(ids(sorted)).toEqual(['small-new', 'small-old', 'big', 'none']);
  });

  it('newest puts the latest added recipe first', () => {
    const sorted = sortRecipes(
      [
        recipe('a', '2026-01-01T00:00:00.000Z'),
        recipe('c', '2026-01-03T00:00:00.000Z'),
        recipe('b', '2026-01-02T00:00:00.000Z'),
      ],
      'newest',
    );

    expect(ids(sorted)).toEqual(['c', 'b', 'a']);
  });

  it('does not change the input', () => {
    const input = [
      recipe('a', '2026-01-01T00:00:00.000Z'),
      recipe('b', '2026-01-02T00:00:00.000Z'),
    ];

    sortRecipes(input, 'newest');

    expect(ids(input)).toEqual(['a', 'b']);
  });
});

describe('tolerance, worse-days and own-collection filters', () => {
  const flags = (tolerance: Recipe['tolerance'], worseDays = false, collectionIds: string[] = []) =>
    ({
      id: 'x',
      tolerance,
      worseDays,
      collectionIds,
      ...recipe('x', '2026-01-01T00:00:00.000Z'),
    }) as Recipe;

  it('"Dobrze toleruję" passes only the tolerance "good"', () => {
    expect(matchesFilter(flags('good'), 'toleratedWell', DEFAULT_THRESHOLDS)).toBe(true);
    expect(matchesFilter(flags('medium'), 'toleratedWell', DEFAULT_THRESHOLDS)).toBe(false);
    expect(matchesFilter(flags('bad'), 'toleratedWell', DEFAULT_THRESHOLDS)).toBe(false);
    expect(matchesFilter(flags(null), 'toleratedWell', DEFAULT_THRESHOLDS)).toBe(false);
  });

  it('"Na gorsze dni" passes only tagged recipes', () => {
    expect(matchesFilter(flags(null, true), 'worseDays', DEFAULT_THRESHOLDS)).toBe(true);
    expect(matchesFilter(flags(null, false), 'worseDays', DEFAULT_THRESHOLDS)).toBe(false);
  });

  it('the new filters combine with the nutrition ones', () => {
    const both = { ...recipe('a', '2026-01-01T00:00:00.000Z', { protein: 30 }), tolerance: 'good' };
    const weak = { ...recipe('b', '2026-01-01T00:00:00.000Z', { protein: 5 }), tolerance: 'good' };

    expect(
      ids(
        applyFilters(
          [both, weak] as unknown as Recipe[],
          ['highProtein', 'toleratedWell'],
          DEFAULT_THRESHOLDS,
        ),
      ),
    ).toEqual(['a']);
  });

  it('inOwnCollection keeps the recipes of one collection, or all when none is chosen', () => {
    const list = [flags(null, false, ['c1']), flags(null, false, ['c2']), flags(null)];

    expect(inOwnCollection(list, 'c1')).toHaveLength(1);
    expect(inOwnCollection(list, null)).toHaveLength(3);
  });
});

describe('matchesFilter', () => {
  const at = '2026-01-01T00:00:00.000Z';

  it.each<[FilterId, Values, Values]>([
    ['highProtein', { protein: 25 }, { protein: 24.9 }],
    ['smallPortion', { kcal: 300 }, { kcal: 300.1 }],
    ['light', { fat: 15 }, { fat: 15.1 }],
    ['highFiber', { fiber: 5 }, { fiber: 4.9 }],
    ['lowKcal', { kcal: 400 }, { kcal: 400.1 }],
  ])('%s includes the threshold itself and excludes beyond it', (filter, passing, failing) => {
    expect(matchesFilter(recipe('p', at, passing), filter, DEFAULT_THRESHOLDS)).toBe(true);
    expect(matchesFilter(recipe('f', at, failing), filter, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it.each<FilterId>(['highProtein', 'smallPortion', 'light', 'highFiber', 'lowKcal'])(
    '%s rejects a recipe without the value ("brak danych")',
    (filter) => {
      expect(matchesFilter(recipe('none', at), filter, DEFAULT_THRESHOLDS)).toBe(false);
    },
  );

  it('uses the thresholds it is given', () => {
    const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS, thresholdProteinG: 30 };

    expect(matchesFilter(recipe('a', at, { protein: 28 }), 'highProtein', thresholds)).toBe(false);
    expect(matchesFilter(recipe('b', at, { protein: 30 }), 'highProtein', thresholds)).toBe(true);
  });

  it('smallPortion and lowKcal read the same value with different thresholds', () => {
    const middle = recipe('mid', at, { kcal: 350 });

    expect(matchesFilter(middle, 'smallPortion', DEFAULT_THRESHOLDS)).toBe(false);
    expect(matchesFilter(middle, 'lowKcal', DEFAULT_THRESHOLDS)).toBe(true);
  });
});

describe('applyFilters', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const all = [
    recipe('both', at, { protein: 30, kcal: 250 }),
    recipe('protein-only', at, { protein: 30, kcal: 500 }),
    recipe('kcal-only', at, { protein: 10, kcal: 250 }),
    recipe('neither', at),
  ];

  it('returns everything when no filter is active', () => {
    expect(ids(applyFilters(all, [], DEFAULT_THRESHOLDS))).toEqual(ids(all));
  });

  it('keeps only the recipes that pass all active filters at once', () => {
    const result = applyFilters(all, ['highProtein', 'smallPortion'], DEFAULT_THRESHOLDS);

    expect(ids(result)).toEqual(['both']);
  });
});

describe('search', () => {
  it('normalizes case and Polish letters', () => {
    expect(normalizeSearchText('Łosoś pieczony ZĄĘĆŃÓŹŻ')).toBe('losos pieczony zaecnozz');
  });

  it('finds a recipe by a part of its title without case or diacritics', () => {
    const text = buildSearchText({ title: 'Łosoś pieczony', ingredients: [] });

    expect(matchesSearch(text, 'losos')).toBe(true);
    expect(matchesSearch(text, 'ŁOSOŚ PIE')).toBe(true);
    expect(matchesSearch(text, 'kurczak')).toBe(false);
  });

  it('finds a recipe by an ingredient name or line', () => {
    const text = buildSearchText({
      title: 'Obiad',
      ingredients: [
        {
          quantity: 200,
          unit: 'g',
          name: 'filet z piersi kurczaka',
          originalText: '200 g filetu z piersi kurczaka',
        },
        { quantity: null, unit: null, name: null, originalText: 'szczypta soli morskiej' },
      ],
    });

    expect(matchesSearch(text, 'KURCZAKA')).toBe(true);
    expect(matchesSearch(text, 'soli morskiej')).toBe(true);
    expect(matchesSearch(text, 'ryż')).toBe(false);
  });

  it('does not match across the border between two ingredients', () => {
    const text = buildSearchText({
      title: 'Obiad',
      ingredients: [
        { quantity: null, unit: null, name: null, originalText: 'mąka' },
        { quantity: null, unit: null, name: null, originalText: 'jajko' },
      ],
    });

    expect(matchesSearch(text, 'makajajko')).toBe(false);
  });

  it('matches everything for an empty or blank query', () => {
    const text = buildSearchText({ title: 'Zupa', ingredients: [] });

    expect(matchesSearch(text, '')).toBe(true);
    expect(matchesSearch(text, '   ')).toBe(true);
  });
});

describe('formatting', () => {
  it('shows whole numbers with units and a dash for missing data', () => {
    const known = recipe('a', '2026-01-01T00:00:00.000Z', { protein: 27.6, kcal: 412.4 });
    const unknown = recipe('b', '2026-01-01T00:00:00.000Z');

    expect(formatProtein(known)).toBe('28 g');
    expect(formatKcal(known)).toBe('412 kcal');
    expect(formatProtein(unknown)).toBe('—');
    expect(formatKcal(unknown)).toBe('—');
  });
});
