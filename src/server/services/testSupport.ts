import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { accounts } from '../db/schema';

/** Test support only: removes all accounts and, by cascade, everything that belongs to them. */
export async function deleteAllData({ db }: Database): Promise<void> {
  await db.execute(sql`truncate table accounts cascade`);
}

/** Test support only: the id of the first account, or null. */
export async function firstAccountId({ db }: Database): Promise<string | null> {
  const [row] = await db.select({ id: accounts.id }).from(accounts).limit(1);
  return row?.id ?? null;
}
