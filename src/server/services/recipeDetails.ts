import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CookEvent } from '../../shared/contracts/cookEvent';
import type { Recipe, ToleranceInput } from '../../shared/contracts/recipe';
import { warsawDate } from '../../shared/domain/cookStats';
import type { Database } from '../db/client';
import { collections, cookEvents, recipeCollections, recipes } from '../db/schema';
import { bumpDataVersion, findRecipe, type Executor } from './recipes';

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
type RecipeChange = { recipe: Recipe; dataVersion: number };

/**
 * Updates columns of one recipe of the account and returns it with the new data version, or null
 * when the account has no such recipe. `extra` runs in the same transaction after the update.
 */
async function changeRecipe(
  { db }: Database,
  accountId: string,
  recipeId: string,
  columns: Partial<typeof recipes.$inferInsert>,
  now: Date,
  extra?: (tx: Tx) => Promise<void>,
): Promise<RecipeChange | null> {
  const dataVersion = await db.transaction(async (tx) => {
    const updated = await tx
      .update(recipes)
      .set({ ...columns, updatedAt: now })
      .where(and(eq(recipes.id, recipeId), eq(recipes.accountId, accountId)))
      .returning({ id: recipes.id });
    if (updated.length === 0) return null;
    await extra?.(tx);
    return bumpDataVersion(tx, accountId);
  });
  if (dataVersion === null) return null;
  const recipe = await findRecipe(db, accountId, recipeId);
  return recipe ? { recipe, dataVersion } : null;
}

/** Sets or, with null, removes the own rating (S8). */
export function setRating(
  database: Database,
  accountId: string,
  recipeId: string,
  rating: number | null,
  now: Date,
) {
  return changeRecipe(database, accountId, recipeId, { ownRating: rating }, now);
}

/** Sets or, with level null, removes the tolerance rating (S9); symptoms belong to "medium" and "bad" only. */
export function setTolerance(
  database: Database,
  accountId: string,
  recipeId: string,
  input: ToleranceInput,
  now: Date,
) {
  const withSymptoms = input.level === 'medium' || input.level === 'bad';
  const symptoms = withSymptoms ? [...new Set(input.symptoms)] : [];
  return changeRecipe(
    database,
    accountId,
    recipeId,
    {
      tolerance: input.level,
      toleranceSymptoms: symptoms,
      toleranceNote: symptoms.includes('other') && input.note ? input.note : null,
    },
    now,
  );
}

/** Turns the "Na gorsze dni" tag on or off (S10). */
export function setWorseDays(
  database: Database,
  accountId: string,
  recipeId: string,
  enabled: boolean,
  now: Date,
) {
  return changeRecipe(database, accountId, recipeId, { worseDays: enabled }, now);
}

/**
 * Replaces the own collections a recipe belongs to (S11). Returns 'unknown_collection' when one of
 * the ids is not a collection of the account, null when the recipe is not the account's.
 */
export async function setRecipeCollections(
  database: Database,
  accountId: string,
  recipeId: string,
  collectionIds: string[],
  now: Date,
): Promise<RecipeChange | null | 'unknown_collection'> {
  const wanted = [...new Set(collectionIds)];
  if (wanted.length > 0) {
    const known = await database.db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.accountId, accountId), inArray(collections.id, wanted)));
    if (known.length !== wanted.length) return 'unknown_collection';
  }
  try {
    return await changeRecipe(database, accountId, recipeId, {}, now, async (tx) => {
      await tx.delete(recipeCollections).where(eq(recipeCollections.recipeId, recipeId));
      if (wanted.length > 0) {
        await tx
          .insert(recipeCollections)
          .values(wanted.map((collectionId) => ({ recipeId, collectionId })));
      }
    });
  } catch (error) {
    // A collection deleted between the check and the insert.
    if ((error as { cause?: { code?: string } })?.cause?.code === '23503') {
      return 'unknown_collection';
    }
    throw error;
  }
}

const toCookEvent = (row: typeof cookEvents.$inferSelect): CookEvent => ({
  id: row.id,
  recipeId: row.recipeId,
  cookedOn: row.cookedOn,
  createdAt: row.createdAt.toISOString(),
});

/** Every cooking of the account, oldest first, for the snapshot. */
export async function listCookEvents(db: Executor, accountId: string): Promise<CookEvent[]> {
  const rows = await db
    .select()
    .from(cookEvents)
    .where(eq(cookEvents.accountId, accountId))
    .orderBy(cookEvents.createdAt, cookEvents.id);
  return rows.map(toCookEvent);
}

/** Records a cooking of the recipe dated today in Warsaw (S8); null when the recipe is not the account's. */
export async function addCookEvent(
  { db }: Database,
  accountId: string,
  recipeId: string,
  now: Date,
): Promise<{ cookEvent: CookEvent; dataVersion: number } | null> {
  return db.transaction(async (tx) => {
    // Locking the recipe row keeps the check and the insert together with a concurrent delete.
    const [recipe] = await tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.accountId, accountId)))
      .for('update');
    if (!recipe) return null;
    const [row] = await tx
      .insert(cookEvents)
      .values({ id: randomUUID(), accountId, recipeId, cookedOn: warsawDate(now), createdAt: now })
      .returning();
    if (!row) throw new Error('cook event insert returned no row');
    return { cookEvent: toCookEvent(row), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}

/** Removes the most recently added cooking of the recipe (S8); null when it has none. */
export async function removeLastCookEvent(
  { db }: Database,
  accountId: string,
  recipeId: string,
): Promise<{ cookEvent: CookEvent; dataVersion: number } | null> {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select()
      .from(cookEvents)
      .where(and(eq(cookEvents.accountId, accountId), eq(cookEvents.recipeId, recipeId)))
      .orderBy(desc(cookEvents.createdAt), desc(cookEvents.cookedOn))
      .limit(1)
      .for('update');
    if (!last) return null;
    await tx.delete(cookEvents).where(eq(cookEvents.id, last.id));
    return { cookEvent: toCookEvent(last), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}
