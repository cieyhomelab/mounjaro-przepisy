import type { Ingredient, NutritionOrigin, SourceNutrition } from '../contracts/recipe';

/** The four values every recipe has, per serving. */
export const NUTRITION_KEYS = ['kcal', 'proteinG', 'fatG', 'fiberG'] as const;
export type NutritionKey = (typeof NUTRITION_KEYS)[number];
export type NutritionValues = Record<NutritionKey, number | null>;

/** One row of the ingredient table (`src/shared/nutrition/ingredients.pl.json`). */
export type IngredientNutrition = {
  name: string;
  synonyms: string[];
  /** Per 100 g. */
  per100g: Record<NutritionKey, number>;
  /** Grams per millilitre; lets millilitres, litres, spoons and glasses be turned into grams. */
  density?: number;
  /** Grams of one piece of a counted unit ("sztuka", "ząbek", "plaster", "puszka", …). */
  unitGrams?: Record<string, number>;
  /** Adds nothing worth counting (salt, water): a line without quantity is not "unrecognized". */
  negligible?: boolean;
};

/** Millilitres in the volume units a recipe line may use. */
const VOLUME_ML: Record<string, number> = { ml: 1, l: 1000, łyżka: 15, łyżeczka: 5, szklanka: 250 };
const MASS_G: Record<string, number> = { g: 1, dag: 10, kg: 1000 };

/** Lower case, no diacritics, single spaces: the form in which names are compared. */
export function normalizeIngredientName(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name without a trailing remark: "cebula, pokrojona", "cebula (duża)", "sól do smaku". */
function bareName(name: string): string {
  return name
    .replace(/\s*[(,].*$/, '')
    .replace(/\s+do\s+(?:smaku|posypania|podania|dekoracji|smażenia|natarcia)$/i, '')
    .trim();
}

export type NutritionLookup = (name: string) => IngredientNutrition | undefined;

/** Exact match on the normalized name or one of its synonyms; no approximate matching. */
export function createNutritionLookup(table: readonly IngredientNutrition[]): NutritionLookup {
  const byName = new Map<string, IngredientNutrition>();
  for (const entry of table) {
    for (const name of [entry.name, ...entry.synonyms]) {
      const key = normalizeIngredientName(name);
      if (!byName.has(key)) byName.set(key, entry);
    }
  }
  return (name) => byName.get(normalizeIngredientName(bareName(name)));
}

/** Mass of the ingredient in grams, or null when its unit cannot be turned into grams. */
function gramsOf(ingredient: Ingredient, entry: IngredientNutrition): number | null {
  const quantity = ingredient.quantity;
  if (quantity === null) return null;
  const unit = ingredient.unit ?? 'sztuka';
  const mass = MASS_G[unit];
  if (mass !== undefined) return quantity * mass;
  const piece = entry.unitGrams?.[unit];
  if (piece !== undefined) return quantity * piece;
  const volume = VOLUME_ML[unit];
  if (volume !== undefined && entry.density !== undefined) return quantity * volume * entry.density;
  return null;
}

export type NutritionEstimate = {
  /** Per serving, whole numbers; null when no ingredient could be counted. */
  values: NutritionValues;
  /** Ingredient lines (their original text) that were left out of the sum. */
  unrecognized: string[];
};

/**
 * Estimates the nutrition per serving from the ingredient lines: the sum of the recognized
 * ingredients divided by the number of servings. Lines that match nothing, have no quantity or
 * a unit that cannot be turned into grams are listed in `unrecognized` and not counted.
 */
export function estimateNutrition(
  ingredients: readonly Ingredient[],
  servings: number,
  lookup: NutritionLookup,
): NutritionEstimate {
  const total: Record<NutritionKey, number> = { kcal: 0, proteinG: 0, fatG: 0, fiberG: 0 };
  const unrecognized: string[] = [];
  let counted = 0;
  for (const ingredient of ingredients) {
    const entry = ingredient.name ? lookup(ingredient.name) : undefined;
    if (!entry) {
      unrecognized.push(ingredient.originalText);
      continue;
    }
    const grams = gramsOf(ingredient, entry);
    if (grams === null) {
      if (!entry.negligible) unrecognized.push(ingredient.originalText);
      continue;
    }
    if (!entry.negligible) counted += 1;
    for (const key of NUTRITION_KEYS) total[key] += (grams / 100) * entry.per100g[key];
  }
  const perServing = (key: NutritionKey) =>
    counted === 0 || servings <= 0 ? null : Math.round(total[key] / servings);
  return {
    values: {
      kcal: perServing('kcal'),
      proteinG: perServing('proteinG'),
      fatG: perServing('fatG'),
      fiberG: perServing('fiberG'),
    },
    unrecognized,
  };
}

export type ResolvedNutrition = Record<NutritionKey, { value: number | null; origin: NutritionOrigin }>;

const store = (key: NutritionKey, value: number) =>
  key === 'kcal' ? Math.round(value) : Math.round(value * 10) / 10;

/**
 * The origin rule of S5, for each value on its own: a value typed by the user is "manual"; else
 * a value the source page stated is "source"; else the estimate from the ingredients is
 * "estimated"; when nothing is known the value is empty with origin "none".
 */
export function resolveNutrition(inputs: {
  manual: Partial<Record<NutritionKey, number | null | undefined>>;
  source: SourceNutrition | null | undefined;
  estimate: NutritionValues;
}): ResolvedNutrition {
  const resolve = (key: NutritionKey): ResolvedNutrition[NutritionKey] => {
    const manual = inputs.manual[key];
    if (typeof manual === 'number') return { value: store(key, manual), origin: 'manual' };
    const source = inputs.source?.[key];
    if (typeof source === 'number') return { value: store(key, source), origin: 'source' };
    const estimate = inputs.estimate[key];
    if (estimate !== null) return { value: estimate, origin: 'estimated' };
    return { value: null, origin: 'none' };
  };
  return {
    kcal: resolve('kcal'),
    proteinG: resolve('proteinG'),
    fatG: resolve('fatG'),
    fiberG: resolve('fiberG'),
  };
}

/** Polish labels of the origins, as shown next to a value. */
export const ORIGIN_LABELS: Record<NutritionOrigin, string> = {
  source: 'ze źródła',
  estimated: 'szacunkowe',
  manual: 'wpisane ręcznie',
  none: 'brak danych',
};
