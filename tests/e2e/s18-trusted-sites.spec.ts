import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_SITES, apiCall, logIn, resetServer, useTestSites } from './helpers';
import { readZip } from './zipReader';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const STARTER = ['Ania Gotuje', 'Kwestia Smaku', 'Przepisy.pl', 'Doradca Smaku'];

async function openTrustedSites(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await page.getByRole('link', { name: 'Zaufane serwisy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zaufane serwisy' })).toBeVisible();
}

const activeBox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name: `Aktywny: ${name}` });

test.describe('S18: edycja listy zaufanych serwisów', () => {
  test('S18: nowe konto ma cztery serwisy z listy startowej, wszystkie aktywne', async ({
    page,
  }) => {
    await logIn(page);
    await openTrustedSites(page);
    for (const name of STARTER) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(activeBox(page, name)).toBeChecked();
    }
    await expect(page.getByRole('checkbox')).toHaveCount(4);
    for (const host of ['aniagotuje.pl', 'kwestiasmaku.com', 'przepisy.pl', 'doradcasmaku.pl']) {
      await expect(page.getByText(host, { exact: true })).toBeVisible();
    }
  });

  test('S18: wyłączony serwis nie bierze udziału w wyszukiwaniu', async ({ page, request }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable, FIXTURE_SITES.scaleTen]);
    await page.reload();
    await openTrustedSites(page);
    await activeBox(page, 'Skala dziesięć').click();
    await expect(activeBox(page, 'Skala dziesięć')).not.toBeChecked();

    await page.goto('/szukaj');
    await page.getByLabel('Czego szukasz?').fill('kurczak');
    await page.getByRole('button', { name: 'Szukaj', exact: true }).click();
    await expect(page.getByText('Kurczak 2')).toBeVisible();
    await expect(page.getByText('Skala dziesięć')).toHaveCount(0);
    await expect(page.getByText('Przeszukiwalny').first()).toBeVisible();
  });

  test('S18: usunięty serwis znika z listy, a zapisane z niego przepisy zostają w kolekcji', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await apiCall(page, 'POST', '/api/recipes', {
      title: 'Przepis z serwisu',
      servings: 2,
      ingredients: [{ originalText: 'sól' }],
      steps: ['Wymieszaj.'],
      nutritionManual: {},
      sourceUrl: 'http://przeszukiwalny.test:8080/przepisy/czytelna',
    });
    await page.reload();
    await openTrustedSites(page);

    await page.getByRole('button', { name: 'Usuń serwis Przeszukiwalny' }).click();
    // Bez potwierdzenia serwis zostaje.
    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(page.getByText('Przeszukiwalny', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Usuń serwis Przeszukiwalny' }).click();
    await page.getByRole('button', { name: 'Usuń serwis', exact: true }).click();
    await expect(page.getByText('Przeszukiwalny', { exact: true })).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByText('Przepis z serwisu')).toBeVisible();
  });

  test('S18: gdy wszystkie serwisy są wyłączone, wyszukiwanie odsyła do ustawień zaufanych serwisów', async ({
    page,
  }) => {
    await logIn(page);
    await openTrustedSites(page);
    for (const name of STARTER) await activeBox(page, name).click();
    for (const name of STARTER) await expect(activeBox(page, name)).not.toBeChecked();

    await page.goto('/szukaj');
    await expect(page.getByText('Nie masz aktywnych zaufanych serwisów.')).toBeVisible();
    await page.getByRole('link', { name: 'ustawieniach zaufanych serwisów' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zaufane serwisy' })).toBeVisible();
  });

  test('S18: gdy wszystkie serwisy są usunięte, wyszukiwanie odsyła do ustawień zaufanych serwisów', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, []);
    await page.goto('/szukaj');
    await expect(page.getByText('Nie masz aktywnych zaufanych serwisów.')).toBeVisible();
  });

  test('S18: eksport zawiera aktualną listę serwisów ze stanem aktywny / nieaktywny', async ({
    page,
  }) => {
    await logIn(page);
    await openTrustedSites(page);
    await activeBox(page, 'Kwestia Smaku').click();
    await expect(activeBox(page, 'Kwestia Smaku')).not.toBeChecked();

    await page.getByRole('link', { name: '← Ustawienia' }).click();
    await page.getByRole('link', { name: 'Moje dane' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const file = await download;
    const files = readZip(await readFile(await file.path()));
    const data = JSON.parse(files.get('dane.json')?.toString('utf8') ?? '{}') as {
      trustedSites: { host: string; name: string; active: boolean }[];
    };
    expect(data.trustedSites.map((site) => [site.host, site.active])).toEqual([
      ['aniagotuje.pl', true],
      ['kwestiasmaku.com', false],
      ['przepisy.pl', true],
      ['doradcasmaku.pl', true],
    ]);
  });

  test('S18: serwis „przeszukiwalny” trafia na listę jako aktywny, a jego przepisy są w wynikach', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, []);
    await page.reload();
    await openTrustedSites(page);

    await page.getByLabel('Adres serwisu').fill('http://przeszukiwalny.test:8080/');
    await page.getByRole('button', { name: 'Dodaj serwis' }).click();

    await expect(page.getByText('Przeszukiwalny', { exact: true })).toBeVisible();
    await expect(page.getByText('przeszukiwalny.test', { exact: true })).toBeVisible();
    await expect(activeBox(page, 'Przeszukiwalny')).toBeChecked();

    await page.goto('/szukaj');
    await page.getByLabel('Czego szukasz?').fill('kurczak');
    await page.getByRole('button', { name: 'Szukaj', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Kurczak 2' })).toBeVisible();
  });

  test('S18: serwis „nieprzeszukiwalny” nie zostaje dodany, a użytkownik widzi odesłanie do wklejania linków', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, []);
    await page.reload();
    await openTrustedSites(page);

    await page.getByLabel('Adres serwisu').fill('http://nieprzeszukiwalny.test:8080/');
    await page.getByRole('button', { name: 'Dodaj serwis' }).click();

    await expect(
      page.getByText('Przepisy z niego nadal możesz dodawać, wklejając link do przepisu.'),
    ).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('S18: serwis, który już jest na liście, nie zostaje dodany drugi raz', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await useTestSites(request, [FIXTURE_SITES.searchable]);
    await page.reload();
    await openTrustedSites(page);

    await page
      .getByLabel('Adres serwisu')
      .fill('http://www.przeszukiwalny.test:8080/przepisy/czytelna');
    await page.getByRole('button', { name: 'Dodaj serwis' }).click();

    await expect(page.getByText('Ten serwis jest już na Twojej liście.')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
  });
});
