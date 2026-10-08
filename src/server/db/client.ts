import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    /** Raw pool, for tests that inspect tables directly. */
    pool,
    /** Applies pending migrations from the drizzle/ directory. */
    migrate: (migrationsFolder = 'drizzle') => migrate(db, { migrationsFolder }),
    /** True when the database answers a trivial query. */
    ping: async () => {
      try {
        await pool.query('select 1');
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}
