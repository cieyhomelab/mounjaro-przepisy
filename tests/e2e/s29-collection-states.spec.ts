import { expect, test, type Page } from '@playwright/test';
import {
  TINY_PNG,
  apiCall,
  fillRecipeForm,
  logIn,
  resetServer,
  seedRecipe,
  setServerClock,
} from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const collectionHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Kolekcja' });
const NOW = '2026-10-14T10:00:00Z';

// WebKit does not hand requests of a service-worker-controlled page to page.route.
test.use({ serviceWorkers: 'block' });

test.describe('S29: stany kolekcji i pole „Brak zdjęcia”', () => {
  test('S29: przy opóźnionej odpowiedzi serwera użytkownik widzi nieruchome bloki i tekst „Wczytuję Twoje przepisy…” o roli „status”', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/snapshot', async (route) => {
      await gate;
      await route.continue();
    });

    await logIn(page);

    await expect(page.getByRole('status')).toHaveText('Wczytuję Twoje przepisy…');
    const blocks = page.getByTestId('collection-placeholder');
    await expect(blocks).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const style = await blocks.nth(index).evaluate((element) => ({
        animationName: getComputedStyle(element).animationName,
        transitionDuration: getComputedStyle(element).transitionDuration,
      }));
      expect(style).toEqual({ animationName: 'none', transitionDuration: '0s' });
    }

    release();
    await expect(
      page.getByRole('heading', { name: 'Twoja kolekcja jest jeszcze pusta' }),
    ).toBeVisible();
    await expect(blocks).toHaveCount(0);
  });

  test('S29: przepis bez zdjęcia ma w kolekcji i w szczegółach pole z literą „O” i napisem „Brak zdjęcia”', async ({
    page,
  }) => {
    await logIn(page);
    await expect(collectionHeading(page)).toBeVisible();
    await seedRecipe(page, { title: 'Omlet testowy' });
    await page.reload();

    const item = page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem');
    const field = item.getByRole('img', { name: 'Brak zdjęcia' });
    await expect(field).toBeVisible();
    await expect(field.getByText('Brak zdjęcia')).toBeVisible();
    await expect(field.getByText('O', { exact: true })).toHaveAttribute('aria-hidden', 'true');

    await item.getByRole('link').click();
    const details = page.getByRole('article').getByRole('img', { name: 'Brak zdjęcia' });
    await expect(details).toBeVisible();
    await expect(details.getByText('O', { exact: true })).toHaveAttribute('aria-hidden', 'true');
    await expect(details.getByText('Brak zdjęcia')).toBeVisible();
  });

  test('S29: przepis, którego zdjęcia nie da się wczytać, pokazuje to samo pole zastępcze', async ({
    page,
  }) => {
    await logIn(page);
    await expect(collectionHeading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Dodaj pierwszy przepis' }).click();
    await page.getByRole('button', { name: 'Wpiszę sama' }).click();
    await fillRecipeForm(page, { title: 'Zupa ze zdjęciem' });
    await page
      .getByLabel('Zdjęcie (opcjonalnie)')
      .setInputFiles({ name: 'zdjecie.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByRole('img', { name: 'Zdjęcie: Zupa ze zdjęciem' })).toBeVisible();

    await page.route('**/api/photos/**', (route) => route.abort('failed'));
    await page.reload();

    const field = page.getByRole('img', { name: 'Brak zdjęcia' });
    await expect(field).toBeVisible();
    await expect(field.getByText('Z', { exact: true })).toBeVisible();
    await expect(field.getByText('Brak zdjęcia')).toBeVisible();
  });

  test('S29: miniatura w planerze pokazuje samą literę, bez napisu', async ({ page, request }) => {
    await setServerClock(request, NOW);
    await page.clock.setFixedTime(new Date(NOW));
    await logIn(page);
    await expect(collectionHeading(page)).toBeVisible();
    const recipeId = await seedRecipe(page, { title: 'Omlet testowy' });
    await apiCall(page, 'POST', '/api/meal-plan', {
      date: '2026-10-14',
      slot: 'breakfast',
      recipeId,
      servings: 1,
    });
    await page.reload();
    await page.getByRole('link', { name: 'Planer', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Planer' })).toBeVisible();

    const thumbnail = page.getByRole('img', { name: 'Brak zdjęcia' });
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail.getByText('O', { exact: true })).toBeVisible();
    await expect(thumbnail.getByText('Brak zdjęcia')).toHaveCount(0);
  });

  test('S29: błąd pierwszego wczytania pokazuje pełnoekranowy komunikat bez treści technicznej, a „Spróbuj ponownie” ponawia wczytanie', async ({
    page,
  }) => {
    let failing = true;
    await page.route('**/api/snapshot', async (route) => {
      if (failing) {
        await route.fulfill({ status: 500, json: { error: { code: 'internal' } } });
      } else await route.continue();
    });

    await logIn(page);

    const alert = page.getByRole('alert');
    await expect(
      alert.getByRole('heading', { name: 'Nie udało się wczytać danych' }),
    ).toBeVisible();
    await expect(alert).toContainText('Twoje zapisane przepisy są bezpieczne');
    await expect(alert).not.toContainText('internal');
    await expect(alert).not.toContainText('500');

    failing = false;
    await alert.getByRole('button', { name: 'Spróbuj ponownie' }).click();
    await expect(
      page.getByRole('heading', { name: 'Twoja kolekcja jest jeszcze pusta' }),
    ).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
});
