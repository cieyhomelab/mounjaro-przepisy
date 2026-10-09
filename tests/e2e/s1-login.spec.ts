import { expect, test, type Page } from '@playwright/test';
import { OWNER_EMAIL, logIn, resetServer, setServerClockAhead } from './helpers';

// All tests share one server (reset and clock are global), so they run one at a time:
// playwright.config.ts sets workers to 1.
test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const loginLink = (page: Page) => page.getByRole('link', { name: 'Zaloguj przez Google' });
const collection = (page: Page) => page.getByRole('heading', { level: 1, name: 'Kolekcja' });

test.describe('S1: logowanie kontem Google', () => {
  test('S1: niezalogowany użytkownik na dowolnym adresie widzi ekran logowania i żadnych danych', async ({
    page,
    request,
  }) => {
    for (const path of ['/', '/konto', '/przepisy/123']) {
      await page.goto(path);

      await expect(loginLink(page)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toHaveCount(0);
      await expect(page).toHaveURL(/\/logowanie/);
    }
    const response = await request.get('/api/session');
    expect(response.status()).toBe(401);
  });

  test('S1: logowanie dozwolonym adresem z ekranu głównego pokazuje kolekcję', async ({ page }) => {
    await logIn(page);

    await expect(collection(page)).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('S1: niezalogowany użytkownik po zalogowaniu widzi otwarty wcześniej ekran', async ({
    page,
  }) => {
    await page.goto('/konto');
    await expect(loginLink(page)).toBeVisible();

    await loginLink(page).click();
    await page.getByLabel('Adres e-mail').fill(OWNER_EMAIL);
    await page.getByRole('button', { name: 'Zaloguj' }).click();

    await expect(page).toHaveURL('/konto');
    await expect(page.getByRole('heading', { level: 1, name: 'Konto' })).toBeVisible();
    await expect(page.getByText(OWNER_EMAIL)).toBeVisible();
  });

  test('S1: logowanie innym adresem pokazuje komunikat i żadnych danych', async ({ page }) => {
    await logIn(page, 'ktos.inny@example.test');

    await expect(page.getByRole('alert')).toHaveText('To konto nie ma dostępu');
    await expect(loginLink(page)).toBeVisible();
    await expect(collection(page)).toHaveCount(0);

    await page.goto('/');
    await expect(loginLink(page)).toBeVisible();
    await expect(collection(page)).toHaveCount(0);
  });

  test('S1: wylogowanie wraca na ekran logowania', async ({ page }) => {
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    await page.getByRole('button', { name: 'Wyloguj' }).click();

    await expect(loginLink(page)).toBeVisible();
    await page.reload();
    await expect(loginLink(page)).toBeVisible();
    await expect(collection(page)).toHaveCount(0);
  });

  test('S1: urządzenie otwierane w ciągu 30 dni jest zalogowane bez ponownego logowania', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    await setServerClockAhead(request, 29);
    await page.reload();
    await expect(collection(page)).toBeVisible();

    // Opening the app moved the expiry: another 29 days later it is still valid.
    await setServerClockAhead(request, 58);
    await page.reload();
    await expect(collection(page)).toBeVisible();
  });

  test('S1: urządzenie nieotwierane przez ponad 30 dni pokazuje ekran logowania i żadnych danych', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    await setServerClockAhead(request, 31);
    await page.reload();

    await expect(loginLink(page)).toBeVisible();
    await expect(collection(page)).toHaveCount(0);
  });

  test('S1: błąd serwera przy sprawdzaniu sesji pokazuje komunikat po polsku z ponowieniem', async ({
    page,
  }) => {
    let fail = true;
    await page.route('**/api/session', async (route) => {
      if (fail) {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'internal' } },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Coś poszło nie tak');

    fail = false;
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
    await expect(loginLink(page)).toBeVisible();
  });
});

test.describe('S1: wariant offline', () => {
  test('S1: zegar przeglądarki przesunięty o ponad 30 dni pokazuje offline ekran logowania i żadnych danych', async ({
    page,
    context,
  }) => {
    await logIn(page);
    await expect(collection(page)).toBeVisible();
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();

    await context.setOffline(true);
    await page.clock.setFixedTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    await page.goto('/');

    await expect(loginLink(page)).toBeVisible();
    await expect(collection(page)).toHaveCount(0);
  });
});
