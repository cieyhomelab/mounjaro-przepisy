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

/** Sets the server clock to the given instant (ISO 8601). */
export async function setServerClock(request: APIRequestContext, now: string) {
  const response = await request.put('/api/__test/clock', { data: { now } });
  expect(response.ok()).toBe(true);
}

/**
 * Logs in through the user interface: opens `path`, taps "Zaloguj przez Google" and submits the
 * mock account chooser with `email`. For the allowed address it returns once the session is active.
 */
export async function logIn(page: Page, email: string = OWNER_EMAIL, path = '/') {
  await page.goto(path);
  await page.getByRole('link', { name: 'Zaloguj przez Google' }).click();
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  if (email === OWNER_EMAIL) {
    // The login redirect is asynchronous; API calls made before the session cookie is set get 401.
    await expect.poll(async () => (await page.request.get('/api/session')).status()).toBe(200);
  }
}

/** Origin the API accepts for state-changing requests (APP_BASE_URL of the e2e stack). */
const APP_ORIGIN = 'http://localhost:3000';

export type RecipeSeed = {
  title: string;
  servings?: number;
  ingredients?: string[];
  steps?: string[];
  nutritionManual?: { kcal?: number; proteinG?: number; fatG?: number; fiberG?: number };
  /** Makes it a recipe saved from a link, with the rating the source gave (scale 0–5). */
  source?: { url: string; rating: number };
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
      ...(seed.source
        ? {
            sourceUrl: seed.source.url,
            sourceImport: {
              rating: seed.source.rating,
              ratingCount: 10,
              siteName: 'Testowy serwis',
              nutrition: null,
            },
          }
        : {}),
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { recipe: { id: string } };
  return body.recipe.id;
}

/** Calls a state-changing API route as the user logged in on `page`; returns the parsed body. */
export async function apiCall(
  page: Page,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<Record<string, unknown>> {
  const response = await page.request.fetch(path, {
    method,
    headers: { Origin: APP_ORIGIN },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), `${method} ${path}`).toBe(true);
  return (await response.json()) as Record<string, unknown>;
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

/** A search site played by the "fixtures" service; the host name picks its behaviour. */
export type TestSite = { name: string; host: string; active?: boolean };

export const FIXTURE_SITES = {
  searchable: { name: 'Przeszukiwalny', host: 'przeszukiwalny.test' },
  scaleTen: { name: 'Skala dziesięć', host: 'skala10.test' },
  unavailable: { name: 'Niedostępny', host: 'niedostepny.test' },
} satisfies Record<string, TestSite>;

/** Replaces the trusted sites of the (logged in) account with test sites from the fixtures service. */
export async function useTestSites(request: APIRequestContext, sites: TestSite[]) {
  const response = await request.put('/api/__test/trusted-sites', {
    data: {
      sites: sites.map((site) => ({
        host: site.host,
        name: site.name,
        active: site.active ?? true,
        searchConfig: {
          searchUrl: `http://${site.host}:8080/szukaj?q={q}`,
          linkPattern: '^/przepisy?/[^/]+$',
        },
      })),
    },
  });
  expect(response.status()).toBe(204);
}

/** Opens the collection through the main navigation ("Przepisy"), as a user does from any screen. */
export async function goHome(page: Page) {
  await page
    .getByRole('navigation', { name: 'Nawigacja główna' })
    .getByRole('link', { name: 'Przepisy', exact: true })
    .click();
}

/** Opens Settings the way a user does: through the "Ustawienia" button in the collection header. */
export async function goToSettings(page: Page) {
  const collectionHeading = page.getByRole('heading', { level: 1, name: 'Kolekcja' });
  if (!(await collectionHeading.isVisible())) await goHome(page);
  await page.getByRole('link', { name: 'Ustawienia' }).click();
}

/** A chip of the collection screen: one of the filters in the panel or "Na gorsze dni"/a collection in the quick row. */
export const filterButton = (page: Page, name: string) =>
  page
    .getByRole('group', { name: /^(Filtry|Kolekcje i tagi)$/ })
    .getByRole('button', { name, exact: true });

/** Opens the filter panel when it is closed (below 768 px); on a wide screen it is always open. */
export async function openFilterPanel(page: Page) {
  await page.getByRole('searchbox', { name: 'Szukaj w kolekcji' }).waitFor();
  const toggle = page.getByRole('button', { name: /^Filtry/ });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
  await expect(page.getByRole('group', { name: 'Filtry' })).toBeVisible();
}

/** Switches a filter chip on or off, opening the panel first when needed. */
export async function toggleFilter(page: Page, name: string) {
  await openFilterPanel(page);
  await filterButton(page, name).click();
}
