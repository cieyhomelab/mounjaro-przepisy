import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { TrustedSite } from '../../shared/contracts/trustedSite';
import type { Database } from '../db/client';
import { trustedSites } from '../db/schema';
import { detectSite } from '../integrations/siteDetect';
import type { PageFetcher } from '../integrations/pageFetcher';
import type { SearchConfig } from '../integrations/siteSearch';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import { bumpDataVersion, type Executor } from './recipes';

type Row = typeof trustedSites.$inferSelect;
type StarterSite = { host: string; name: string; searchConfig: SearchConfig };

/**
 * The sites every new account starts with (S18). Migration 0004 inserts the same four for the
 * accounts that exist; keep both in step.
 */
export const STARTER_SITES: readonly StarterSite[] = [
  {
    host: 'aniagotuje.pl',
    name: 'Ania Gotuje',
    searchConfig: {
      searchUrl: 'https://aniagotuje.pl/szukaj?s={q}',
      linkPattern: '^/przepis/[^/]+$',
    },
  },
  {
    host: 'kwestiasmaku.com',
    name: 'Kwestia Smaku',
    searchConfig: {
      searchUrl: 'https://www.kwestiasmaku.com/szukaj?search_api_views_fulltext={q}',
      linkPattern: '/przepis\\.html$',
    },
  },
  {
    host: 'przepisy.pl',
    name: 'Przepisy.pl',
    searchConfig: {
      searchUrl: 'https://www.przepisy.pl/szukaj?q={q}',
      linkPattern: '^/przepis/[^/]+$',
    },
  },
  {
    host: 'doradcasmaku.pl',
    name: 'Doradca Smaku',
    searchConfig: {
      searchUrl: 'https://www.doradcasmaku.pl/wyszukiwanie?q={q}',
      linkPattern: '^/przepis-[^/]+-\\d+$',
    },
  },
];

const toSite = (row: Pick<Row, 'id' | 'host' | 'name' | 'active'>): TrustedSite => ({
  id: row.id,
  host: row.host,
  name: row.name,
  active: row.active,
});

/** Puts the starter sites on an account (new account, test setup). */
export async function insertStarterSites(
  db: Pick<Database['db'], 'insert'>,
  accountId: string,
  now: Date,
) {
  await db
    .insert(trustedSites)
    .values(
      STARTER_SITES.map((site, index) => ({
        id: randomUUID(),
        accountId,
        host: site.host,
        name: site.name,
        active: true,
        searchConfig: site.searchConfig,
        // Distinct instants keep the list in the order of the starter list.
        createdAt: new Date(now.getTime() + index),
      })),
    )
    .onConflictDoNothing();
}

/** The trusted sites of the account, oldest first, for the snapshot and the export. */
export async function listTrustedSites(db: Executor, accountId: string): Promise<TrustedSite[]> {
  const rows = await db
    .select()
    .from(trustedSites)
    .where(eq(trustedSites.accountId, accountId))
    .orderBy(asc(trustedSites.createdAt), asc(trustedSites.id));
  return rows.map(toSite);
}

/** Active sites with their search recipe, for the search. */
export async function listActiveSearchSites(db: Executor, accountId: string) {
  return db
    .select({
      id: trustedSites.id,
      name: trustedSites.name,
      searchConfig: trustedSites.searchConfig,
    })
    .from(trustedSites)
    .where(and(eq(trustedSites.accountId, accountId), eq(trustedSites.active, true)))
    .orderBy(asc(trustedSites.createdAt), asc(trustedSites.id));
}

export type AddSiteOutcome =
  | { kind: 'added'; site: TrustedSite; dataVersion: number }
  | { kind: 'invalid_url' | 'duplicate' | 'not_searchable' | 'unavailable' };

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string } | null)?.code === '23505' ||
  (error as { cause?: { code?: string } } | null)?.cause?.code === '23505';

/**
 * Adds the site at `address` to the account's list, active (S18). A site already on the list is
 * not added twice; a site the app cannot search is not added at all.
 */
export async function addSite(
  database: Database,
  fetcher: PageFetcher,
  accountId: string,
  address: string,
  fetchTimeoutMs: number,
  now: Date,
): Promise<AddSiteOutcome> {
  const source = parseSourceUrl(address);
  if (!source) return { kind: 'invalid_url' };
  const { db } = database;
  const [existing] = await db
    .select({ id: trustedSites.id })
    .from(trustedSites)
    .where(and(eq(trustedSites.accountId, accountId), eq(trustedSites.host, source.host)));
  if (existing) return { kind: 'duplicate' };

  const detected = await detectSite(fetcher, source.url, { timeoutMs: fetchTimeoutMs });
  if (detected.kind !== 'detected') return { kind: detected.kind };

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(trustedSites)
        .values({
          id: randomUUID(),
          accountId,
          host: detected.site.host,
          name: detected.site.name,
          active: true,
          searchConfig: detected.site.searchConfig,
          createdAt: now,
        })
        .returning();
      if (!row) throw new Error('site not inserted');
      return {
        kind: 'added',
        site: toSite(row),
        dataVersion: await bumpDataVersion(tx, accountId),
      };
    });
  } catch (error) {
    // The same site added twice at once: the unique index lets one through.
    if (isUniqueViolation(error)) return { kind: 'duplicate' };
    throw error;
  }
}

/** Switches a site on or off (S18); null when the account has no such site. */
export async function setSiteActive(
  { db }: Database,
  accountId: string,
  siteId: string,
  active: boolean,
): Promise<{ site: TrustedSite; dataVersion: number } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(trustedSites)
      .set({ active })
      .where(and(eq(trustedSites.id, siteId), eq(trustedSites.accountId, accountId)))
      .returning();
    if (!row) return null;
    return { site: toSite(row), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}

/** Removes a site; recipes saved from it stay (they do not reference it). Null when there is no such site. */
export async function deleteSite(
  { db }: Database,
  accountId: string,
  siteId: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(trustedSites)
      .where(and(eq(trustedSites.id, siteId), eq(trustedSites.accountId, accountId)))
      .returning({ id: trustedSites.id });
    return deleted.length === 0 ? null : await bumpDataVersion(tx, accountId);
  });
}

export type TestSite = { host: string; name: string; active: boolean; searchConfig: SearchConfig };

/** Test support only: replaces the sites of the account with the given ones. */
export async function replaceSitesForTests(
  { db }: Database,
  accountId: string,
  sites: TestSite[],
  now: Date,
) {
  await db.transaction(async (tx) => {
    await tx.delete(trustedSites).where(eq(trustedSites.accountId, accountId));
    if (sites.length > 0) {
      await tx.insert(trustedSites).values(
        sites.map((site, index) => ({
          id: randomUUID(),
          accountId,
          ...site,
          createdAt: new Date(now.getTime() + index),
        })),
      );
    }
    await bumpDataVersion(tx, accountId);
  });
}
