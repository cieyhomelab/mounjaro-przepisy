import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { WellbeingEntry, wellbeingInputSchema } from '../../shared/contracts/wellbeing';
import type { Database } from '../db/client';
import { wellbeingEntries } from '../db/schema';
import { bumpDataVersion, type Executor } from './recipes';

type WellbeingData = z.output<typeof wellbeingInputSchema>;

const toEntry = (row: typeof wellbeingEntries.$inferSelect): WellbeingEntry => ({
  date: row.entryDate,
  weightKg: row.weightKg,
  mood: row.mood,
  note: row.note,
  updatedAt: row.updatedAt.toISOString(),
});

/** Every entry of the weight and mood journal of the account, oldest first, for the snapshot and the export. */
export async function listWellbeingEntries(
  db: Executor,
  accountId: string,
): Promise<WellbeingEntry[]> {
  const rows = await db
    .select()
    .from(wellbeingEntries)
    .where(eq(wellbeingEntries.accountId, accountId))
    .orderBy(asc(wellbeingEntries.entryDate));
  return rows.map(toEntry);
}

/** Creates the entry of a day or replaces the one that is there (S24): one entry per day. */
export async function saveWellbeingEntry(
  { db }: Database,
  accountId: string,
  date: string,
  input: WellbeingData,
  now: Date,
): Promise<{ entry: WellbeingEntry; dataVersion: number }> {
  return db.transaction(async (tx) => {
    const values = { weightKg: input.weightKg, mood: input.mood, note: input.note, updatedAt: now };
    const [row] = await tx
      .insert(wellbeingEntries)
      .values({ accountId, entryDate: date, ...values })
      .onConflictDoUpdate({
        target: [wellbeingEntries.accountId, wellbeingEntries.entryDate],
        set: values,
      })
      .returning();
    if (!row) throw new Error('wellbeing upsert returned no row');
    return { entry: toEntry(row), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}

/** Removes the entry of a day; null when the account has none. */
export async function deleteWellbeingEntry(
  { db }: Database,
  accountId: string,
  date: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(wellbeingEntries)
      .where(and(eq(wellbeingEntries.accountId, accountId), eq(wellbeingEntries.entryDate, date)))
      .returning({ date: wellbeingEntries.entryDate });
    return removed.length === 0 ? null : bumpDataVersion(tx, accountId);
  });
}
