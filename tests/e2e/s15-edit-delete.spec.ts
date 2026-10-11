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

test.describe('S15: edycja przepisu z linku', () => {
  test('S15: link do źródła oraz ocena i liczba opinii ze źródła zostają po edycji przepisu z linku', async ({
    page,
  }) => {
    await logInToCollection(page);
    await page.getByRole('button', { name: 'Z linku' }).click();
    await page
      .getByLabel('Adres strony z przepisem')
      .fill('http://fixtures.test:8080/przepisy/czytelna');
    await page.getByRole('button', { name: 'Odczytaj przepis' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Podgląd przepisu' })).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Ocena ze źródła: 4,6 (128 opinii)')).toBeVisible();

    await page.getByRole('link', { name: 'Edytuj' }).click();
    await page.getByLabel('Tytuł').fill('Kurczak po mojemu');
    await page.getByLabel('Liczba porcji').fill('2');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kurczak po mojemu' })).toBeVisible();
    await expect(page.getByText('Ocena ze źródła: 4,6 (128 opinii)')).toBeVisible();
    const source = page.getByRole('link', { name: 'Smaczne Testy' });
    await expect(source).toHaveAttribute('href', 'http://fixtures.test:8080/przepisy/czytelna');
  });
});

test.describe('S15: usunięcie przepisu', () => {
  test('S15: „Usuń” z potwierdzeniem usuwa przepis z kolekcji', async ({ page }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Do usunięcia' });
    await seedRecipe(page, { title: 'Zostaje' });
    await page.reload();
    // The list is first drawn from the device and the sync started by the reload may still be
    // writing the new recipes, so wait for both before acting on the collection.
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(2);
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
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
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

// The service worker would answer the snapshot request itself, out of reach of page.route.
test.describe('S15: usunięcie w trakcie synchronizacji', () => {
  test.use({ serviceWorkers: 'block' });

  test('S15: usunięcie w trakcie trwającej synchronizacji nie przywraca przepisu na listę', async ({
    page,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Do usunięcia' });
    await page.reload();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
    // A second recipe appears on the account from elsewhere, so the held snapshot differs from
    // the one the delete response is consistent with.
    const other = await page.context().newPage();
    await other.goto('/');
    await seedRecipe(other, { title: 'Zostaje' });
    await other.close();

    // The snapshot is read by the server before the delete but reaches the page only after it.
    let deleted!: () => void;
    const deleteDone = new Promise<void>((resolve) => (deleted = resolve));
    let held = false;
    await page.route('**/api/snapshot', async (route) => {
      if (held) return route.continue();
      held = true;
      const response = await route.fetch();
      await deleteDone;
      await route.fulfill({ response });
    });
    page.on('response', (response) => {
      if (response.request().method() === 'DELETE') deleted();
    });
    await page.reload();
    await expect.poll(() => held).toBe(true);
    await recipeList(page)
      .getByRole('link', { name: /Do usunięcia/ })
      .click();
    await page.getByRole('button', { name: 'Usuń' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
    await expect(recipeList(page)).toContainText('Zostaje');
    await expect(recipeList(page)).not.toContainText('Do usunięcia');
  });
});

test.describe('S15: dwie zmiany w trakcie synchronizacji', () => {
  test.use({ serviceWorkers: 'block' });

  test('S15: spóźniona starsza migawka nie przywraca usuniętego przepisu po dwóch zmianach', async ({
    page,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Pierwszy' });
    await seedRecipe(page, { title: 'Drugi' });
    await page.reload();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(2);

    // The server reads the snapshot after the first change; the answer reaches the page only
    // after the second one.
    let edited!: () => void;
    const editDone = new Promise<void>((resolve) => (edited = resolve));
    let deleted!: () => void;
    const deleteDone = new Promise<void>((resolve) => (deleted = resolve));
    let held = false;
    await page.route('**/api/snapshot', async (route) => {
      if (held) return route.continue();
      held = true;
      await editDone;
      const response = await route.fetch();
      await deleteDone;
      await route.fulfill({ response });
    });
    page.on('response', (response) => {
      const method = response.request().method();
      if (method === 'DELETE') deleted();
      else if (method !== 'GET' && response.url().includes('/api/recipes')) edited();
    });
    await page.reload();
    await expect.poll(() => held).toBe(true);

    await openEdit(page, 'Pierwszy');
    await page.getByLabel('Tytuł').fill('Pierwszy zmieniony');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pierwszy zmieniony' })).toBeVisible();
    await page.getByRole('link', { name: 'Mounjaro Przepisy' }).click();
    await recipeList(page).getByRole('link', { name: /Drugi/ }).click();
    await page.getByRole('button', { name: 'Usuń' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
    await expect(recipeList(page)).toContainText('Pierwszy zmieniony');
    await expect(recipeList(page)).not.toContainText('Drugi');
  });
});
