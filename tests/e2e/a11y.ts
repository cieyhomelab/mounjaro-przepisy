import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { SCREENS, prepareScreens, type SampleData, type Screen } from './screens';

/**
 * Helpers of the cross-cutting S29 checks (touch targets, contrast, horizontal scroll, colours).
 * Each walks the screen catalogue, so a new screen in `screens.ts` is covered without a new test.
 */

export type Scheme = 'light' | 'dark';

export const SCHEMES: readonly Scheme[] = ['light', 'dark'];

/** Screens that need a logged-in session with data (the login screen has no app shell). */
export const APP_SCREENS = SCREENS.filter((screen) => screen.area !== 'public');

/**
 * Runs `check` on each screen in a fresh browser context (no session or local data left over from
 * the previous screen), as the project's device.
 */
export async function forEachScreen(
  browser: Browser,
  testInfo: TestInfo,
  screens: readonly Screen[],
  check: (page: Page, screen: Screen) => Promise<void>,
) {
  const use = testInfo.project.use as BrowserContextOptions;
  for (const screen of screens) {
    const context = await browser.newContext(use);
    try {
      await check(await context.newPage(), screen);
    } finally {
      await context.close();
    }
  }
}

/** Prepares the data, then opens `screen` at `width` in the given colour scheme. */
export async function openScreen(
  page: Page,
  screen: Screen,
  options: { width: number; scheme?: Scheme; height?: number },
): Promise<SampleData> {
  const scheme = options.scheme ?? 'light';
  await page.setViewportSize({ width: options.width, height: options.height ?? 844 });
  await page.emulateMedia({ colorScheme: scheme });
  const data = await prepareScreens(page, screen);
  await screen.open(page, data);
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
  return data;
}

export type SmallTarget = { target: string; width: number; height: number };

/** Interactive elements whose touch area (the element, or the whole row for a check box) is under 44 px. */
export function smallTouchTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate((min) => {
    const SELECTOR = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const describe = (el: Element) => {
      const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ''}`;
    };
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[hidden]');
    };
    /** A link in the middle of a sentence is not measured. */
    const inSentence = (el: Element) => {
      if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
      const parent = el.parentElement;
      if (!parent) return false;
      return [...parent.childNodes].some(
        (node) => node !== el && node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
    };

    const found: { target: string; width: number; height: number }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (!visible(el) || inSentence(el)) continue;
      const isCheck =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
      // A check box in a list row counts as the whole row.
      const box = isCheck ? (el.closest('label, li') ?? el) : el;
      if (seen.has(box)) continue;
      seen.add(box);
      const rect = box.getBoundingClientRect();
      // Visually hidden inputs (an invisible native control behind a styled one) have no area.
      if (rect.width <= 1 && rect.height <= 1) continue;
      if (rect.width + 0.5 < min || rect.height + 0.5 < min) {
        found.push({
          target: describe(box),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    return found;
  }, 44);
}

/** Contrast violations (WCAG AA) reported by axe's `color-contrast` rule. */
export async function contrastViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  return result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
  );
}

/** How far the page is wider than the window, in px (0: no horizontal scrolling). */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
  });
}

const HEALTH_TOKENS = ['--health', '--health-bg', '--health-soft', '--health-line'] as const;
const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
] as const;

/** Computed values of the four health tokens in the current scheme, as `rgb(...)` strings. */
export function healthColors(page: Page): Promise<string[]> {
  return page.evaluate((tokens) => {
    const probe = document.createElement('div');
    document.body.append(probe);
    const values = tokens.map((token) => {
      probe.style.backgroundColor = `var(${token})`;
      return getComputedStyle(probe).backgroundColor;
    });
    probe.remove();
    return values;
  }, HEALTH_TOKENS);
}

/** Elements (and properties) on the page that compute to one of the health colours. */
export function elementsWithColors(page: Page, colors: string[]): Promise<string[]> {
  return page.evaluate(
    ({ colors: forbidden, properties }) => {
      const found = new Set<string>();
      for (const el of document.querySelectorAll('html, body, body *')) {
        const style = getComputedStyle(el);
        for (const property of properties) {
          const value = style.getPropertyValue(property);
          if (forbidden.includes(value)) {
            found.add(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${property}`,
            );
          }
        }
      }
      return [...found];
    },
    { colors, properties: [...COLOR_PROPERTIES] },
  );
}

export const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
