import { expect, test, type Page } from '@playwright/test';
import testSet from '../fixtures/nutrition/ingredients.test-set.json' with { type: 'json' };
import { fillRecipeForm, logIn, resetServer, seedRecipe } from './helpers';

const FIXTURES = 'http://fixtures.test:8080';
const pageUrl = (name: string) => `${FIXTURES}/przepisy/${name}`;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

async function logInToCollection(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

const values = (page: Page) => page.getByRole('list', { name: 'Wartości odżywcze' });

async function openRecipe(page: Page, id: string) {
  await page.goto(`/przepisy/${id}`);
  await expect(values(page)).toBeVisible();
}

async function openEdit(page: Page, id: string) {
  await page.goto(`/przepisy/${id}/edycja`);
  await expect(page.getByRole('heading', { level: 1, name: 'Edycja przepisu' })).toBeVisible();
}

async function openDetails(page: Page) {
  await page.getByText('Szczegóły wartości odżywczych').click();
  await expect(page.getByRole('button', { name: /Wpisz ręcznie|Zmień/ }).first()).toBeVisible();
}

/** Saves the recipe read from `name` and returns its id. */
async function importPage(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Z linku' }).click();
  await page.getByLabel('Adres strony z przepisem').fill(pageUrl(name));
  await page.getByRole('button', { name: 'Odczytaj przepis' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Podgląd przepisu' })).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(values(page)).toBeVisible();
  return page.url().split('/').pop() ?? '';
}

/** The number in "Kalorie: 403 kcal (szacunkowe)". */
async function numberOf(page: Page, label: string): Promise<number> {
  const text = (await values(page).getByText(`${label}:`).textContent()) ?? '';
  return Number(/:\s*(\d+)/.exec(text)?.[1]);
}

test.describe('S5: pochodzenie wartości odżywczych', () => {
  test('S5: strona „z wartościami odżywczymi” daje cztery wartości równe podanym i oznaczone „ze źródła”', async ({
    page,
  }) => {
    await logInToCollection(page);

    await importPage(page, 'z-wartosciami-odzywczymi');

    await expect(values(page).getByText('Kalorie: 310 kcal (ze źródła)')).toBeVisible();
    // Strona podaje 21,5 g; wartości pokazujemy z dokładnością do 1 g.
    await expect(values(page).getByText('Białko: 22 g (ze źródła)')).toBeVisible();
    await expect(values(page).getByText('Tłuszcz: 22 g (ze źródła)')).toBeVisible();
    await expect(values(page).getByText('Błonnik: 3 g (ze źródła)')).toBeVisible();
  });

  test('S5: przepis referencyjny bez wartości ze źródła ma wszystkie wartości „szacunkowe”, równe sumie składników przez porcje (±1)', async ({
    page,
  }) => {
    await logInToCollection(page);
    const { referenceRecipe } = testSet;
    const id = await seedRecipe(page, {
      title: referenceRecipe.title,
      servings: referenceRecipe.servings,
      ingredients: referenceRecipe.ingredients,
    });

    await openRecipe(page, id);

    for (const [label, key, unit] of [
      ['Kalorie', 'kcal', 'kcal'],
      ['Białko', 'proteinG', 'g'],
      ['Tłuszcz', 'fatG', 'g'],
      ['Błonnik', 'fiberG', 'g'],
    ] as const) {
      await expect(
        values(page).getByText(new RegExp(`${label}: \\d+ ${unit} \\(szacunkowe\\)`)),
      ).toBeVisible();
      const shown = await numberOf(page, label);
      expect(Math.abs(shown - referenceRecipe.expectedPerServing[key])).toBeLessThanOrEqual(1);
    }
  });

  test('S5: nierozpoznane składniki są na liście z informacją, że nie zostały wliczone', async ({
    page,
  }) => {
    await logInToCollection(page);
    const id = await seedRecipe(page, {
      title: 'Kurczak z sosem',
      ingredients: ['200 g piersi z kurczaka', '3 łyżki sosu tajemniczego'],
    });
    await openRecipe(page, id);

    await openDetails(page);

    await expect(page.getByRole('heading', { name: 'Nierozpoznane składniki' })).toBeVisible();
    await expect(page.getByText('nie zostały wliczone', { exact: false })).toBeVisible();
    await expect(page.getByText('3 łyżki sosu tajemniczego')).toBeVisible();
    await expect(page.getByText('200 g piersi z kurczaka').nth(1)).toBeHidden();
  });

  test('S5: przepis bez rozpoznanych składników pokazuje „brak danych” i pozwala wpisać każdą wartość ręcznie', async ({
    page,
  }) => {
    await logInToCollection(page);
    const id = await seedRecipe(page, { title: 'Tajemnica', ingredients: ['sos tajemniczy'] });
    await openRecipe(page, id);

    await openDetails(page);

    for (const label of ['Kalorie', 'Białko', 'Tłuszcz', 'Błonnik']) {
      await expect(values(page).getByText(`${label}: — (brak danych)`)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Wpisz ręcznie' })).toHaveCount(4);

    await page.getByRole('button', { name: 'Wpisz ręcznie: kalorie' }).click();
    await page.getByLabel('Kalorie (kcal)').fill('350');
    await page.getByRole('button', { name: 'Zapisz wartość' }).click();

    await expect(values(page).getByText('Kalorie: 350 kcal (wpisane ręcznie)')).toBeVisible();
    await expect(values(page).getByText('Białko: — (brak danych)')).toBeVisible();
  });

  test('S5: strona „z częścią wartości” daje podane wartości „ze źródła”, a pozostałe „szacunkowe”', async ({
    page,
  }) => {
    await logInToCollection(page);

    await importPage(page, 'z-czescia-wartosci');

    await expect(values(page).getByText('Kalorie: 240 kcal (ze źródła)')).toBeVisible();
    await expect(values(page).getByText('Białko: 26 g (ze źródła)')).toBeVisible();
    await expect(values(page).getByText(/Tłuszcz: \d+ g \(szacunkowe\)/)).toBeVisible();
    await expect(values(page).getByText(/Błonnik: \d+ g \(szacunkowe\)/)).toBeVisible();
  });

  test('S5: wartość wpisana przy tworzeniu przepisu jest „wpisana ręcznie”', async ({ page }) => {
    await logInToCollection(page);
    await page.getByRole('button', { name: 'Ręcznie' }).click();
    await fillRecipeForm(page);
    await page.getByLabel('Białko (g)').fill('41');

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(values(page).getByText('Białko: 41 g (wpisane ręcznie)')).toBeVisible();
    await expect(values(page).getByText(/Kalorie: \d+ kcal \(szacunkowe\)/)).toBeVisible();
  });

  test('S5: wartość wpisana później przy edycji przepisu jest „wpisana ręcznie”', async ({
    page,
  }) => {
    await logInToCollection(page);
    const id = await seedRecipe(page, {
      title: 'Kurczak',
      ingredients: ['200 g piersi z kurczaka'],
    });
    await openEdit(page, id);

    await page.getByLabel('Tłuszcz (g)').fill('12,4');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(values(page).getByText('Tłuszcz: 12 g (wpisane ręcznie)')).toBeVisible();
  });

  test('S5: wartości „wpisane ręcznie” i „ze źródła” nie zmieniają się po zmianie składników i porcji', async ({
    page,
  }) => {
    await logInToCollection(page);
    const id = await importPage(page, 'z-wartosciami-odzywczymi');
    await openEdit(page, id);
    await page.getByLabel('Białko (g)').fill('33');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(values(page).getByText('Białko: 33 g (wpisane ręcznie)')).toBeVisible();

    await page.getByRole('link', { name: 'Edytuj' }).click();
    await page.getByLabel('Liczba porcji').fill('5');
    await page.getByLabel('Składnik 1').fill('10 jajek');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(values(page).getByText('Białko: 33 g (wpisane ręcznie)')).toBeVisible();
    await expect(values(page).getByText('Kalorie: 310 kcal (ze źródła)')).toBeVisible();
    await expect(values(page).getByText('Tłuszcz: 22 g (ze źródła)')).toBeVisible();
  });

  test('S5: wartość „szacunkowa” jest wyliczana ponownie po zmianie składników i porcji', async ({
    page,
  }) => {
    await logInToCollection(page);
    const id = await seedRecipe(page, {
      title: 'Kurczak',
      servings: 2,
      ingredients: ['400 g piersi z kurczaka'],
    });
    await openRecipe(page, id);
    await expect(values(page).getByText('Kalorie: 240 kcal (szacunkowe)')).toBeVisible();

    await page.getByRole('link', { name: 'Edytuj' }).click();
    await page.getByLabel('Składnik 1').fill('800 g piersi z kurczaka');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(values(page).getByText('Kalorie: 480 kcal (szacunkowe)')).toBeVisible();

    await page.getByRole('link', { name: 'Edytuj' }).click();
    await page.getByLabel('Liczba porcji').fill('4');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(values(page).getByText('Kalorie: 240 kcal (szacunkowe)')).toBeVisible();
  });

  test('S5: „Przywróć wyliczenie” wraca do wartości ze źródła, a bez źródła do wyliczonej ze składników', async ({
    page,
  }) => {
    await logInToCollection(page);
    const fromLink = await importPage(page, 'z-czescia-wartosci');
    const own = await seedRecipe(page, {
      title: 'Kurczak',
      servings: 2,
      ingredients: ['400 g piersi z kurczaka'],
      nutritionManual: { kcal: 999 },
    });

    await openEdit(page, fromLink);
    await page.getByLabel('Kalorie (kcal)').fill('500');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(values(page).getByText('Kalorie: 500 kcal (wpisane ręcznie)')).toBeVisible();
    await openDetails(page);
    await page.getByRole('button', { name: 'Przywróć wyliczenie: kalorie' }).click();
    await expect(values(page).getByText('Kalorie: 240 kcal (ze źródła)')).toBeVisible();

    await openRecipe(page, own);
    await expect(values(page).getByText('Kalorie: 999 kcal (wpisane ręcznie)')).toBeVisible();
    await openDetails(page);
    await page.getByRole('button', { name: 'Przywróć wyliczenie: kalorie' }).click();
    await expect(values(page).getByText('Kalorie: 240 kcal (szacunkowe)')).toBeVisible();
  });

  for (const [name, text] of [
    ['liczba ujemna', '-5'],
    ['tekst', 'dużo'],
  ] as const) {
    test(`S5: ${name} w polu wartości odżywczej nie jest zapisana i widać komunikat`, async ({
      page,
    }) => {
      await logInToCollection(page);
      const id = await seedRecipe(page, { title: 'Kurczak', ingredients: ['sos tajemniczy'] });
      await openEdit(page, id);

      await page.getByLabel('Błonnik (g)').fill(text);
      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect(page.getByText('Podaj liczbę nieujemną.')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Edycja przepisu' })).toBeVisible();
      await openRecipe(page, id);
      await expect(values(page).getByText('Błonnik: — (brak danych)')).toBeVisible();
    });

    test(`S5: ${name} wpisana w szczegółach wartości nie jest zapisana i widać komunikat`, async ({
      page,
    }) => {
      await logInToCollection(page);
      const id = await seedRecipe(page, { title: 'Kurczak', ingredients: ['sos tajemniczy'] });
      await openRecipe(page, id);
      await openDetails(page);

      await page.getByRole('button', { name: 'Wpisz ręcznie: błonnik' }).click();
      await page.getByLabel('Błonnik (g)').fill(text);
      await page.getByRole('button', { name: 'Zapisz wartość' }).click();

      await expect(page.getByText('Podaj liczbę nieujemną.')).toBeVisible();
      await expect(values(page).getByText('Błonnik: — (brak danych)')).toBeVisible();
    });
  }
});
