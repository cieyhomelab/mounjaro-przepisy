import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const FIELD_LABELS = {
  protein: 'Wysokie białko: co najmniej',
  smallPortion: 'Mała porcja: najwyżej',
  fat: 'Lekkostrawne: najwyżej',
  fiber: 'Dużo błonnika: co najmniej',
  kcal: 'Mało kalorii: najwyżej',
};

async function openThresholds(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await page.getByRole('link', { name: 'Progi filtrów' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Progi filtrów' })).toBeVisible();
}

async function loggedInWithThresholds(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  await openThresholds(page);
}

test.describe('S7: progi filtrów', () => {
  test('S7: nowe konto widzi pięć wartości domyślnych', async ({ page }) => {
    await loggedInWithThresholds(page);

    await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('25');
    await expect(page.getByLabel(FIELD_LABELS.smallPortion)).toHaveValue('300');
    await expect(page.getByLabel(FIELD_LABELS.fat)).toHaveValue('15');
    await expect(page.getByLabel(FIELD_LABELS.fiber)).toHaveValue('5');
    await expect(page.getByLabel(FIELD_LABELS.kcal)).toHaveValue('400');
  });

  test('S7: zmieniony próg białka na 30 g działa w filtrze „Wysokie białko”', async ({ page }) => {
    await logIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await seedRecipe(page, { title: 'Dwadzieścia osiem', nutritionManual: { proteinG: 28 } });
    await seedRecipe(page, { title: 'Trzydzieści pięć', nutritionManual: { proteinG: 35 } });
    await page.reload();
    await openThresholds(page);

    await page.getByLabel(FIELD_LABELS.protein).fill('30');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano progi.')).toBeVisible();
    await page.getByRole('link', { name: 'Mounjaro Przepisy' }).click();
    await page.getByRole('button', { name: 'Wysokie białko' }).click();

    const items = page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Trzydzieści pięć');
  });

  test('S7: „Przywróć domyślne” przywraca wartości domyślne', async ({ page }) => {
    await loggedInWithThresholds(page);
    await page.getByLabel(FIELD_LABELS.protein).fill('30');
    await page.getByLabel(FIELD_LABELS.kcal).fill('350,5');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano progi.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('30');
    await expect(page.getByLabel(FIELD_LABELS.kcal)).toHaveValue('350.5');
    await page.getByRole('button', { name: 'Przywróć domyślne' }).click();

    await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('25');
    await expect(page.getByLabel(FIELD_LABELS.kcal)).toHaveValue('400');
    await page.reload();
    await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('25');
  });

  for (const [name, value] of [
    ['wartość ujemna', '-5'],
    ['zero', '0'],
    ['wartość mniejsza niż 0,1', '0,04'],
    ['wartość z dwoma miejscami po przecinku', '25,55'],
    ['tekst', 'dużo'],
  ] as const) {
    test(`S7: ${name} nie zostaje zapisana i widać komunikat o błędzie`, async ({ page }) => {
      await loggedInWithThresholds(page);
      await page.getByLabel(FIELD_LABELS.protein).fill(value);
      await page.getByLabel(FIELD_LABELS.fat).fill('12');

      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect(page.getByRole('alert')).toContainText('Podaj liczbę');
      await expect(page.getByText('Zapisano progi.')).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('25');
      await expect(page.getByLabel(FIELD_LABELS.fat)).toHaveValue('15');
    });
  }

  test('S7: progi zmienione na jednym urządzeniu obowiązują na drugim', async ({
    page,
    browser,
    baseURL,
  }) => {
    await loggedInWithThresholds(page);
    await page.getByLabel(FIELD_LABELS.protein).fill('32');
    await page.getByLabel(FIELD_LABELS.smallPortion).fill('250');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano progi.')).toBeVisible();

    const context = await browser.newContext({ ...(baseURL ? { baseURL } : {}), locale: 'pl-PL' });
    try {
      const other = await context.newPage();
      await logIn(other);
      await expect(other.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
      await openThresholds(other);

      await expect(other.getByLabel(FIELD_LABELS.protein)).toHaveValue('32');
      await expect(other.getByLabel(FIELD_LABELS.smallPortion)).toHaveValue('250');
    } finally {
      await context.close();
    }
  });

  for (const [action, expectedSaved] of [
    ['Zapisz', 'Zapisano progi.'],
    ['Przywróć domyślne', 'Zapisano progi.'],
  ] as const) {
    test(`S7: „${action}” bez połączenia pokazuje komunikat, zachowuje pola i da się ponowić`, async ({
      page,
      context,
    }) => {
      await loggedInWithThresholds(page);
      await page.getByLabel(FIELD_LABELS.protein).fill('30');
      await page.getByRole('button', { name: 'Zapisz' }).click();
      await expect(page.getByText(expectedSaved)).toBeVisible();

      await page.getByLabel(FIELD_LABELS.fat).fill('12');
      await context.setOffline(true);
      await page.getByRole('button', { name: action }).click();

      await expect(page.getByRole('alert')).toContainText(
        /Ta akcja wymaga połączenia z internetem|Nie udało się połączyć z serwerem/,
      );
      await expect(page.getByText(expectedSaved)).toHaveCount(0);
      await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('30');
      await expect(page.getByLabel(FIELD_LABELS.fat)).toHaveValue('12');

      await context.setOffline(false);
      await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
      await expect(page.getByText(expectedSaved)).toBeVisible();
    });
  }

  test('S7: progi zmienione na drugim urządzeniu pojawiają się w polach po synchronizacji', async ({
    page,
  }) => {
    await loggedInWithThresholds(page);
    await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('25');

    const response = await page.request.put('/api/settings/thresholds', {
      headers: { Origin: 'http://localhost:3000' },
      data: { proteinG: 41, fatG: 15, fiberG: 5, kcal: 400, smallPortionKcal: 300 },
    });
    expect(response.ok()).toBe(true);
    await page.reload();

    await expect(page.getByLabel(FIELD_LABELS.protein)).toHaveValue('41');
  });
});
