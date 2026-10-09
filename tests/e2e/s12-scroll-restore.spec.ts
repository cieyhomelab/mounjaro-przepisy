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
    // The page is tall enough to scroll only once all recipes are counted in.
    await expect(
      page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem').first(),
    ).toHaveAttribute('aria-setsize', '25');

    // The list is virtual: rows come and go while scrolling, so the position is set directly and
    // one row is picked by its address once the position has settled.
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, 1200));
        return page.evaluate(() => window.scrollY);
      })
      .toBeGreaterThan(200);
    let href = '';
    await expect
      .poll(async () => {
        href = await page.evaluate(() => {
          const links = [
            ...document.querySelectorAll<HTMLAnchorElement>('ul[aria-label="Przepisy"] a'),
          ];
          const onScreen = links.find((link) => {
            const box = link.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight;
          });
          return onScreen?.getAttribute('href') ?? '';
        });
        return href;
      })
      .toMatch(/^\/przepisy\//);
    const row = page.locator(`ul[aria-label="Przepisy"] a[href="${href}"]`);

    await row.click();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Kolekcja');
    await page.goBack();
    await expect(row).toBeVisible();

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });
});
