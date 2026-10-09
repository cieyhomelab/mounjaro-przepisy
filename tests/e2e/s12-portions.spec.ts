import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe, type RecipeSeed } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

async function openRecipe(page: Page, seed: RecipeSeed) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  const id = await seedRecipe(page, seed);
  await page.goto(`/przepisy/${id}`);
  await expect(page.getByRole('button', { name: 'Ugotowane' })).toBeVisible();
  return id;
}

const ingredients = (page: Page) =>
  page.getByRole('region', { name: 'Składniki' }).getByRole('listitem');
const setServings = (page: Page, value: string) =>
  page.getByLabel('Przelicz na porcje').fill(value);

test.describe('S12: skalowanie porcji', () => {
  test('S12: przepis na 4 porcje przeliczony na 2 pokazuje „200 g” z 400 g piersi z kurczaka', async ({
    page,
  }) => {
    await openRecipe(page, {
      title: 'Kurczak',
      servings: 4,
      ingredients: ['400 g piersi z kurczaka'],
    });

    await setServings(page, '2');

    await expect(ingredients(page)).toHaveText(['200 g piersi z kurczaka']);
  });

  test('S12: przepis na 1 porcję przeliczony na 0,5 porcji zmniejsza o połowę wszystkie ilości', async ({
    page,
  }) => {
    await openRecipe(page, {
      title: 'Omlet',
      servings: 1,
      ingredients: ['200 g mąki', '4 łyżki mleka', '2 jajka'],
    });

    await setServings(page, '0,5');

    await expect(ingredients(page)).toHaveText(['100 g mąki', '2 łyżki mleka', '1 jajka']);
  });

  test('S12: 3 jajka z przepisu na 2 porcje, przy 1 porcji, to „1,5 jajka”', async ({ page }) => {
    await openRecipe(page, { title: 'Jajecznica', servings: 2, ingredients: ['3 jajka'] });

    await setServings(page, '1');

    await expect(ingredients(page)).toHaveText(['1,5 jajka']);
  });

  test('S12: przyciski „Mniej porcji” i „Więcej porcji” zmieniają liczbę porcji co 0,5', async ({
    page,
  }) => {
    await openRecipe(page, { title: 'Zupa', servings: 2, ingredients: ['400 g warzyw'] });

    await page.getByRole('button', { name: 'Mniej porcji' }).click();
    await expect(ingredients(page)).toHaveText(['300 g warzyw']);
    await page.getByRole('button', { name: 'Więcej porcji' }).click();
    await page.getByRole('button', { name: 'Więcej porcji' }).click();
    await expect(ingredients(page)).toHaveText(['500 g warzyw']);
  });

  test('S12: składnik bez ilości wyświetla się bez zmian', async ({ page }) => {
    await openRecipe(page, {
      title: 'Zupa',
      servings: 4,
      ingredients: ['sól do smaku', '400 g marchewki'],
    });

    await setServings(page, '2');

    await expect(ingredients(page)).toHaveText(['sól do smaku', '200 g marchewki']);
  });

  test('S12: składnik, którego nie rozbito na ilość, jednostkę i nazwę, ma dopisek „ilość nieprzeliczona”', async ({
    page,
  }) => {
    await openRecipe(page, {
      title: 'Zupa',
      servings: 4,
      ingredients: ['2-3 łyżki oleju', '400 g marchewki'],
    });
    await expect(ingredients(page).first()).toHaveText('2-3 łyżki oleju');

    await setServings(page, '2');

    await expect(ingredients(page)).toHaveText([
      '2-3 łyżki oleju (ilość nieprzeliczona)',
      '200 g marchewki',
    ]);
  });

  test('S12: zmiana liczby porcji nie zmienia wartości odżywczych na porcję', async ({ page }) => {
    await openRecipe(page, {
      title: 'Zupa',
      servings: 4,
      ingredients: ['400 g marchewki'],
      nutritionManual: { kcal: 320, proteinG: 25, fatG: 10, fiberG: 6 },
    });
    const nutrition = page.getByRole('region', { name: /wartości odżywcze/i });
    const before = await nutrition.innerText();
    expect(before).toContain('320');

    await setServings(page, '1');
    await expect(ingredients(page)).toHaveText(['100 g marchewki']);

    expect(await nutrition.innerText()).toBe(before);
  });

  test('S12: po zamknięciu i ponownym otwarciu przepisu widać pierwotną liczbę porcji', async ({
    page,
  }) => {
    const id = await openRecipe(page, {
      title: 'Zupa',
      servings: 4,
      ingredients: ['400 g marchewki'],
    });
    await setServings(page, '2');
    await expect(ingredients(page)).toHaveText(['200 g marchewki']);

    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await page.goto(`/przepisy/${id}`);

    await expect(page.getByText('Liczba porcji: 4')).toBeVisible();
    await expect(page.getByLabel('Przelicz na porcje')).toHaveValue('4');
    await expect(ingredients(page)).toHaveText(['400 g marchewki']);
  });

  test('S12: niepoprawna liczba porcji pokazuje komunikat i nie zmienia ilości', async ({
    page,
  }) => {
    await openRecipe(page, { title: 'Zupa', servings: 4, ingredients: ['400 g marchewki'] });

    await setServings(page, '0,3');

    await expect(
      page.getByText('Liczba porcji musi być od 0,5 do 99, z krokiem 0,5.'),
    ).toBeVisible();
    await expect(ingredients(page)).toHaveText(['400 g marchewki']);
  });
});
