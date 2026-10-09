import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_SITES, apiCall, logIn, resetServer, useTestSites } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const searchHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Szukaj w serwisach' });

async function openSearch(page: Page) {
  await page.goto('/szukaj');
  await expect(searchHeading(page)).toBeVisible();
}

async function search(page: Page, phrase: string) {
  await page.getByLabel('Czego szukasz?').fill(phrase);
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click();
}

const resultItems = (page: Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('link') });

test.describe('S17: wyszukiwanie przepisów w zaufanych serwisach', () => {
  test('S17: „Szukaj w serwisach” otwiera się z kolekcji', async ({ page }) => {
    await logIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await page.getByRole('button', { name: 'Szukaj w serwisach' }).click();
    await expect(searchHeading(page)).toBeVisible();
  });

  test('S17: lista ma najwyżej 10 wyników z serwisu, a każdy pokazuje tytuł, zdjęcie, serwis, ocenę i liczbę opinii', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await openSearch(page);
    await search(page, 'kurczak');

    const items = resultItems(page);
    await expect(items).toHaveCount(10);
    const best = items.first();
    await expect(best.getByRole('link', { name: 'Kurczak 2' })).toBeVisible();
    await expect(best).toContainText('Przeszukiwalny');
    await expect(best).toContainText('Ocena 4,9 / 5');
    await expect(best).toContainText('20 opinii');
    const photo = best.getByRole('img', { name: 'Zdjęcie: Kurczak 2' });
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test('S17: oceny w skali 0–10 są przeliczone na skalę 0–5', async ({ page, request }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.scaleTen]);
    await openSearch(page);
    await search(page, 'ocena');

    // 9,5 z 10 to 4,75 z 5 (4,8 po zaokrągleniu do jednego miejsca); 8 z 10 to 4,0.
    const items = resultItems(page);
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Danie z oceną z dziesięciu 2');
    await expect(items.first()).toContainText('Ocena 4,8 / 5');
    await expect(items.last()).toContainText('Ocena 4,0 / 5');
  });

  test('S17: lista jest posortowana od najwyżej ocenianych, a wyniki bez oceny są na końcu', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await openSearch(page);
    await search(page, 'obiad');
    // Strony „czytelna” (4,6) i „bez oceny”; „nie-przepis” nie jest przepisem i odpada.
    const items = resultItems(page);
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Kurczak pieczony z cukinią');
    await expect(items.first()).toContainText('Ocena 4,6 / 5');
    await expect(items.last()).toContainText('Brak oceny');

    await search(page, 'kurczak');
    const readRatings = () =>
      resultItems(page).evaluateAll((elements) =>
        elements.map((element) => {
          const match = /Ocena (\d),(\d)/.exec(element.textContent ?? '');
          return match ? Number(`${match[1]}.${match[2]}`) : -1;
        }),
      );
    await expect.poll(async () => (await readRatings()).length).toBeGreaterThan(1);
    const ratings = await readRatings();
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  test('S17: wynik, którego adres jest w kolekcji, jest oznaczony „w kolekcji” i nie ma przycisku „Zapisz”', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    const imported = await apiCall(page, 'POST', '/api/recipes', {
      title: 'Kurczak pieczony z cukinią',
      servings: 4,
      ingredients: [{ originalText: '500 g piersi z kurczaka' }],
      steps: ['Piecz.'],
      nutritionManual: {},
      sourceUrl: 'http://przeszukiwalny.test:8080/przepisy/czytelna/',
    });
    expect(imported).toHaveProperty('recipe');
    await openSearch(page);
    await search(page, 'obiad');

    const owned = resultItems(page).filter({ hasText: 'Kurczak pieczony z cukinią' });
    await expect(owned.getByRole('link', { name: 'w kolekcji' })).toBeVisible();
    await expect(owned.getByRole('button', { name: 'Zapisz' })).toHaveCount(0);
    const other = resultItems(page).filter({ hasNotText: 'Kurczak pieczony z cukinią' });
    await expect(other.getByRole('link', { name: 'w kolekcji' })).toHaveCount(0);
  });

  test('S17: tytuł wyniku prowadzi do oryginalnej strony przepisu', async ({ page, request }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await openSearch(page);
    await search(page, 'obiad');
    const title = page.getByRole('link', { name: 'Kurczak pieczony z cukinią' });
    await expect(title).toHaveAttribute(
      'href',
      'http://przeszukiwalny.test:8080/przepisy/czytelna',
    );
    await expect(title).toHaveAttribute('target', '_blank');
  });

  test('S17: serwis „niedostępny” jest wskazany, a wyniki pozostałych serwisów widać', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable, FIXTURE_SITES.unavailable]);
    await openSearch(page);
    await search(page, 'kurczak');
    await expect(resultItems(page)).toHaveCount(10);
    await expect(page.getByRole('alert')).toHaveText('Nie udało się przeszukać: Niedostępny.');
  });

  test('S17: fraza bez wyników pokazuje „Brak wyników”', async ({ page, request }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await openSearch(page);
    await search(page, 'nic takiego');
    await expect(page.getByText('Brak wyników')).toBeVisible();
    await expect(resultItems(page)).toHaveCount(0);
  });

  test('S17: offline „Szukaj w serwisach” pokazuje komunikat, że wyszukiwanie wymaga połączenia', async ({
    page,
    context,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await openSearch(page);
    await context.setOffline(true);
    await expect(
      page.getByText('Wyszukiwanie w serwisach wymaga połączenia z internetem.'),
    ).toBeVisible();
    await expect(page.getByLabel('Czego szukasz?')).toHaveCount(0);
  });
});
