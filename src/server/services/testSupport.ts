import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';

/** Test support only: removes all accounts and, by cascade, everything that belongs to them. */
export async function deleteAllData({ db }: Database): Promise<void> {
  await db.execute(sql`truncate table accounts cascade`);
}
