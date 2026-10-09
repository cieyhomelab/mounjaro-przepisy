import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { OwnCollection } from '../../shared/contracts/collection';
import { cleanCollectionName, collectionNameKey } from '../../shared/domain/collectionName';
import type { Database } from '../db/client';
import { collections } from '../db/schema';
import { bumpDataVersion, type Executor } from './recipes';

const toCollection = (row: typeof collections.$inferSelect): OwnCollection => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
});

/** Every own collection of the account, oldest first, for the snapshot. */
export async function listCollections(db: Executor, accountId: string): Promise<OwnCollection[]> {
  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.accountId, accountId))
    .orderBy(asc(collections.createdAt), asc(collections.id));
  return rows.map(toCollection);
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string } | null)?.code === '23505' ||
  (error as { cause?: { code?: string } } | null)?.cause?.code === '23505';

type Saved = { collection: OwnCollection; dataVersion: number };

/** Creates an own collection; 'duplicate_name' when the name is taken (any letter case). `name` is already checked. */
export async function createCollection(
  { db }: Database,
  accountId: string,
  name: string,
  now: Date,
): Promise<Saved | 'duplicate_name'> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(collections)
        .values({
          id: randomUUID(),
          accountId,
          name: cleanCollectionName(name),
          nameKey: collectionNameKey(name),
          createdAt: now,
        })
        .returning();
      if (!row) throw new Error('collection insert returned no row');
      return { collection: toCollection(row), dataVersion: await bumpDataVersion(tx, accountId) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'duplicate_name';
    throw error;
  }
}

/** Renames an own collection; its recipes stay. Null when the account has no such collection. */
export async function renameCollection(
  { db }: Database,
  accountId: string,
  collectionId: string,
  name: string,
): Promise<Saved | 'duplicate_name' | null> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(collections)
        .set({ name: cleanCollectionName(name), nameKey: collectionNameKey(name) })
        .where(and(eq(collections.id, collectionId), eq(collections.accountId, accountId)))
        .returning();
      if (!row) return null;
      return { collection: toCollection(row), dataVersion: await bumpDataVersion(tx, accountId) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'duplicate_name';
    throw error;
  }
}

/** Deletes an own collection and its assignments; the recipes stay. Null when there is no such collection. */
export async function deleteCollection(
  { db }: Database,
  accountId: string,
  collectionId: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.accountId, accountId)))
      .returning({ id: collections.id });
    return removed.length === 0 ? null : bumpDataVersion(tx, accountId);
  });
}
