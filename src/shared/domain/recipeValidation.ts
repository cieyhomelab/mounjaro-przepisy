import type { ZodError } from 'zod';
import { recipeInputSchema, type RecipeInput } from '../contracts/recipe';

/** Field names as they appear in the `fields` of a validation error. */
export type RecipeField =
  | 'title'
  | 'servings'
  | 'ingredients'
  | 'steps'
  | 'sourceUrl'
  | 'kcal'
  | 'proteinG'
  | 'fatG'
  | 'fiberG';

/** "required": nothing was given. "invalid": something was given but it is not acceptable. */
export type RecipeFieldCode = 'required' | 'invalid';

export type RecipeValidation =
  | { ok: true; input: RecipeInput }
  | { ok: false; fields: Partial<Record<RecipeField, RecipeFieldCode>> };

const NUTRITION_FIELDS = new Set(['kcal', 'proteinG', 'fatG', 'fiberG']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function fieldOf(path: PropertyKey[]): RecipeField | undefined {
  const [head, second] = path;
  if (head === 'nutritionManual' && typeof second === 'string' && NUTRITION_FIELDS.has(second)) {
    return second as RecipeField;
  }
  switch (head) {
    case 'title':
    case 'servings':
    case 'ingredients':
    case 'steps':
    case 'sourceUrl':
      return head;
    default:
      return undefined;
  }
}

function toFields(error: ZodError, raw: unknown): Partial<Record<RecipeField, RecipeFieldCode>> {
  const body = isRecord(raw) ? raw : {};
  const fields: Partial<Record<RecipeField, RecipeFieldCode>> = {};
  for (const issue of error.issues) {
    const field = fieldOf(issue.path);
    if (!field || fields[field]) continue;
    const topLevel = issue.path.length === 1;
    const missing = topLevel && (body[field] === undefined || body[field] === null);
    const empty =
      topLevel &&
      issue.code === 'too_small' &&
      (issue.origin === 'string' || issue.origin === 'array');
    fields[field] = missing || empty ? 'required' : 'invalid';
  }
  return fields;
}

/**
 * Validates a recipe request body. Used by the server for every request and by the client form
 * before sending, so both reject the same input with the same field codes.
 */
export function validateRecipeInput(raw: unknown): RecipeValidation {
  const parsed = recipeInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, input: parsed.data };
  const fields = toFields(parsed.error, raw);
  // An issue on a field we do not name (for example a malformed body) still must not pass.
  if (Object.keys(fields).length === 0) fields.title = 'invalid';
  return { ok: false, fields };
}
