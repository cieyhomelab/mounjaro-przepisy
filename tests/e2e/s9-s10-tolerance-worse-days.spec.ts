import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const items = (page: Page) => page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem');
const titles = (page: Page) => items(page).locator('span.truncate').allTextContents();
const filterButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Filtry' }).getByRole('button', { name });
const level = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'Ocena tolerancji' }).getByRole('radio', { name });

async function loggedIn(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

async function openRecipe(page: Page, id: string) {
  await page.goto(`/przepisy/${id}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Tolerancja' })).toBeVisible();
}

async function backToList(page: Page) {
  await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
  await expect(items(page).first()).toBeVisible();
}

test.describe('S9: tolerancja', () => {
  test('S9: zaznaczenie „dobrze” pokazuje tolerancję „dobrze”', async ({ page }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await openRecipe(page, id);
    await expect(page.getByText('Tolerancja: brak oceny')).toBeVisible();

    await level(page, 'dobrze').click();

    await expect(page.getByText('Tolerancja: dobrze')).toBeVisible();
    await expect(level(page, 'dobrze')).toHaveAttribute('aria-checked', 'true');
  });

  test('S9: „średnio” z wybranymi objawami zapisuje je i pokazuje w szczegółach', async ({
    page,
  }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await openRecipe(page, id);

    await level(page, 'średnio').click();
    await page.getByRole('checkbox', { name: 'Nudności' }).check();
    await page.getByRole('checkbox', { name: 'Zgaga' }).check();
    await page.getByRole('button', { name: 'Zapisz tolerancję' }).click();

    await expect(page.getByText('Tolerancja: średnio (nudności, zgaga)')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Tolerancja: średnio (nudności, zgaga)')).toBeVisible();
  });

  test('S9: „źle” z objawem „inne” zapisuje też notatkę', async ({ page }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await openRecipe(page, id);

    await level(page, 'źle').click();
    await page.getByRole('checkbox', { name: 'Inne' }).check();
    await page.getByLabel('Notatka do „inne”').fill('ból głowy');
    await page.getByRole('button', { name: 'Zapisz tolerancję' }).click();

    await expect(page.getByText('Tolerancja: źle (inne)')).toBeVisible();
    await expect(page.getByText('Notatka: ból głowy')).toBeVisible();
  });

  test('S9: filtr „Dobrze toleruję” zostawia tylko przepisy z tolerancją „dobrze”', async ({
    page,
  }) => {
    await loggedIn(page);
    const good = await seedRecipe(page, { title: 'Dobry' });
    const medium = await seedRecipe(page, { title: 'Średni' });
    const bad = await seedRecipe(page, { title: 'Zły' });
    await seedRecipe(page, { title: 'Bez oceny' });
    await apiCall(page, 'PUT', `/api/recipes/${good}/tolerance`, { level: 'good', symptoms: [] });
    await apiCall(page, 'PUT', `/api/recipes/${medium}/tolerance`, {
      level: 'medium',
      symptoms: ['bloating'],
    });
    await apiCall(page, 'PUT', `/api/recipes/${bad}/tolerance`, { level: 'bad', symptoms: [] });
    await page.reload();
    await expect(items(page).first()).toBeVisible();

    await filterButton(page, 'Dobrze toleruję').click();

    await expect(filterButton(page, 'Dobrze toleruję')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => titles(page)).toEqual(['Dobry']);
  });

  test('S9: zmiana i usunięcie oceny tolerancji są uwzględnione przez filtr „Dobrze toleruję”', async ({
    page,
  }) => {
    await loggedIn(page);
    const first = await seedRecipe(page, { title: 'Pierwszy' });
    const second = await seedRecipe(page, { title: 'Drugi' });
    await apiCall(page, 'PUT', `/api/recipes/${first}/tolerance`, { level: 'good', symptoms: [] });
    await apiCall(page, 'PUT', `/api/recipes/${second}/tolerance`, { level: 'good', symptoms: [] });
    await page.reload();
    await filterButton(page, 'Dobrze toleruję').click();
    await expect
      .poll(() => titles(page).then((all) => [...all].sort()))
      .toEqual(['Drugi', 'Pierwszy']);

    await items(page).filter({ hasText: 'Pierwszy' }).getByRole('link').click();
    await level(page, 'źle').click();
    await page.getByRole('button', { name: 'Zapisz tolerancję' }).click();
    await expect(page.getByText('Tolerancja: źle')).toBeVisible();
    await backToList(page);
    await expect.poll(() => titles(page)).toEqual(['Drugi']);

    await items(page).first().getByRole('link').click();
    await page.getByRole('button', { name: 'Usuń ocenę tolerancji' }).click();
    await expect(page.getByText('Tolerancja: brak oceny')).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(page.getByText('Brak przepisów dla tych filtrów')).toBeVisible();
  });

  test('S9: przepis z tolerancją „źle” ma na liście etykietę „źle toleruję”', async ({ page }) => {
    await loggedIn(page);
    const bad = await seedRecipe(page, { title: 'Zły' });
    await seedRecipe(page, { title: 'Dobry' });
    await apiCall(page, 'PUT', `/api/recipes/${bad}/tolerance`, { level: 'bad', symptoms: [] });
    await page.reload();
    await expect(items(page).first()).toBeVisible();

    await expect(items(page).filter({ hasText: 'Zły' })).toContainText('źle toleruję');
    await expect(items(page).filter({ hasText: 'Dobry' })).not.toContainText('toleruję');
  });
});

test.describe('S10: tag „Na gorsze dni”', () => {
  const badge = (page: Page) => page.locator('span').filter({ hasText: /^Na gorsze dni$/ });

  test('S10: włączenie „Na gorsze dni” pokazuje tag w szczegółach i na liście', async ({
    page,
  }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await openRecipe(page, id);
    await expect(badge(page)).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Na gorsze dni' }).click();

    await expect(page.getByRole('checkbox', { name: 'Na gorsze dni' })).toBeChecked();
    await expect(badge(page)).toBeVisible();
    await backToList(page);
    await expect(items(page).first()).toContainText('Na gorsze dni');
  });

  test('S10: filtr „Na gorsze dni” zostawia tylko przepisy z tagiem', async ({ page }) => {
    await loggedIn(page);
    const tagged = await seedRecipe(page, { title: 'Z tagiem' });
    await seedRecipe(page, { title: 'Bez tagu' });
    await apiCall(page, 'PUT', `/api/recipes/${tagged}/worse-days`, { enabled: true });
    await page.reload();
    await expect(items(page).first()).toBeVisible();

    await filterButton(page, 'Na gorsze dni').click();

    await expect.poll(() => titles(page)).toEqual(['Z tagiem']);
  });

  test('S10: wyłączenie tagu usuwa przepis z wyników filtra „Na gorsze dni”', async ({ page }) => {
    await loggedIn(page);
    const tagged = await seedRecipe(page, { title: 'Z tagiem' });
    await seedRecipe(page, { title: 'Inny' });
    await apiCall(page, 'PUT', `/api/recipes/${tagged}/worse-days`, { enabled: true });
    await page.reload();
    await filterButton(page, 'Na gorsze dni').click();
    await expect.poll(() => titles(page)).toEqual(['Z tagiem']);

    await items(page).first().getByRole('link').click();
    await page.getByRole('checkbox', { name: 'Na gorsze dni' }).click();
    await expect(page.getByRole('checkbox', { name: 'Na gorsze dni' })).not.toBeChecked();
    await expect(badge(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();

    await expect(page.getByText('Brak przepisów dla tych filtrów')).toBeVisible();
  });
});
