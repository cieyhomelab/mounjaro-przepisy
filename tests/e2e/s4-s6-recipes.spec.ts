import { expect, test, type Page } from '@playwright/test';
import { TINY_PNG, fillRecipeForm, logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const collectionHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Kolekcja' });
const recipeList = (page: Page) => page.getByRole('list', { name: 'Przepisy' });

/** Logs in and waits for the collection, so the session cookie is set before API calls. */
async function logInToCollection(page: Page) {
  await logIn(page);
  await expect(collectionHeading(page)).toBeVisible();
}

async function openManualForm(page: Page) {
  await page.getByRole('button', { name: 'Ręcznie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nowy przepis' })).toBeVisible();
}

test.describe('S6: lista kolekcji', () => {
  test('S6: pusta kolekcja zachęca do dodania pierwszego przepisu przyciskami „Z linku” i „Ręcznie”', async ({
    page,
  }) => {
    await logInToCollection(page);

    await expect(collectionHeading(page)).toBeVisible();
    await expect(page.getByText('Dodaj pierwszy przepis')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Z linku' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Ręcznie' })).toBeEnabled();
    await expect(recipeList(page)).toHaveCount(0);
  });

  test('S6: przepisy są posortowane malejąco według białka, a pozycja pokazuje tytuł, grafikę zastępczą, białko i kalorie', async ({
    page,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Sałatka', nutritionManual: { kcal: 200, proteinG: 12.4 } });
    await seedRecipe(page, { title: 'Kurczak', nutritionManual: { kcal: 412, proteinG: 27.6 } });
    await seedRecipe(page, { title: 'Jajecznica', nutritionManual: { kcal: 350, proteinG: 18 } });

    await page.reload();

    const items = recipeList(page).getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Kurczak');
    await expect(items.nth(0)).toContainText('Białko: 28 g');
    await expect(items.nth(0)).toContainText('Kalorie: 412 kcal');
    await expect(items.nth(0).getByRole('img', { name: 'Brak zdjęcia' })).toBeVisible();
    await expect(items.nth(1)).toContainText('Jajecznica');
    await expect(items.nth(2)).toContainText('Sałatka');
    await expect(items.nth(2)).toContainText('Białko: 12 g');
  });

  test('S6: przepis bez wartości pokazuje „—” i trafia na koniec listy', async ({ page }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Zupa bez danych' });
    await seedRecipe(page, { title: 'Bez kalorii', nutritionManual: { proteinG: 5 } });
    await seedRecipe(page, { title: 'Kurczak', nutritionManual: { kcal: 400, proteinG: 30 } });

    await page.reload();

    const items = recipeList(page).getByRole('listitem');
    await expect(items.nth(0)).toContainText('Kurczak');
    await expect(items.nth(1)).toContainText('Bez kalorii');
    await expect(items.nth(1)).toContainText('Białko: 5 g');
    await expect(items.nth(1)).toContainText('Kalorie: —');
    await expect(items.nth(2)).toContainText('Zupa bez danych');
    await expect(items.nth(2)).toContainText('Białko: —');
    await expect(items.nth(2)).toContainText('Kalorie: —');
  });

  test('S6: przepisy o równym białku mają wyżej przepis dodany później', async ({ page }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Starszy', nutritionManual: { proteinG: 20 } });
    await seedRecipe(page, { title: 'Nowszy', nutritionManual: { proteinG: 20 } });

    await page.reload();

    await expect(recipeList(page).getByRole('listitem').nth(0)).toContainText('Nowszy');
  });

  test('S6: lista jest dostępna po ponownym otwarciu aplikacji bez połączenia', async ({
    page,
    context,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Kurczak', nutritionManual: { proteinG: 30 } });
    await page.reload();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);

    await context.setOffline(true);
    await page.getByRole('link', { name: 'Konto' }).click();
    await page.getByRole('link', { name: 'Mounjaro Przepisy' }).click();

    await expect(recipeList(page).getByRole('listitem')).toContainText('Kurczak');
  });
});

