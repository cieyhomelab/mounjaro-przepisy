import * as cheerio from 'cheerio';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import { FetchError, type PageFetcher } from './pageFetcher';
import { parseRecipePage } from './recipeParser';
import type { SearchConfig } from './siteSearch';

/** The phrase of the trial search that proves a site can be searched. */
const PROBE_PHRASE = 'kurczak';
/** Typical places of a site's search when the site does not describe it (S18). */
const COMMON_SEARCH_PATHS = ['/?s={q}', '/szukaj?q={q}'];
/** Pages looked at in one trial search; the same bound as the search itself. */
const MAX_PROBED_PAGES = 14;
const MAX_NAME_LENGTH = 60;
const PLACEHOLDER = '__q__';

export type DetectedSite = { host: string; name: string; searchConfig: SearchConfig };

/** `unavailable`: the site's front page could not be read; `not_searchable`: no trial search found recipes. */
export type DetectOutcome =
  { kind: 'detected'; site: DetectedSite } | { kind: 'not_searchable' } | { kind: 'unavailable' };

/** Resolves a search address template (`{q}`, `{search_term_string}` or `{searchTerms}`) against the site; null when it leaves the site. */
function toSearchUrl(template: string, base: string, siteHost: string): string | null {
  const marked = template.replace(/\{(?:q|search_term_string|searchTerms)\??\}/g, PLACEHOLDER);
  if (!marked.includes(PLACEHOLDER)) return null;
  let resolved: URL;
  try {
    resolved = new URL(marked, base);
  } catch {
    return null;
  }
  if (parseSourceUrl(resolved.href)?.host !== siteHost) return null;
  return resolved.href.replaceAll(PLACEHOLDER, '{q}');
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function* walk(value: unknown): Generator<JsonObject> {
  if (Array.isArray(value)) for (const item of value) yield* walk(item);
  else if (isObject(value)) {
    yield value;
    yield* walk(value['@graph']);
    yield* walk(value['potentialAction']);
  }
}

/** The name and the `SearchAction` templates a front page declares in its schema.org data. */
function readSchemaOrg(
  $: cheerio.CheerioAPI,
  siteHost: string,
  base: string,
): { name: string | null; templates: string[] } {
  let name: string | null = null;
  const templates: string[] = [];
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown;
    try {
      data = JSON.parse($(element).text());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      if (node['@type'] === 'WebSite' && typeof node['name'] === 'string') name ??= node['name'];
      if (node['@type'] !== 'SearchAction') continue;
      const target = node['target'];
      const raw = isObject(target) ? target['urlTemplate'] : target;
      if (typeof raw !== 'string') continue;
      const url = toSearchUrl(raw, base, siteHost);
      if (url) templates.push(url);
    }
  }
  return { name, templates };
}

/** The search template of the OpenSearch description the front page links to, if any. */
async function readOpenSearch(
  fetcher: PageFetcher,
  $: cheerio.CheerioAPI,
  base: string,
  siteHost: string,
  timeoutMs: number,
): Promise<string[]> {
  const href = $('link[rel="search"][type="application/opensearchdescription+xml"]').attr('href');
  if (!href) return [];
  try {
    const description = await fetcher.fetch(new URL(href, base).href, 'html', { timeoutMs });
    const xml = cheerio.load(description.body.toString('utf8'), { xmlMode: true });
    return xml('Url')
      .toArray()
      .flatMap((element) => {
        const type = xml(element).attr('type') ?? 'text/html';
        const url = type.startsWith('text/html')
          ? toSearchUrl(xml(element).attr('template') ?? '', base, siteHost)
          : null;
        return url ? [url] : [];
      });
  } catch (error) {
    if (error instanceof FetchError) return [];
    throw error;
  }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A path pattern that matches the given recipe paths: same folders, any last segment. */
function linkPatternFor(paths: string[]): string {
  const folders = [
    ...new Set(paths.map((path) => path.replace(/\/+$/, '').split('/').slice(0, -1).join('/'))),
  ];
  return `^(?:${folders.map(escapeRegExp).join('|')})/[^/]+/?$`;
}

/** Runs the trial search of one template; the search config when it led to recipe pages, else null. */
async function trySearch(
  fetcher: PageFetcher,
  template: string,
  siteHost: string,
  timeoutMs: number,
): Promise<SearchConfig | null> {
  const options = { timeoutMs };
  let page;
  try {
    page = await fetcher.fetch(
      template.replace('{q}', encodeURIComponent(PROBE_PHRASE)),
      'html',
      options,
    );
  } catch (error) {
    if (error instanceof FetchError) return null;
    throw error;
  }
  const $ = cheerio.load(page.body.toString('utf8'));
  const seen = new Set<string>();
  const links: URL[] = [];
  for (const element of $('a[href]').toArray()) {
    let target: URL;
    try {
      target = new URL($(element).attr('href') ?? '', page.finalUrl);
    } catch {
      continue;
    }
    target.hash = '';
    const parsed = parseSourceUrl(target.href);
    if (!parsed || parsed.host !== siteHost || target.pathname === '/' || seen.has(parsed.key)) {
      continue;
    }
    seen.add(parsed.key);
    links.push(target);
    if (links.length >= MAX_PROBED_PAGES) break;
  }
  const recipePaths = await Promise.all(
    links.map(async (link) => {
      try {
        const recipePage = await fetcher.fetch(link.href, 'html', options);
        const parsed = parseRecipePage(recipePage.body.toString('utf8'), recipePage.finalUrl);
        return parsed.hasRecipeData && parsed.title ? link.pathname : null;
      } catch (error) {
        if (error instanceof FetchError) return null;
        throw error;
      }
    }),
  );
  const found = recipePaths.filter((path): path is string => path !== null);
  return found.length === 0 ? null : { searchUrl: template, linkPattern: linkPatternFor(found) };
}

/**
 * Works out how to search the site at `address` (S18): the search the front page declares
 * (schema.org `SearchAction`, then OpenSearch), then the usual addresses. A site is searchable
 * when a trial search returns at least one page with schema.org/Recipe data.
 */
export async function detectSite(
  fetcher: PageFetcher,
  address: string,
  options: { timeoutMs: number },
): Promise<DetectOutcome> {
  const source = parseSourceUrl(address);
  if (!source) return { kind: 'unavailable' };
  const origin = new URL(source.url).origin;
  let front;
  try {
    front = await fetcher.fetch(`${origin}/`, 'html', options);
  } catch (error) {
    if (error instanceof FetchError) return { kind: 'unavailable' };
    throw error;
  }
  const $ = cheerio.load(front.body.toString('utf8'));
  const declared = readSchemaOrg($, source.host, front.finalUrl);
  const described = await readOpenSearch(
    fetcher,
    $,
    front.finalUrl,
    source.host,
    options.timeoutMs,
  );
  const common = COMMON_SEARCH_PATHS.flatMap((path) => {
    const url = toSearchUrl(path, front.finalUrl, source.host);
    return url ? [url] : [];
  });
  const templates = [...new Set([...declared.templates, ...described, ...common])];

  for (const template of templates) {
    const searchConfig = await trySearch(fetcher, template, source.host, options.timeoutMs);
    if (!searchConfig) continue;
    const siteName =
      $('meta[property="og:site_name"]').attr('content')?.trim() || declared.name?.trim() || '';
    const name = (siteName || source.host).slice(0, MAX_NAME_LENGTH);
    return { kind: 'detected', site: { host: source.host, name, searchConfig } };
  }
  return { kind: 'not_searchable' };
}
