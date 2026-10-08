import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorResponseSchema } from '../../src/shared/contracts/error';
import { recipeResponseSchema } from '../../src/shared/contracts/recipe';
import {
  importPreviewResponseSchema,
  type ImportPreviewResponse,
} from '../../src/shared/contracts/recipeImport';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { createPageFetcher } from '../../src/server/integrations/pageFetcher';
import { recipes } from '../../src/server/db/schema';
import {
  CookieJar,
  OWNER_EMAIL,
  loginWithMock,
  originHeaders,
  testConfig,
  useApp,
} from './helpers';

const pagesDir = path.resolve(import.meta.dirname, '../e2e/fixtures/pages');

let pages: Server;
let origin = '';
let image: Buffer;

beforeAll(async () => {
  image = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#336699' } })
    .png()
    .toBuffer();
  pages = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://x').pathname;
    const slug = /^\/przepisy\/([a-z-]+)$/.exec(pathname)?.[1];
    if (slug === 'niedostepna') return; // never answers
    if (slug && slug !== 'blad') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return response.end(readFileSync(path.join(pagesDir, `${slug}.html`)));
    }
    if (pathname === '/img/danie.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      return response.end(image);
    }
    response.writeHead(500);
    response.end();
  });
  await new Promise<void>((resolve) => pages.listen(0, '127.0.0.1', resolve));
  origin = `http://fixtures.test:${(pages.address() as AddressInfo).port}`;
});

afterAll(async () => {
  pages.closeAllConnections();
  await new Promise((resolve) => pages.close(resolve));
});

