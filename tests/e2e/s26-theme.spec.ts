import { expect, test, type Browser, type Page } from '@playwright/test';
import { logIn, resetServer } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const collection = (page: Page) => page.getByRole('heading', { level: 1, name: 'Kolekcja' });
const loginLink = (page: Page) => page.getByRole('link', { name: 'Zaloguj przez Google' });
const dataTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Motyw' }).getByRole('button', { name, exact: true });

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
}

async function chooseTheme(page: Page, name: 'System' | 'Jasny' | 'Ciemny') {
  await openSettings(page);
  await themeButton(page, name).click();
  await expect(themeButton(page, name)).toHaveAttribute('aria-pressed', 'true');
}

test.describe('S26: tryb jasny i ciemny', () => {
  test('S26: system ciemny i motyw „System” dają data-theme="dark" i tło #1C1816', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    expect(await dataTheme(page)).toBe('dark');
    expect(await bodyBackground(page)).toBe('rgb(28, 24, 22)');
  });

  test('S26: system jasny i motyw „System” dają data-theme="light" i tło #FBF8F4', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    expect(await dataTheme(page)).toBe('light');
    expect(await bodyBackground(page)).toBe('rgb(251, 248, 244)');
  });

  test('S26: zmiana trybu systemu z jasnego na ciemny przy motywie „System” działa bez przeładowania', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await logIn(page);
    await expect(collection(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('light');
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect.poll(() => dataTheme(page)).toBe('dark');
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
    ).toBe(true);
  });

  test('S26: na urządzeniu bez wyboru w Ustawieniach zaznaczony jest „System”', async ({
    page,
  }) => {
    await logIn(page);
    await openSettings(page);

    await expect(themeButton(page, 'System')).toHaveAttribute('aria-pressed', 'true');
    await expect(themeButton(page, 'Jasny')).toHaveAttribute('aria-pressed', 'false');
    await expect(themeButton(page, 'Ciemny')).toHaveAttribute('aria-pressed', 'false');
  });

  test('S26: wybór „Jasny” przy ciemnym systemie działa od razu i po ponownym uruchomieniu', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await logIn(page);
    await expect(collection(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('dark');

    await chooseTheme(page, 'Jasny');
    expect(await dataTheme(page)).toBe('light');

    await page.goto('/');
    await expect(collection(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('light');
    expect(await bodyBackground(page)).toBe('rgb(251, 248, 244)');
  });

  test('S26: wybór „Ciemny” przy jasnym systemie działa od razu i po ponownym uruchomieniu', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    await chooseTheme(page, 'Ciemny');
    expect(await dataTheme(page)).toBe('dark');

    await page.goto('/');
    await expect(collection(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('dark');
    expect(await bodyBackground(page)).toBe('rgb(28, 24, 22)');
  });

  test('S26: offline zmiana motywu działa i nie pokazuje komunikatu o braku internetu', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await logIn(page);
    await openSettings(page);
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

    await themeButton(page, 'Ciemny').click();

    await expect.poll(() => dataTheme(page)).toBe('dark');
    await expect(themeButton(page, 'Ciemny')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Ta akcja wymaga połączenia z internetem')).toHaveCount(0);
  });

  test('S26: motyw wybrany na jednym urządzeniu nie obowiązuje na drugim', async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    await logIn(page);
    await chooseTheme(page, 'Ciemny');

    const other = await browser.newContext({ colorScheme: 'light', locale: 'pl-PL' });
    try {
      const secondPage = await other.newPage();
      await logIn(secondPage);
      await expect(collection(secondPage)).toBeVisible();
      expect(await dataTheme(secondPage)).toBe('light');
      await openSettings(secondPage);
      await expect(themeButton(secondPage, 'System')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await other.close();
    }
  });

  test('S26: ekran logowania przy ciemnym systemie i bez wyboru ma data-theme="dark"', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    await expect(loginLink(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('dark');
  });

  test('S26: po wylogowaniu wybrany „Ciemny” obowiązuje na ekranie logowania i po ponownym zalogowaniu', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await logIn(page);
    await chooseTheme(page, 'Ciemny');

    await page.getByRole('button', { name: 'Wyloguj' }).click();

    await expect(loginLink(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('dark');
    await logIn(page);
    await openSettings(page);
    await expect(themeButton(page, 'Ciemny')).toHaveAttribute('aria-pressed', 'true');
  });

  test('S26: po usunięciu konta wybrany „Ciemny” obowiązuje na ekranie logowania i po ponownym zalogowaniu', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await logIn(page);
    await chooseTheme(page, 'Ciemny');
    await page.goto('/ustawienia/moje-dane');
    await page.getByRole('button', { name: 'Usuń konto i wszystkie dane' }).click();
    await page.getByLabel(/Aby potwierdzić, wpisz słowo/).fill('USUŃ');
    await page.getByRole('button', { name: 'Usuń konto', exact: true }).click();

    await expect(loginLink(page)).toBeVisible();
    expect(await dataTheme(page)).toBe('dark');
    await logIn(page);
    await openSettings(page);
    await expect(themeButton(page, 'Ciemny')).toHaveAttribute('aria-pressed', 'true');
  });

  test('S26: przeglądarka bez trybu systemu i motyw „System” dają data-theme="light"', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });
    });
    await logIn(page);
    await expect(collection(page)).toBeVisible();

    expect(await dataTheme(page)).toBe('light');
    await openSettings(page);
    await expect(themeButton(page, 'System')).toHaveAttribute('aria-pressed', 'true');
  });
});
