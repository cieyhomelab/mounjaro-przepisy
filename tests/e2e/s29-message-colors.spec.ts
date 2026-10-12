import { expect, test, type Locator, type Page } from '@playwright/test';
import { fillRecipeForm, logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

// Served by the "fixtures" service; the app's page fetcher gets an error from it.
const FAILING_PAGE = 'http://fixtures.test:8080/przepisy/niedostepna';

/** True for a colour dominated by red (a red-* utility), as opposed to the warm warn-soft family. */
const isRed = (rgb: string) => {
  const [r = 0, g = 0, b = 0] = (rgb.match(/\d+/g) ?? []).map(Number);
  return r > 120 && g < 80 && b < 80;
};

const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';

const WARN_SOFT = { light: 'rgb(247, 230, 218)', dark: 'rgb(74, 46, 30)' };
const ON_WARN_SOFT = { light: 'rgb(94, 49, 24)', dark: 'rgb(247, 230, 218)' };
const PRIMARY_SOFT = { light: 'rgb(228, 232, 245)', dark: 'rgb(46, 53, 80)' };
const ON_PRIMARY_SOFT = { light: 'rgb(43, 52, 89)', dark: 'rgb(220, 226, 247)' };

const colorsOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });

async function openApp(page: Page, scheme: 'light' | 'dark') {
  await page.goto('/');
  await page.emulateMedia({ colorScheme: scheme });
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`S29: kolory komunikatów, tryb ${scheme}`, () => {
    test(`S29: komunikat „${OFFLINE_MESSAGE}” ma tło warn-soft i tekst on-warn-soft`, async ({
      page,
      context,
    }) => {
      await openApp(page, scheme);
      const id = await seedRecipe(page, { title: 'Zupa' });
      await page.goto(`/przepisy/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Zupa' })).toBeVisible();
      await context.setOffline(true);
      await page.getByRole('button', { name: '4 gwiazdki' }).click();

      const notice = page.getByRole('alert').filter({ hasText: OFFLINE_MESSAGE });
      await expect(notice).toBeVisible();
      expect(await colorsOf(notice)).toEqual({
        background: WARN_SOFT[scheme],
        color: ON_WARN_SOFT[scheme],
      });
    });

    test('S29: błąd pola formularza ma tło warn-soft i tekst on-warn-soft', async ({ page }) => {
      await openApp(page, scheme);
      await page.goto('/przepisy/nowy');
      await page.getByRole('button', { name: 'Zapisz' }).click();

      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
      const alerts = page.getByRole('alert');
      await expect(alerts.first()).toBeVisible();
      for (const alert of await alerts.all()) {
        expect(await colorsOf(alert)).toEqual({
          background: WARN_SOFT[scheme],
          color: ON_WARN_SOFT[scheme],
        });
      }
    });

    test('S29: znacznik „offline” ma tło primary-soft i tekst on-primary-soft', async ({
      page,
      context,
    }) => {
      await openApp(page, scheme);
      await context.setOffline(true);

      const badge = page.getByRole('status').filter({ hasText: /^offline$/ });
      await expect(badge).toBeVisible();
      expect(await colorsOf(badge)).toEqual({
        background: PRIMARY_SOFT[scheme],
        color: ON_PRIMARY_SOFT[scheme],
      });
    });

    test('S29: nieudany odczyt linku ma tło warn-soft, a jego przyciski nie mają czerwieni', async ({
      page,
    }) => {
      await openApp(page, scheme);
      await page.goto('/przepisy/z-linku');
      await page.getByLabel('Adres strony z przepisem').fill(FAILING_PAGE);
      await page.getByRole('button', { name: 'Odczytaj przepis' }).click();

      const notice = page.getByRole('alert').filter({ hasText: 'Strona nie odpowiada' });
      await expect(notice).toBeVisible({ timeout: 15_000 });
      expect(await colorsOf(notice)).toEqual({
        background: WARN_SOFT[scheme],
        color: ON_WARN_SOFT[scheme],
      });
      for (const name of ['Spróbuj ponownie', 'Wpisz przepis ręcznie']) {
        const button = notice.getByRole('button', { name });
        const { background, color, border } = await button.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            color: style.color,
            border: style.borderTopColor,
          };
        });
        for (const value of [background, color, border]) {
          expect(isRed(value)).toBe(false);
        }
      }
    });

    test('S29: błąd zapisu przepisu ma tło warn-soft i tekst on-warn-soft', async ({ page }) => {
      await openApp(page, scheme);
      await page.goto('/przepisy/nowy');
      await fillRecipeForm(page, {
        title: 'Zupa',
        servings: '2',
        ingredient: '100 g ryżu',
        step: 'Ugotuj ryż.',
      });
      await page.route('**/api/recipes', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: { code: 'internal' } }),
            })
          : route.continue(),
      );
      await page.getByRole('button', { name: 'Zapisz' }).click();

      const notice = page
        .getByRole('alert')
        .filter({ has: page.getByRole('button', { name: 'Spróbuj ponownie' }) });
      await expect(notice).toBeVisible();
      expect(await colorsOf(notice)).toEqual({
        background: WARN_SOFT[scheme],
        color: ON_WARN_SOFT[scheme],
      });
    });
  });
}
