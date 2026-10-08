import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  sourceNutritionSchema,
  type Ingredient,
  type Recipe,
  type RecipeInput,
  type SourceNutrition,
} from '../../shared/contracts/recipe';
import { normalizeIngredient } from '../../shared/domain/ingredientLine';
import {
  createNutritionLookup,
  estimateNutrition,
  resolveNutrition,
} from '../../shared/domain/nutrition';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import type { Database } from '../db/client';
import { accounts, recipePhotos, recipes } from '../db/schema';
import ingredientTable from '../../shared/nutrition/ingredients.pl.json';

/** Anything that can run a select: the database itself or a transaction. */
export type Executor = Pick<Database['db'], 'select'>;
type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
type RecipeRow = typeof recipes.$inferSelect;

/** Increases the account's data version inside the caller's transaction and returns the new one. */
export async function bumpDataVersion(tx: Tx, accountId: string): Promise<number> {
  const [row] = await tx
    .update(accounts)
    .set({ dataVersion: sql`${accounts.dataVersion} + 1` })
    .where(eq(accounts.id, accountId))
    .returning({ dataVersion: accounts.dataVersion });
  return row?.dataVersion ?? 0;
}

const nutritionValue = (value: number | null, origin: RecipeRow['kcalOrigin']) => ({
  value,
  origin: value === null ? ('none' as const) : origin,
});

/** The API shape of a recipe row; `photoId` comes from the photo table. */
export function toRecipe(row: RecipeRow, photoId: string | null): Recipe {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    servings: row.servings,
    ingredients: row.ingredients,
    steps: row.steps,
    sourceUrl: row.sourceUrl,
    sourceSiteName: row.sourceSiteName,
    sourceRating: row.sourceRating,
    sourceRatingCount: row.sourceRatingCount,
    nutrition: {
      kcal: nutritionValue(row.kcal, row.kcalOrigin),
      proteinG: nutritionValue(row.proteinG, row.proteinOrigin),
      fatG: nutritionValue(row.fatG, row.fatOrigin),
      fiberG: nutritionValue(row.fiberG, row.fiberOrigin),
    },
    unrecognizedIngredients: row.unrecognizedIngredients,
    ownRating: row.ownRating,
    tolerance: row.tolerance,
    toleranceSymptoms: row.toleranceSymptoms,
    toleranceNote: row.toleranceNote,
    worseDays: row.worseDays,
    photoId,
    collectionIds: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const nutritionLookup = createNutritionLookup(ingredientTable);

/**
 * The nutrition columns of a recipe (S5): each of the four values is what the user typed, else
 * what the source page stated, else the estimate from the ingredients, else empty. Run on every
 * save, so estimates follow the ingredients and servings while typed and source values stay.
 */
function nutritionColumns(
  input: RecipeInput,
  ingredients: Ingredient[],
  source: SourceNutrition | null,
) {
  const estimate = estimateNutrition(ingredients, input.servings, nutritionLookup);
  const resolved = resolveNutrition({
    manual: input.nutritionManual,
    source,
    estimate: estimate.values,
  });
  return {
    kcal: resolved.kcal.value,
    kcalOrigin: resolved.kcal.origin,
    proteinG: resolved.proteinG.value,
    proteinOrigin: resolved.proteinG.origin,
    fatG: resolved.fatG.value,
    fatOrigin: resolved.fatG.origin,
    fiberG: resolved.fiberG.value,
    fiberOrigin: resolved.fiberG.origin,
    unrecognizedIngredients: estimate.unrecognized,
  };
}

/** The source columns for an address: the address itself, its normalized key and the site name. */
function sourceColumns(sourceUrl: string | null | undefined, siteName?: string | null) {
  const parsed = sourceUrl ? parseSourceUrl(sourceUrl) : null;
  return {
    sourceUrl: sourceUrl ?? null,
    sourceUrlKey: parsed?.key ?? null,
    sourceSiteName: parsed ? (siteName ?? parsed.host) : null,
  };
}

/** The recipe of the account holding this source key, other than `exceptId`. */
async function recipeWithKey(
  tx: Executor,
  accountId: string,
  key: string | null,
  exceptId?: string,
): Promise<string | null> {
  if (!key) return null;
  const rows = await tx
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.accountId, accountId), eq(recipes.sourceUrlKey, key)));
  return rows.find((row) => row.id !== exceptId)?.id ?? null;
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string } | null)?.code === '23505' ||
  (error as { cause?: { code?: string } } | null)?.cause?.code === '23505';

/** The page the recipe came from is already in the collection (S2): the existing recipe's id. */
export type DuplicateSource = { duplicateOf: string };

/**
 * Creates a recipe (typed by hand, or read from a link when the input carries `sourceImport`) and
 * returns it with the new data version. A second recipe from the same page is refused.
 */
export async function createRecipe(
  database: Database,
  accountId: string,
  input: RecipeInput,
  now: Date,
): Promise<{ recipe: Recipe; dataVersion: number } | DuplicateSource> {
  const key = input.sourceUrl ? (parseSourceUrl(input.sourceUrl)?.key ?? null) : null;
  try {
    return await insertRecipe(database, accountId, input, now);
  } catch (error) {
    // Two saves of the same page at once: the unique index lets one through.
    const existing = isUniqueViolation(error)
      ? await recipeWithKey(database.db, accountId, key)
      : null;
    if (existing) return { duplicateOf: existing };
    throw error;
  }
}

