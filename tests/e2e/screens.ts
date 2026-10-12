import { expect, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe, setServerClock } from './helpers';
import { enableReminder, seedDose } from './reminderHelpers';

/**
 * Catalogue of every screen of the app, with deterministic sample data.
 *
 * - `prepareScreens` resets the server, freezes both clocks and (unless the screen is public) logs
 *   in and seeds the sample data; it returns the ids the screens need.
 * - `SCREENS` lists one entry per screen state. `open` navigates and returns once the screen is
 *   fully rendered. It must be safe to call again on a fresh page (screenshots reopen each screen
 *   per viewport and colour scheme), so it never changes data.
 * - Used by screens.spec.ts (opening + screenshots); accessibility tests can iterate it too.
 * - To add a screen, append an entry; use a visible heading (or another stable element) as the
 *   wait condition, never a timeout.
 */

/** Wednesday 2026-10-14, 10:00 in Warsaw (UTC+2); the week runs 2026-10-12 to 2026-10-18. */
export const NOW = '2026-10-14T08:00:00Z';
export const TODAY = '2026-10-14';
export const WEEK_START = '2026-10-12';

export type ScreenArea = 'public' | 'culinary' | 'health';

/** What the sample data leaves behind for screens that need an id. */
export type SampleData = { recipeId: string; linkRecipeId: string };

export type Screen = {
  /** kebab-case Polish without diacritics; also the screenshot file name. */
  id: string;
  area: ScreenArea;
  /** `false`: the screen is shown with a logged-in but empty account (no recipes). */
  sample?: boolean;
  open: (page: Page, data: SampleData) => Promise<void>;
};

/** Moves the server clock and the browser clock to the one fixed instant. */
export async function freezeClocks(page: Page) {
  await setServerClock(page.request, NOW);
  await page.clock.setFixedTime(new Date(NOW));
}

/** Fictional data through the API, as the user logged in on `page`. */
export async function seedSampleData(page: Page): Promise<SampleData> {
  const recipeId = await seedRecipe(page, {
    title: 'Kurczak z cukinią i ryżem',
    servings: 2,
    ingredients: ['400 g piersi z kurczaka', '1 cukinia', '150 g ryżu', 'sól do smaku'],
    steps: ['Pokrój kurczaka i cukinię.', 'Usmaż na patelni.', 'Podaj z ugotowanym ryżem.'],
    nutritionManual: { kcal: 420, proteinG: 38, fatG: 9, fiberG: 4 },
  });
  const linkRecipeId = await seedRecipe(page, {
    title: 'Zupa krem z dyni',
    servings: 4,
    ingredients: ['800 g dyni', '1 cebula', '500 ml bulionu'],
    steps: ['Upiecz dynię.', 'Zblenduj z bulionem.'],
    nutritionManual: { kcal: 180, proteinG: 5, fatG: 6, fiberG: 3 },
    source: { url: 'http://fixtures.test:8080/przepis/zupa-dyniowa', rating: 4.5 },
  });
  const noNutritionId = await seedRecipe(page, {
    title: 'Owsianka z jabłkiem',
    ingredients: ['60 g płatków owsianych', '1 jabłko'],
    steps: ['Ugotuj płatki z jabłkiem.'],
  });

  await apiCall(page, 'PUT', `/api/recipes/${recipeId}/tolerance`, {
    level: 'good',
    symptoms: [],
  });
  await apiCall(page, 'PUT', `/api/recipes/${noNutritionId}/worse-days`, { enabled: true });

  const collection = (await apiCall(page, 'POST', '/api/collections', { name: 'Obiady' })) as {
    collection: { id: string };
  };
  await apiCall(page, 'PUT', `/api/recipes/${recipeId}/collections`, {
    collectionIds: [collection.collection.id],
  });

  await apiCall(page, 'POST', '/api/meal-plan', {
    date: '2026-10-14',
    slot: 'lunch',
    recipeId,
    servings: 2,
  });
  await apiCall(page, 'POST', '/api/meal-plan', {
    date: '2026-10-15',
    slot: 'dinner',
    recipeId: linkRecipeId,
    servings: 4,
  });
  await apiCall(page, 'POST', `/api/shopping/${WEEK_START}/custom-items`, {
    name: 'woda mineralna',
  });

  await seedDose(page, '2026-09-30');
  await seedDose(page, '2026-10-07');

  const wellbeing = [
    ['2026-10-08', { weightKg: 82.4, mood: 3 }],
    ['2026-10-11', { weightKg: 81.9, mood: 4, note: 'Dobry dzień.' }],
    ['2026-10-13', { weightKg: 81.5, mood: 4 }],
  ] as const;
  for (const [date, entry] of wellbeing) {
    await apiCall(page, 'PUT', `/api/wellbeing/${date}`, entry);
  }

  await apiCall(page, 'PUT', '/api/settings/goals', {
    proteinGoalG: 100,
    waterGoalMl: 2000,
    glassMl: 250,
  });
  await apiCall(page, 'POST', '/api/protein-entries', {
    kind: 'manual',
    grams: 35,
    description: 'jogurt grecki',
  });
  await apiCall(page, 'POST', '/api/water-entries');
  await apiCall(page, 'POST', '/api/water-entries');
  await enableReminder(page, 4, '19:00');

  return { recipeId, linkRecipeId };
}

/**
 * Brings the server and `page` to the catalogue's starting state. Public screens stay logged out;
 * `sample: false` screens are logged in without any recipes.
 */
