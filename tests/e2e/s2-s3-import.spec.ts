import { expect, test, type Page } from '@playwright/test';
import { TINY_PNG, fillRecipeForm, logIn, resetServer } from './helpers';

// The test pages come from the "fixtures" service (tests/e2e/fixtures); the app fetches them with
// its real page fetcher. FETCH_TIMEOUT_MS is 3 s in this stack, so "niedostępna" ends quickly.
const FIXTURES = 'http://fixtures.test:8080';
const pageUrl = (name: string) => `${FIXTURES}/przepisy/${name}`;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

async function logInToCollection(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

/** Opens "Z linku" from the empty collection and submits `address`. */
async function readFromLink(page: Page, address: string) {
  await page.getByRole('button', { name: 'Z linku' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dodaj przepis z linku' }),
  ).toBeVisible();
  await page.getByLabel('Adres strony z przepisem').fill(address);
  await page.getByRole('button', { name: 'Odczytaj przepis' }).click();
}

/** Opens "Z linku" when the collection already has recipes. */
async function readAnotherLink(page: Page, address: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dodaj przepis' }).click();
  await readFromLink(page, address);
}

const preview = (page: Page) => page.getByRole('heading', { level: 1, name: 'Podgląd przepisu' });
const manualForm = (page: Page) => page.getByRole('heading', { level: 1, name: 'Nowy przepis' });
const recipeList = (page: Page) => page.getByRole('list', { name: 'Przepisy' });

async function recipesInCollection(page: Page) {
  const response = await page.request.get('/api/snapshot');
  const body = (await response.json()) as { recipes: unknown[] };
  return body.recipes.length;
}

async function expectPhotoLoaded(page: Page, title: string) {
  const photo = page.getByRole('img', { name: `Zdjęcie: ${title}` });
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
}

test.describe('S2: dodanie przepisu z linku', () => {
  test('S2: link do strony „czytelna” pokazuje podgląd z tytułem, zdjęciem, składnikami, krokami, porcjami i oceną ze źródła', async ({
    page,
  }) => {
    await logInToCollection(page);

    await readFromLink(page, pageUrl('czytelna'));

    await expect(preview(page)).toBeVisible();
    await expect(page.getByLabel('Tytuł')).toHaveValue('Kurczak pieczony z cukinią');
    await expect(page.getByLabel('Liczba porcji')).toHaveValue('4');
    await expect(page.getByLabel('Składnik 1')).toHaveValue('500 g piersi z kurczaka');
    await expect(page.getByLabel('Składnik 5')).toHaveValue('sól i pieprz do smaku');
    await expect(page.getByLabel('Składnik 6')).toHaveCount(0);
    await expect(page.getByLabel('Krok 1')).toHaveValue('Pokrój kurczaka i cukinię w kostkę.');
    await expect(page.getByLabel('Krok 3')).toHaveValue('Piecz 25 minut w 200 stopniach.');
    await expect(page.getByLabel('Krok 4')).toHaveCount(0);
    await expect(page.getByText('Ocena ze źródła: 4,6 (128 opinii)')).toBeVisible();
    await expectPhotoLoaded(page, 'Kurczak pieczony z cukinią');
    await expect(page.getByLabel('Link do źródła (opcjonalnie)')).toHaveValue(pageUrl('czytelna'));
    // Nothing is in the collection until the user saves.
    expect(await recipesInCollection(page)).toBe(0);
  });

  test('S2: „Zapisz” dodaje przepis do kolekcji z treścią, zdjęciem, linkiem do źródła, oceną i liczbą opinii', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('czytelna'));
    await expect(preview(page)).toBeVisible();

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Kurczak pieczony z cukinią' }),
    ).toBeVisible();
    await expect(page.getByText('Liczba porcji: 4')).toBeVisible();
    await expect(page.getByText('2 łyżki oliwy')).toBeVisible();
    await expect(page.getByText('Wymieszaj z oliwą i przyprawami.')).toBeVisible();
    await expectPhotoLoaded(page, 'Kurczak pieczony z cukinią');

    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    const item = recipeList(page).getByRole('listitem');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Kurczak pieczony z cukinią');
    await expect(item).toContainText('Ocena ze źródła: 4,6 (128 opinii)');
    await expect(
      item.getByRole('img', { name: 'Zdjęcie: Kurczak pieczony z cukinią' }),
    ).toBeVisible();
  });

  test('S2: szczegóły zapisanego przepisu z linku pokazują nazwę serwisu, ocenę i link do oryginału', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('czytelna'));
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Ocena ze źródła: 4,6 (128 opinii)')).toBeVisible();
    const source = page.getByRole('link', { name: 'Smaczne Testy' });
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute('href', pageUrl('czytelna'));
    await expect(source).toHaveAttribute('target', '_blank');
  });

  test('S2: link do strony „bez oceny” daje zapisany przepis z napisem „brak oceny”', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('bez-oceny'));
    await expect(preview(page)).toBeVisible();
    await expect(page.getByLabel('Tytuł')).toHaveValue('Zupa krem z dyni');

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Ocena ze źródła: brak oceny')).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(recipeList(page).getByRole('listitem')).toContainText(
      'Ocena ze źródła: brak oceny',
    );
  });

  test('S2: link do strony „bez liczby porcji” daje puste pole, a zapis jest możliwy po jego wypełnieniu', async ({
    page,
  }) => {
    await logInToCollection(page);

    await readFromLink(page, pageUrl('bez-liczby-porcji'));

    await expect(preview(page)).toBeVisible();
    await expect(page.getByLabel('Tytuł')).toHaveValue('Jajecznica ze szpinakiem');
    await expect(page.getByLabel('Liczba porcji')).toHaveValue('');

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Podaj liczbę porcji.')).toBeVisible();
    await expect(preview(page)).toBeVisible();
    expect(await recipesInCollection(page)).toBe(0);

    await page.getByLabel('Liczba porcji').fill('1');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Jajecznica ze szpinakiem' }),
    ).toBeVisible();
    await expect(page.getByText('Liczba porcji: 1')).toBeVisible();
    expect(await recipesInCollection(page)).toBe(1);
  });

  test('S2: link do strony „bez zdjęcia” daje grafikę zastępczą, a zdjęcie da się dodać przy edycji', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('bez-zdjecia'));
    await expect(preview(page)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Brak zdjęcia' })).toBeVisible();

    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Twaróg z rzodkiewką' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: 'Brak zdjęcia' })).toBeVisible();

    await page.getByRole('link', { name: 'Edytuj' }).click();
    await page
      .getByLabel('Zdjęcie (opcjonalnie)')
      .setInputFiles({ name: 'zdjecie.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expectPhotoLoaded(page, 'Twaróg z rzodkiewką');
    await expect(page.getByRole('img', { name: 'Brak zdjęcia' })).toHaveCount(0);
  });

  test('S2: ten sam adres wklejony ponownie pokazuje, że przepis już jest, i prowadzi do niego', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('czytelna'));
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kurczak pieczony z cukinią' }),
    ).toBeVisible();
    const recipeUrl = page.url();

    // Same page, different spelling: protocol, "www", trailing slash, query and fragment.
    await readAnotherLink(
      page,
      'https://www.fixtures.test:8080/przepisy/czytelna/?utm_source=fb#opinie',
    );

    await expect(page.getByRole('alert')).toContainText(
      'Przepis z tego adresu już jest w Twojej kolekcji.',
    );
    await expect(preview(page)).toHaveCount(0);

    await page.getByRole('link', { name: 'Przejdź do przepisu' }).click();

    await expect(page).toHaveURL(recipeUrl);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kurczak pieczony z cukinią' }),
    ).toBeVisible();
    expect(await recipesInCollection(page)).toBe(1);
  });

  test('S2: w trakcie odczytu użytkownik widzi wskaźnik postępu, a po najwyżej 15 sekundach komunikat', async ({
    page,
  }) => {
    await logInToCollection(page);

    await readFromLink(page, pageUrl('niedostepna'));

    await expect(page.getByRole('status')).toHaveText('Odczytuję przepis…');
    await expect(page.getByRole('button', { name: 'Odczytaj przepis' })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Strona nie odpowiada', {
      timeout: 15_000,
    });
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('S2: odczyt idzie za przekierowaniem do strony przepisu', async ({ page }) => {
    await logInToCollection(page);

    await readFromLink(page, `${FIXTURES}/przekierowanie/czytelna`);

    await expect(preview(page)).toBeVisible();
    await expect(page.getByLabel('Tytuł')).toHaveValue('Kurczak pieczony z cukinią');
  });
});

