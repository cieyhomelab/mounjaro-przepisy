import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from '@playwright/test';
import { freezeClocks, prepareScreens, SCREENS } from './screens';

// Full-page screenshots of every catalogued screen, only when E2E_SCREENSHOTS=1. They land in
// screenshots/<variant>/<id>.png (relative to the runner's working directory), which
// scripts/test-e2e.sh copies to docs/screenshots/.
const VARIANTS = [
  {
    name: 'mobile-light',
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    mobile: true,
  },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, colorScheme: 'dark', mobile: true },
  {
    name: 'desktop-light',
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    mobile: false,
  },
] as const;

test.describe('Katalog ekranów', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-chromium',
      `katalog ekranów działa tylko na mobile-chromium (${browserName})`,
    );
  });

  for (const screen of SCREENS) {
    test(`Ekran ${screen.id} otwiera się`, async ({ page, browser, baseURL }) => {
      const data = await prepareScreens(page, screen);
      await screen.open(page, data);

      if (process.env.E2E_SCREENSHOTS !== '1') return;

      const storageState = await page.context().storageState();
      for (const variant of VARIANTS) {
        // A fresh context per variant, so the layout is the real one for that viewport and scheme.
        const context = await browser.newContext({
          ...(baseURL ? { baseURL } : {}),
          storageState,
          locale: 'pl-PL',
          timezoneId: 'Europe/Warsaw',
          viewport: variant.viewport,
          colorScheme: variant.colorScheme,
          deviceScaleFactor: 1,
          isMobile: variant.mobile,
          hasTouch: variant.mobile,
          serviceWorkers: 'block',
        });
        try {
          const variantPage = await context.newPage();
          await freezeClocks(variantPage);
          await screen.open(variantPage, data);
          const file = path.join('screenshots', variant.name, `${screen.id}.png`);
          await mkdir(path.dirname(file), { recursive: true });
          await variantPage.screenshot({
            path: file,
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
          });
        } finally {
          await context.close();
        }
      }
    });
  }
});
