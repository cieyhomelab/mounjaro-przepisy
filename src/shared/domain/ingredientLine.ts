import type { Ingredient } from '../contracts/recipe';
import { MAX_QUANTITY } from '../contracts/shopping';

/** Spellings of the units we understand, mapped to one canonical form. */
const UNITS: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  gramy: 'g',
  gramów: 'g',
  dag: 'dag',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  litr: 'l',
  litry: 'l',
  litrów: 'l',
  łyżka: 'łyżka',
  łyżki: 'łyżka',
  łyżek: 'łyżka',
  łyżeczka: 'łyżeczka',
  łyżeczki: 'łyżeczka',
  łyżeczek: 'łyżeczka',
  szklanka: 'szklanka',
  szklanki: 'szklanka',
  szklanek: 'szklanka',
  szczypta: 'szczypta',
  szczypty: 'szczypta',
  szczypt: 'szczypta',
  sztuka: 'sztuka',
  sztuki: 'sztuka',
  sztuk: 'sztuka',
  szt: 'sztuka',
  ząbek: 'ząbek',
  ząbki: 'ząbek',
  ząbków: 'ząbek',
  plaster: 'plaster',
  plastry: 'plaster',
  plastrów: 'plaster',
  opakowanie: 'opakowanie',
  opakowania: 'opakowanie',
  opakowań: 'opakowanie',
  puszka: 'puszka',
  puszki: 'puszka',
  puszek: 'puszka',
  garść: 'garść',
  garście: 'garść',
  garści: 'garść',
  pęczek: 'pęczek',
  pęczki: 'pęczek',
  pęczków: 'pęczek',
  kostka: 'kostka',
  kostki: 'kostka',
  kostek: 'kostka',
};

const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
};

/** A quantity at the start of the line: "1 1/2", "1/2", "½", "1,5", "200". */
const QUANTITY = /^(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+)?\s?([½¼¾⅓⅔])|(\d+(?:[.,]\d+)?))/;
/** What follows a quantity when the line really holds a range such as "2-3" or "2 do 3". */
const RANGE_CONTINUATION = /^\s*(?:[-–—]\s*\d|do\s+\d)/i;

const round = (value: number) => Math.round(value * 1000) / 1000;

function readQuantity(text: string): { quantity: number; rest: string } | null {
  const match = QUANTITY.exec(text);
  if (!match) return null;
  let quantity: number;
  if (match[1] !== undefined) quantity = Number(match[1]) + Number(match[2]) / Number(match[3]);
  else if (match[4] !== undefined) quantity = Number(match[4]) / Number(match[5]);
  else if (match[7] !== undefined)
    quantity = Number(match[6] ?? 0) + (VULGAR_FRACTIONS[match[7]] ?? 0);
  else quantity = Number((match[8] ?? '').replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { quantity: round(quantity), rest: text.slice(match[0].length) };
}

/** The quantity a line starts with and the text after it, or null when it starts with none. */
export function splitLeadingQuantity(text: string): { quantity: number; rest: string } | null {
  return readQuantity(text.trim());
}

/**
 * Splits one ingredient line into quantity, unit and name. A line without a leading quantity
 * ("sól do smaku") is a name only. A line that cannot be split reliably (a range such as
 * "2-3 łyżki", or a quantity with no name) keeps only its text.
 */
export function parseIngredientLine(line: string): Ingredient {
  const originalText = line.trim().replace(/\s+/g, ' ');
  const textOnly: Ingredient = { quantity: null, unit: null, name: null, originalText };
  const read = readQuantity(originalText);
  if (!read) return { ...textOnly, name: originalText };
  // A quantity the stored column cannot hold is kept as text, like a range.
  if (read.quantity > MAX_QUANTITY || RANGE_CONTINUATION.test(read.rest)) return textOnly;

  const rest = read.rest.trim();
  const [firstWord = '', ...others] = rest.split(' ');
  const unit = UNITS[firstWord.toLowerCase().replace(/\.$/, '')];
  // "200g" has no space between the number and the unit.
  const glued = read.rest.length > 0 && !/^\s/.test(read.rest);
  if (unit) {
    const name = others.join(' ');
    return name ? { quantity: read.quantity, unit, name, originalText } : textOnly;
  }
  if (glued || !rest) return textOnly;
  return { quantity: read.quantity, unit: null, name: rest, originalText };
}

/**
 * The ingredient as stored. A client that gives none of quantity, unit and name leaves the
 * splitting to us; otherwise what it sent is kept.
 */
export function normalizeIngredient(input: {
  quantity?: number | null | undefined;
  unit?: string | null | undefined;
  name?: string | null | undefined;
  originalText: string;
}): Ingredient {
  if (input.quantity === undefined && input.unit === undefined && input.name === undefined) {
    return parseIngredientLine(input.originalText);
  }
  return {
    quantity: input.quantity ?? null,
    unit: input.unit || null,
    name: input.name || null,
    originalText: input.originalText,
  };
}
