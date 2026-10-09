import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe, type RecipeSeed } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const recipeList = (page: Page) => page.getByRole('list', { name: 'Przepisy' });
const items = (page: Page) => recipeList(page).getByRole('listitem');
const filterButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Filtry' }).getByRole('button', { name });
const titles = (page: Page) => items(page).locator('span.truncate').allTextContents();

async function openCollection(page: Page, seeds: RecipeSeed[]) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  for (const seed of seeds) await seedRecipe(page, seed);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  await expect(items(page).first()).toBeVisible();
}

const nutrition = (kcal?: number, proteinG?: number, fatG?: number, fiberG?: number) => ({
  nutritionManual: {
    ...(kcal === undefined ? {} : { kcal }),
    ...(proteinG === undefined ? {} : { proteinG }),
    ...(fatG === undefined ? {} : { fatG }),
    ...(fiberG === undefined ? {} : { fiberG }),
  },
});

test.describe('S6: filtry pod Mounjaro', () => {
  test('S6: „Wysokie białko” zostawia przepisy z białkiem co najmniej 25 g na porcję', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Równo 25', ...nutrition(undefined, 25) },
      { title: 'Prawie 25', ...nutrition(undefined, 24.4) },
      { title: 'Dużo', ...nutrition(undefined, 40) },
    ]);

    await filterButton(page, 'Wysokie białko').click();

    await expect(filterButton(page, 'Wysokie białko')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => titles(page)).toEqual(['Dużo', 'Równo 25']);
  });

  test('S6: „Mała porcja” zostawia przepisy z najwyżej 300 kcal na porcję', async ({ page }) => {
    await openCollection(page, [
      { title: 'Równo 300', ...nutrition(300, 10) },
      { title: 'Ponad 300', ...nutrition(301, 20) },
      { title: 'Lekki', ...nutrition(120, 5) },
    ]);

    await filterButton(page, 'Mała porcja').click();

    await expect.poll(() => titles(page)).toEqual(['Równo 300', 'Lekki']);
  });

  test('S6: „Lekkostrawne” zostawia przepisy z tłuszczem najwyżej 15 g na porcję', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Równo 15', ...nutrition(undefined, 10, 15) },
      { title: 'Tłusty', ...nutrition(undefined, 20, 15.5) },
      { title: 'Chudy', ...nutrition(undefined, 5, 2) },
    ]);

    await filterButton(page, 'Lekkostrawne (mało tłuszczu)').click();

    await expect.poll(() => titles(page)).toEqual(['Równo 15', 'Chudy']);
  });

  test('S6: „Dużo błonnika” zostawia przepisy z błonnikiem co najmniej 5 g na porcję', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Równo 5', ...nutrition(undefined, 10, undefined, 5) },
      { title: 'Mało błonnika', ...nutrition(undefined, 20, undefined, 4.9) },
      { title: 'Dużo błonnika', ...nutrition(undefined, 5, undefined, 12) },
    ]);

    await filterButton(page, 'Dużo błonnika').click();

    await expect.poll(() => titles(page)).toEqual(['Równo 5', 'Dużo błonnika']);
  });

  test('S6: „Mało kalorii” zostawia przepisy z najwyżej 400 kcal na porcję, a „Mała porcja” z tą samą wartością ma niższy próg', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Równo 400', ...nutrition(400, 30) },
      { title: 'Ponad 400', ...nutrition(401, 20) },
      { title: 'Między progami', ...nutrition(350, 10) },
    ]);

    await filterButton(page, 'Mało kalorii').click();
    await expect.poll(() => titles(page)).toEqual(['Równo 400', 'Między progami']);

    await filterButton(page, 'Mała porcja').click();
    await expect(page.getByText('Brak przepisów dla tych filtrów')).toBeVisible();
  });

  test('S6: przepis z „brak danych” nie przechodzi filtra opartego na brakującej wartości', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Bez białka', ...nutrition(200) },
      { title: 'Bez wszystkiego' },
      { title: 'Z białkiem', ...nutrition(200, 30) },
    ]);

    await filterButton(page, 'Wysokie białko').click();
    await expect.poll(() => titles(page)).toEqual(['Z białkiem']);
    await filterButton(page, 'Wysokie białko').click();
    await filterButton(page, 'Lekkostrawne (mało tłuszczu)').click();

    await expect(page.getByText('Brak przepisów dla tych filtrów')).toBeVisible();
  });

  test('S6: kilka filtrów działa jednocześnie', async ({ page }) => {
    await openCollection(page, [
      { title: 'Oba', ...nutrition(250, 30) },
      { title: 'Tylko białko', ...nutrition(500, 35) },
      { title: 'Tylko mało kcal', ...nutrition(250, 10) },
    ]);

    await filterButton(page, 'Wysokie białko').click();
    await filterButton(page, 'Mała porcja').click();

    await expect.poll(() => titles(page)).toEqual(['Oba']);
  });

  test('S6: gdy nic nie pasuje, widać komunikat i „Wyczyść filtry” przywraca listę', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'A', ...nutrition(500, 10) },
      { title: 'B', ...nutrition(600, 12) },
    ]);

    await filterButton(page, 'Mała porcja').click();

    await expect(page.getByText('Brak przepisów dla tych filtrów')).toBeVisible();
    await expect(recipeList(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Wyczyść filtry' }).click();
    await expect(items(page)).toHaveCount(2);
    await expect(filterButton(page, 'Mała porcja')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('S6: sortowanie', () => {
  const sortSelect = (page: Page) => page.getByLabel('Sortowanie');

  test('S6: wybór sortowania oferuje pięć opcji, domyślnie białko malejąco', async ({ page }) => {
    await openCollection(page, [{ title: 'A', ...nutrition(100, 10) }]);

    await expect(sortSelect(page)).toHaveValue('proteinDesc');
    await expect(sortSelect(page).locator('option')).toHaveText([
      'Białko na porcję malejąco',
      'Własna ocena malejąco',
      'Ocena ze źródła malejąco',
      'Kalorie rosnąco',
      'Ostatnio dodane',
    ]);
  });

  test('S6: kalorie rosnąco, a przepisy bez kalorii są na końcu', async ({ page }) => {
    await openCollection(page, [
      { title: 'Bez kalorii', ...nutrition(undefined, 50) },
      { title: 'Duży', ...nutrition(700, 20) },
      { title: 'Mały', ...nutrition(150, 10) },
    ]);

    await sortSelect(page).selectOption({ label: 'Kalorie rosnąco' });

    await expect.poll(() => titles(page)).toEqual(['Mały', 'Duży', 'Bez kalorii']);
  });

  test('S6: ocena ze źródła malejąco, a przepisy bez oceny są na końcu', async ({ page }) => {
    await openCollection(page, [
      { title: 'Bez oceny', ...nutrition(100, 50) },
      {
        title: 'Słabszy',
        ...nutrition(100, 10),
        source: { url: 'https://example.test/slabszy', rating: 3.5 },
      },
      {
        title: 'Lepszy',
        ...nutrition(100, 5),
        source: { url: 'https://example.test/lepszy', rating: 4.8 },
      },
    ]);

    await sortSelect(page).selectOption({ label: 'Ocena ze źródła malejąco' });

    await expect.poll(() => titles(page)).toEqual(['Lepszy', 'Słabszy', 'Bez oceny']);
  });

  test('S6: własna ocena malejąco ustawia przepisy bez oceny w kolejności od ostatnio dodanego', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Starszy', ...nutrition(100, 50) },
      { title: 'Nowszy', ...nutrition(100, 10) },
    ]);

    await sortSelect(page).selectOption({ label: 'Własna ocena malejąco' });

    await expect.poll(() => titles(page)).toEqual(['Nowszy', 'Starszy']);
  });

  test('S6: własna ocena malejąco ustawia ocenione przepisy od najwyżej ocenionego, a nieocenione na końcu', async ({
    page,
  }) => {
    await logIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    const ids: Record<string, string> = {};
    for (const title of ['Bez oceny', 'Trójka', 'Piątka', 'Czwórka']) {
      ids[title] = await seedRecipe(page, { title, ...nutrition(100, 10) });
    }
    for (const [title, rating] of [
      ['Trójka', 3],
      ['Piątka', 5],
      ['Czwórka', 4],
    ] as const) {
      await apiCall(page, 'PUT', `/api/recipes/${ids[title]}/rating`, { rating });
    }
    await page.reload();
    await expect(items(page).first()).toBeVisible();

    await sortSelect(page).selectOption({ label: 'Własna ocena malejąco' });

    await expect.poll(() => titles(page)).toEqual(['Piątka', 'Czwórka', 'Trójka', 'Bez oceny']);
  });

  test('S6: ostatnio dodane ustawia najnowszy przepis na górze', async ({ page }) => {
    await openCollection(page, [
      { title: 'Pierwszy', ...nutrition(100, 50) },
      { title: 'Drugi', ...nutrition(100, 30) },
      { title: 'Trzeci', ...nutrition(100, 10) },
    ]);

    await sortSelect(page).selectOption({ label: 'Ostatnio dodane' });

    await expect.poll(() => titles(page)).toEqual(['Trzeci', 'Drugi', 'Pierwszy']);
  });
});

