import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe, setServerClock, goToSettings } from './helpers';

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
  // Right after a reload the app may still be hydrating, and a click landing in between is lost, so
  // the click is repeated until the planner shows.
  const heading = page.getByRole('heading', { level: 1, name: 'Planer' });
  await expect(async () => {
    if (!(await heading.isVisible())) {
      await page.getByRole('link', { name: 'Planer', exact: true }).click({ timeout: 2000 });
    }
    await expect(heading).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 15000 });
};

const meal = (page: Page, day: string, slot: string) =>
  page.getByRole('region', { name: `${day}: ${slot}` });

const DAY_BUTTON: Record<string, string> = {
  'poniedziałek, 12 października': 'pon. 12',
  'wtorek, 13 października': 'wt. 13',
  'środa, 14 października': 'śr. 14',
  'czwartek, 15 października': 'czw. 15',
  'poniedziałek, 19 października': 'pon. 19',
};

/** Chooses a day in the strip; the planner shows one day at a time. */
async function pickDay(page: Page, day: string) {
  const button = page.getByRole('button', { name: DAY_BUTTON[day] ?? day, exact: true });
  await expect(async () => {
    if ((await button.getAttribute('aria-pressed')) !== 'true')
      await button.click({ timeout: 2000 });
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

const protein = (page: Page) => page.getByText(/^Białko zaplanowane:/);

async function plan(page: Page, day: string, slot: string, title: string, servings?: string) {
  // The planner first shows the local copy and re-renders when the snapshot arrives, so opening the
  // form and choosing the recipe is repeated until it sticks. Everything is scoped to this slot, so a
  // form of a previous, still-saving addition is never mistaken for this one.
  await pickDay(page, day);
  const region = meal(page, day, slot);
  const form = region.getByRole('form', { name: /^Dodaj przepis/ });
  await expect(async () => {
    if (!(await form.isVisible())) {
      await region.getByRole('button', { name: '+ Dodaj przepis' }).click({ timeout: 2000 });
    }
    await form
      .getByLabel('Przepis', { exact: true })
      .selectOption({ label: title }, { timeout: 2000 });
    await expect(form.getByLabel('Przepis', { exact: true }).locator('option:checked')).toHaveText(
      title,
      { timeout: 2000 },
    );
  }).toPass({ timeout: 15000 });
  if (servings) await form.getByLabel('Liczba porcji', { exact: true }).fill(servings);
  await form.getByRole('button', { name: 'Dodaj do planera' }).click();
  // Wait for the save to finish, so the next call does not see this form.
  await expect(form).toBeHidden();
}

test.describe('S19: planer posiłków na tydzień', () => {
  test('S19: pusty planer pokazuje pasek 7 dni z dniem dzisiejszym i cztery pory z przyciskiem dodania', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await goToPlanner(page);

    await expect(page.getByText('Ten tydzień', { exact: true })).toBeVisible();
    const strip = page.getByRole('button', { name: /^(pon|wt|śr|czw|pt|sob|niedz)\. \d+$/ });
    await expect(strip).toHaveCount(7);
    await expect(strip).toHaveText([
      'pon.12',
      'wt.13',
      'śr.14',
      'czw.15',
      'pt.16',
      'sob.17',
      'niedz.18',
    ]);
    for (const name of ['pon. 12', 'wt. 13', 'czw. 15', 'pt. 16', 'sob. 17', 'niedz. 18']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    await expect(page.getByRole('button', { name: 'śr. 14', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('środa, 14 października');
    // Tylko pierwsza litera nagłówka jest wielka; nazwa miesiąca zostaje mała (nie `capitalize`).
    await expect(page.getByRole('heading', { level: 2 })).toHaveCSS('text-transform', 'none');
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'Śniadanie',
      'Obiad',
      'Kolacja',
      'Przekąska',
    ]);
    for (const slot of ['Śniadanie', 'Obiad', 'Kolacja', 'Przekąska']) {
      await expect(
        meal(page, 'środa, 14 października', slot).getByRole('button', { name: '+ Dodaj przepis' }),
      ).toBeVisible();
    }
  });

  test('S19: wybranie innego dnia przestawia aria-pressed i pokazuje tylko przepisy tego dnia', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await seedRecipe(page, { title: 'Omlet' });
    await page.reload();
    await goToPlanner(page);
    await plan(page, 'środa, 14 października', 'Obiad', 'Zupa dyniowa');
    await plan(page, 'czwartek, 15 października', 'Śniadanie', 'Omlet');

    await expect(page.getByRole('button', { name: 'czw. 15', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'śr. 14', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByRole('link', { name: 'Omlet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);

    await pickDay(page, 'środa, 14 października');
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Omlet' })).toHaveCount(0);
  });

  test('S19: suma białka dnia liczy białko na porcję razy zaplanowane porcje', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Kurczak', nutritionManual: { proteinG: 30 } });
    await seedRecipe(page, { title: 'Twaróg', nutritionManual: { proteinG: 20 } });
    await page.reload();
    await goToPlanner(page);

    await expect(page.getByText('Białko zaplanowane: 0 g', { exact: true })).toBeVisible();
    await plan(page, 'środa, 14 października', 'Obiad', 'Kurczak', '2');
    await plan(page, 'środa, 14 października', 'Kolacja', 'Twaróg');

    await expect(page.getByText('Białko zaplanowane: 80 g', { exact: true })).toBeVisible();
    await pickDay(page, 'czwartek, 15 października');
    await expect(page.getByText('Białko zaplanowane: 0 g', { exact: true })).toBeVisible();
  });

  test('S19: suma białka pomija przepisy bez danych i mówi o tym dopiskiem', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Kurczak', nutritionManual: { proteinG: 30 } });
    await seedRecipe(page, { title: 'Sałatka' });
    await seedRecipe(page, { title: 'Zupa dyniowa' });
    await page.reload();
    await goToPlanner(page);

    await plan(page, 'środa, 14 października', 'Obiad', 'Kurczak');
    await plan(page, 'środa, 14 października', 'Kolacja', 'Sałatka');
    await expect(protein(page)).toContainText('Białko zaplanowane: 30 g');
    await expect(page.getByText('bez 1 przepisu bez danych', { exact: true })).toBeVisible();

    await plan(page, 'środa, 14 października', 'Przekąska', 'Zupa dyniowa');
    await expect(protein(page)).toContainText('Białko zaplanowane: 30 g');
    await expect(page.getByText('bez 2 przepisów bez danych', { exact: true })).toBeVisible();
  });

  test('S19: suma białka jest zaokrąglona do 1 g', async ({ page, request }) => {
    await openPlanner(page, request);
    await seedRecipe(page, { title: 'Jajka', nutritionManual: { proteinG: 25 } });
    await page.reload();
    await goToPlanner(page);

    await plan(page, 'środa, 14 października', 'Śniadanie', 'Jajka', '0,5');

    await expect(page.getByText('Białko zaplanowane: 13 g', { exact: true })).toBeVisible();
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
      .getByRole('button', { name: '+ Dodaj przepis' })
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
    await expect(page.getByText('19–25 października 2026', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'pon. 19', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);
    await plan(page, 'poniedziałek, 19 października', 'Przekąska', 'Omlet');
    await expect(
      meal(page, 'poniedziałek, 19 października', 'Przekąska').getByRole('link', { name: 'Omlet' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Poprzedni tydzień' }).click();
    await expect(page.getByText('Ten tydzień', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'śr. 14', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Omlet' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Poprzedni tydzień' }).click();
    await expect(page.getByText('5–11 października 2026', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zupa dyniowa' })).toHaveCount(0);
  });

  test('S19: nagłówek innego tygodnia to zakres dat, także na przełomie miesięcy, a przycisk listy zakupów niesie oglądany tydzień', async ({
    page,
    request,
  }) => {
    await openPlanner(page, request);
    await goToPlanner(page);

    const create = page.getByRole('link', { name: 'Utwórz listę zakupów na tydzień' });
    await expect(create).toHaveAttribute('href', '/zakupy');
    await page.getByRole('button', { name: 'Poprzedni tydzień' }).click();
    await page.getByRole('button', { name: 'Poprzedni tydzień' }).click();
    await expect(
      page.getByText('28 września – 4 października 2026', { exact: true }),
    ).toBeVisible();
    await expect(create).toHaveAttribute('href', '/zakupy?tydzien=2026-09-28');
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
    await goToSettings(page);
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
    await pickDay(page, 'czwartek, 15 października');
    const thursday = meal(page, 'czwartek, 15 października', 'Obiad');
    await thursday.getByRole('button', { name: '+ Dodaj przepis' }).click();
    await expect(thursday.getByText(OFFLINE_MESSAGE)).toBeInViewport();
    await expect(thursday.getByRole('button', { name: 'Dodaj do planera' })).toHaveCount(0);
  });
});

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}