export async function prepareScreens(page: Page, screen: Screen): Promise<SampleData> {
  await resetServer(page.request);
  await freezeClocks(page);
  if (screen.area === 'public') return { recipeId: '', linkRecipeId: '' };
  await logIn(page);
  if (screen.sample === false) return { recipeId: '', linkRecipeId: '' };
  return seedSampleData(page);
}

/** Opens `path` and waits for its level 1 heading. */
const heading = (path: string, name: string | RegExp) => async (page: Page) => {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
};

const screen = (
  id: string,
  area: ScreenArea,
  open: (page: Page, data: SampleData) => Promise<void>,
  sample?: boolean,
): Screen => ({
  id,
  area,
  open: async (page, data) => {
    await open(page, data);
    // Headings render before the local copy of the data is ready; wait for the loading notes to go.
    await expect(page.getByText(/^Ładowanie/)).toHaveCount(0);
  },
  ...(sample === undefined ? {} : { sample }),
});

const simple = (id: string, path: string, name: string | RegExp, area: ScreenArea = 'culinary') =>
  screen(id, area, heading(path, name));

export const SCREENS: readonly Screen[] = [
  simple('logowanie', '/logowanie', 'Mounjaro Przepisy', 'public'),
  simple('kolekcja', '/', 'Kolekcja'),
  screen('kolekcja-pusta', 'culinary', heading('/', 'Kolekcja'), false),
  screen('przepis', 'culinary', (page, data) =>
    heading(`/przepisy/${data.recipeId}`, 'Kurczak z cukinią i ryżem')(page),
  ),
  simple('przepis-nowy', '/przepisy/nowy', 'Nowy przepis'),
  screen('przepis-edycja', 'culinary', (page, data) =>
    heading(`/przepisy/${data.recipeId}/edycja`, 'Edycja przepisu')(page),
  ),
  simple('przepis-z-linku', '/przepisy/z-linku', 'Dodaj przepis z linku'),
  screen('gotowanie-skladniki', 'culinary', async (page, data) => {
    await page.goto(`/przepisy/${data.recipeId}/gotuj`);
    await expect(page.getByRole('heading', { level: 2, name: /^Składniki/ })).toBeVisible();
  }),
  screen('gotowanie-krok', 'culinary', async (page, data) => {
    await page.goto(`/przepisy/${data.recipeId}/gotuj`);
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'krok 1 z 3' })).toBeVisible();
  }),
  simple('planer', '/planer', 'Planer'),
  simple('zakupy', `/zakupy?tydzien=${WEEK_START}`, 'Lista zakupów'),
  simple('szukaj', '/szukaj', 'Szukaj w serwisach'),
  simple('kolekcje', '/kolekcje', 'Kolekcje własne'),
  simple('ustawienia', '/ustawienia', 'Ustawienia'),
  simple('ustawienia-progi-filtrow', '/ustawienia/progi-filtrow', 'Progi filtrów'),
  simple('ustawienia-cele', '/ustawienia/cele', 'Cele i szklanka'),
  simple('ustawienia-przypomnienie', '/ustawienia/przypomnienie', 'Przypomnienie o zastrzyku'),
  screen('ustawienia-zaufane-serwisy', 'culinary', async (page) => {
    await heading('/ustawienia/zaufane-serwisy', 'Zaufane serwisy')(page);
    // The default list arrives after the heading.
    await expect(page.getByText('Ania Gotuje')).toBeVisible();
  }),
  simple('ustawienia-moje-dane', '/ustawienia/moje-dane', 'Moje dane'),
  simple('konto', '/konto', 'Konto'),
  simple('dawki', '/dawki', 'Dziennik dawek', 'health'),
  simple('dawki-nowy', '/dawki/nowy', 'Nowy wpis dawki', 'health'),
  simple('waga', '/waga', 'Waga i samopoczucie', 'health'),
  simple('waga-nowy', '/waga/nowy', 'Nowy wpis wagi i samopoczucia', 'health'),
  simple('licznik', '/licznik', 'Licznik białka i wody', 'health'),
  screen('przepis-nowy-blad-pola', 'culinary', async (page) => {
    await heading('/przepisy/nowy', 'Nowy przepis')(page);
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  }),
  screen('przepis-z-linku-blad-odczytu', 'culinary', async (page) => {
    await heading('/przepisy/z-linku', 'Dodaj przepis z linku')(page);
    await page
      .getByLabel('Adres strony z przepisem')
      .fill('http://fixtures.test:8080/przepisy/niedostepna');
    await page.getByRole('button', { name: 'Odczytaj przepis' }).click();
    await expect(page.getByRole('alert')).toContainText('Strona nie odpowiada', {
      timeout: 15_000,
    });
  }),
  screen('kolekcja-offline', 'culinary', async (page) => {
    await heading('/', 'Kolekcja')(page);
    await page.context().setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: /^offline$/ })).toBeVisible();
  }),
  screen('kolekcja-baner-zastrzyku', 'culinary', async (page) => {
    // Same setting every time it opens, so reopening the screen changes nothing: the reminder day is
    // today (Wednesday) at 08:00 and no dose is entered for it.
    await enableReminder(page, 3, '08:00');
    await heading('/', 'Kolekcja')(page);
    await expect(page.getByRole('status', { name: 'Przypomnienie o zastrzyku' })).toBeVisible();
  }),
  simple('nie-znaleziono', '/tego-nie-ma', 'Nie znaleziono ekranu'),
];
