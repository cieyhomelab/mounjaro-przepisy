import { expect, test } from '@playwright/test';
import { logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.describe('Powrót do kolekcji', () => {
  test('powrót ze szczegółów przepisu zachowuje pozycję przewinięcia listy', async ({ page }) => {
    await logIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    for (let i = 1; i <= 25; i++) await seedRecipe(page, { title: `Przepis ${i}` });
    await page.reload();
    const last = page.getByRole('list', { name: 'Przepisy' }).getByRole('link').last();
    await expect(last).toBeVisible();

    await last.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(200);

    await last.click();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Kolekcja');
    await page.goBack();
    await expect(last).toBeVisible();

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });
});
