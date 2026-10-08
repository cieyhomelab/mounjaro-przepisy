import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { SourceNutrition } from '../../shared/contracts/recipe';
import { SERVINGS_MAX, SERVINGS_MIN, SERVINGS_STEP } from '../../shared/contracts/recipe';

/** What a recipe page says, as far as it could be read. Absent fields are null or empty. */
export type ParsedRecipe = {
  title: string | null;
  /** Address of the photo, absolute. */
  imageUrl: string | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  /** Scale 0–5. */
  rating: number | null;
  ratingCount: number | null;
  nutrition: SourceNutrition | null;
  siteName: string | null;
  /** True when the page carries a schema.org Recipe (JSON-LD or microdata). */
  hasRecipeData: boolean;
};

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (value: Json): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Text of a value that may be a string, a number or an object with a text-like field. */
function textOf(value: Json): string | null {
  if (typeof value === 'string') return clean(value) || null;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (isObj(value)) return textOf(value.text ?? value.name ?? value['@value']);
  return null;
}

/** A number from "4,5", "350 kcal", 4.5 or "4.5"; null when there is none. */
function numberOf(value: Json): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return numberOf(value[0]);
  if (typeof value !== 'string') return null;
  const match = /\d+(?:[.,]\d+)?/.exec(value);
  return match ? Number(match[0].replace(',', '.')) : null;
}

const isType = (node: Obj, type: string) => {
  const declared = node['@type'];
  const types = Array.isArray(declared) ? declared : [declared];
  return types.some((t) => typeof t === 'string' && t.split('/').pop() === type);
};

/** Every object of the JSON-LD document with the given type, searching arrays and @graph. */
function collect(node: Json, type: string, found: Obj[] = []): Obj[] {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, type, found);
  } else if (isObj(node)) {
    if (isType(node, type)) found.push(node);
    collect(node['@graph'], type, found);
  }
  return found;
}

function absolute(address: string | null, base: string): string | null {
  if (!address) return null;
  try {
    const url = new URL(address, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function imageOf(value: Json): string | null {
  if (typeof value === 'string') return value || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageOf(item);
      if (found) return found;
    }
    return null;
  }
  if (isObj(value)) return imageOf(value.url ?? value.contentUrl);
  return null;
}

/** Servings from "4", "4 porcje", ["4", "4 porcje"]; only values the app can store. */
export function parseServings(value: Json): number | null {
  const first: Json = Array.isArray(value)
    ? (value as Json[]).find((v) => numberOf(v) !== null)
    : value;
  const number = numberOf(first);
  if (number === null || number < SERVINGS_MIN || number > SERVINGS_MAX) return null;
  return Number.isInteger(number / SERVINGS_STEP) ? number : null;
}

/** Rating on the 0–5 scale from a schema.org AggregateRating (the best rating defaults to 5). */
export function parseRating(value: Json): { rating: number | null; count: number | null } {
  const node: Json = Array.isArray(value) ? (value as Json[])[0] : value;
  if (!isObj(node)) return { rating: null, count: null };
  const rating = numberOf(node.ratingValue);
  const best = numberOf(node.bestRating) ?? 5;
  const count = numberOf(node.ratingCount) ?? numberOf(node.reviewCount);
  const scaled =
    rating === null || best <= 0 ? null : Math.min(5, Math.max(0, (rating / best) * 5));
  return {
    rating: scaled === null ? null : Math.round(scaled * 100) / 100,
    count: count !== null && Number.isInteger(count) && count >= 0 ? count : null,
  };
}

function parseSteps(value: Json): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n+/)
      .map(clean)
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(parseSteps);
  if (isObj(value)) {
    if (value.itemListElement !== undefined) return parseSteps(value.itemListElement);
    const text = textOf(value.text ?? value.name);
    return text ? [text] : [];
  }
  return [];
}

function parseNutrition(value: Json): SourceNutrition | null {
  if (!isObj(value)) return null;
  const nutrition: SourceNutrition = {
    kcal: numberOf(value.calories),
    proteinG: numberOf(value.proteinContent),
    fatG: numberOf(value.fatContent),
    fiberG: numberOf(value.fiberContent),
  };
  return Object.values(nutrition).some((v) => v !== null && v !== undefined) ? nutrition : null;
}

function fromJsonLd(recipe: Obj, base: string) {
  const ingredients = recipe.recipeIngredient ?? recipe.ingredients;
  const list = Array.isArray(ingredients)
    ? ingredients
    : typeof ingredients === 'string'
      ? [ingredients]
      : [];
  const { rating, count } = parseRating(recipe.aggregateRating);
  return {
    title: textOf(recipe.name ?? recipe.headline),
    imageUrl: absolute(imageOf(recipe.image), base),
    servings: parseServings(recipe.recipeYield),
    ingredients: list.map(textOf).filter((text): text is string => text !== null),
    steps: parseSteps(recipe.recipeInstructions),
    rating,
    ratingCount: count,
    nutrition: parseNutrition(recipe.nutrition),
  };
}