describe('POST /api/recipes/import-preview', () => {
  // "fixtures.test" stands for a recipe site: every name resolves to the local page server.
  const toLocalPages = () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]);
  const harness = useApp(() => ({
    config: testConfig({ FETCH_ALLOW_PRIVATE_NETWORK: 'true', FETCH_TIMEOUT_MS: '1000' }),
    pageFetcher: createPageFetcher({
      timeoutMs: 1000,
      allowPrivateNetwork: true,
      resolve: toLocalPages,
    }),
  }));

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const preview = (jar: CookieJar, payload: unknown) =>
    harness.app.inject({
      method: 'POST',
      url: '/api/recipes/import-preview',
      headers: { ...originHeaders, ...jar.header() },
      payload: payload as object,
    });

  const save = (jar: CookieJar, payload: unknown) =>
    harness.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: { ...originHeaders, ...jar.header() },
      payload: payload as object,
    });

  const read = async (jar: CookieJar, page: string): Promise<ImportPreviewResponse> => {
    const response = await preview(jar, { url: `${origin}/przepisy/${page}` });
    expect(response.statusCode).toBe(200);
    return importPreviewResponseSchema.parse(response.json());
  };

  /** The request the client sends when the user saves a preview as it is. */
  const asRecipe = (result: ImportPreviewResponse, overrides: Record<string, unknown> = {}) => ({
    ...result.draft,
    servings: result.draft.servings ?? 2,
    ...overrides,
  });

  it('requires a session', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/recipes/import-preview',
      headers: originHeaders,
      payload: { url: `${origin}/przepisy/czytelna` },
    });

    expect(response.statusCode).toBe(401);
  });

  it('reads a readable page into a complete draft with the photo stored', async () => {
    const jar = await login();

    const result = await read(jar, 'czytelna');

    expect(result.status).toBe('complete');
    expect(result.missing).toEqual([]);
    expect(result.draft).toMatchObject({
      title: 'Kurczak pieczony z cukinią',
      servings: 4,
      sourceUrl: `${origin}/przepisy/czytelna`,
      sourceImport: { rating: 4.6, ratingCount: 128, siteName: 'Smaczne Testy', nutrition: null },
    });
    expect(result.draft.ingredients).toHaveLength(5);
    expect(result.draft.steps).toHaveLength(3);
    const photo = await harness.app.inject({
      method: 'GET',
      url: `/api/photos/${result.draft.photoId}`,
      headers: jar.header(),
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect((await sharp(photo.rawPayload).metadata()).width).toBe(1280);
  });

  it('does not save anything but the photo', async () => {
    const jar = await login();

    await read(jar, 'czytelna');

    const data = snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );
    expect(data.recipes).toEqual([]);
    expect(data.dataVersion).toBe(0);
  });

  it('reports a missing rating, servings or photo without failing', async () => {
    const jar = await login();

    const noRating = await read(jar, 'bez-oceny');
    expect(noRating.status).toBe('complete');
    expect(noRating.draft.sourceImport).toMatchObject({ rating: null, ratingCount: null });

    const noServings = await read(jar, 'bez-liczby-porcji');
    expect(noServings).toMatchObject({ status: 'complete', missing: ['servings'] });
    expect(noServings.draft.servings).toBeNull();

    const noPhoto = await read(jar, 'bez-zdjecia');
    expect(noPhoto.status).toBe('complete');
    expect(noPhoto.draft.photoId).toBeNull();
  });

  it('keeps the nutrition values the page states', async () => {
    const jar = await login();

    const full = await read(jar, 'z-wartosciami-odzywczymi');
    const part = await read(jar, 'z-czescia-wartosci');

    expect(full.draft.sourceImport?.nutrition).toEqual({
      kcal: 310,
      proteinG: 21.5,
      fatG: 22,
      fiberG: 3,
    });
    expect(part.draft.sourceImport?.nutrition).toMatchObject({ kcal: 240, proteinG: 26 });
  });

  it('answers a partial draft for a page without ingredients or without a recipe', async () => {
    const jar = await login();

    const noIngredients = await read(jar, 'bez-skladnikow');
    expect(noIngredients).toMatchObject({ status: 'partial', missing: ['ingredients'] });
    expect(noIngredients.draft).toMatchObject({
      title: 'Ryba w sosie',
      servings: 2,
      ingredients: [],
      photoId: null,
      sourceImport: null,
    });
    expect(noIngredients.draft.steps).toHaveLength(2);

    const notRecipe = await read(jar, 'nie-przepis');
    expect(notRecipe.status).toBe('partial');
    expect(notRecipe.missing).toEqual(expect.arrayContaining(['ingredients', 'steps']));
    expect(notRecipe.draft.sourceUrl).toBe(`${origin}/przepisy/nie-przepis`);
  });

  it.each([
    ['text that is not an address', { url: 'to nie jest adres' }],
    ['an unsupported scheme', { url: 'ftp://example.com/przepis' }],
    ['an empty address', { url: '  ' }],
    ['no address', {}],
    ['an address that is not text', { url: 42 }],
  ])('rejects %s with invalid_url', async (_name, payload) => {
    const jar = await login();

    const response = await preview(jar, payload);

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.parse(response.json())).toEqual({ error: { code: 'invalid_url' } });
  });

  it('answers source_unavailable when the page does not answer in time or fails', async () => {
    const jar = await login();

    for (const page of ['niedostepna', 'blad']) {
      const response = await preview(jar, { url: `${origin}/przepisy/${page}` });

      expect(response.statusCode).toBe(502);
      expect(errorResponseSchema.parse(response.json())).toEqual({
        error: { code: 'source_unavailable' },
      });
    }
    const refused = await preview(jar, { url: 'http://fixtures.test:9/przepis' });
    expect(refused.statusCode).toBe(502);
  });

  it('refuses private addresses when the network is not allowed', async () => {
    const strict = createStrictHarness();
    const jar = await strict.login();

    const response = await strict.preview(jar, { url: `${origin}/przepisy/czytelna` });

    expect(response.statusCode).toBe(502);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe('source_unavailable');
  });

  describe('saving what was read', () => {
    it('saves a link recipe with the rating, the site, the source and the photo', async () => {
      const jar = await login();
      const result = await read(jar, 'z-wartosciami-odzywczymi');
      const photo = await read(jar, 'czytelna');

      const response = await save(jar, asRecipe(result, { photoId: photo.draft.photoId }));

      expect(response.statusCode).toBe(201);
      const { recipe } = recipeResponseSchema.parse(response.json());
      expect(recipe).toMatchObject({
        title: 'Omlet z warzywami',
        kind: 'link',
        sourceUrl: `${origin}/przepisy/z-wartosciami-odzywczymi`,
        sourceSiteName: 'Smaczne Testy',
        sourceRating: 4.5,
        sourceRatingCount: 12,
        photoId: photo.draft.photoId,
      });
      // The values of the page are kept for later; their origin is decided in a later step.
      expect(recipe.nutrition.kcal).toEqual({ value: null, origin: 'none' });
      const [row] = await harness.database.db
        .select({ sourceNutrition: recipes.sourceNutrition, key: recipes.sourceUrlKey })
        .from(recipes)
        .where(eq(recipes.id, recipe.id));
      expect(row?.sourceNutrition).toEqual({ kcal: 310, proteinG: 21.5, fatG: 22, fiberG: 3 });
      expect(row?.key).toBe(`${new URL(origin).host}/przepisy/z-wartosciami-odzywczymi`);
    });

    it('saves a recipe without a rating with empty rating fields', async () => {
      const jar = await login();

      const response = await save(jar, asRecipe(await read(jar, 'bez-oceny')));

      const { recipe } = recipeResponseSchema.parse(response.json());
      expect(recipe).toMatchObject({ kind: 'link', sourceRating: null, sourceRatingCount: null });
    });

    it('refuses a second recipe from the same page in any spelling of the address', async () => {
      const jar = await login();
      const first = await read(jar, 'czytelna');
      const created = recipeResponseSchema.parse((await save(jar, asRecipe(first))).json());
      const host = new URL(origin).host;
      const variants = [
        `${origin}/przepisy/czytelna`,
        `${origin}/przepisy/czytelna/`,
        `https://${host}/przepisy/czytelna?utm_source=fb`,
        `${origin}/przepisy/czytelna#skladniki`,
      ];

      for (const url of variants) {
        const again = await preview(jar, { url });
        expect(again.statusCode).toBe(409);
        expect(errorResponseSchema.parse(again.json())).toEqual({
          error: { code: 'duplicate_source', recipeId: created.recipe.id },
        });
        const copy = await save(jar, asRecipe(first, { sourceUrl: url }));
        expect(copy.statusCode).toBe(409);
        expect(errorResponseSchema.parse(copy.json()).error.recipeId).toBe(created.recipe.id);
      }

      const data = snapshotSchema.parse(
        (
          await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
        ).json(),
      );
      expect(data.recipes).toHaveLength(1);
    });

    it('does not mix up the recipes of different pages', async () => {
      const jar = await login();
      await save(jar, asRecipe(await read(jar, 'czytelna')));

      const other = await preview(jar, { url: `${origin}/przepisy/bez-oceny` });

      expect(other.statusCode).toBe(200);
    });

    it('treats a recipe typed by hand with a source link as the same page too', async () => {
      const jar = await login();
      const manual = {
        title: 'Z formularza ręcznego',
        servings: 2,
        ingredients: [{ originalText: 'sól' }],
        steps: ['Posól.'],
        sourceUrl: `${origin}/przepisy/nie-przepis`,
      };
      const created = recipeResponseSchema.parse((await save(jar, manual)).json());
      expect(created.recipe).toMatchObject({ kind: 'manual', sourceSiteName: 'fixtures.test' });

      const again = await preview(jar, { url: `${origin}/przepisy/nie-przepis/` });

      expect(again.statusCode).toBe(409);
      expect(errorResponseSchema.parse(again.json()).error.recipeId).toBe(created.recipe.id);
    });

    it('lets the same page be saved again after its recipe is deleted', async () => {
      const jar = await login();
      const first = await read(jar, 'czytelna');
      const created = recipeResponseSchema.parse((await save(jar, asRecipe(first))).json());
      await harness.app.inject({
        method: 'DELETE',
        url: `/api/recipes/${created.recipe.id}`,
        headers: { ...originHeaders, ...jar.header() },
      });

      const again = await preview(jar, { url: `${origin}/przepisy/czytelna` });

      expect(again.statusCode).toBe(200);
    });

    it('ignores the source fields when a link recipe is edited', async () => {
      const jar = await login();
      const created = recipeResponseSchema.parse(
        (await save(jar, asRecipe(await read(jar, 'czytelna')))).json(),
      );

      const response = await harness.app.inject({
        method: 'PUT',
        url: `/api/recipes/${created.recipe.id}`,
        headers: { ...originHeaders, ...jar.header() },
        payload: {
          title: 'Zmieniony tytuł',
          servings: 2,
          ingredients: [{ originalText: 'sól' }],
          steps: ['Posól.'],
          sourceUrl: 'https://inna.example.test/strona',
          sourceImport: { rating: 1, ratingCount: 1, siteName: 'Inny', nutrition: null },
        },
      });

      expect(response.statusCode).toBe(200);
      const { recipe } = recipeResponseSchema.parse(response.json());
      expect(recipe).toMatchObject({
        title: 'Zmieniony tytuł',
        sourceUrl: `${origin}/przepisy/czytelna`,
        sourceRating: 4.6,
        sourceRatingCount: 128,
        sourceSiteName: 'Smaczne Testy',
      });
    });
  });

  function createStrictHarness() {
    const login_ = async () => {
      // The same app, but a fetcher that does not reach private addresses.
      return login();
    };
    return {
      login: login_,
      preview: async (jar: CookieJar, payload: unknown) => {
        const { buildApp } = await import('../../src/server/app');
        const app = await buildApp({
          config: harness.config,
          database: harness.database,
          clock: harness.clock,
          pageFetcher: createPageFetcher({
            timeoutMs: 1000,
            allowPrivateNetwork: false,
            resolve: toLocalPages,
          }),
        });
        try {
          return await app.inject({
            method: 'POST',
            url: '/api/recipes/import-preview',
            headers: { ...originHeaders, ...jar.header() },
            payload: payload as object,
          });
        } finally {
          await app.close();
        }
      },
    };
  }
});
