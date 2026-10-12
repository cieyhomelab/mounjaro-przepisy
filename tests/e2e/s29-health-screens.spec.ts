import { expect, test, type Page } from '@playwright/test';
import { SCREENS, prepareScreens } from './screens';

const HEALTH = SCREENS.filter((screen) => screen.area === 'health');

const area = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-area'));
const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const MODES = [
  { scheme: 'light', background: 'rgb(244, 246, 242)', line: 'rgb(63, 101, 83)' },
  { scheme: 'dark', background: 'rgb(23, 28, 25)', line: 'rgb(143, 187, 165)' },
] as const;

test.describe('S29: ekrany zdrowia w palecie zdrowia', () => {
  test.skip(
    ({ browserName, isMobile }) => !isMobile || browserName !== 'chromium',
    'przechodzi po całym katalogu ekranów',
  );

  for (const mode of MODES) {
    test(`S29: ekrany zdrowia mają data-area="health" i tło health-bg (${mode.scheme})`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.emulateMedia({ colorScheme: mode.scheme });
      expect(HEALTH.length).toBeGreaterThan(0);
      for (const screen of HEALTH) {
        const data = await prepareScreens(page, screen);
        await page.emulateMedia({ colorScheme: mode.scheme });
        await screen.open(page, data);
        expect(await area(page), screen.id).toBe('health');
        expect(await bodyBackground(page), screen.id).toBe(mode.background);
      }
    });

    test(`S29: wykres wagi ma linię w kolorze health (${mode.scheme})`, async ({ page }) => {
      const waga = HEALTH.find((screen) => screen.id === 'waga');
      if (!waga) throw new Error('brak ekranu waga w katalogu');
      await page.goto('/');
      await page.emulateMedia({ colorScheme: mode.scheme });
      const data = await prepareScreens(page, waga);
      await page.emulateMedia({ colorScheme: mode.scheme });
      await waga.open(page, data);
      const line = page.locator('figure svg polyline');
      await expect(line).toBeVisible();
      expect(await line.evaluate((el) => getComputedStyle(el).stroke)).toBe(mode.line);
    });
  }

  test('S29: ekran kulinarny nie ma data-area', async ({ page }) => {
    const culinary = SCREENS.find((screen) => screen.area === 'culinary');
    if (!culinary) throw new Error('brak ekranu kulinarnego');
    const data = await prepareScreens(page, culinary);
    await culinary.open(page, data);
    expect(await area(page)).toBeNull();
  });

  test('S29: informacja medyczna ma tło health-soft tylko na ekranach zdrowia', async ({
    page,
  }) => {
    const noticeBackground = async (id: string) => {
      const screen = SCREENS.find((s) => s.id === id);
      if (!screen) throw new Error(`brak ekranu ${id} w katalogu`);
      const data = await prepareScreens(page, screen);
      await screen.open(page, data);
      return page
        .locator('.medical-notice')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    };
    const soft = await noticeBackground('dawki-nowy');
    expect(soft).toBe('rgb(228, 237, 231)');
    expect(await noticeBackground('ustawienia-cele')).not.toBe(soft);
    expect(await noticeBackground('ustawienia-przypomnienie')).not.toBe(soft);
  });
});