async function insertRecipe(
  { db }: Database,
  accountId: string,
  input: RecipeInput,
  now: Date,
): Promise<{ recipe: Recipe; dataVersion: number } | DuplicateSource> {
  const id = randomUUID();
  const imported = input.sourceImport;
  const ingredients = input.ingredients.map(normalizeIngredient);
  const source = sourceColumns(input.sourceUrl, imported?.siteName);
  return db.transaction(async (tx) => {
    const duplicate = await recipeWithKey(tx, accountId, source.sourceUrlKey);
    if (duplicate) return { duplicateOf: duplicate };
    const [row] = await tx
      .insert(recipes)
      .values({
        id,
        accountId,
        title: input.title,
        kind: imported && input.sourceUrl ? 'link' : 'manual',
        servings: input.servings,
        ingredients,
        steps: input.steps,
        ...source,
        sourceRating: imported?.rating ?? null,
        sourceRatingCount: imported?.ratingCount ?? null,
        sourceNutrition: imported?.nutrition ?? null,
        ...nutritionColumns(input, ingredients, imported?.nutrition ?? null),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error('recipe insert returned no row');
    let photoId: string | null = null;
    if (input.photoId) {
      const [photo] = await tx
        .update(recipePhotos)
        .set({ recipeId: id })
        .where(
          and(
            eq(recipePhotos.id, input.photoId),
            eq(recipePhotos.accountId, accountId),
            isNull(recipePhotos.recipeId),
          ),
        )
        .returning({ id: recipePhotos.id });
      photoId = photo?.id ?? null;
    }
    const dataVersion = await bumpDataVersion(tx, accountId);
    return { recipe: toRecipe(row, photoId), dataVersion };
  });
}

/** Every recipe of the account, oldest first, for the snapshot. */
export async function listRecipes(db: Executor, accountId: string): Promise<Recipe[]> {
  const rows = await db
    .select({ recipe: recipes, photoId: recipePhotos.id })
    .from(recipes)
    .leftJoin(recipePhotos, eq(recipePhotos.recipeId, recipes.id))
    .where(eq(recipes.accountId, accountId))
    .orderBy(asc(recipes.createdAt), asc(recipes.id));
  return rows.map((row) => toRecipe(row.recipe, row.photoId));
}

/** One recipe of the account, or null. */
export async function findRecipe(
  db: Executor,
  accountId: string,
  recipeId: string,
): Promise<Recipe | null> {
  const [row] = await db
    .select({ recipe: recipes, photoId: recipePhotos.id })
    .from(recipes)
    .leftJoin(recipePhotos, eq(recipePhotos.recipeId, recipes.id))
    .where(and(eq(recipes.id, recipeId), eq(recipes.accountId, accountId)));
  return row ? toRecipe(row.recipe, row.photoId) : null;
}

/**
 * Replaces the editable fields of a recipe and returns it with the new data version, or null
 * when the account has no such recipe. The row is locked while it changes, so two saves of the
 * same recipe apply one after the other and the one that arrives later wins (S15). A link
 * recipe keeps its source address; the photo is replaced only when `photoId` names an
 * unattached upload of the account.
 */
export async function updateRecipe(
  { db }: Database,
  accountId: string,
  recipeId: string,
  input: RecipeInput,
  now: Date,
): Promise<{ recipe: Recipe; dataVersion: number } | DuplicateSource | null> {
  const ingredients = input.ingredients.map(normalizeIngredient);
  const source = sourceColumns(input.sourceUrl);
  const dataVersion = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ kind: recipes.kind, sourceNutrition: recipes.sourceNutrition })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.accountId, accountId)))
      .for('update');
    if (!current) return null;
    if (current.kind === 'manual') {
      const duplicate = await recipeWithKey(tx, accountId, source.sourceUrlKey, recipeId);
      if (duplicate) return { duplicateOf: duplicate };
    }
    await tx
      .update(recipes)
      .set({
        title: input.title,
        servings: input.servings,
        ingredients,
        steps: input.steps,
        ...(current.kind === 'manual' ? source : {}),
        ...nutritionColumns(
          input,
          ingredients,
          sourceNutritionSchema.nullable().catch(null).parse(current.sourceNutrition),
        ),
        updatedAt: now,
      })
      .where(eq(recipes.id, recipeId));
    if (input.photoId) {
      const [free] = await tx
        .select({ id: recipePhotos.id })
        .from(recipePhotos)
        .where(
          and(
            eq(recipePhotos.id, input.photoId),
            eq(recipePhotos.accountId, accountId),
            isNull(recipePhotos.recipeId),
          ),
        );
      if (free) {
        await tx.delete(recipePhotos).where(eq(recipePhotos.recipeId, recipeId));
        await tx.update(recipePhotos).set({ recipeId }).where(eq(recipePhotos.id, free.id));
      }
    }
    return bumpDataVersion(tx, accountId);
  });
  if (dataVersion === null) return null;
  if (typeof dataVersion === 'object') return dataVersion;
  const recipe = await findRecipe(db, accountId, recipeId);
  return recipe ? { recipe, dataVersion } : null;
}

/**
 * Deletes a recipe with its photo and returns the new data version, or null when the account has
 * no such recipe. Own collections (stage 1.3) will drop their entries for it here as well.
 */
export async function deleteRecipe(
  { db }: Database,
  accountId: string,
  recipeId: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.accountId, accountId)))
      .returning({ id: recipes.id });
    return removed.length === 0 ? null : bumpDataVersion(tx, accountId);
  });
}
