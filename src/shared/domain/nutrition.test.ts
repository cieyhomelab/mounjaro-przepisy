import { describe, expect, it } from 'vitest';
import testSet from '../../../tests/fixtures/nutrition/ingredients.test-set.json';
import table from '../nutrition/ingredients.pl.json';
import { parseIngredientLine } from './ingredientLine';
import {
  createNutritionLookup,
  estimateNutrition,
  normalizeIngredientName,
  resolveNutrition,
  type IngredientNutrition,
  type NutritionValues,
} from './nutrition';

const lines = (texts: string[]) => texts.map(parseIngredientLine);
const fixtureLookup = createNutritionLookup(testSet.table);
const empty: NutritionValues = { kcal: null, proteinG: null, fatG: null, fiberG: null };

describe('normalizeIngredientName', () => {
  it('ignores case, Polish diacritics and extra spaces', () => {
    expect(normalizeIngredientName('  Pierś  Z Kurczaka ')).toBe('piers z kurczaka');
    expect(normalizeIngredientName('łyżka żółtka')).toBe('lyzka zoltka');
  });
});

describe('estimateNutrition', () => {
  it('S5: the reference recipe equals the ingredient sum divided by the servings (±1)', () => {
    const { referenceRecipe } = testSet;
    const estimate = estimateNutrition(
      lines(referenceRecipe.ingredients),
      referenceRecipe.servings,
      fixtureLookup,
    );
    expect(estimate.unrecognized).toEqual([]);
    for (const key of ['kcal', 'proteinG', 'fatG', 'fiberG'] as const) {
      expect(
        Math.abs((estimate.values[key] ?? NaN) - referenceRecipe.expectedPerServing[key]),
      ).toBeLessThanOrEqual(1);
    }
  });

  it('lists lines it cannot count and leaves them out of the sum', () => {
    const estimate = estimateNutrition(
      lines([
        '200 g piersi z kurczaka',
        '3 łyżki sosu tajemniczego',
        '2-3 ząbki czosnku',
        'pęczek rzeczy',
      ]),
      1,
      fixtureLookup,
    );
    expect(estimate.unrecognized).toEqual([
      '3 łyżki sosu tajemniczego',
      '2-3 ząbki czosnku',
      'pęczek rzeczy',
    ]);
    expect(estimate.values.kcal).toBe(240);
  });

  it('gives no values when no ingredient is recognized', () => {
    const estimate = estimateNutrition(
      lines(['2 kostki dziwnego sera', 'sól do smaku']),
      2,
      fixtureLookup,
    );
    expect(estimate.values).toEqual(empty);
    expect(estimate.unrecognized).toEqual(['2 kostki dziwnego sera']);
  });

  it('does not list salt without a quantity but does not count it as recognized either', () => {
    const estimate = estimateNutrition(lines(['sól do smaku', 'sól']), 1, fixtureLookup);
    expect(estimate).toEqual({ values: empty, unrecognized: [] });
  });

  it('turns millilitres, spoons, glasses and pieces into grams', () => {
    const grams = (text: string) => estimateNutrition(lines([text]), 1, fixtureLookup).values.fatG;
    expect(grams('100 ml oliwy z oliwek')).toBe(92);
    expect(grams('1 łyżka oliwy z oliwek')).toBe(14);
    expect(grams('1 szklanka oliwy z oliwek')).toBe(230);
    expect(grams('1 kg ryżu')).toBe(7);
    expect(grams('10 dag ryżu')).toBe(1);
  });

  it('matches names exactly after normalization and ignores a trailing remark', () => {
    const kcal = (text: string) => estimateNutrition(lines([text]), 1, fixtureLookup).values.kcal;
    expect(kcal('100 g PIERSI Z KURCZAKA')).toBe(120);
    expect(kcal('100 g piersi z kurczaka, pokrojonej w kostkę')).toBe(120);
    expect(kcal('100 g piersi z kurczaka (bez skóry)')).toBe(120);
    expect(kcal('100 g piersi kurczą')).toBeNull();
  });

  it('is not shifted by the order or the number of servings', () => {
    const one = estimateNutrition(lines(['400 g piersi z kurczaka']), 1, fixtureLookup);
    const four = estimateNutrition(lines(['400 g piersi z kurczaka']), 4, fixtureLookup);
    expect(one.values.proteinG).toBe(90);
    expect(four.values.proteinG).toBe(23);
  });
});