test.describe('S6: wyszukiwanie', () => {
  const search = (page: Page) => page.getByRole('searchbox', { name: 'Szukaj w kolekcji' });

  test('S6: „losos” znajduje „Łosoś pieczony” bez rozróżniania wielkości liter i polskich znaków', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Łosoś pieczony', ...nutrition(300, 30) },
      { title: 'Kurczak', ...nutrition(300, 20) },
    ]);

    await search(page).fill('losos');
    await expect.poll(() => titles(page)).toEqual(['Łosoś pieczony']);

    await search(page).fill('ŁOSOŚ PIE');
    await expect.poll(() => titles(page)).toEqual(['Łosoś pieczony']);
  });

  test('S6: wyszukiwanie obejmuje nazwy składników', async ({ page }) => {
    await openCollection(page, [
      { title: 'Obiad', ingredients: ['200 g filetu z piersi kurczaka', 'szczypta soli'] },
      { title: 'Deser', ingredients: ['100 g jogurtu'] },
    ]);

    await search(page).fill('KURCZAKA');

    await expect.poll(() => titles(page)).toEqual(['Obiad']);
  });

  test('S6: wpisany tekst i włączone filtry działają razem', async ({ page }) => {
    await openCollection(page, [
      { title: 'Łosoś z piekarnika', ...nutrition(300, 32) },
      { title: 'Łosoś w sosie', ...nutrition(300, 12) },
      { title: 'Kurczak', ...nutrition(300, 40) },
    ]);

    await search(page).fill('losos');
    await filterButton(page, 'Wysokie białko').click();

    await expect.poll(() => titles(page)).toEqual(['Łosoś z piekarnika']);
  });
});

