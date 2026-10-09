import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from '../../src/shared/contracts/error';
import { recipeResponseSchema } from '../../src/shared/contracts/recipe';
import { API_VERSION } from '../../src/shared/contracts/session';
import { snapshotEtag, snapshotSchema } from '../../src/shared/contracts/snapshot';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const recipeBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Kurczak z ryżem',
  servings: 2,
  ingredients: [{ originalText: '200 g piersi z kurczaka' }, { originalText: 'sól do smaku' }],
  steps: ['Usmaż kurczaka.'],
  ...overrides,
});

const image = (format: 'png' | 'jpeg' | 'webp', width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#cc6633' } })
    [format]()
    .toBuffer();

describe('snapshot and manual recipes', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const post = (jar: CookieJar, payload: unknown) =>
    harness.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: { ...originHeaders, ...jar.header() },
      payload: payload as object,
    });

  const snapshot = (jar: CookieJar, headers: Record<string, string> = {}) =>
    harness.app.inject({
      method: 'GET',
      url: '/api/snapshot',
      headers: { ...jar.header(), ...headers },
    });

  const putPhoto = (jar: CookieJar, id: string, body: Buffer, contentType: string) =>
    harness.app.inject({
      method: 'PUT',
      url: `/api/recipes/${id}/photo`,
      headers: { ...originHeaders, ...jar.header(), 'content-type': contentType },
      payload: body,
    });

  describe('GET /api/snapshot', () => {
    it('returns the empty state of a new account with an ETag equal to the data version', async () => {
      const jar = await login();

      const response = await snapshot(jar);

      expect(response.statusCode).toBe(200);
      const body = snapshotSchema.parse(response.json());
      expect(body).toMatchObject({ dataVersion: 0, recipes: [], collections: [], cookEvents: [] });
      expect(body.settings.thresholdProteinG).toBe(25);
      expect(response.headers.etag).toBe(snapshotEtag(0));
    });

    it('answers 304 when the client already has the current version', async () => {
      const jar = await login();

      const response = await snapshot(jar, { 'if-none-match': snapshotEtag(0) });

      expect(response.statusCode).toBe(304);
      expect(response.body).toBe('');
      expect(response.headers.etag).toBe(snapshotEtag(0));
    });

    it('answers with a full snapshot to a client that knows the data version under another API version', async () => {
      const jar = await login();

      const response = await snapshot(jar, { 'if-none-match': snapshotEtag(0, API_VERSION - 1) });

      expect(response.statusCode).toBe(200);
      expect(snapshotSchema.parse(response.json()).apiVersion).toBe(API_VERSION);
    });

    it('answers with a full snapshot again after a change', async () => {
      const jar = await login();
      await post(jar, recipeBody());

      const response = await snapshot(jar, { 'if-none-match': snapshotEtag(0) });

      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBe(snapshotEtag(1));
      expect(snapshotSchema.parse(response.json()).recipes).toHaveLength(1);
    });
  });

  describe('POST /api/recipes', () => {
    it('creates a manual recipe, splits ingredients and raises the data version', async () => {
      const jar = await login();

      const response = await post(jar, recipeBody());

      expect(response.statusCode).toBe(201);
      const { recipe, dataVersion } = recipeResponseSchema.parse(response.json());
      expect(dataVersion).toBe(1);
      expect(recipe).toMatchObject({
        title: 'Kurczak z ryżem',
        kind: 'manual',
        servings: 2,
        steps: ['Usmaż kurczaka.'],
        photoId: null,
        sourceUrl: null,
      });
      expect(recipe.ingredients).toEqual([
        {
          quantity: 200,
          unit: 'g',
          name: 'piersi z kurczaka',
          originalText: '200 g piersi z kurczaka',
        },
        { quantity: null, unit: null, name: 'sól do smaku', originalText: 'sól do smaku' },
      ]);
      // 200 g of chicken breast is in the ingredient table, so the value is estimated (S5).
      expect(recipe.nutrition.proteinG).toEqual({ value: 23, origin: 'estimated' });
      const stored = snapshotSchema.parse((await snapshot(jar)).json());
      expect(stored.recipes.map((item) => item.id)).toEqual([recipe.id]);
      expect(stored.dataVersion).toBe(1);
    });

    it('stores typed nutrition values as manual and leaves the rest without data', async () => {
      const jar = await login();

      const response = await post(
        jar,
        recipeBody({
          ingredients: [{ originalText: 'sos tajemniczy' }],
          nutritionManual: { kcal: 412.4, proteinG: 28, fatG: null },
        }),
      );

      const { recipe } = recipeResponseSchema.parse(response.json());
      expect(recipe.nutrition).toEqual({
        kcal: { value: 412, origin: 'manual' },
        proteinG: { value: 28, origin: 'manual' },
        fatG: { value: null, origin: 'none' },
        fiberG: { value: null, origin: 'none' },
      });
    });

    it.each([
      ['no title', { title: ' ' }, { title: 'required' }],
      ['no servings', { servings: undefined }, { servings: 'required' }],
      ['servings below the range', { servings: 0.4 }, { servings: 'invalid' }],
      ['servings above the range', { servings: 99.5 }, { servings: 'invalid' }],
      ['servings off the 0.5 step', { servings: 1.3 }, { servings: 'invalid' }],
      ['no ingredients', { ingredients: [] }, { ingredients: 'required' }],
      ['no steps', { steps: [] }, { steps: 'required' }],
      ['negative nutrition', { nutritionManual: { kcal: -1 } }, { kcal: 'invalid' }],
      ['a source that is not an address', { sourceUrl: 'nie adres' }, { sourceUrl: 'invalid' }],
    ])('rejects %s and names the field', async (_name, override, fields) => {
      const jar = await login();

      const response = await post(jar, recipeBody(override));

      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.parse(response.json())).toEqual({
        error: { code: 'validation', fields },
      });
      expect(snapshotSchema.parse((await snapshot(jar)).json()).recipes).toHaveLength(0);
      expect(snapshotSchema.parse((await snapshot(jar)).json()).dataVersion).toBe(0);
    });

    it('accepts half servings and the limits of the range', async () => {
      const jar = await login();

      for (const servings of [0.5, 99]) {
        expect((await post(jar, recipeBody({ servings }))).statusCode).toBe(201);
      }
    });

    it('refuses a request from another origin', async () => {
      const jar = await login();

      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/recipes',
        headers: { origin: 'https://evil.example', ...jar.header() },
        payload: recipeBody(),
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('photos', () => {
    const createRecipe = async (jar: CookieJar) =>
      recipeResponseSchema.parse((await post(jar, recipeBody())).json()).recipe;

    it.each(['png', 'jpeg', 'webp'] as const)(
      'stores a %s upload as WebP with the longer side at most 1280 px',
      async (format) => {
        const jar = await login();
        const recipe = await createRecipe(jar);

        const upload = await putPhoto(
          jar,
          recipe.id,
          await image(format, 2400, 1200),
          `image/${format}`,
        );

        expect(upload.statusCode).toBe(200);
        const { recipe: updated, dataVersion } = recipeResponseSchema.parse(upload.json());
        expect(dataVersion).toBe(2);
        expect(updated.photoId).toBeTruthy();
        const photo = await harness.app.inject({
          method: 'GET',
          url: `/api/photos/${updated.photoId}`,
          headers: jar.header(),
        });
        expect(photo.statusCode).toBe(200);
        expect(photo.headers['content-type']).toBe('image/webp');
        expect(photo.headers['cache-control']).toBe('private, max-age=31536000, immutable');
        const meta = await sharp(photo.rawPayload).metadata();
        expect(meta).toMatchObject({ format: 'webp', width: 1280, height: 640 });
      },
    );

    it('does not enlarge a small photo', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const upload = await putPhoto(jar, recipe.id, await image('png', 300, 200), 'image/png');

      const { recipe: updated } = recipeResponseSchema.parse(upload.json());
      const photo = await harness.app.inject({
        method: 'GET',
        url: `/api/photos/${updated.photoId}`,
        headers: jar.header(),
      });
      expect(await sharp(photo.rawPayload).metadata()).toMatchObject({ width: 300, height: 200 });
    });

    it('replaces the previous photo of the recipe', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      await putPhoto(jar, recipe.id, await image('png', 100, 100), 'image/png');

      await putPhoto(jar, recipe.id, await image('png', 120, 120), 'image/png');

      const { rows } = await harness.database.pool.query('select 1 from recipe_photos');
      expect(rows).toHaveLength(1);
    });

    it('shows the photo id in the snapshot', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      const upload = await putPhoto(jar, recipe.id, await image('png', 100, 100), 'image/png');
      const { recipe: updated } = recipeResponseSchema.parse(upload.json());

      const stored = snapshotSchema.parse((await snapshot(jar)).json());

      expect(stored.recipes[0]?.photoId).toBe(updated.photoId);
    });

    it.each([
      ['a file that is not an image', Buffer.from('to nie jest obraz'), 'image/png'],
      ['a GIF', Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'), 'image/gif'],
      ['an empty body', Buffer.alloc(0), 'image/png'],
    ])('rejects %s with unsupported_image', async (_name, body, contentType) => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await putPhoto(jar, recipe.id, body, contentType);

      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe('unsupported_image');
    });

    it('rejects an upload larger than 10 MB', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await putPhoto(
        jar,
        recipe.id,
        Buffer.alloc(10 * 1024 * 1024 + 1),
        'image/png',
      );

      expect(response.statusCode).toBe(413);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('payload_too_large');
    });

    it('answers 404 for a recipe or photo that does not exist', async () => {
      const jar = await login();
      const missing = '00000000-0000-4000-8000-000000000000';

      const upload = await putPhoto(jar, missing, await image('png', 10, 10), 'image/png');
      const photo = await harness.app.inject({
        method: 'GET',
        url: `/api/photos/${missing}`,
        headers: jar.header(),
      });

      expect(upload.statusCode).toBe(404);
      expect(photo.statusCode).toBe(404);
    });

    it('answers 401 for a photo without a session', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      const upload = await putPhoto(jar, recipe.id, await image('png', 10, 10), 'image/png');
      const { recipe: updated } = recipeResponseSchema.parse(upload.json());

      const photo = await harness.app.inject({
        method: 'GET',
        url: `/api/photos/${updated.photoId}`,
      });

      expect(photo.statusCode).toBe(401);
    });

    it('attaches an unassigned photo named by photoId when the recipe is created', async () => {
      const jar = await login();
      const first = await createRecipe(jar);
      const upload = await putPhoto(jar, first.id, await image('png', 10, 10), 'image/png');
      const { recipe: withPhoto } = recipeResponseSchema.parse(upload.json());

      // A photo already attached to a recipe cannot be claimed by another one.
      const second = await post(jar, recipeBody({ photoId: withPhoto.photoId }));

      expect(recipeResponseSchema.parse(second.json()).recipe.photoId).toBeNull();
    });
  });
});
