import { expect, test } from '@playwright/test';
import {
  SCHEMES,
  bodyBackground,
  contrastViolations,
  elementsWithColors,
  forEachScreen,
  healthColors,
  horizontalOverflow,
  openScreen,
  smallTouchTargets,
} from './a11y';
import { SCREENS, prepareScreens } from './screens';
import { enableReminder } from './reminderHelpers';

// Every test walks the whole screen catalogue (AGENTS.md allows mobile-chromium only).
test.skip(
  ({ browserName, isMobile }) => !isMobile || browserName !== 'chromium',
  'przechodzi po całym katalogu ekranów',
);
test.setTimeout(600_000);

// Screens drawn outside AppShell (the banner lives there): the cooking view takes the whole screen.
const WITHOUT_APP_SHELL = new Set(['gotowanie-skladniki', 'gotowanie-krok']);

test.describe('S29: testy przekrojowe po katalogu ekranów', () => {
  test('katalog ekranów nie jest pusty', () => {
    expect(SCREENS.length).toBeGreaterThan(20);
    expect(SCREENS.some((screen) => screen.area === 'health')).toBe(true);
  });

  // Each pass walks the catalogue once (a fresh context per screen) and runs every check that
  // shares its viewport and colour scheme, so the whole catalogue is opened 4 times, not 11.
  for (const width of [1280]) {
    test(`S29: pola dotyku mają co najmniej 44 × 44 px na każdym ekranie (${width} px)`, async ({
      browser,
    }, testInfo) => {
      const failures: string[] = [];
      await forEachScreen(browser, testInfo, SCREENS, async (page, screen) => {
        await openScreen(page, screen, { width });
        for (const small of await smallTouchTargets(page)) {
          failures.push(`${screen.id}: ${small.target} ${small.width}×${small.height}`);
        }
      });
      expect(failures).toEqual([]);
    });
  }

  test('S29: żaden ekran nie przewija się w poziomie (360 px)', async ({ browser }, testInfo) => {
    const failures: string[] = [];
    await forEachScreen(browser, testInfo, SCREENS, async (page, screen) => {
      await openScreen(page, screen, { width: 360 });
      const overflow = await horizontalOverflow(page);
      if (overflow > 0) failures.push(`${screen.id}: ${overflow} px za szeroko`);
    });
    expect(failures).toEqual([]);
  });

  for (const scheme of SCHEMES) {
    test(`S29: ekran 390 px (${scheme}): pola dotyku, kontrast axe, kolory health*, baner zastrzyku`, async ({
      browser,
    }, testInfo) => {
      const touch: string[] = [];
      const contrast: string[] = [];
      const healthLeaks: string[] = [];
      const healthBackground: string[] = [];
      const banners: string[] = [];
      await forEachScreen(browser, testInfo, SCREENS, async (page, screen) => {
        const withSession = screen.area !== 'public';
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: scheme });
        const data = await prepareScreens(page, screen);
        const banner = page.getByRole('status', { name: 'Przypomnienie o zastrzyku' });
        if (withSession) {
          // The reminder day is today (Wednesday) at 08:00 with no dose entered. It is set before
          // the measured screen opens, and the collection is opened once so the settings reach the
          // local copy before the screen is drawn (an offline screen cannot fetch them later).
          await enableReminder(page, 3, '08:00');
          await page.goto('/');
          await expect(banner, 'baner zastrzyku po synchronizacji').toBeVisible();
        }
        await screen.open(page, data);
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);

        for (const small of await smallTouchTargets(page)) {
          touch.push(`${screen.id}: ${small.target} ${small.width}×${small.height}`);
        }
        for (const violation of await contrastViolations(page)) {
          contrast.push(`${screen.id}: ${violation}`);
        }

        const colors = await healthColors(page);
        expect(new Set(colors).size, 'tokeny health mają cztery różne kolory').toBe(4);
        if (screen.area === 'health') {
          const actual = await bodyBackground(page);
          if (actual !== colors[1]) {
            healthBackground.push(`${screen.id}: ${actual}, oczekiwano ${colors[1]}`);
          }
        } else {
          for (const found of await elementsWithColors(page, colors)) {
            healthLeaks.push(`${screen.id}: ${found}`);
          }
        }

        if (!withSession) return;
        if (WITHOUT_APP_SHELL.has(screen.id)) {
          await expect(banner, `${screen.id}: ekran bez AppShell`).toHaveCount(0);
          return;
        }
        await expect(banner, `${screen.id}: baner zastrzyku`).toBeVisible();
        const background = await banner.evaluate((el) => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = 'var(--primary-soft)';
          document.body.append(probe);
          const expected = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { actual: getComputedStyle(el).backgroundColor, expected };
        });
        if (background.actual !== background.expected) {
          banners.push(`${screen.id}: ${background.actual}, oczekiwano ${background.expected}`);
        }
      });
      expect.soft(touch, 'pola dotyku ≥ 44 × 44 px').toEqual([]);
      expect.soft(contrast, 'kontrast axe (color-contrast)').toEqual([]);
      expect.soft(healthLeaks, 'ekrany kulinarne nie mają kolorów health*').toEqual([]);
      expect.soft(healthBackground, 'ekrany zdrowia mają tło body health-bg').toEqual([]);
      expect.soft(banners, 'baner zastrzyku ma tło primary-soft').toEqual([]);
    });
  }
});