test.describe('S4: ręczne dodanie przepisu', () => {
  // WebKit's page.route does not see requests of a page controlled by a service worker.
  test.use({ serviceWorkers: 'block' });

  test('S4: wypełniony przepis pojawia się w kolekcji oznaczony jako „ręczny”, z grafiką zastępczą', async ({
    page,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);

    await fillRecipeForm(page);
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kurczak z ryżem' })).toBeVisible();
    await expect(page.getByText('200 g piersi z kurczaka')).toBeVisible();
    await expect(page.getByText('Usmaż kurczaka.')).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    const item = recipeList(page).getByRole('listitem');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Kurczak z ryżem');
    await expect(item).toContainText('ręczny');
    await expect(item.getByRole('img', { name: 'Brak zdjęcia' })).toBeVisible();
    // 200 g of chicken breast in 2 servings: the value is estimated from the ingredients (S5).
    await expect(item).toContainText('Białko: 23 g');
  });

  test('S4: przycisk „Dodaj przepis” w niepustej kolekcji prowadzi do formularza „Ręcznie”', async ({
    page,
  }) => {
    await logInToCollection(page);
    await seedRecipe(page, { title: 'Pierwszy' });
    await page.reload();

    await page.getByRole('button', { name: 'Dodaj przepis' }).click();
    await expect(page.getByRole('button', { name: 'Z linku' })).toBeEnabled();
    await openManualForm(page);
  });

  test('S4: przepis z wpisanymi wartościami odżywczymi pokazuje je na liście', async ({ page }) => {
    await logInToCollection(page);
    await openManualForm(page);

    await fillRecipeForm(page, { title: 'Tosty' });
    await page.getByLabel('Kalorie (kcal)').fill('320');
    await page.getByLabel('Białko (g)').fill('24,4');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();

    const item = recipeList(page).getByRole('listitem');
    await expect(item).toContainText('Białko: 24 g');
    await expect(item).toContainText('Kalorie: 320 kcal');
  });

  test('S4: brak tytułu, porcji, składników i kroków nie zapisuje przepisu i wskazuje każde pole', async ({
    page,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Podaj tytuł przepisu.')).toBeVisible();
    await expect(page.getByText('Podaj liczbę porcji.')).toBeVisible();
    await expect(page.getByText('Dodaj co najmniej jeden składnik.')).toBeVisible();
    await expect(page.getByText('Dodaj co najmniej jeden krok.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Nowy przepis' })).toBeVisible();
    const snapshot = await page.request.get('/api/snapshot');
    expect(((await snapshot.json()) as { recipes: unknown[] }).recipes).toHaveLength(0);
  });

  test('S4: brakujące tylko składniki lub kroki wskazuje dokładnie to pole', async ({ page }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await page.getByLabel('Tytuł').fill('Coś');
    await page.getByLabel('Liczba porcji').fill('1');

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Dodaj co najmniej jeden składnik.')).toBeVisible();
    await expect(page.getByText('Dodaj co najmniej jeden krok.')).toBeVisible();
    await expect(page.getByText('Podaj tytuł przepisu.')).toHaveCount(0);
    await expect(page.getByText('Podaj liczbę porcji.')).toHaveCount(0);
  });

  for (const servings of ['0', '0,4', '100', '1,3', 'dużo', '-1']) {
    test(`S4: liczba porcji „${servings}” nie zapisuje przepisu i pole jest wskazane`, async ({
      page,
    }) => {
      await logInToCollection(page);
      await openManualForm(page);
      await fillRecipeForm(page, { servings });

      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect(page.getByText(/Liczba porcji musi być od 0,5 do 99/)).toBeVisible();
      await expect(page.getByLabel('Liczba porcji')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByRole('heading', { level: 1, name: 'Nowy przepis' })).toBeVisible();
    });
  }

  for (const servings of ['0,5', '99', '2,5']) {
    test(`S4: liczba porcji „${servings}” jest przyjęta`, async ({ page }) => {
      await logInToCollection(page);
      await openManualForm(page);
      await fillRecipeForm(page, { servings });

      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect(page.getByText(`Liczba porcji: ${servings}`)).toBeVisible();
    });
  }

  test('S4: składnik tylko z nazwą, bez ilości i jednostki, zostaje przyjęty', async ({ page }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page, { ingredient: 'sól do smaku' });

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kurczak z ryżem' })).toBeVisible();
    await expect(page.getByText('sól do smaku')).toBeVisible();
  });

  test('S4: kilka składników i kroków zachowuje kolejność', async ({ page }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page);
    await page.getByRole('button', { name: 'Dodaj składnik' }).click();
    await page.getByLabel('Składnik 2').fill('1,5 szklanki ryżu');
    await page.getByRole('button', { name: 'Dodaj krok' }).click();
    await page.getByLabel('Krok 2').fill('Ugotuj ryż.');

    await page.getByRole('button', { name: 'Zapisz' }).click();

    const ingredients = page.getByRole('region', { name: 'Składniki' }).getByRole('listitem');
    await expect(ingredients).toHaveText(['200 g piersi z kurczaka', '1,5 szklanki ryżu']);
    const steps = page.getByRole('region', { name: 'Kroki' }).getByRole('listitem');
    await expect(steps).toHaveText(['Usmaż kurczaka.', 'Ugotuj ryż.']);
  });

  test('S4: błąd sieci przy zapisie pokazuje komunikat, dane zostają w formularzu, a ponowienie zapisuje', async ({
    page,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page, { title: 'Zupa dyniowa', servings: '4' });
    let failing = true;
    await page.route('**/api/recipes', async (route) => {
      if (failing && route.request().method() === 'POST') await route.abort('failed');
      else await route.continue();
    });

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('alert')).toContainText('Nie udało się połączyć z serwerem');
    await expect(page.getByLabel('Tytuł')).toHaveValue('Zupa dyniowa');
    await expect(page.getByLabel('Liczba porcji')).toHaveValue('4');
    await expect(page.getByLabel('Składnik 1')).toHaveValue('200 g piersi z kurczaka');
    await expect(page.getByLabel('Krok 1')).toHaveValue('Usmaż kurczaka.');

    failing = false;
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Zupa dyniowa' })).toBeVisible();
  });

  test('S4: utrata połączenia w chwili zapisu pokazuje komunikat i zachowuje dane w formularzu', async ({
    page,
    context,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page, { title: 'Zupa dyniowa' });

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('alert')).toContainText(
      /Ta akcja wymaga połączenia z internetem|Nie udało się połączyć z serwerem/,
    );
    await expect(page.getByLabel('Tytuł')).toHaveValue('Zupa dyniowa');
    await expect(page.getByLabel('Krok 1')).toHaveValue('Usmaż kurczaka.');

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zupa dyniowa' })).toBeVisible();
  });

  test('S4: przepis dodany ze zdjęciem pokazuje zdjęcie na liście i w szczegółach', async ({
    page,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page, { title: 'Ze zdjęciem' });
    await page
      .getByLabel('Zdjęcie (opcjonalnie)')
      .setInputFiles({ name: 'zdjecie.png', mimeType: 'image/png', buffer: TINY_PNG });

    await page.getByRole('button', { name: 'Zapisz' }).click();

    const details = page.getByRole('img', { name: 'Zdjęcie: Ze zdjęciem' });
    await expect(details).toBeVisible();
    await expect(page.getByRole('img', { name: 'Brak zdjęcia' })).toHaveCount(0);
    const src = await details.getAttribute('src');
    const photo = await page.request.get(src ?? '');
    expect(photo.status()).toBe(200);
    expect(photo.headers()['content-type']).toBe('image/webp');

    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(recipeList(page).getByRole('img', { name: 'Zdjęcie: Ze zdjęciem' })).toBeVisible();
  });

  test('S4: plik, który nie jest zdjęciem, pokazuje komunikat, a przepis zostaje zapisany bez ponownego dodawania', async ({
    page,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page, { title: 'Zły plik' });
    await page.getByLabel('Zdjęcie (opcjonalnie)').setInputFiles({
      name: 'to-nie-obraz.png',
      mimeType: 'image/png',
      buffer: Buffer.from('to nie jest obraz'),
    });

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('alert')).toContainText('Nie udało się odczytać zdjęcia');
    await expect(page.getByLabel('Tytuł')).toHaveValue('Zły plik');
    // Fields other than the photo are locked, so edits cannot be silently dropped.
    await expect(page.getByLabel('Tytuł')).toBeDisabled();
    await expect(page.getByLabel('Liczba porcji')).toBeDisabled();
    await expect(page.getByLabel('Składnik 1')).toBeDisabled();
    await expect(page.getByLabel('Krok 1')).toBeDisabled();
    await expect(page.getByLabel('Kalorie (kcal)')).toBeDisabled();
    await expect(page.getByLabel('Link do źródła (opcjonalnie)')).toBeDisabled();
    await expect(page.getByLabel('Zdjęcie (opcjonalnie)')).toBeEnabled();

    await page.getByLabel('Zdjęcie (opcjonalnie)').setInputFiles([]);
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Zły plik' })).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(recipeList(page).getByRole('listitem')).toHaveCount(1);
  });

  test('S4: zapisany przepis jest widoczny na drugim urządzeniu po otwarciu aplikacji', async ({
    page,
    browser,
  }) => {
    await logInToCollection(page);
    await openManualForm(page);
    await fillRecipeForm(page, { title: 'Na dwóch urządzeniach' });
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Na dwóch urządzeniach' }),
    ).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await logIn(otherPage, undefined, 'http://localhost:3000/');

    await expect(recipeList(otherPage).getByRole('listitem')).toContainText(
      'Na dwóch urządzeniach',
    );
    await other.close();
  });
});
