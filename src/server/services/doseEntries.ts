import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { DoseEntry } from '../../shared/contracts/dose';
import type { doseInputSchema } from '../../shared/contracts/dose';
import type { z } from 'zod';
import type { Database } from '../db/client';
import { doseEntries } from '../db/schema';
import { bumpDataVersion, type Executor } from './recipes';

type DoseData = z.output<typeof doseInputSchema>;

const toEntry = (row: typeof doseEntries.$inferSelect): DoseEntry => ({
  id: row.id,
  date: row.doseDate,
  doseMg: row.doseMg,
  site: row.site,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

/** Every entry of the dose journal of the account, oldest first, for the snapshot and the export. */
export async function listDoseEntries(db: Executor, accountId: string): Promise<DoseEntry[]> {
  const rows = await db
    .select()
    .from(doseEntries)
    .where(eq(doseEntries.accountId, accountId))
    .orderBy(asc(doseEntries.doseDate), asc(doseEntries.createdAt), asc(doseEntries.id));
  return rows.map(toEntry);
}

/** Adds an entry to the journal (S21). */
export async function addDoseEntry(
  { db }: Database,
  accountId: string,
  input: DoseData,
  now: Date,
): Promise<{ entry: DoseEntry; dataVersion: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(doseEntries)
      .values({
        id: randomUUID(),
        accountId,
        doseDate: input.date,
        doseMg: input.doseMg,
        site: input.site,
        note: input.note,
        createdAt: now,
      })
      .returning();
    if (!row) throw new Error('dose insert returned no row');
    return { entry: toEntry(row), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}

/** Replaces the data of an entry; null when the account has no such entry. */
export async function updateDoseEntry(
  { db }: Database,
  accountId: string,
  entryId: string,
  input: DoseData,
): Promise<{ entry: DoseEntry; dataVersion: number } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(doseEntries)
      .set({ doseDate: input.date, doseMg: input.doseMg, site: input.site, note: input.note })
      .where(and(eq(doseEntries.id, entryId), eq(doseEntries.accountId, accountId)))
      .returning();
    return row ? { entry: toEntry(row), dataVersion: await bumpDataVersion(tx, accountId) } : null;
  });
}

/** Removes an entry; null when the account has no such entry. */
export async function deleteDoseEntry(
  { db }: Database,
  accountId: string,
  entryId: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(doseEntries)
      .where(and(eq(doseEntries.id, entryId), eq(doseEntries.accountId, accountId)))
      .returning({ id: doseEntries.id });
    return removed.length === 0 ? null : bumpDataVersion(tx, accountId);
  });
}
