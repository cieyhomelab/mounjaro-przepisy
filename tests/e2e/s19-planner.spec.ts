import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe, setServerClock } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';
// Wednesday; its week runs from Monday 2026-10-12 to Sunday 2026-10-18.
const NOW = '2026-10-14T10:00:00Z';

/** Fixes the clock of the server and of the browser, then logs in and opens the planner. */
async function openPlanner(page: Page, request: Parameters<typeof setServerClock>[0]) {
  await setServerClock(request, NOW);
  await page.clock.setFixedTime(new Date(NOW));
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

const goToPlanner = async (page: Page) => {
  await page.getByRole('link', { name: 'Planer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Planer' })).toBeVisible();
};

const meal = (page: Page, day: string, slot: string) =>
  page.getByRole('region', { name: `${day}: ${slot}` });

async function plan(page: Page, day: string, slot: string, title: string, servings?: string) {
  await meal(page, day, slot)
    .getByRole('button', { name: /^Dodaj przepis/ })
    .click();
  await page.getByLabel('Przepis', { exact: true }).selectOption({ label: title });
  if (servings) await page.getByLabel('Liczba porcji', { exact: true }).fill(servings);
  await page.getByRole('button', { name: 'Dodaj do planera' }).click();
}

test.describe('S19: planer posiłków na tydzień', () => {
  test('S19: pusty planer pokazuje 7 dni bieżącego tygodnia, każdy z czterema porami', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await goToPlanner(page);

    await expect(page.getByText('Tydzień od poniedziałek, 12 października')).toBeVisible();
    const days = page.getByRole('heading', { level: 2 });
    await expect(days).toHaveText([
      'poniedziałek, 12 października',
      'wtorek, 13 października',
      'środa, 14 października',
      'czwartek, 15 października',
      'piątek, 16 października',
      'sobota, 17 października',
      'niedziela, 18 października',
    ]);
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(28);
    for (const slot of ['Śniadanie', 'Obiad', 'Kolacja', 'Przekąska']) {
      await expect(meal(page, 'środa, 14 października', slot)).toBeVisible();
    }
  });

  test('S19: przepis dodany do pory jest widoczny z liczbą porcji, domyślnie 1', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await page.reload();
    await goToPlanner(page);

    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa');
    const lunch = meal(page, 'środa, 14 października', 'Obiad');
    await expect(lunch.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    await expect(lunch.getByText('Porcje: 1', { exact: true })).toBeVisible();

    await plan(page, 'środa, 14 października', 'Kolacja', 'Zupa dyniowa', '2,5');
    await expect(
      meal(page, 'środa, 14 października', 'Kolacja').getByText('Porcje: 2,5'),
    ).toBeVisible();
    // The plan is saved on the server: it survives a reload.
    await page.reload();
    await expect(
      meal(page, 'środa, 14 października', 'Obiad').getByRole('link', { name: 'Zupa dyniowa' }),
    ).toBeVisible();
  });

  test('S19: liczba porcji poza zakresem blokuje dodanie', async ({ page, request }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await page.reload();
    await goToPlanner(page);

    await meal(page, 'środa, 14 października', 'Obiad')
      .getByRole('button', { name: /^Dodaj przepis/ })
      .click();
    await page.getByLabel('Przepis', { exact: true }).selectOption({ label: 'Zupa dyniowa' });
    await page.getByLabel('Liczba porcji', { exact: true }).fill('100');

    await expect(
      page.getByText('Liczba porcji musi być od 0,5 do 99, z krokiem 0,5.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dodaj do planera' })).toBeDisabled();
  });

  test('S19: do jednej pory można dodać drugi przepis i oba są widoczne', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await seedRecipe(page, { title: 'Omlet' });
    await page.reload();
    await goToPlanner(page);

    await plan(page, 'wtorek, 13 października', 'Śniadanie', 'Omlet');
    await plan(page, 'wtorek, 13 października', 'Śniadanie', 'Zupa dyniowa');

    const breakfast = meal(page, 'wtorek, 13 października', 'Śniadanie');
    await expect(breakfast.getByRole('link', { name: 'Omlet' })).toBeVisible();
    await expect(breakfast.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
  });

  test('S19: usunięcie z pory zostawia przepis w kolekcji', async ({ page, request }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await page.reload();
    await goToPlanner(page);
    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa');
    const lunch = meal(page, 'środa, 14 października', 'Obiad');
    await expect(lunch.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();

    await lunch.getByRole('button', { name: 'Usuń z pory: Zupa dyniowa' }).click();

    await expect(lunch.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Zupa dyniowa/ })).toBeVisible();
  });

  test('S19: wybranie przepisu w planerze otwiera szczegóły z liczbą porcji z planera', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa', servings: 2, ingredients: ['200 g dyni'] });
    await page.reload();
    await goToPlanner(page);
    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa', '4');

    await meal(page, 'środa, 14 października', 'Obiad')
      .getByRole('link', { name: 'Zupa dyniowa' })
      .click();

    await expect(page.getByRole('heading', { level: 1, name: 'Zupa dyniowa' })).toBeVisible();
    await expect(page.getByLabel('Przelicz na porcje')).toHaveValue('4');
    await expect(page.getByText('400 g dyni')).toBeVisible();
  });

  test('S19: przejście do następnego i poprzedniego tygodnia pokazuje plan tamtego tygodnia', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await seedRecipe(page, { title: 'Omlet' });
    await page.reload();
    await goToPlanner(page);
    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa');

    await page.getByRole('button', { name: 'Następny tydzień' }).click();
    await expect(page.getByText('Tydzień od poniedziałek, 19 października')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);
    await plan(page, 'poniedziałek, 19 października', 'Przekąska', 'Omlet');
    await expect(
      meal(page, 'poniedziałek, 19 października', 'Przekąska').getByRole('link', { name: 'Omlet' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Poprzedni tydzień' }).click();
    await expect(page.getByText('Tydzień od poniedziałek, 12 października')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Omlet' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Poprzedni tydzień' }).click();
    await expect(page.getByText('Tydzień od poniedziałek, 5 października')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);
  });

  test('S19: usunięcie zaplanowanego przepisu z kolekcji uprzedza o planerze, a po potwierdzeniu planer go nie zawiera', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    const id = await seedRecipe(page, { title: 'Zupa dyniowa' });
    await seedRecipe(page, { title: 'Omlet' });
    await page.reload();
    await goToPlanner(page);
    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa');
    await plan(page, 'środa, 14 października', 'Kolacja', 'Omlet');

    await page.goto(`/przepisy/${id}`);
    await page.getByRole('button', { name: 'Usuń', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByText(/zniknie też z planera/)).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await goToPlanner(page);
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Omlet' })).toBeVisible();
  });

  test('S19: offline planer pokazuje ostatnio pobrany plan, a zmiana jest niedostępna', async ({
    page,
    context,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await page.reload();
    await goToPlanner(page);
    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa');
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
    // Under load the service worker may not control the page yet, and the offline reload below
    // relies on it to serve the app shell, so wait until it does.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          return navigator.serviceWorker.controller !== null;
        }),
      )
      .toBe(true);

    await goOffline(context, page);
    await page.goto('/planer');

    await expect(page.getByRole('heading', { level: 1, name: 'Planer' })).toBeVisible({
      timeout: 15_000,
    });
    const lunch = meal(page, 'środa, 14 października', 'Obiad');
    await expect(lunch.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    await lunch.getByRole('button', { name: 'Usuń z pory: Zupa dyniowa' }).click();
    await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();
    await expect(lunch.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    const thursday = meal(page, 'czwartek, 15 października', 'Obiad');
    await thursday.getByRole('button', { name: /^Dodaj przepis/ }).click();
    await expect(thursday.getByText(OFFLINE_MESSAGE)).toBeInViewport();
    await expect(thursday.getByRole('button', { name: 'Dodaj do planera' })).toHaveCount(0);
  });
});

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}
