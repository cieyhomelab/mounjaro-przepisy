import { expect, test, type Page } from '@playwright/test';
import { TINY_PNG, logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const recipeList = (page: Page) => page.getByRole('list', { name: 'Przepisy' });

async function logInToCollection(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

async function openEdit(page: Page, title: string) {
  await recipeList(page)
    .getByRole('link', { name: new RegExp(title) })
    .click();
  await page.getByRole('link', { name: 'Edytuj' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edycja przepisu' })).toBeVisible();
}

test.describe('S15: edycja przepisu', () => {
  test('S15: zmiana tytułu, składników, kroków i porcji jest widoczna w szczegółach i na liście', async ({
    page,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Stary tytuł' });
    await page.reload();
    await openEdit(page, 'Stary tytuł');
    await expect(page.getByLabel('Tytuł')).toHaveValue('Stary tytuł');

    await page.getByLabel('Tytuł').fill('Nowy tytuł');
    await page.getByLabel('Liczba porcji').fill('3,5');
    await page.getByLabel('Składnik 1').fill('300 g ryżu');
    await page.getByRole('button', { name: 'Dodaj krok' }).click();
    await page.getByLabel('Krok 2').fill('Podaj na gorąco.');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Nowy tytuł' })).toBeVisible();
    await expect(page.getByText('Liczba porcji: 3,5')).toBeVisible();
    await expect(page.getByText('300 g ryżu')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Kroki' }).getByRole('listitem')).toHaveText([
      'Wymieszaj.',
      'Podaj na gorąco.',
    ]);
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
    await expect(recipeList(page)).toContainText('Nowy tytuł');
    await expect(recipeList(page)).not.toContainText('Stary tytuł');
  });

  test('S15: zmiana zdjęcia pokazuje nowe zdjęcie w szczegółach', async ({ page }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Bez zdjęcia' });
    await page.reload();
    await openEdit(page, 'Bez zdjęcia');

    await page
      .getByLabel('Zdjęcie (opcjonalnie)')
      .setInputFiles({ name: 'zdjecie.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('img', { name: 'Zdjęcie: Bez zdjęcia' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Brak zdjęcia' })).toHaveCount(0);
  });

  for (const [name, clear] of [
    ['tytułu', (page: Page) => page.getByLabel('Tytuł').fill('')],
    ['liczby porcji', (page: Page) => page.getByLabel('Liczba porcji').fill('')],
    ['wszystkich składników', (page: Page) => page.getByLabel('Składnik 1').fill('')],
    ['wszystkich kroków', (page: Page) => page.getByLabel('Krok 1').fill('')],
  ] as const) {
    test(`S15: usunięcie ${name} nie zapisuje zmiany i wskazuje brakujące pole`, async ({
      page,
    }) => {
      await logInToCollection(page);
      await seedRecipe(page, { title: 'Bez zmian' });
      await page.reload();
      await openEdit(page, 'Bez zmian');

      await clear(page);
      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect(
        page.getByText(
          /Podaj tytuł przepisu\.|Podaj liczbę porcji\.|Dodaj co najmniej jeden składnik\.|Dodaj co najmniej jeden krok\./,
        ),
      ).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1, name: 'Edycja przepisu' })).toBeVisible();
      const snapshot = await page.request.get('/api/snapshot');
      const body = (await snapshot.json()) as { recipes: { title: string }[] };
      expect(body.recipes.map((recipe) => recipe.title)).toEqual(['Bez zmian']);
    });
  }

  test('S15: ten sam przepis zmieniony na dwóch urządzeniach — obowiązuje zapis, który dotarł później', async ({
    page,
    browser,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Wspólny' });
    await page.reload();
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await logIn(otherPage, undefined, 'http://localhost:3000/');
    await expect(recipeList(otherPage)).toContainText('Wspólny');
    await openEdit(page, 'Wspólny');
    await openEdit(otherPage, 'Wspólny');

    await page.getByLabel('Tytuł').fill('Z telefonu');
    await otherPage.getByLabel('Tytuł').fill('Z komputera');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Z telefonu' })).toBeVisible();
    await otherPage.getByRole('button', { name: 'Zapisz' }).click();
    await expect(otherPage.getByRole('heading', { level: 1, name: 'Z komputera' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Z komputera' })).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
    await expect(recipeList(page)).toContainText('Z komputera');
    await other.close();
  });

  test('S1: przepis dodany na telefonie jest widoczny po zalogowaniu na komputerze', async ({
    page,
    browser,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Dodany na telefonie' });

    const desktop = await browser.newContext();
    const desktopPage = await desktop.newPage();
    await logIn(desktopPage, undefined, 'http://localhost:3000/');

    await expect(recipeList(desktopPage).getByRole('listitem')).toContainText(
      'Dodany na telefonie',
    );
    await desktop.close();
  });
});

test.describe('S15: usunięcie przepisu', () => {
  test('S15: „Usuń” z potwierdzeniem usuwa przepis z kolekcji', async ({ page }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Do usunięcia' });
    await seedRecipe(page, { title: 'Zostaje' });
    await page.reload();
    await recipeList(page)
      .getByRole('link', { name: /Do usunięcia/ })
      .click();

    await page.getByRole('button', { name: 'Usuń' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Usunąć przepis „Do usunięcia”?');
    await dialog.getByRole('button', { name: 'Usuń' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
    await expect(recipeList(page)).toContainText('Zostaje');
    await page.reload();
    await expect(recipeList(page)).not.toContainText('Do usunięcia');
    const snapshot = await page.request.get('/api/snapshot');
    expect(((await snapshot.json()) as { recipes: unknown[] }).recipes).toHaveLength(1);
  });

  test('S15: „Anuluj” w oknie potwierdzenia zostawia przepis bez zmian', async ({ page }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Zostaje' });
    await page.reload();
    await recipeList(page)
      .getByRole('link', { name: /Zostaje/ })
      .click();

    await page.getByRole('button', { name: 'Usuń' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Anuluj' }).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Zostaje' })).toBeVisible();
    const snapshot = await page.request.get('/api/snapshot');
    expect(((await snapshot.json()) as { recipes: unknown[] }).recipes).toHaveLength(1);
  });

  test('S15: usunięcie bez połączenia pokazuje komunikat i nie usuwa przepisu', async ({
    page,
    context,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Offline' });
    await page.reload();
    await recipeList(page)
      .getByRole('link', { name: /Offline/ })
      .click();
    await page.getByRole('button', { name: 'Usuń' }).click();

    await context.setOffline(true);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń' }).click();

    await expect(page.getByRole('alert')).toContainText(
      /Ta akcja wymaga połączenia z internetem|Nie udało się połączyć z serwerem/,
    );
    await context.setOffline(false);
    const snapshot = await page.request.get('/api/snapshot');
    expect(((await snapshot.json()) as { recipes: unknown[] }).recipes).toHaveLength(1);
  });
});
