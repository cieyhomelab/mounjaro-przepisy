import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe, setServerClock } from './helpers';
import { readZip } from './zipReader';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';
// Wednesday; its week runs from Monday 2026-10-12 to Sunday 2026-10-18.
const NOW = '2026-10-14T10:00:00Z';

async function openApp(page: Page, request: Parameters<typeof setServerClock>[0]) {
  await setServerClock(request, NOW);
  await page.clock.setFixedTime(new Date(NOW));
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

const plan = (page: Page, recipeId: string, date: string, servings: number, slot = 'lunch') =>
  apiCall(page, 'POST', '/api/meal-plan', { date, slot, recipeId, servings });

/** Opens the list through the planner, as the user does. */
async function openList(page: Page) {
  const planner = page.getByRole('heading', { level: 1, name: 'Planer' });
  // Firefox may swallow a tap made while the collection is still rendering: tap again.
  await expect(async () => {
    if (!(await planner.isVisible())) {
      await page.getByRole('link', { name: 'Planer', exact: true }).click({ timeout: 2000 });
    }
    await expect(planner).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByRole('link', { name: 'Lista zakupów' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lista zakupów' })).toBeVisible();
}

const item = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });
const toBuy = (page: Page) => page.getByRole('list', { name: 'Do kupienia' });
const bought = (page: Page) => page.getByRole('list', { name: 'Kupione' });

async function addOwn(page: Page, name: string) {
  await page.getByLabel('Własna pozycja').fill(name);
  await page.getByRole('button', { name: 'Dodaj pozycję' }).click();
}

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

async function goOnline(context: BrowserContext, page: Page) {
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
}

/** Opens Settings and waits until the app reports that everything is on the device. */
async function waitForOfflineData(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
}

/** The ticks the server holds, read through the API of the session on `page`. */
const serverChecks = async (page: Page) =>
  (
    (await (await page.request.get('/api/snapshot')).json()) as {
      shoppingChecks: { itemKey: string; checked: boolean }[];
    }
  ).shoppingChecks;

async function secondDevice(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  return { context, page };
}

test.describe('S20: lista zakupów z planera', () => {
  test('S20: lista zawiera składniki zaplanowanych przepisów w ilościach przeliczonych na porcje', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const soup = await seedRecipe(page, {
      title: 'Zupa dyniowa',
      servings: 2,
      ingredients: ['200 g dyni', '1 cebula'],
    });
    await plan(page, soup, '2026-10-14', 4);
    await page.reload();

    await openList(page);

    await expect(item(page, 'dyni 400 g')).toBeVisible();
    await expect(item(page, 'cebula 2')).toBeVisible();
  });

  test('S20: „200 g Twaróg” i „300 g twaróg” to jedna pozycja „twaróg 500 g”', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const first = await seedRecipe(page, {
      title: 'Naleśniki',
      servings: 1,
      ingredients: ['200 g Twaróg'],
    });
    const second = await seedRecipe(page, {
      title: 'Sernik',
      servings: 1,
      ingredients: ['300 g twaróg'],
    });
    await plan(page, first, '2026-10-13', 1);
    await plan(page, second, '2026-10-15', 1);
    await page.reload();

    await openList(page);

    await expect(item(page, 'twaróg 500 g')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
  });

  test('S20: ten sam przepis zaplanowany dwa razy ma zsumowane ilości', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const rice = await seedRecipe(page, {
      title: 'Ryż',
      servings: 1,
      ingredients: ['100 g ryżu'],
    });
    await plan(page, rice, '2026-10-13', 1);
    await plan(page, rice, '2026-10-16', 2, 'dinner');
    await page.reload();

    await openList(page);

    await expect(item(page, 'ryżu 300 g')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
  });

  test('S20: ten sam składnik w różnych jednostkach to osobne pozycje', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const first = await seedRecipe(page, {
      title: 'Zupa cebulowa',
      servings: 1,
      ingredients: ['2 szt. cebula'],
    });
    const second = await seedRecipe(page, {
      title: 'Cebula smażona',
      servings: 1,
      ingredients: ['300 g cebula'],
    });
    await plan(page, first, '2026-10-13', 1);
    await plan(page, second, '2026-10-15', 1);
    await page.reload();

    await openList(page);

    await expect(item(page, 'cebula 300 g')).toBeVisible();
    await expect(item(page, 'cebula 2 szt.')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(2);
  });

  test('S20: składnik bez ilości albo zapisany jako tekst jest na liście raz, bez ilości', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const first = await seedRecipe(page, {
      title: 'Jajecznica',
      servings: 1,
      ingredients: ['sól do smaku', '2-3 łyżki oleju'],
    });
    const second = await seedRecipe(page, {
      title: 'Omlet',
      servings: 1,
      ingredients: ['sól do smaku', '2-3 łyżki oleju'],
    });
    await plan(page, first, '2026-10-13', 1);
    await plan(page, second, '2026-10-15', 3);
    await page.reload();

    await openList(page);

    await expect(item(page, 'sól do smaku')).toBeVisible();
    await expect(item(page, '2-3 łyżki oleju')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(2);
  });

  test('S20: odhaczona pozycja przechodzi do części odhaczonej, a ponowne tapnięcie cofa odhaczenie', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Sałatka',
      servings: 1,
      ingredients: ['1 ogórek', '1 pomidor', '1 rzodkiewka'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await expect(toBuy(page).getByText(/^(ogórek|pomidor|rzodkiewka) 1$/)).toHaveText([
      'ogórek 1',
      'pomidor 1',
      'rzodkiewka 1',
    ]);

    await item(page, 'ogórek 1').click();

    await expect(bought(page).getByRole('checkbox', { name: 'ogórek 1' })).toBeChecked();
    await expect(toBuy(page).getByText(/^(pomidor|rzodkiewka) 1$/)).toHaveText([
      'pomidor 1',
      'rzodkiewka 1',
    ]);
    await expect(toBuy(page).getByText('ogórek 1')).toHaveCount(0);
    // The tick is kept on the account: it survives a reload.
    await expect.poll(async () => (await serverChecks(page)).length).toBe(1);
    await page.reload();
    await expect(bought(page).getByRole('checkbox', { name: 'ogórek 1' })).toBeChecked();

    await item(page, 'ogórek 1').click();

    await expect(toBuy(page).getByRole('checkbox', { name: 'ogórek 1' })).not.toBeChecked();
    await expect(page.getByRole('list', { name: 'Kupione' })).toHaveCount(0);
  });

  test('S20: własną pozycję można dopisać, odhaczyć i usunąć', async ({ page, request }) => {
    await openApp(page, request);
    await openList(page);

    await addOwn(page, 'papier do pieczenia');

    await expect(toBuy(page).getByRole('checkbox', { name: 'papier do pieczenia' })).toBeVisible();
    await item(page, 'papier do pieczenia').click();
    await expect(bought(page).getByRole('checkbox', { name: 'papier do pieczenia' })).toBeChecked();
    await page.reload();
    await expect(bought(page).getByRole('checkbox', { name: 'papier do pieczenia' })).toBeChecked();

    await page.getByRole('button', { name: 'Usuń pozycję: papier do pieczenia' }).click();

    await expect(item(page, 'papier do pieczenia')).toHaveCount(0);
    await page.reload();
    await expect(item(page, 'papier do pieczenia')).toHaveCount(0);
  });

  test('S20: po zmianie planera lista odzwierciedla nowy plan, własne pozycje zostają, odhaczenie niezmienionej pozycji zostaje, a zmienionej wraca do nieodhaczonych', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const rice = await seedRecipe(page, { title: 'Ryż', servings: 1, ingredients: ['100 g ryżu'] });
    const egg = await seedRecipe(page, { title: 'Jajko', servings: 1, ingredients: ['2 jajka'] });
    await plan(page, rice, '2026-10-13', 1);
    await plan(page, egg, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await addOwn(page, 'papier do pieczenia');
    await item(page, 'ryżu 100 g').click();
    await item(page, 'jajka 2').click();
    await item(page, 'papier do pieczenia').click();
    await expect(bought(page).getByRole('checkbox')).toHaveCount(3);

    // The plan changes: more rice, the eggs stay, a new recipe appears.
    const soup = await seedRecipe(page, { title: 'Zupa', servings: 1, ingredients: ['1 marchew'] });
    await plan(page, rice, '2026-10-16', 1, 'dinner');
    await plan(page, soup, '2026-10-17', 1);
    await page.reload();

    await expect(toBuy(page).getByRole('checkbox', { name: 'ryżu 200 g' })).not.toBeChecked();
    await expect(toBuy(page).getByRole('checkbox', { name: 'marchew 1' })).toBeVisible();
    await expect(bought(page).getByRole('checkbox', { name: 'jajka 2' })).toBeChecked();
    await expect(bought(page).getByRole('checkbox', { name: 'papier do pieczenia' })).toBeChecked();
    await expect(item(page, 'ryżu 100 g')).toHaveCount(0);
  });

  test('S20: tydzień bez zaplanowanych przepisów pokazuje komunikat i pozwala dopisać własną pozycję', async ({
    page,
    request,
  }) => {
    await openApp(page, request);

    await openList(page);

    await expect(page.getByText('Zaplanuj posiłki, żeby wygenerować listę')).toBeVisible();
    await addOwn(page, 'sznurek');
    await expect(item(page, 'sznurek')).toBeVisible();
    await expect(page.getByText('Zaplanuj posiłki, żeby wygenerować listę')).toBeVisible();
  });

  test('S20: lista pobrana do pracy offline pokazuje wszystkie pozycje z ich stanem odhaczenia', async ({
    page,
    context,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Sałatka',
      servings: 1,
      ingredients: ['1 ogórek', '1 pomidor'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await addOwn(page, 'sznurek');
    await item(page, 'pomidor 1').click();
    await expect.poll(async () => (await serverChecks(page)).length).toBe(1);
    await waitForOfflineData(page);

    await goOffline(context, page);
    await page.goto('/zakupy');

    await expect(page.getByRole('heading', { level: 1, name: 'Lista zakupów' })).toBeVisible();
    await expect(toBuy(page).getByRole('checkbox', { name: 'ogórek 1' })).not.toBeChecked();
    await expect(toBuy(page).getByRole('checkbox', { name: 'sznurek' })).not.toBeChecked();
    await expect(bought(page).getByRole('checkbox', { name: 'pomidor 1' })).toBeChecked();
  });

  test('S20: odhaczenie offline jest od razu widoczne i pozostaje po ponownym otwarciu aplikacji', async ({
    page,
    context,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Sałatka',
      servings: 1,
      ingredients: ['1 ogórek', '1 pomidor'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await waitForOfflineData(page);
    await goOffline(context, page);
    await page.goto('/zakupy');

    await item(page, 'ogórek 1').click();

    await expect(bought(page).getByRole('checkbox', { name: 'ogórek 1' })).toBeChecked();
    await page.reload();
    await expect(bought(page).getByRole('checkbox', { name: 'ogórek 1' })).toBeChecked();
    await item(page, 'ogórek 1').click();
    await expect(toBuy(page).getByRole('checkbox', { name: 'ogórek 1' })).not.toBeChecked();
    await page.reload();
    await expect(toBuy(page).getByRole('checkbox', { name: 'ogórek 1' })).not.toBeChecked();
  });

  test('S20: odhaczenia z pracy offline zapisują się na koncie po odzyskaniu połączenia i są widoczne na drugim urządzeniu', async ({
    page,
    context,
    browser,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Sałatka',
      servings: 1,
      ingredients: ['1 ogórek', '1 pomidor'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await waitForOfflineData(page);
    await goOffline(context, page);
    await page.goto('/zakupy');
    await item(page, 'ogórek 1').click();
    await item(page, 'pomidor 1').click();
    await expect(bought(page).getByRole('checkbox')).toHaveCount(2);

    await goOnline(context, page);

    await expect
      .poll(async () => (await serverChecks(page)).map((check) => check.checked))
      .toEqual([true, true]);
    const other = await secondDevice(browser);
    await other.page.goto('/zakupy');
    await expect(bought(other.page).getByRole('checkbox')).toHaveCount(2);
    await expect(bought(other.page).getByRole('checkbox', { name: 'ogórek 1' })).toBeChecked();
    await other.context.close();
  });

  test('S20: odhaczenie, którego serwer nie przyjmuje, nie blokuje pobierania zmian z drugiego urządzenia', async ({
    page,
    browser,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Naleśniki',
      servings: 1,
      ingredients: ['100 g mąki'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await page.route('**/api/shopping/*/checks', (route) =>
      route.fulfill({ status: 500, json: { error: { code: 'internal' } } }),
    );
    await item(page, 'mąki 100 g').click();
    const other = await secondDevice(browser);

    await apiCall(other.page, 'POST', '/api/shopping/2026-10-12/custom-items', {
      name: 'sznurek',
    });

    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect(item(page, 'sznurek')).toBeVisible();
    await other.context.close();
  });

  test('S20: odhaczenie odrzucane przez serwer jest ponawiane w rosnących odstępach', async ({
    page,
    context,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile-webkit',
      'WebKit nie przekazuje żądań z service workera do page.route, więc nie da się wymusić odpowiedzi 500',
    );
    await setServerClock(request, NOW);
    await page.clock.install({ time: new Date(NOW) });
    await logIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    const recipe = await seedRecipe(page, {
      title: 'Naleśniki',
      servings: 1,
      ingredients: ['100 g mąki'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    let attempts = 0;
    await context.route('**/api/shopping/*/checks', (route) => {
      attempts += 1;
      return route.fulfill({ status: 500, json: { error: { code: 'internal' } } });
    });
    await item(page, 'mąki 100 g').click();
    await expect.poll(() => attempts).toBeGreaterThan(0);

    // A minute in 2 s steps: a fixed 2 s retry would send about thirty requests.
    for (let second = 0; second < 60; second += 2) {
      await page.clock.runFor(2000);
      await page.evaluate(() => fetch('/api/health'));
    }

    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThanOrEqual(8);
  });

  test('S20: offline dopisanie i usunięcie własnej pozycji jest niedostępne', async ({
    page,
    context,
    request,
  }) => {
    await openApp(page, request);
    await openList(page);
    await addOwn(page, 'sznurek');
    await expect(item(page, 'sznurek')).toBeVisible();
    await waitForOfflineData(page);
    await goOffline(context, page);
    await page.goto('/zakupy');

    await addOwn(page, 'papier do pieczenia');
    await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();
    await expect(item(page, 'papier do pieczenia')).toHaveCount(0);

    await page.getByRole('button', { name: 'Usuń pozycję: sznurek' }).click();
    await expect(page.getByText(OFFLINE_MESSAGE)).toHaveCount(2);
    await expect(item(page, 'sznurek')).toBeVisible();
  });

  test('S20: ta sama pozycja zmieniona offline na dwóch urządzeniach ma stan z urządzenia, które zsynchronizowało się później', async ({
    page,
    context,
    browser,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Sałatka',
      servings: 1,
      ingredients: ['1 ogórek'],
    });
    await plan(page, recipe, '2026-10-14', 1);
    await page.reload();
    await openList(page);
    await waitForOfflineData(page);
    const other = await secondDevice(browser);
    await other.page.goto('/zakupy');
    await expect(item(other.page, 'ogórek 1')).toBeVisible();
    await waitForOfflineData(other.page);
    await goOffline(context, page);
    await goOffline(other.context, other.page);
    await page.goto('/zakupy');
    await other.page.goto('/zakupy');

    // The first device ticks the item; the second ticks and unticks it. It syncs later and wins.
    await item(page, 'ogórek 1').click();
    await item(other.page, 'ogórek 1').click();
    await item(other.page, 'ogórek 1').click();
    await goOnline(context, page);
    await expect
      .poll(async () => (await serverChecks(page)).map((check) => check.checked))
      .toEqual([true]);
    await goOnline(other.context, other.page);

    await expect
      .poll(async () => (await serverChecks(page)).map((check) => check.checked))
      .toEqual([false]);
    await page.reload();
    await expect(toBuy(page).getByRole('checkbox', { name: 'ogórek 1' })).not.toBeChecked();
    await other.context.close();
  });

  test('S20: eksport zawiera plan i listę zakupów wraz ze stanem odhaczenia', async ({
    page,
    request,
  }) => {
    await openApp(page, request);
    const recipe = await seedRecipe(page, {
      title: 'Zupa dyniowa',
      servings: 2,
      ingredients: ['200 g Twaróg', 'sól do smaku'],
    });
    await plan(page, recipe, '2026-10-14', 4);
    await page.reload();
    await openList(page);
    await addOwn(page, 'papier do pieczenia');
    await item(page, 'twaróg 400 g').click();
    await item(page, 'papier do pieczenia').click();
    await expect.poll(async () => (await serverChecks(page)).length).toBe(1);
    await expect(bought(page).getByRole('checkbox')).toHaveCount(2);

    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await page.getByRole('link', { name: 'Moje dane' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const files = readZip(await readFile(await (await download).path()));

    const data = JSON.parse(files.get('dane.json')?.toString() ?? '') as {
      mealPlan: { date: string; servings: number }[];
      shoppingLists: {
        weekStart: string;
        items: { name: string; quantity: number | null; custom: boolean; checked: boolean }[];
      }[];
    };
    expect(data.mealPlan).toMatchObject([{ date: '2026-10-14', servings: 4 }]);
    expect(data.shoppingLists).toHaveLength(1);
    expect(data.shoppingLists[0]?.weekStart).toBe('2026-10-12');
    expect(data.shoppingLists[0]?.items).toEqual([
      expect.objectContaining({ name: 'sól do smaku', quantity: null, checked: false }),
      expect.objectContaining({ name: 'papier do pieczenia', custom: true, checked: true }),
      expect.objectContaining({ name: 'twaróg', quantity: 400, checked: true }),
    ]);
  });
});
