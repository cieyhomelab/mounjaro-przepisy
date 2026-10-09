import * as cheerio from 'cheerio';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import { RESULTS_PER_SITE } from '../../shared/domain/searchResults';
import { FetchError, type PageFetcher } from './pageFetcher';
import { parseRecipePage } from './recipeParser';

/**
 * How to search one site: the address of its results page (`{q}` stands for the encoded phrase)
 * and a regular expression that the path of a link to a recipe page matches.
 */
export type SearchConfig = {
  searchUrl: string;
  linkPattern: string;
};

/** What the search found on one site, before the account's collection is consulted. */
export type SiteResult = {
  title: string;
  url: string;
  /** Address of the photo on the site. */
  imageUrl: string | null;
  /** Scale 0–5. */
  rating: number | null;
  ratingCount: number | null;
};

/** Recipe pages looked at per site; more than the limit, because some links are not recipes. */
const CANDIDATES_PER_SITE = 14;

export const hasPlaceholder = (config: SearchConfig) => config.searchUrl.includes('{q}');

/** Addresses of recipe pages found on a results page, in page order, once each, on the site's host. */
export function findRecipeLinks(html: string, pageUrl: string, config: SearchConfig): string[] {
  const pattern = new RegExp(config.linkPattern);
  const siteHost = parseSourceUrl(pageUrl)?.host;
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: string[] = [];
  for (const element of $('a[href]').toArray()) {
    let target: URL;
    try {
      target = new URL($(element).attr('href') ?? '', pageUrl);
    } catch {
      continue;
    }
    target.hash = '';
    const parsed = parseSourceUrl(target.href);
    if (!parsed || parsed.host !== siteHost || !pattern.test(target.pathname)) continue;
    if (seen.has(parsed.key)) continue;
    seen.add(parsed.key);
    links.push(parsed.url);
    if (links.length >= CANDIDATES_PER_SITE) break;
  }
  return links;
}

/**
 * Searches one site: fetches its results page, then reads the linked recipe pages in parallel.
 * Throws FetchError when the results page cannot be fetched (the site is reported as failed);
 * a recipe page that fails is skipped. At most `RESULTS_PER_SITE` results, in page order.
 */
export async function searchSite(
  fetcher: PageFetcher,
  config: SearchConfig,
  query: string,
  options: { timeoutMs: number },
): Promise<SiteResult[]> {
  const searchUrl = config.searchUrl.replace('{q}', encodeURIComponent(query));
  const page = await fetcher.fetch(searchUrl, 'html', options);
  const links = findRecipeLinks(page.body.toString('utf8'), page.finalUrl, config);
  const read = await Promise.all(
    links.map(async (link): Promise<SiteResult | null> => {
      try {
        const recipePage = await fetcher.fetch(link, 'html', options);
        const parsed = parseRecipePage(recipePage.body.toString('utf8'), recipePage.finalUrl);
        if (!parsed.hasRecipeData || !parsed.title) return null;
        return {
          title: parsed.title,
          url: link,
          imageUrl: parsed.imageUrl,
          rating: parsed.rating,
          ratingCount: parsed.ratingCount,
        };
      } catch (error) {
        if (error instanceof FetchError) return null;
        throw error;
      }
    }),
  );
  return read.filter((result): result is SiteResult => result !== null).slice(0, RESULTS_PER_SITE);
}