test.describe('S6: zachowanie wyboru', () => {
  test('S6: filtry, sortowanie i wyszukiwanie zostają po otwarciu przepisu i powrocie, a po ponownym uruchomieniu znikają', async ({
    page,
  }) => {
    await openCollection(page, [
      { title: 'Łosoś', ...nutrition(250, 30) },
      { title: 'Zupa', ...nutrition(150, 28) },
      { title: 'Kotlet', ...nutrition(600, 35) },
    ]);
    await filterButton(page, 'Mała porcja').click();
    await page.getByLabel('Sortowanie').selectOption({ label: 'Kalorie rosnąco' });
    await page.getByRole('searchbox', { name: 'Szukaj w kolekcji' }).fill('o');
    await expect.poll(() => titles(page)).toEqual(['Zupa', 'Łosoś']);

    await items(page).first().getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zupa' })).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();

    await expect(filterButton(page, 'Mała porcja')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Sortowanie')).toHaveValue('kcalAsc');
    await expect(page.getByRole('searchbox', { name: 'Szukaj w kolekcji' })).toHaveValue('o');
    await expect.poll(() => titles(page)).toEqual(['Zupa', 'Łosoś']);

    await page.reload();

    await expect(filterButton(page, 'Mała porcja')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Sortowanie')).toHaveValue('proteinDesc');
    await expect(page.getByRole('searchbox', { name: 'Szukaj w kolekcji' })).toHaveValue('');
    await expect.poll(() => titles(page)).toEqual(['Kotlet', 'Łosoś', 'Zupa']);
  });
});

test.describe('S6: wydajność przy 1000 przepisów', () => {
  test('S6: filtr, sortowanie i wpisanie znaku trwają poniżej sekundy przy czterokrotnie spowolnionym procesorze', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'spowolnienie procesora działa tylko w Chromium');
    test.setTimeout(240_000);
    await logIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    for (let batch = 0; batch < 1000; batch += 25) {
      await Promise.all(
        Array.from({ length: 25 }, (_, offset) => {
          const n = batch + offset;
          return seedRecipe(page, {
            title: `Przepis ${n}`,
            ingredients: [`${n} g składnika ${n % 7}`],
            nutritionManual: { kcal: 100 + (n % 10) * 50, proteinG: n % 50 },
          });
        }),
      );
    }
    await page.reload();
    await expect(items(page).first()).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // Each action runs in the page; the time runs until the second frame after it has been painted.
    const filterMs = await page.evaluate(async () => {
      const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent === 'Wysokie białko',
      );
      const started = performance.now();
      button?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    });
    await expect(items(page).first()).toHaveAttribute('aria-setsize', '500');

    const sortMs = await page.evaluate(async () => {
      const select = [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.startsWith('Sortowanie'))
        ?.querySelector('select');
      const started = performance.now();
      if (select) {
        select.value = 'kcalAsc';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    });
    await expect(page.getByLabel('Sortowanie')).toHaveValue('kcalAsc');

    const typeMs = await page.evaluate(async () => {
      const input = document.querySelector('input[type="search"]') as HTMLInputElement;
      const started = performance.now();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'składnika 3',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    });
    await expect(items(page).first()).toHaveAttribute('aria-setsize', /^\d+$/);

    expect(filterMs).toBeLessThan(1000);
    expect(sortMs).toBeLessThan(1000);
    expect(typeMs).toBeLessThan(1000);
    // Only the rows near the screen exist, not all 500.
    expect(await items(page).count()).toBeLessThan(60);
  });
});
