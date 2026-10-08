import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Recipe, RecipeInput } from '../../shared/contracts/recipe';
import { normalizeIngredient } from '../../shared/domain/ingredientLine';
import type { Database } from '../db/client';
import { accounts, recipePhotos, recipes } from '../db/schema';

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

/** Value typed by the user, or nothing: until estimates exist (stage 1.2) there is no other source. */
function manualNutrition(value: number | null | undefined) {
  return value === null || value === undefined
    ? { value: null, origin: 'none' as const }
    : { value, origin: 'manual' as const };
}

/** Creates a manual recipe and returns it with the new data version. */
export async function createManualRecipe(
  { db }: Database,
  accountId: string,
  input: RecipeInput,
  now: Date,
): Promise<{ recipe: Recipe; dataVersion: number }> {
  const id = randomUUID();
  const kcal = manualNutrition(input.nutritionManual.kcal);
  const protein = manualNutrition(input.nutritionManual.proteinG);
  const fat = manualNutrition(input.nutritionManual.fatG);
  const fiber = manualNutrition(input.nutritionManual.fiberG);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({
        id,
        accountId,
        title: input.title,
        kind: 'manual',
        servings: input.servings,
        ingredients: input.ingredients.map(normalizeIngredient),
        steps: input.steps,
        sourceUrl: input.sourceUrl ?? null,
        kcal: kcal.value === null ? null : Math.round(kcal.value),
        kcalOrigin: kcal.origin,
        proteinG: protein.value,
        proteinOrigin: protein.origin,
        fatG: fat.value,
        fatOrigin: fat.origin,
        fiberG: fiber.value,
        fiberOrigin: fiber.origin,
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
