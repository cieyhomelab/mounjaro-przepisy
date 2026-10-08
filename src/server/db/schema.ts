// Drizzle schema: the single source of truth for database tables.
// After changing it run `scripts/npm.sh run db:generate` and commit the new files in drizzle/.
import { bigint, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** The single user. `email` is personal data; nothing else is taken from the Google account. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  dataVersion: bigint('data_version', { mode: 'number' }).notNull().default(0),
  createdAt: timestamptz('created_at').notNull(),
});

/** `id` is the SHA-256 of the session token held in the cookie; `expires_at = last_seen_at + 30 days`. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: timestamptz('created_at').notNull(),
  lastSeenAt: timestamptz('last_seen_at').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
});

const threshold = (name: string, fallback: number) =>
  numeric(name, { precision: 7, scale: 1, mode: 'number' }).notNull().default(fallback);

/** Defaults are the filter thresholds of scenario S7. */
export const settings = pgTable('settings', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  thresholdProteinG: threshold('threshold_protein_g', 25),
  thresholdFatG: threshold('threshold_fat_g', 15),
  thresholdFiberG: threshold('threshold_fiber_g', 5),
  thresholdKcal: threshold('threshold_kcal', 400),
  thresholdSmallPortionKcal: threshold('threshold_small_portion_kcal', 300),
});
