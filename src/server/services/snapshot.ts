import { eq } from 'drizzle-orm';
import { API_VERSION } from '../../shared/contracts/session';
import type { Snapshot } from '../../shared/contracts/snapshot';
import type { Database } from '../db/client';
import { accounts, settings } from '../db/schema';
import { listRecipes, type Executor } from './recipes';

/** Current data version of the account; the ETag of the snapshot. */
export async function readDataVersion(db: Executor, accountId: string): Promise<number> {
  const [row] = await db
    .select({ dataVersion: accounts.dataVersion })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row?.dataVersion ?? 0;
}

/**
 * The whole state of the account. Reads run in one transaction so the version and the data
 * belong together even while another request writes.
 */
export async function buildSnapshot(
  database: Database,
  accountId: string,
  now: Date,
): Promise<Snapshot> {
  const { db } = database;
  return db.transaction(
    async (tx) => {
      const dataVersion = await readDataVersion(tx, accountId);
      const [row] = await tx.select().from(settings).where(eq(settings.accountId, accountId));
      return {
        apiVersion: API_VERSION,
        dataVersion,
        generatedAt: now.toISOString(),
        settings: {
          thresholdProteinG: row?.thresholdProteinG ?? 25,
          thresholdFatG: row?.thresholdFatG ?? 15,
          thresholdFiberG: row?.thresholdFiberG ?? 5,
          thresholdKcal: row?.thresholdKcal ?? 400,
          thresholdSmallPortionKcal: row?.thresholdSmallPortionKcal ?? 300,
        },
        recipes: await listRecipes(tx, accountId),
        collections: [],
        cookEvents: [],
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
