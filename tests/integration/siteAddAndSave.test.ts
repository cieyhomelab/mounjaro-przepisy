import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { searchResponseSchema } from '../../src/shared/contracts/trustedSite';
import { createPageFetcher } from '../../src/server/integrations/pageFetcher';
import {
  CookieJar,
  OWNER_EMAIL,
  loginWithMock,
  originHeaders,
  testConfig,
  useApp,
} from './helpers';

const recipe = (title: string, extra: Record<string, unknown> = {}) =>
  `<html><head><title>${title}</title><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    recipeYield: '2',
    recipeIngredient: ['1 jajko'],
    recipeInstructions: ['Ugotuj.'],
    ...extra,
  })}</script></head><body></body></html>`;

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    const host = (request.headers.host ?? '').split(':')[0];
    const url = new URL(request.url ?? '/', 'http://x');
    const send = (type: string, body: string, status = 200) => {
      response.writeHead(status, { 'content-type': type });
      response.end(body);
    };
    const html = (body: string) => send('text/html; charset=utf-8', body);
    const links = (hrefs: string[]) =>
      html(`<html><body>${hrefs.map((h) => `<a href="${h}">x</a>`).join('')}</body></html>`);
    if (host === 'wolny.test') return;
    if (url.pathname.startsWith('/przepisy/')) {
      const name = url.pathname.slice('/przepisy/'.length);
      if (name === 'brak-skladnikow') {
        return html(recipe('Bez składników', { recipeIngredient: [] }));
      }
      if (name === 'brak-porcji') return html(recipe('Bez porcji', { recipeYield: undefined }));
      return html(recipe(`Przepis ${name}`));
    }
    if (host === 'deklarowany.test') {
      if (url.pathname === '/') {
        const data = {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Deklarowany Serwis',
          potentialAction: {
            '@type': 'SearchAction',
            target: `http://deklarowany.test:${port}/wyniki?fraza={search_term_string}`,
          },
        };
        return html(
          `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head></html>`,
        );
      }
      if (url.pathname === '/wyniki') return links(['/przepisy/a', '/przepisy/b', '/kontakt']);
    }
    if (host === 'opensearch.test') {
      if (url.pathname === '/') {
        return html(
          '<html><head><meta property="og:site_name" content="Serwis OpenSearch"><link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml"></head></html>',
        );
      }
      if (url.pathname === '/opensearch.xml') {
        return send(
          'text/html',
          `<OpenSearchDescription><Url type="text/html" template="http://opensearch.test:${port}/find?term={searchTerms}"/></OpenSearchDescription>`,
        );
      }
      if (url.pathname === '/find') return links(['/przepisy/c']);
    }
    if (host === 'zwykly.test') {
      if (url.pathname === '/') return html('<html><body>Strona</body></html>');
      if (url.pathname === '/szukaj') return links(['/przepisy/d', '/przepisy/e']);
    }
    if (host === 'pusty.test') {
      if (url.pathname === '/') return html('<html><body>Strona</body></html>');
      return links(['/o-nas']);
    }
    send('text/plain', 'nie ma', 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('adding a trusted site and saving from search', () => {
  const harness = useApp(() => ({
    config: testConfig({ FETCH_ALLOW_PRIVATE_NETWORK: 'true', FETCH_TIMEOUT_MS: '1000' }),
    pageFetcher: createPageFetcher({
      timeoutMs: 1000,
      allowPrivateNetwork: true,
      resolve: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
    }),
  }));

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const post = (jar: CookieJar, url: string, payload: unknown) =>
    harness.app.inject({
      method: 'POST',
      url,
      headers: { ...originHeaders, ...jar.header() },
      payload: payload as object,
    });

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  const addSite = (jar: CookieJar, host: string, path = '/') =>
    post(jar, '/api/trusted-sites', { url: `http://${host}:${port}${path}` });

  it('requires a session', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/trusted-sites',
      headers: originHeaders,
      payload: { url: 'http://a.test' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('adds a site that declares its search in schema.org data, active and named (S18)', async () => {
    const jar = await login();
    const response = await addSite(jar, 'deklarowany.test');
    expect(response.statusCode).toBe(201);
    expect(response.json<{ site: unknown }>().site).toMatchObject({
      host: 'deklarowany.test',
      name: 'Deklarowany Serwis',
      active: true,
    });
    const sites = (await snapshot(jar)).trustedSites;
    expect(sites.at(-1)?.host).toBe('deklarowany.test');

    const found = searchResponseSchema.parse(
      (
        await harness.app.inject({
          method: 'GET',
          url: '/api/search?q=jajko',
          headers: jar.header(),
        })
      ).json(),
    );
    expect(found.results.length).toBeGreaterThan(0);
  });

  it('finds the search of a site through its OpenSearch description (S18)', async () => {
    const jar = await login();
    const response = await addSite(jar, 'opensearch.test');
    expect(response.statusCode).toBe(201);
    expect(response.json<{ site: { name: string } }>().site.name).toBe('Serwis OpenSearch');
  });

  it('falls back to the usual search address, and names the site by its host (S18)', async () => {
    const jar = await login();
    const response = await addSite(jar, 'zwykly.test', '/przepisy/d');
    expect(response.statusCode).toBe(201);
    expect(response.json<{ site: unknown }>().site).toMatchObject({
      host: 'zwykly.test',
      name: 'zwykly.test',
    });
  });

  it('does not add a site whose trial search finds no recipe (S18)', async () => {
    const jar = await login();
    const before = (await snapshot(jar)).trustedSites.length;
    const response = await addSite(jar, 'pusty.test');
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: { code: 'not_searchable' } });
    expect((await snapshot(jar)).trustedSites).toHaveLength(before);
  });

  it('does not add a site twice, also when the address differs by www or path (S18)', async () => {
    const jar = await login();
    expect((await addSite(jar, 'deklarowany.test')).statusCode).toBe(201);
    const again = await addSite(jar, 'deklarowany.test', '/przepisy/a');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: { code: 'duplicate_site' } });
    const www = await addSite(jar, 'www.deklarowany.test');
    expect(www.statusCode).toBe(409);
    const starter = await post(jar, '/api/trusted-sites', { url: 'https://www.przepisy.pl/' });
    expect(starter.statusCode).toBe(409);
  });

  it('answers 502 when the site does not respond and 400 for a bad address', async () => {
    const jar = await login();
    expect((await addSite(jar, 'wolny.test')).statusCode).toBe(502);
    expect((await post(jar, '/api/trusted-sites', { url: 'to nie adres' })).statusCode).toBe(400);
    expect((await post(jar, '/api/trusted-sites', {})).statusCode).toBe(400);
  });

  const saveUrl = (name: string) => ({ url: `http://zwykly.test:${port}/przepisy/${name}` });

  it('saves a readable result without a preview and refuses it a second time (S17)', async () => {
    const jar = await login();
    const response = await post(jar, '/api/search/save', saveUrl('dobry'));
    expect(response.statusCode).toBe(201);
    expect(response.json<{ recipe: unknown }>().recipe).toMatchObject({
      title: 'Przepis dobry',
      servings: 2,
    });
    expect((await snapshot(jar)).recipes).toHaveLength(1);

    const again = await post(jar, '/api/search/save', saveUrl('dobry'));
    expect(again.statusCode).toBe(409);
    expect(again.json<{ error: { code: string } }>().error.code).toBe('duplicate_source');
    expect((await snapshot(jar)).recipes).toHaveLength(1);
  });

  it('saves nothing when ingredients or servings are missing and returns what was read (S17)', async () => {
    const jar = await login();
    const noIngredients = await post(jar, '/api/search/save', saveUrl('brak-skladnikow'));
    expect(noIngredients.statusCode).toBe(200);
    expect(noIngredients.json()).toMatchObject({
      status: 'partial',
      missing: ['ingredients'],
      draft: { title: 'Bez składników' },
    });
    const noServings = await post(jar, '/api/search/save', saveUrl('brak-porcji'));
    expect(noServings.statusCode).toBe(200);
    expect(noServings.json()).toMatchObject({ status: 'partial', missing: ['servings'] });
    expect((await snapshot(jar)).recipes).toHaveLength(0);
  });

  it('rejects a bad address and a page that does not answer', async () => {
    const jar = await login();
    expect((await post(jar, '/api/search/save', { url: 'nie adres' })).statusCode).toBe(400);
    const slow = await post(jar, '/api/search/save', {
      url: `http://wolny.test:${port}/przepisy/x`,
    });
    expect(slow.statusCode).toBe(502);
  });
});