describe('resolveNutrition', () => {
  const estimate: NutritionValues = { kcal: 400, proteinG: 30, fatG: 12, fiberG: 4 };

  it('S5: a manual value wins over the source and the estimate', () => {
    const result = resolveNutrition({
      manual: { kcal: 321.4 },
      source: { kcal: 240, proteinG: 26 },
      estimate,
    });
    expect(result.kcal).toEqual({ value: 321, origin: 'manual' });
  });

  it('S5: values the source states are "source", the rest is "estimated"', () => {
    const result = resolveNutrition({
      manual: {},
      source: { kcal: 240, proteinG: 26, fatG: null },
      estimate,
    });
    expect(result.kcal).toEqual({ value: 240, origin: 'source' });
    expect(result.proteinG).toEqual({ value: 26, origin: 'source' });
    expect(result.fatG).toEqual({ value: 12, origin: 'estimated' });
    expect(result.fiberG).toEqual({ value: 4, origin: 'estimated' });
  });

  it('S5: without any data the value is empty with origin "none"', () => {
    const result = resolveNutrition({ manual: { fatG: null }, source: null, estimate: empty });
    expect(result.fatG).toEqual({ value: null, origin: 'none' });
    expect(result.kcal).toEqual({ value: null, origin: 'none' });
  });

  it('keeps a typed zero as a manual value', () => {
    const result = resolveNutrition({ manual: { fiberG: 0 }, source: null, estimate });
    expect(result.fiberG).toEqual({ value: 0, origin: 'manual' });
  });
});

describe('ingredient table', () => {
  const entries = table as IngredientNutrition[];

  it('has at least 300 ingredients', () => {
    expect(entries.length).toBeGreaterThanOrEqual(300);
  });

  it('has no repeated names or synonyms', () => {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      for (const name of [entry.name, ...entry.synonyms]) {
        const key = normalizeIngredientName(name);
        expect(seen.get(key), `"${name}" is also used by "${seen.get(key)}"`).toBeUndefined();
        seen.set(key, entry.name);
      }
    }
  });

  it('has plausible, non-negative values per 100 g in known units', () => {
    const units = new Set([
      'sztuka',
      'ząbek',
      'plaster',
      'puszka',
      'garść',
      'pęczek',
      'kostka',
      'szczypta',
      'opakowanie',
    ]);
    for (const entry of entries) {
      for (const key of ['kcal', 'proteinG', 'fatG', 'fiberG'] as const) {
        expect(entry.per100g[key], `${entry.name} ${key}`).toBeGreaterThanOrEqual(0);
      }
      expect(entry.per100g.kcal, entry.name).toBeLessThanOrEqual(910);
      expect(entry.per100g.proteinG + entry.per100g.fatG, entry.name).toBeLessThanOrEqual(100);
      if (entry.density !== undefined) expect(entry.density, entry.name).toBeGreaterThan(0);
      for (const [unit, grams] of Object.entries(entry.unitGrams ?? {})) {
        expect(units.has(unit), `${entry.name}: unit ${unit}`).toBe(true);
        expect(grams, `${entry.name}: ${unit}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the test set equal to the real table', () => {
    for (const row of testSet.table) {
      const real = entries.find((entry) => entry.name === row.name);
      expect(real, row.name).toBeDefined();
      expect(row.per100g, row.name).toEqual(real?.per100g);
      expect(row.unitGrams ?? null, row.name).toEqual(real?.unitGrams ?? null);
      expect(row.density ?? null, row.name).toEqual(real?.density ?? null);
    }
  });

  it('S5: the reference recipe gets the same result from the real table', () => {
    const { referenceRecipe } = testSet;
    const estimate = estimateNutrition(
      lines(referenceRecipe.ingredients),
      referenceRecipe.servings,
      createNutritionLookup(entries),
    );
    expect(estimate.unrecognized).toEqual([]);
    expect(estimate.values).toEqual(referenceRecipe.expectedPerServing);
  });
});
