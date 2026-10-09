import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const items = (page: Page) => page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem');
const titles = (page: Page) => items(page).locator('span.truncate').allTextContents();
const collectionRows = (page: Page) =>
  page.getByRole('list', { name: 'Kolekcje własne' }).getByRole('listitem');
const filterButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Filtry' }).getByRole('button', { name });
const ownSelect = (page: Page) => page.getByLabel('Kolekcja własna');

async function loggedIn(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

async function openManager(page: Page) {
  await page.getByRole('link', { name: 'Kolekcje własne' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcje własne' })).toBeVisible();
}

async function addCollection(page: Page, name: string) {
  await page.getByLabel('Nazwa nowej kolekcji').fill(name);
  await page.getByRole('button', { name: 'Dodaj kolekcję' }).click();
}

async function createViaApi(page: Page, name: string): Promise<string> {
  const body = (await apiCall(page, 'POST', '/api/collections', { name })) as {
    collection: { id: string };
  };
  return body.collection.id;
}

test.describe('S11: kolekcje własne', () => {
  test('S11: podana nazwa tworzy kolekcję własną widoczną na liście', async ({ page }) => {
    await loggedIn(page);
    await openManager(page);
    await expect(page.getByText('Nie masz jeszcze kolekcji własnych.')).toBeVisible();

    await addCollection(page, 'Obiady');

    await expect(collectionRows(page)).toHaveCount(1);
    await expect(collectionRows(page).first()).toContainText('Obiady');
    await expect(page.getByLabel('Nazwa nowej kolekcji')).toHaveValue('');
  });

  test('S11: pusta nazwa i nazwa istniejącej kolekcji (bez rozróżniania wielkości liter) nie są zapisywane', async ({
    page,
  }) => {
    await loggedIn(page);
    await createViaApi(page, 'Obiady');
    await page.reload();
    await openManager(page);

    await addCollection(page, '   ');
    await expect(page.getByText('Podaj nazwę kolekcji.')).toBeVisible();
    await addCollection(page, 'oBIADY');
    await expect(page.getByText('Kolekcja o takiej nazwie już istnieje.')).toBeVisible();

    await expect(collectionRows(page)).toHaveCount(1);
  });

  test('S11: nazwa zajęta na innym urządzeniu jest odrzucona przez serwer z komunikatem', async ({
    page,
  }) => {
    await loggedIn(page);
    await openManager(page);
    // The page does not know this collection yet, so only the server can refuse the name.
    await createViaApi(page, 'Kolacje');

    await addCollection(page, 'kolacje');

    await expect(page.getByText('Kolekcja o takiej nazwie już istnieje.')).toBeVisible();
  });

  test('S11: zmiana nazwy na zajętą lub pustą nie jest zapisywana, na unikalną zachowuje przepisy', async ({
    page,
  }) => {
    await loggedIn(page);
    const recipe = await seedRecipe(page, { title: 'Zupa' });
    const dinners = await createViaApi(page, 'Obiady');
    await createViaApi(page, 'Kolacje');
    await apiCall(page, 'PUT', `/api/recipes/${recipe}/collections`, { collectionIds: [dinners] });
    await page.reload();
    await openManager(page);
    const row = collectionRows(page).filter({ hasText: 'Obiady' });

    await row.getByRole('button', { name: 'Zmień nazwę kolekcji Obiady' }).click();
    await page.getByLabel('Nowa nazwa').fill('KOLACJE');
    await page.getByRole('button', { name: 'Zapisz nazwę' }).click();
    await expect(page.getByText('Kolekcja o takiej nazwie już istnieje.')).toBeVisible();
    await page.getByLabel('Nowa nazwa').fill('');
    await page.getByRole('button', { name: 'Zapisz nazwę' }).click();
    await expect(page.getByText('Podaj nazwę kolekcji.')).toBeVisible();
    await page.getByLabel('Nowa nazwa').fill('Szybkie obiady');
    await page.getByRole('button', { name: 'Zapisz nazwę' }).click();

    await expect(collectionRows(page).filter({ hasText: 'Szybkie obiady' })).toContainText(
      'Przepisy: 1',
    );
    await expect(collectionRows(page).filter({ hasText: 'Obiady' })).toHaveCount(1);
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await ownSelect(page).selectOption({ label: 'Szybkie obiady' });
    await expect.poll(() => titles(page)).toEqual(['Zupa']);
  });

  test('S11: przepis przypisany do dwóch kolekcji własnych jest widoczny w obu', async ({
    page,
  }) => {
    await loggedIn(page);
    const recipe = await seedRecipe(page, { title: 'Zupa' });
    await seedRecipe(page, { title: 'Inny' });
    await createViaApi(page, 'Obiady');
    await createViaApi(page, 'Szybkie');
    await page.goto(`/przepisy/${recipe}`);

    await page.getByRole('checkbox', { name: 'Obiady' }).check();
    await expect(page.getByRole('checkbox', { name: 'Obiady' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Szybkie' }).check();
    await expect(page.getByRole('checkbox', { name: 'Szybkie' })).toBeChecked();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();

    await ownSelect(page).selectOption({ label: 'Obiady' });
    await expect.poll(() => titles(page)).toEqual(['Zupa']);
    await ownSelect(page).selectOption({ label: 'Szybkie' });
    await expect.poll(() => titles(page)).toEqual(['Zupa']);
  });

  test('S11: filtr kolekcji własnej działa łącznie z pozostałymi filtrami i wybiera jedną kolekcję naraz', async ({
    page,
  }) => {
    await loggedIn(page);
    const soup = await seedRecipe(page, { title: 'Zupa' });
    const stew = await seedRecipe(page, { title: 'Gulasz' });
    const cake = await seedRecipe(page, { title: 'Ciasto' });
    const dinners = await createViaApi(page, 'Obiady');
    const sweets = await createViaApi(page, 'Słodkie');
    await apiCall(page, 'PUT', `/api/recipes/${soup}/collections`, { collectionIds: [dinners] });
    await apiCall(page, 'PUT', `/api/recipes/${stew}/collections`, { collectionIds: [dinners] });
    await apiCall(page, 'PUT', `/api/recipes/${cake}/collections`, { collectionIds: [sweets] });
    await apiCall(page, 'PUT', `/api/recipes/${soup}/worse-days`, { enabled: true });
    await page.reload();
    await expect(items(page).first()).toBeVisible();

    await ownSelect(page).selectOption({ label: 'Obiady' });
    await expect
      .poll(() => titles(page).then((all) => [...all].sort()))
      .toEqual(['Gulasz', 'Zupa']);
    await filterButton(page, 'Na gorsze dni').click();
    await expect.poll(() => titles(page)).toEqual(['Zupa']);
    await ownSelect(page).selectOption({ label: 'Słodkie' });

    await expect(page.getByText('Brak przepisów dla tych filtrów')).toBeVisible();
    await expect(ownSelect(page)).toHaveValue(sweets);
    await page.getByRole('button', { name: 'Wyczyść filtry' }).click();
    await expect(ownSelect(page)).toHaveValue('');
    await expect(items(page)).toHaveCount(3);
  });

  test('S11: usunięcie kolekcji własnej po potwierdzeniu zostawia przepisy w kolekcji', async ({
    page,
  }) => {
    await loggedIn(page);
    const recipe = await seedRecipe(page, { title: 'Zupa' });
    const dinners = await createViaApi(page, 'Obiady');
    await apiCall(page, 'PUT', `/api/recipes/${recipe}/collections`, { collectionIds: [dinners] });
    await page.reload();
    await openManager(page);

    await page.getByRole('button', { name: 'Usuń kolekcję Obiady' }).click();
    await expect(
      page.getByRole('alertdialog', { name: /Usunąć kolekcję „Obiady”\?/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(collectionRows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Usuń kolekcję Obiady' }).click();
    await page.getByRole('button', { name: 'Potwierdź usunięcie' }).click();

    await expect(page.getByText('Nie masz jeszcze kolekcji własnych.')).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect.poll(() => titles(page)).toEqual(['Zupa']);
    await expect(ownSelect(page).locator('option')).toHaveText(['Wszystkie przepisy']);
  });
});
