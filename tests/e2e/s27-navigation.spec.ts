import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Nawigacja główna' });

async function loggedIn(page: Page, size = PHONE) {
  await page.setViewportSize(size);
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

/** The visible text of the navigation item marked as current, or null when there is none. */
async function activeItem(page: Page) {
  const current = mainNav(page).locator('[aria-current="page"]');
  const count = await current.count();
  expect(count).toBeLessThanOrEqual(1);
  return count === 0 ? null : ((await current.textContent()) ?? '').trim();
}

test.describe('S27: nawigacja', () => {
  test('S27: na 390 px dolny pasek ma cztery pozycje, aktywna z podpisem i aria-current, pozostałe z aria-label', async ({
    page,
  }) => {
    await loggedIn(page);

    const nav = mainNav(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(4);
    const active = nav.getByRole('link', { name: 'Przepisy' });
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(active).toHaveText('Przepisy');
    for (const name of ['Planer', 'Zakupy', 'Zdrowie']) {
      const link = nav.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('aria-label', name);
      await expect(link).not.toHaveAttribute('aria-current', 'page');
      await expect(link).toHaveText('');
    }
    // The side menu is not shown on a phone.
    await expect(page.getByRole('complementary')).toBeHidden();
  });

  test('S27: na 390 px po przewinięciu do końca pasek nie zasłania ostatniego elementu treści', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await logIn(page);
    for (let index = 1; index <= 12; index += 1) {
      await seedRecipe(page, { title: `Przepis testowy ${index}` });
    }
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();

    const navTop = (await mainNav(page).boundingBox())?.y ?? 0;
    // The list is virtual and the page grows as it renders, so scroll until the end is reached.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          const last = document.querySelector('main section')?.lastElementChild;
          const atEnd =
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
          return atEnd && last ? last.getBoundingClientRect().bottom : Number.POSITIVE_INFINITY;
        }),
      )
      .toBeLessThanOrEqual(navTop);
  });

  test('S27: na 1280 px jest boczne menu z nazwą aplikacji, czterema pozycjami i kolekcjami własnymi, bez dolnego paska', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await logIn(page);
    await apiCall(page, 'POST', '/api/collections', { name: 'Obiady' });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();

    const side = page.getByRole('complementary');
    await expect(side).toBeVisible();
    await expect(side.getByRole('link', { name: 'Mounjaro Przepisy' })).toBeVisible();
    for (const name of ['Przepisy', 'Planer', 'Zakupy', 'Zdrowie']) {
      await expect(side.getByRole('link', { name, exact: true })).toHaveText(name);
    }
    await expect(side.getByRole('button', { name: 'Obiady' })).toBeVisible();
    // Only the side menu is a main navigation at this width.
    await expect(mainNav(page)).toHaveCount(1);
    await expect(page.locator('nav.fixed')).toBeHidden();
  });

  test('S27: pozycje otwierają kolekcję, planer, listę zakupów bieżącego tygodnia i dziennik dawek', async ({
    page,
  }) => {
    await loggedIn(page);
    const nav = mainNav(page);

    await nav.getByRole('link', { name: 'Planer', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Planer' })).toBeVisible();
    expect(await activeItem(page)).toBe('Planer');

    await nav.getByRole('link', { name: 'Zakupy', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Lista zakupów' })).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/zakupy');

    await nav.getByRole('link', { name: 'Zdrowie', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();

    await nav.getByRole('link', { name: 'Przepisy', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  });

  test('S27: aktywna pozycja zależy od ekranu, a w Ustawieniach i na Koncie nie ma aria-current', async ({
    page,
  }) => {
    await loggedIn(page);
    const recipeId = await seedRecipe(page, { title: 'Zupa testowa' });

    const expected: [string, string | null][] = [
      ['/', 'Przepisy'],
      [`/przepisy/${recipeId}`, 'Przepisy'],
      ['/przepisy/nowy', 'Przepisy'],
      [`/przepisy/${recipeId}/edycja`, 'Przepisy'],
      ['/szukaj', 'Przepisy'],
      ['/kolekcje', 'Przepisy'],
      ['/planer', 'Planer'],
      ['/zakupy', 'Zakupy'],
      ['/dawki', 'Zdrowie'],
      ['/dawki/nowy', 'Zdrowie'],
      ['/waga', 'Zdrowie'],
      ['/waga/nowy', 'Zdrowie'],
      ['/licznik', 'Zdrowie'],
      ['/ustawienia', null],
      ['/ustawienia/progi-filtrow', null],
      ['/konto', null],
    ];
    for (const [path, item] of expected) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(mainNav(page)).toBeVisible();
      expect(await activeItem(page), path).toBe(item);
    }
  });

  test('S27: kolekcja własna z bocznego menu otwiera kolekcję z jej filtrem', async ({ page }) => {
    await loggedIn(page, DESKTOP);
    const inId = await seedRecipe(page, { title: 'Zupa w kolekcji' });
    await seedRecipe(page, { title: 'Sałatka poza kolekcją' });
    const body = (await apiCall(page, 'POST', '/api/collections', { name: 'Obiady' })) as {
      collection: { id: string };
    };
    await apiCall(page, 'PUT', `/api/recipes/${inId}/collections`, {
      collectionIds: [body.collection.id],
    });
    await page.reload();
    await page.getByRole('link', { name: 'Planer', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Planer' })).toBeVisible();

    await page.getByRole('complementary').getByRole('button', { name: 'Obiady' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(page.getByLabel('Kolekcja własna')).toHaveValue(body.collection.id);
    await expect(page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem')).toHaveCount(1);
    await expect(page.getByText('Zupa w kolekcji')).toBeVisible();
    await expect(page.getByText('Sałatka poza kolekcją')).toHaveCount(0);
  });

  test('S27: przycisk „Ustawienia” w nagłówku kolekcji otwiera ekran ze wszystkimi ustawieniami', async ({
    page,
  }) => {
    await loggedIn(page);
    await seedRecipe(page, { title: 'Zupa testowa' });
    await page.reload();

    await page.getByRole('link', { name: 'Ustawienia' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Motyw' })).toBeVisible();
    for (const name of [
      'Progi filtrów',
      'Cele i szklanka',
      'Przypomnienie o zastrzyku',
      'Zaufane serwisy',
      'Moje dane',
      'Konto',
    ]) {
      await expect(page.getByRole('link', { name })).toBeVisible();
    }
    await expect(page.getByText(/^Dane offline:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible();
  });

  test('S27: nawigacja główna nie zawiera „Ustawienia”, „Konto” ani „Wyloguj”', async ({
    page,
  }) => {
    await loggedIn(page);
    for (const size of [PHONE, DESKTOP]) {
      await page.setViewportSize(size);
      const nav = mainNav(page);
      await expect(nav.getByRole('link')).toHaveCount(4);
      for (const name of ['Ustawienia', 'Konto', 'Wyloguj']) {
        await expect(nav.getByRole('link', { name })).toHaveCount(0);
        await expect(nav.getByRole('button', { name })).toHaveCount(0);
      }
    }
  });

  test('S27: w trybie gotowania nie ma ani dolnego paska, ani bocznego menu', async ({ page }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa do gotowania' });
    for (const size of [PHONE, DESKTOP]) {
      await page.setViewportSize(size);
      await page.goto(`/przepisy/${id}/gotuj`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Zupa do gotowania' }),
      ).toBeVisible();
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expect(page.getByRole('complementary')).toHaveCount(0);
    }
  });

  test('S27: offline znacznik „offline” jest u góry ekranu także w trybie gotowania', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa offline' });
    await page.reload();
    await page.getByRole('link', { name: 'Zupa offline' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zupa offline' })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'offline' })).toBeVisible();
    const box = await page.getByRole('status').filter({ hasText: 'offline' }).boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(120);

    await page.getByRole('link', { name: 'Gotuj' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zupa offline' })).toBeVisible();
    expect(page.url()).toContain(`/przepisy/${id}/gotuj`);
    await expect(page.getByRole('status').filter({ hasText: 'offline' })).toBeVisible();
    await context.setOffline(false);
  });
});
