import { expect, test } from '@playwright/test';
import { logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.describe('S29: źródło na zdjęciu', () => {
  test('S29: na 390 × 844 nazwa serwisu z linkiem do źródła jest widoczna na zdjęciu bez przewijania', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await logIn(page);
    const url = 'http://fixtures.test:8080/przepis/zupa-dyniowa';
    const id = await seedRecipe(page, {
      title: 'Zupa krem z dyni',
      source: { url, rating: 4.5 },
    });
    await page.goto(`/przepisy/${id}`);

    const source = page.getByRole('link', { name: /Źródło: Testowy serwis/ });
    await expect(source).toBeVisible();
    await expect(source).toBeInViewport({ ratio: 1 });
    await expect(source).toHaveAttribute('href', url);
    await expect(source).toHaveAttribute('target', '_blank');
    const photo = await page.getByRole('img', { name: /Brak zdjęcia|Zdjęcie:/ }).boundingBox();
    const link = await source.boundingBox();
    expect(photo).not.toBeNull();
    expect(link).not.toBeNull();
    expect(link!.y).toBeGreaterThanOrEqual(photo!.y);
    expect(link!.y + link!.height).toBeLessThanOrEqual(photo!.y + photo!.height);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