type Microdata = ReturnType<typeof fromJsonLd>;

function fromMicrodata($: cheerio.CheerioAPI, base: string): Microdata | null {
  const scope = $('[itemtype*="schema.org/Recipe"]').first();
  if (scope.length === 0) return null;
  const props = (name: string) => scope.find(`[itemprop="${name}"]`).toArray();
  const valueOf = (element: Element) => {
    const node = $(element);
    return clean(
      node.attr('content') ??
        node.attr('src') ??
        node.attr('href') ??
        (node.is('meta') ? '' : node.text()),
    );
  };
  const first = (name: string) => {
    const element = props(name)[0];
    return element ? valueOf(element) || null : null;
  };
  const rated = scope.find('[itemprop="aggregateRating"]').first();
  const ratingField = (name: string) => {
    const element = rated.find(`[itemprop="${name}"]`)[0];
    return element ? valueOf(element) : undefined;
  };
  const { rating, count } = parseRating(
    rated.length === 0
      ? null
      : {
          ratingValue: ratingField('ratingValue'),
          bestRating: ratingField('bestRating'),
          worstRating: ratingField('worstRating'),
          ratingCount: ratingField('ratingCount'),
          reviewCount: ratingField('reviewCount'),
        },
  );
  const nutritionScope = scope.find('[itemprop="nutrition"]').first();
  const nutritionField = (name: string) => {
    const element = nutritionScope.find(`[itemprop="${name}"]`)[0];
    return element ? valueOf(element) : undefined;
  };
  const instructions = props('recipeInstructions');
  const steps = instructions.flatMap((element) => {
    const items = $(element).find('[itemprop="itemListElement"], li').toArray();
    return (items.length > 0 ? items : [element]).flatMap((item) => parseSteps(valueOf(item)));
  });
  return {
    title: first('name'),
    imageUrl: absolute(first('image'), base),
    servings: parseServings(first('recipeYield')),
    ingredients: [...props('recipeIngredient'), ...props('ingredients')]
      .map(valueOf)
      .filter(Boolean),
    steps,
    rating,
    ratingCount: count,
    nutrition: parseNutrition(
      nutritionScope.length === 0
        ? null
        : {
            calories: nutritionField('calories'),
            proteinContent: nutritionField('proteinContent'),
            fatContent: nutritionField('fatContent'),
            fiberContent: nutritionField('fiberContent'),
          },
    ),
  };
}

const hostOf = (address: string) => {
  try {
    return new URL(address).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * Reads a recipe page. Sources, in order: schema.org/Recipe in JSON-LD, schema.org microdata,
 * Open Graph (title and photo only). The first source that gives a field wins. `pageUrl` is the
 * address of the page, used for relative photo addresses and as the fallback site name.
 */
export function parseRecipePage(html: string, pageUrl: string): ParsedRecipe {
  const $ = cheerio.load(html);

  const documents = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((element) => {
      try {
        return [JSON.parse($(element).text()) as Json];
      } catch {
        return []; // a broken block must not hide the other sources
      }
    });
  const jsonLd = documents.flatMap((document) => collect(document, 'Recipe'))[0];
  const fromLd = jsonLd ? fromJsonLd(jsonLd, pageUrl) : null;
  const fromItems = fromMicrodata($, pageUrl);

  const meta = (property: string) =>
    clean(
      $(`meta[property="${property}"], meta[name="${property}"]`).first().attr('content') ?? '',
    ) || null;
  const openGraphTitle = meta('og:title');
  const openGraphImage = absolute(meta('og:image'), pageUrl);
  const pageTitle = clean($('title').first().text()) || null;

  const pick = <K extends keyof Microdata>(key: K): Microdata[K] | null => {
    for (const source of [fromLd, fromItems]) {
      const value = source?.[key];
      if (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined) {
        return value as Microdata[K];
      }
    }
    return null;
  };

  // A rating and its number of opinions are read from the same source.
  const rated = [fromLd, fromItems].find((source) => source && source.rating !== null);

  const siteName = meta('og:site_name') ?? textOf(jsonLd?.publisher) ?? hostOf(pageUrl) ?? null;

  return {
    title: pick('title') ?? openGraphTitle ?? pageTitle,
    imageUrl: pick('imageUrl') ?? openGraphImage,
    servings: pick('servings'),
    ingredients: pick('ingredients') ?? [],
    steps: pick('steps') ?? [],
    rating: rated?.rating ?? null,
    ratingCount: rated?.ratingCount ?? null,
    nutrition: pick('nutrition'),
    siteName,
    hasRecipeData: fromLd !== null || fromItems !== null,
  };
}
