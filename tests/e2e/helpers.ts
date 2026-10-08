import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The address the e2e stack accepts (compose.e2e.yml: ALLOWED_EMAIL). */
export const OWNER_EMAIL = 'owner@example.test';

/** Removes all data and restores the server clock. Tests share one server, so each starts here. */
export async function resetServer(request: APIRequestContext) {
  const response = await request.post('/api/__test/reset');
  expect(response.status()).toBe(204);
}

/** Sets the server clock to `now` plus the given number of days. */
export async function setServerClockAhead(request: APIRequestContext, days: number) {
  const now = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const response = await request.put('/api/__test/clock', { data: { now } });
  expect(response.ok()).toBe(true);
}

/**
 * Logs in through the user interface: opens `path`, taps "Zaloguj przez Google" and submits the
 * mock account chooser with `email`.
 */
export async function logIn(page: Page, email: string = OWNER_EMAIL, path = '/') {
  await page.goto(path);
  await page.getByRole('link', { name: 'Zaloguj przez Google' }).click();
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByRole('button', { name: 'Zaloguj' }).click();
}

/** Origin the API accepts for state-changing requests (APP_BASE_URL of the e2e stack). */
const APP_ORIGIN = 'http://localhost:3000';

export type RecipeSeed = {
  title: string;
  servings?: number;
  ingredients?: string[];
  steps?: string[];
  nutritionManual?: { kcal?: number; proteinG?: number; fatG?: number; fiberG?: number };
};

/** Adds a recipe through the API as the user logged in on `page`; returns its id. */
export async function seedRecipe(page: Page, seed: RecipeSeed): Promise<string> {
  const response = await page.request.post('/api/recipes', {
    headers: { Origin: APP_ORIGIN },
    data: {
      title: seed.title,
      servings: seed.servings ?? 2,
      ingredients: (seed.ingredients ?? ['sól do smaku']).map((originalText) => ({ originalText })),
      steps: seed.steps ?? ['Wymieszaj.'],
      nutritionManual: seed.nutritionManual ?? {},
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { recipe: { id: string } };
  return body.recipe.id;
}

/** Fills the manual recipe form with a complete, valid recipe (everything the criteria require). */
export async function fillRecipeForm(
  page: Page,
  values: { title?: string; servings?: string; ingredient?: string; step?: string } = {},
) {
  await page.getByLabel('Tytuł').fill(values.title ?? 'Kurczak z ryżem');
  await page.getByLabel('Liczba porcji').fill(values.servings ?? '2');
  await page.getByLabel('Składnik 1').fill(values.ingredient ?? '200 g piersi z kurczaka');
  await page.getByLabel('Krok 1').fill(values.step ?? 'Usmaż kurczaka.');
}

/** A valid 1×1 PNG, enough for the photo upload. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
