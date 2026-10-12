import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe, goToSettings } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const HEADING_FONT = 'Bricolage Grotesque';
const TEXT_FONT = 'Atkinson Hyperlegible';

async function waitForOfflineData(page: Page) {
  await goToSettings(page);
  await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
}

test.describe('S29: fonty i żądania zewnętrzne', () => {
  test('S29: offline oba fonty są wczytane, nagłówki mają pierwszy z nich, a tekst drugi', async ({
    page,
    context,
  }) => {
    await logIn(page);
    await waitForOfflineData(page);
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          async ({ heading, text }) => {
            await document.fonts.ready;
            const loaded = (family: string) =>
              [...document.fonts].some(
                (face) => face.family.replaceAll('"', '') === family && face.status === 'loaded',
              );
            return {
              headingFace: loaded(heading),
              textFace: loaded(text),
              headingCheck: document.fonts.check(`800 16px "${heading}"`),
              textCheck: document.fonts.check(`16px "${text}"`),
            };
          },
          { heading: HEADING_FONT, text: TEXT_FONT },
        ),
      )
      .toEqual({ headingFace: true, textFace: true, headingCheck: true, textCheck: true });
    const families = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1') as Element).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
    }));
    expect(families.heading.split(',')[0]?.replaceAll('"', '').trim()).toBe(HEADING_FONT);
    expect(families.body.split(',')[0]?.replaceAll('"', '').trim()).toBe(TEXT_FONT);
  });

  test('S29: poza logowaniem Google żadne żądanie nie trafia do domeny innej niż domena aplikacji', async ({
    page,
  }) => {
    const origin = new URL(page.url() === 'about:blank' ? 'http://localhost:3000' : page.url())
      .origin;
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.origin !== origin) foreign.push(request.url());
    });

    await page.goto('/');
    await logIn(page);
    const id = await seedRecipe(page, { title: 'Zupa testowa' });
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Zupa testowa/ })).toBeVisible();
    await page.goto(`/przepisy/${id}`);
    await expect(page.getByRole('heading', { name: 'Zupa testowa' })).toBeVisible();
    await page.goto('/ustawienia');
    await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();

    expect(foreign).toEqual([]);
  });
});
