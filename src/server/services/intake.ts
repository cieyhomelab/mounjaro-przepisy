import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type {
  ProteinEntry,
  proteinEntryInputSchema,
  WaterEntry,
} from '../../shared/contracts/intake';
import type { z } from 'zod';
import { proteinOfServings } from '../../shared/domain/intake';
import type { Database } from '../db/client';
import { proteinEntries, waterEntries } from '../db/schema';
import { findRecipe, bumpDataVersion, type Executor } from './recipes';
import { readSettings } from './settings';

type ProteinData = z.output<typeof proteinEntryInputSchema>;

const toProteinEntry = (row: typeof proteinEntries.$inferSelect): ProteinEntry => ({
  id: row.id,
  date: row.entryDate,
  grams: row.grams,
  sourceKind: row.sourceKind,
  recipeTitle: row.recipeTitle,
  servings: row.servings,
  description: row.description,
  createdAt: row.createdAt.toISOString(),
});

const toWaterEntry = (row: typeof waterEntries.$inferSelect): WaterEntry => ({
  id: row.id,
  date: row.entryDate,
  ml: row.ml,
  createdAt: row.createdAt.toISOString(),
});

/** Every entry of the protein counter of the account, oldest first, for the snapshot and the export. */
export async function listProteinEntries(db: Executor, accountId: string): Promise<ProteinEntry[]> {
  const rows = await db
    .select()
    .from(proteinEntries)
    .where(eq(proteinEntries.accountId, accountId))
    .orderBy(asc(proteinEntries.entryDate), asc(proteinEntries.createdAt), asc(proteinEntries.id));
  return rows.map(toProteinEntry);
}

/** Every glass of the water counter of the account, oldest first, for the snapshot and the export. */
export async function listWaterEntries(db: Executor, accountId: string): Promise<WaterEntry[]> {
  const rows = await db
    .select()
    .from(waterEntries)
    .where(eq(waterEntries.accountId, accountId))
    .orderBy(asc(waterEntries.entryDate), asc(waterEntries.createdAt), asc(waterEntries.id));
  return rows.map(toWaterEntry);
}

export type AddProteinResult =
  | { status: 'added'; entry: ProteinEntry; dataVersion: number }
  | { status: 'recipe_not_found' }
  | { status: 'protein_required' };

/**
 * Adds an entry for today (S25). A recipe entry takes the protein of one serving times the
 * servings eaten, or the amount given when the recipe has no protein value; the entry keeps the
 * title and the amount, so it does not change when the recipe does.
 */
export async function addProteinEntry(
  { db }: Database,
  accountId: string,
  input: ProteinData,
  today: string,
  now: Date,
): Promise<AddProteinResult> {
  return db.transaction(async (tx) => {
    let values: Omit<typeof proteinEntries.$inferInsert, 'id' | 'accountId'>;
    if (input.kind === 'manual') {
      values = {
        entryDate: today,
        grams: input.grams,
        sourceKind: 'manual',
        recipeTitle: null,
        servings: null,
        description: input.description,
        createdAt: now,
      };
    } else {
      const recipe = await findRecipe(tx, accountId, input.recipeId);
      if (!recipe) return { status: 'recipe_not_found' } as const;
      const perServing = recipe.nutrition.proteinG.value;
      const grams =
        input.grams ?? (perServing === null ? null : proteinOfServings(perServing, input.servings));
      if (grams === null || grams <= 0) return { status: 'protein_required' } as const;
      values = {
        entryDate: today,
        grams,
        sourceKind: 'recipe',
        recipeTitle: recipe.title,
        servings: input.servings,
        description: null,
        createdAt: now,
      };
    }
    const [row] = await tx
      .insert(proteinEntries)
      .values({ id: randomUUID(), accountId, ...values })
      .returning();
    if (!row) throw new Error('protein insert returned no row');
    return {
      status: 'added',
      entry: toProteinEntry(row),
      dataVersion: await bumpDataVersion(tx, accountId),
    } as const;
  });
}

/** Adds a glass of water for today; its size is the glass of the settings (S25). */
export async function addWaterEntry(
  database: Database,
  accountId: string,
  today: string,
  now: Date,
): Promise<{ entry: WaterEntry; dataVersion: number }> {
  return database.db.transaction(async (tx) => {
    const { glassMl } = await readSettings(tx, accountId);
    const [row] = await tx
      .insert(waterEntries)
      .values({ id: randomUUID(), accountId, entryDate: today, ml: glassMl, createdAt: now })
      .returning();
    if (!row) throw new Error('water insert returned no row');
    return { entry: toWaterEntry(row), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}

export type DeleteResult =
  { status: 'deleted'; dataVersion: number } | { status: 'not_found' } | { status: 'past_day' };

/** Removes an entry of today; an entry of an earlier day stays (S25). */
export async function deleteProteinEntry(
  { db }: Database,
  accountId: string,
  entryId: string,
  today: string,
): Promise<DeleteResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ date: proteinEntries.entryDate })
      .from(proteinEntries)
      .where(and(eq(proteinEntries.id, entryId), eq(proteinEntries.accountId, accountId)));
    if (!row) return { status: 'not_found' } as const;
    if (row.date !== today) return { status: 'past_day' } as const;
    await tx.delete(proteinEntries).where(eq(proteinEntries.id, entryId));
    return { status: 'deleted', dataVersion: await bumpDataVersion(tx, accountId) } as const;
  });
}

/** Removes a glass of today; a glass of an earlier day stays (S25). */
export async function deleteWaterEntry(
  { db }: Database,
  accountId: string,
  entryId: string,
  today: string,
): Promise<DeleteResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ date: waterEntries.entryDate })
      .from(waterEntries)
      .where(and(eq(waterEntries.id, entryId), eq(waterEntries.accountId, accountId)));
    if (!row) return { status: 'not_found' } as const;
    if (row.date !== today) return { status: 'past_day' } as const;
    await tx.delete(waterEntries).where(eq(waterEntries.id, entryId));
    return { status: 'deleted', dataVersion: await bumpDataVersion(tx, accountId) } as const;
  });
}
