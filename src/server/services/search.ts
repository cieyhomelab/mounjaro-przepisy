import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { SearchResponse, SearchResult } from '../../shared/contracts/trustedSite';
import { sortSearchResults } from '../../shared/domain/searchResults';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import type { Database } from '../db/client';
import { recipes } from '../db/schema';
import type { PageFetcher } from '../integrations/pageFetcher';
import { searchSite, type SiteResult } from '../integrations/siteSearch';
import { listActiveSearchSites } from './trustedSites';

/** The whole search ends within this time (S17: results or a message within 15 seconds). */
const TOTAL_BUDGET_MS = 14_500;
/** A photo is served through the app only this long after the search returned it. */
const IMAGE_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_IMAGE_TOKENS = 2000;

type ImageGrant = { accountId: string; imageUrl: string; expiresAt: number };

/**
 * Photos of search results, by an unguessable token. The browser asks the app for them so it
 * never connects to other sites; only addresses that the search itself returned can be fetched.
 */
export class ImageGrants {
  private grants = new Map<string, ImageGrant>();

  issue(accountId: string, imageUrl: string, now: number): string {
    this.prune(now);
    const token = randomBytes(18).toString('base64url');
    this.grants.set(token, { accountId, imageUrl, expiresAt: now + IMAGE_TOKEN_TTL_MS });
    return token;
  }

  /** The address behind a token that is still valid for the account, or null. */
  resolve(accountId: string, token: string, now: number): string | null {
    const grant = this.grants.get(token);
    if (!grant || grant.accountId !== accountId || grant.expiresAt <= now) return null;
    return grant.imageUrl;
  }

  private prune(now: number) {
    for (const [token, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(token);
    while (this.grants.size >= MAX_IMAGE_TOKENS) {
      const oldest = this.grants.keys().next().value;
      if (oldest === undefined) break;
      this.grants.delete(oldest);
    }
  }
}

const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('deadline')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('search failed'));
      },
    );
  });

/**
 * Searches every active trusted site of the account in parallel (S17) and merges the results
 * into one list in the order of S17. A site that fails or does not answer in time is only named.
 * `noSites` when the account has no active site.
 */
export async function searchTrustedSites(
  database: Database,
  fetcher: PageFetcher,
  grants: ImageGrants,
  accountId: string,
  query: string,
  fetchTimeoutMs: number,
): Promise<SearchResponse | 'no_sites'> {
  const sites = await listActiveSearchSites(database.db, accountId);
  if (sites.length === 0) return 'no_sites';

  const settled = await Promise.all(
    sites.map(async (site) => {
      try {
        const found = await withDeadline(
          searchSite(fetcher, site.searchConfig, query, { timeoutMs: fetchTimeoutMs }),
          TOTAL_BUDGET_MS,
        );
        return { site, found };
      } catch {
        return { site, found: null };
      }
    }),
  );

  const flat: { siteName: string; result: SiteResult }[] = settled.flatMap(({ site, found }) =>
    (found ?? []).map((result) => ({ siteName: site.name, result })),
  );
  const keys = flat.flatMap(({ result }) => {
    const key = parseSourceUrl(result.url)?.key;
    return key ? [key] : [];
  });
  const owned = new Map<string, string>();
  if (keys.length > 0) {
    const rows = await database.db
      .select({ id: recipes.id, key: recipes.sourceUrlKey })
      .from(recipes)
      .where(and(eq(recipes.accountId, accountId), inArray(recipes.sourceUrlKey, keys)));
    for (const row of rows) if (row.key) owned.set(row.key, row.id);
  }

  const now = Date.now();
  const results: SearchResult[] = flat.map(({ siteName, result }) => ({
    title: result.title,
    url: result.url,
    imageToken: result.imageUrl ? grants.issue(accountId, result.imageUrl, now) : null,
    siteName,
    rating: result.rating,
    ratingCount: result.ratingCount,
    recipeId: owned.get(parseSourceUrl(result.url)?.key ?? '') ?? null,
  }));

  return {
    results: sortSearchResults(results),
    failedSites: settled
      .filter(({ found }) => found === null)
      .map(({ site }) => ({ name: site.name })),
  };
}
