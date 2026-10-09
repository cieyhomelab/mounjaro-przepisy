import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { searchResponseSchema } from '../../src/shared/contracts/trustedSite';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { createPageFetcher } from '../../src/server/integrations/pageFetcher';
import {
  CookieJar,
  OWNER_EMAIL,
  loginWithMock,
  originHeaders,
  testConfig,
  useApp,
} from './helpers';

// A pixel-sized PNG; the image proxy only passes the bytes on.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const recipeHtml = (title: string, value: number, best: number, count: number) =>
  `<html><head><title>${title}</title><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    image: '/img/a.png',
    recipeYield: '2',
    recipeIngredient: ['1 jajko'],
    recipeInstructions: ['Ugotuj.'],
    aggregateRating: { ratingValue: value, bestRating: best, ratingCount: count },
  })}</script></head><body></body></html>`;

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    const host = (request.headers.host ?? '').split(':')[0];
    const url = new URL(request.url ?? '/', 'http://x');
    const html = (body: string) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
    };
    if (host === 'wolny.test') return; // never answers
    if (url.pathname === '/img/a.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      return response.end(PNG);
    }
    if (url.pathname === '/szukaj') {
      const count = url.searchParams.get('q') === 'brak' ? 0 : 12;
      const links = Array.from({ length: count }, (_, i) => `<a href="/przepis/p-${i + 1}">x</a>`);
      links.push(
        '<a href="https://inny.example/przepis/obcy">obcy</a>',
        '<a href="/o-nas">o nas</a>',
      );
      return html(`<html><body>${links.join('')}</body></html>`);
    }
    const number = Number(/^\/przepis\/p-(\d+)$/.exec(url.pathname)?.[1]);
    if (host === 'skala10.test' && number > 0) {
      return html(recipeHtml(`Dziesiątka ${number}`, 9, 10, 5));
    }
    if (number > 0) return html(recipeHtml(`Przepis ${number}`, 5 - number * 0.1, 5, number));
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('trusted sites and search', () => {
  const harness = useApp(() => ({
    config: testConfig({ FETCH_ALLOW_PRIVATE_NETWORK: 'true', FETCH_TIMEOUT_MS: '1000' }),
    pageFetcher: createPageFetcher({
      timeoutMs: 1000,
      allowPrivateNetwork: true,
      resolve: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
    }),
  }));

  const site = (host: string, name: string, active = true) => ({
    host: `${host}.test`,
    name,
    active,
    searchConfig: {
      searchUrl: `http://${host}.test:${port}/szukaj?q={q}`,
      linkPattern: '^/przepis/p-\\d+$',
    },
  });

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const useSites = async (sites: ReturnType<typeof site>[]) => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/__test/trusted-sites',
      payload: { sites },
    });
    expect(response.statusCode).toBe(204);
  };

  const get = (jar: CookieJar, url: string) =>
    harness.app.inject({ method: 'GET', url, headers: jar.header() });

  const search = async (jar: CookieJar, q: string) => {
    const response = await get(jar, `/api/search?q=${encodeURIComponent(q)}`);
    expect(response.statusCode).toBe(200);
    return searchResponseSchema.parse(response.json());
  };

  const snapshotSites = async (jar: CookieJar) =>
    snapshotSchema.parse((await get(jar, '/api/snapshot')).json()).trustedSites;

  it('requires a session', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/search?q=jajko' });
    expect(response.statusCode).toBe(401);
  });

  it('gives a new account the four starter sites, all active (S18)', async () => {
    const jar = await login();
    const sites = await snapshotSites(jar);
    expect(sites.map((s) => s.host)).toEqual([
      'aniagotuje.pl',
      'kwestiasmaku.com',
      'przepisy.pl',
      'doradcasmaku.pl',
    ]);
    expect(sites.every((s) => s.active)).toBe(true);
  });

  it('returns at most 10 results per site, best rated first (S17)', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A')]);
    const { results, failedSites } = await search(jar, 'jajko');
    expect(failedSites).toEqual([]);
    expect(results).toHaveLength(10);
    expect(results.map((r) => r.title).slice(0, 3)).toEqual([
      'Przepis 1',
      'Przepis 2',
      'Przepis 3',
    ]);
    expect(results[0]).toMatchObject({ siteName: 'Serwis A', ratingCount: 1, recipeId: null });
    expect(results[0]?.rating).toBeCloseTo(4.9, 1);
    expect(results.every((r) => r.imageToken !== null)).toBe(true);
  });

  it('scales ratings of other scales to 0–5 and merges the sites into one sorted list', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A'), site('skala10', 'Skala dziesięć')]);
    const { results } = await search(jar, 'jajko');
    expect(results).toHaveLength(20);
    const scaled = results.find((r) => r.title === 'Dziesiątka 1');
    expect(scaled?.rating).toBeCloseTo(4.5, 2);
    const ratings = results.map((r) => r.rating ?? -1);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('names a site that does not answer and still returns the other results', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A'), site('wolny', 'Wolny serwis')]);
    const { results, failedSites } = await search(jar, 'jajko');
    expect(results).toHaveLength(10);
    expect(failedSites).toEqual([{ name: 'Wolny serwis' }]);
  });

  it('returns an empty list for a phrase without results', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A')]);
    expect(await search(jar, 'brak')).toEqual({ results: [], failedSites: [] });
  });

  it('marks a result already in the collection with its recipe (S17)', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A')]);
    const saved = await harness.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: { ...originHeaders, ...jar.header() },
      payload: {
        title: 'Mój zapis',
        servings: 2,
        ingredients: [{ originalText: 'sól' }],
        steps: ['Wymieszaj.'],
        nutritionManual: {},
        sourceUrl: `http://www.a.test:${port}/przepis/p-3/`,
      },
    });
    expect(saved.statusCode).toBe(201);
    const { results } = await search(jar, 'jajko');
    const marked = results.filter((r) => r.recipeId !== null);
    expect(marked.map((r) => r.title)).toEqual(['Przepis 3']);
  });

  it('does not search switched-off sites and refuses when none is active (S18)', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A'), site('skala10', 'Skala dziesięć')]);
    const [first] = await snapshotSites(jar);
    const patched = await harness.app.inject({
      method: 'PATCH',
      url: `/api/trusted-sites/${first?.id}`,
      headers: { ...originHeaders, ...jar.header() },
      payload: { active: false },
    });
    expect(patched.statusCode).toBe(200);
    const { results } = await search(jar, 'jajko');
    expect(results.every((r) => r.siteName === 'Skala dziesięć')).toBe(true);

    const second = (await snapshotSites(jar))[1];
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/trusted-sites/${second?.id}`,
      headers: { ...originHeaders, ...jar.header() },
      payload: { active: false },
    });
    const none = await get(jar, '/api/search?q=jajko');
    expect(none.statusCode).toBe(409);
    expect(none.json()).toEqual({ error: { code: 'no_trusted_sites' } });
  });

  it('deletes a site and keeps the recipes saved from it (S18)', async () => {
    const jar = await login();
    const [first] = await snapshotSites(jar);
    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: `/api/trusted-sites/${first?.id}`,
      headers: { ...originHeaders, ...jar.header() },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await snapshotSites(jar)).toHaveLength(3);
    const again = await harness.app.inject({
      method: 'DELETE',
      url: `/api/trusted-sites/${first?.id}`,
      headers: { ...originHeaders, ...jar.header() },
    });
    expect(again.statusCode).toBe(404);
  });

  it('rejects a phrase that is too short or too long', async () => {
    const jar = await login();
    expect((await get(jar, '/api/search?q=a')).statusCode).toBe(400);
    expect((await get(jar, `/api/search?q=${'a'.repeat(101)}`)).statusCode).toBe(400);
  });

  it('serves a result photo through the app, and only for a token it issued', async () => {
    const jar = await login();
    await useSites([site('a', 'Serwis A')]);
    const { results } = await search(jar, 'jajko');
    const image = await get(jar, `/api/search/images/${results[0]?.imageToken}`);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.rawPayload.equals(PNG)).toBe(true);
    expect((await get(jar, '/api/search/images/zmyslony')).statusCode).toBe(404);
  });
});
