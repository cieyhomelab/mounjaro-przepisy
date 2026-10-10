import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { MealPlanEntry, MealPlanInput } from '../../shared/contracts/mealPlan';
import type { Database } from '../db/client';
import { mealPlanEntries, recipes } from '../db/schema';
import { bumpDataVersion, type Executor } from './recipes';

const toEntry = (row: typeof mealPlanEntries.$inferSelect): MealPlanEntry => ({
  id: row.id,
  date: row.planDate,
  slot: row.slot,
  recipeId: row.recipeId,
  servings: row.servings,
  createdAt: row.createdAt.toISOString(),
});

/** Every planned meal of the account, in calendar order, for the snapshot and the export. */
export async function listMealPlan(db: Executor, accountId: string): Promise<MealPlanEntry[]> {
  const rows = await db
    .select()
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.accountId, accountId))
    .orderBy(
      asc(mealPlanEntries.planDate),
      asc(mealPlanEntries.createdAt),
      asc(mealPlanEntries.id),
    );
  return rows.map(toEntry);
}

const isForeignKeyViolation = (error: unknown) =>
  (error as { cause?: { code?: string } } | null)?.cause?.code === '23503';

/** Plans a recipe of the account for a meal (S19); null when the account has no such recipe. */
export async function addMealPlanEntry(
  { db }: Database,
  accountId: string,
  input: MealPlanInput,
  now: Date,
): Promise<{ entry: MealPlanEntry; dataVersion: number } | null> {
  try {
    return await db.transaction(async (tx) => {
      const [recipe] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(and(eq(recipes.id, input.recipeId), eq(recipes.accountId, accountId)));
      if (!recipe) return null;
      const [row] = await tx
        .insert(mealPlanEntries)
        .values({
          id: randomUUID(),
          accountId,
          planDate: input.date,
          slot: input.slot,
          recipeId: input.recipeId,
          servings: input.servings,
          createdAt: now,
        })
        .returning();
      if (!row) throw new Error('meal plan insert returned no row');
      return { entry: toEntry(row), dataVersion: await bumpDataVersion(tx, accountId) };
    });
  } catch (error) {
    // The recipe deleted between the check and the insert.
    if (isForeignKeyViolation(error)) return null;
    throw error;
  }
}

/** Removes a planned meal; the recipe stays. Null when the account has no such entry. */
export async function deleteMealPlanEntry(
  { db }: Database,
  accountId: string,
  entryId: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(mealPlanEntries)
      .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.accountId, accountId)))
      .returning({ id: mealPlanEntries.id });
    return removed.length === 0 ? null : bumpDataVersion(tx, accountId);
  });
}
