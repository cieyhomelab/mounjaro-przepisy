import { expect, test } from '@playwright/test';
import {
  APP_SCREENS,
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
import { SCREENS } from './screens';
import { enableReminder } from './reminderHelpers';

// Every test walks the whole screen catalogue (AGENTS.md allows mobile-chromium only).
test.skip(
  ({ browserName, isMobile }) => !isMobile || browserName !== 'chromium',
  'przechodzi po całym katalogu ekranów',
);
test.setTimeout(600_000);

test.describe('S29: testy przekrojowe po katalogu ekranów', () => {
  test('katalog ekranów nie jest pusty', () => {
    expect(SCREENS.length).toBeGreaterThan(20);
    expect(SCREENS.some((screen) => screen.area === 'health')).toBe(true);
  });

  for (const width of [390, 1280]) {
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

  for (const scheme of SCHEMES) {
    test(`S29: kontrast axe (color-contrast) bez naruszeń na każdym ekranie (${scheme})`, async ({
      browser,
    }, testInfo) => {
      const failures: string[] = [];
      await forEachScreen(browser, testInfo, SCREENS, async (page, screen) => {
        await openScreen(page, screen, { width: 390, scheme });
        for (const violation of await contrastViolations(page)) {
          failures.push(`${screen.id}: ${violation}`);
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
    test(`S29: ekrany kulinarne nie mają kolorów health* (${scheme})`, async ({
      browser,
    }, testInfo) => {
      const failures: string[] = [];
      const culinary = SCREENS.filter((screen) => screen.area !== 'health');
      await forEachScreen(browser, testInfo, culinary, async (page, screen) => {
        await openScreen(page, screen, { width: 390, scheme });
        const colors = await healthColors(page);
        expect(new Set(colors).size, 'tokeny health mają cztery różne kolory').toBe(4);
        for (const found of await elementsWithColors(page, colors)) {
          failures.push(`${screen.id}: ${found}`);
        }
      });
      expect(failures).toEqual([]);
    });

    test(`S29: ekrany zdrowia mają tło body health-bg (${scheme})`, async ({
      browser,
    }, testInfo) => {
      const failures: string[] = [];
      const health = SCREENS.filter((screen) => screen.area === 'health');
      await forEachScreen(browser, testInfo, health, async (page, screen) => {
        await openScreen(page, screen, { width: 390, scheme });
        const [, healthBg] = await healthColors(page);
        const actual = await bodyBackground(page);
        if (actual !== healthBg) failures.push(`${screen.id}: ${actual}, oczekiwano ${healthBg}`);
      });
      expect(failures).toEqual([]);
    });

    test(`S29: baner „Dziś zaplanowany zastrzyk” ma tło primary-soft na każdym ekranie (${scheme})`, async ({
      browser,
    }, testInfo) => {
      const failures: string[] = [];
      let shown = 0;
      await forEachScreen(browser, testInfo, APP_SCREENS, async (page, screen) => {
        const data = await openScreen(page, screen, { width: 390, scheme });
        // Reminder day is today (Wednesday) at 08:00 with no dose entered.
        await enableReminder(page, 3, '08:00');
        await screen.open(page, data);
        const banner = page.getByRole('status', { name: 'Przypomnienie o zastrzyku' });
        if ((await banner.count()) === 0) return;
        shown += 1;
        const colors = await banner.evaluate((el) => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = 'var(--primary-soft)';
          document.body.append(probe);
          const expected = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { actual: getComputedStyle(el).backgroundColor, expected };
        });
        if (colors.actual !== colors.expected) {
          failures.push(`${screen.id}: ${colors.actual}, oczekiwano ${colors.expected}`);
        }
      });
      expect(shown, 'baner pojawia się na ekranach z nawigacją').toBeGreaterThanOrEqual(4);
      expect(failures).toEqual([]);
    });
  }
});