test.describe('S3: link, którego nie da się odczytać', () => {
  // WebKit's page.route does not see requests of a page controlled by a service worker.
  test.use({ serviceWorkers: 'block' });

  for (const [name, title] of [
    ['bez-skladnikow', 'Ryba w sosie'],
    ['nie-przepis', 'Nasz blog o gotowaniu'],
  ] as const) {
    test(`S3: strona „${name}” pokazuje komunikat i otwiera formularz ręczny z linkiem i odczytanymi polami`, async ({
      page,
    }) => {
      await logInToCollection(page);

      await readFromLink(page, pageUrl(name));

      await expect(page.getByText('Nie udało się odczytać całego przepisu')).toBeVisible();
      await expect(manualForm(page)).toBeVisible();
      await expect(page.getByLabel('Link do źródła (opcjonalnie)')).toHaveValue(pageUrl(name));
      await expect(page.getByLabel('Tytuł')).toHaveValue(title);
      expect(await recipesInCollection(page)).toBe(0);
    });
  }

  test('S3: po uzupełnieniu formularza ręcznego przepis trafia do kolekcji z linkiem do źródła', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('bez-skladnikow'));
    await expect(manualForm(page)).toBeVisible();
    // What could be read is already in the form: servings and both steps.
    await expect(page.getByLabel('Liczba porcji')).toHaveValue('2');
    await expect(page.getByLabel('Krok 1')).toHaveValue('Ugotuj rybę na parze.');
    await expect(page.getByLabel('Krok 2')).toHaveValue('Polej sosem jogurtowym.');

    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Dodaj co najmniej jeden składnik.')).toBeVisible();

    await page.getByLabel('Składnik 1').fill('400 g filetu z dorsza');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Ryba w sosie' })).toBeVisible();
    await expect(page.getByText('400 g filetu z dorsza')).toBeVisible();
    await expect(page.getByRole('link', { name: 'fixtures.test' })).toHaveAttribute(
      'href',
      pageUrl('bez-skladnikow'),
    );
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(recipeList(page).getByRole('listitem')).toContainText('Ryba w sosie');
  });

  test('S3: formularz ręczny po „nie-przepis” da się wypełnić od zera i zapisać', async ({
    page,
  }) => {
    await logInToCollection(page);
    await readFromLink(page, pageUrl('nie-przepis'));
    await expect(manualForm(page)).toBeVisible();

    await fillRecipeForm(page, {
      title: 'Własny przepis ze strony',
      servings: '3',
      ingredient: '100 g ryżu',
      step: 'Ugotuj ryż.',
    });
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Własny przepis ze strony' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'fixtures.test' })).toHaveAttribute(
      'href',
      pageUrl('nie-przepis'),
    );
  });

  for (const [name, address] of [
    ['niedostępna', pageUrl('niedostepna')],
    ['kończąca się błędem', pageUrl('blad')],
    ['pod adresem bez serwera', `${FIXTURES.replace('8080', '9')}/przepisy/czytelna`],
  ] as const) {
    test(`S3: strona ${name} pokazuje „Strona nie odpowiada” z ponowieniem i przejściem do formularza ręcznego z linkiem`, async ({
      page,
    }) => {
      await logInToCollection(page);

      await readFromLink(page, address);

      const alert = page.getByRole('alert');
      await expect(alert).toContainText('Strona nie odpowiada', { timeout: 15_000 });
      await expect(alert.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();

      // Retry reads the page again (and fails again here).
      await alert.getByRole('button', { name: 'Spróbuj ponownie' }).click();
      await expect(alert).toContainText('Strona nie odpowiada', { timeout: 15_000 });

      await alert.getByRole('button', { name: 'Wpisz przepis ręcznie' }).click();

      await expect(manualForm(page)).toBeVisible();
      await expect(page.getByLabel('Link do źródła (opcjonalnie)')).toHaveValue(address);
      await expect(page.getByLabel('Tytuł')).toHaveValue('');
    });
  }

  test('S3: ponowienie po chwilowej awarii kończy się podglądem', async ({ page }) => {
    await logInToCollection(page);
    // The first answer is an error, the second one the real page.
    let calls = 0;
    await page.route('**/api/recipes/import-preview', async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'source_unavailable' } }),
        });
      } else {
        await route.continue();
      }
    });

    await readFromLink(page, pageUrl('czytelna'));
    await expect(page.getByRole('alert')).toContainText('Strona nie odpowiada');
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();

    await expect(preview(page)).toBeVisible();
    await expect(page.getByLabel('Tytuł')).toHaveValue('Kurczak pieczony z cukinią');
  });

  for (const text of [
    'to nie jest adres',
    'kwestiasmaku.com/przepis',
    'ftp://example.com/przepis',
  ]) {
    test(`S3: tekst „${text}” pokazuje „To nie jest poprawny link”, a pole zostaje do poprawy`, async ({
      page,
    }) => {
      await logInToCollection(page);

      await readFromLink(page, text);

      const field = page.getByLabel('Adres strony z przepisem');
      await expect(page.getByText('To nie jest poprawny link')).toBeVisible();
      await expect(field).toHaveValue(text);
      await expect(field).toBeEditable();
      await expect(field).toHaveAttribute('aria-invalid', 'true');

      await field.fill(pageUrl('czytelna'));
      await page.getByRole('button', { name: 'Odczytaj przepis' }).click();

      await expect(preview(page)).toBeVisible();
      await expect(page.getByText('To nie jest poprawny link')).toHaveCount(0);
    });
  }
});
