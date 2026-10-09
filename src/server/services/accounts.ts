import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { accounts, settings } from '../db/schema';
import { insertStarterSites } from './trustedSites';

/** Returns the id of the account for `email`, creating it (with default settings) on first login. */
export async function findOrCreateAccount(
  { db }: Database,
  email: string,
  now: Date,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, email));
    if (existing) return existing.id;
    const id = randomUUID();
    await tx.insert(accounts).values({ id, email, createdAt: now });
    await tx.insert(settings).values({ accountId: id });
    await insertStarterSites(tx, id, now);
    return id;
  });
}
