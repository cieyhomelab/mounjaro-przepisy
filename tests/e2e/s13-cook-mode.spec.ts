import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

/** Replaces the Wake Lock API with a recorder, so the tests can read the lock state in any browser. */
async function fakeWakeLock(page: Page) {
  await page.addInitScript(() => {
    const locks: { released: boolean }[] = [];
    (window as unknown as { __wakeLocks: typeof locks }).__wakeLocks = locks;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          const lock = {
            released: false,
            release: () => {
              lock.released = true;
              return Promise.resolve();
            },
          };
          locks.push(lock);
          return Promise.resolve(lock);
        },
      },
    });
  });
}

async function withoutWakeLock(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  });
}

const heldLocks = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __wakeLocks: { released: boolean }[] }).__wakeLocks.filter(
        (lock) => !lock.released,
      ).length,
  );

async function startCooking(page: Page) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  const id = await seedRecipe(page, {
    title: 'Kurczak z ryżem',
    servings: 4,
    ingredients: ['400 g piersi z kurczaka', 'sól do smaku'],
    steps: ['Pokrój kurczaka.', 'Usmaż kurczaka.', 'Podaj z ryżem.'],
  });
  await page.goto(`/przepisy/${id}`);
  await expect(page.getByRole('button', { name: 'Ugotowane' })).toBeVisible();
  return id;
}

const stepCounter = (page: Page, text: string) => page.getByRole('heading', { name: text });

test.describe('S13: tryb gotowania', () => {
  test('S13: „Gotuj” pokazuje składniki bez nawigacji aplikacji, tekstem co najmniej 22 px', async ({
    page,
  }) => {
    await startCooking(page);

    await page.getByRole('link', { name: 'Gotuj' }).click();

    const items = page.getByRole('listitem');
    await expect(items).toHaveText(['400 g piersi z kurczaka', 'sól do smaku']);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Mounjaro Przepisy' })).toHaveCount(0);
    await expect(page.getByRole('link')).toHaveText(['Wyjdź']);
    for (const element of [
      items.first(),
      items.last(),
      page.getByRole('button', { name: 'Dalej' }),
    ]) {
      const size = await element.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(size).toBeGreaterThanOrEqual(22);
    }
  });

  test('S13: przepis przeskalowany w S12 pokazuje w trybie gotowania przeskalowane ilości', async ({
    page,
  }) => {
    await startCooking(page);
    await page.getByLabel('Przelicz na porcje').fill('2');

    await page.getByRole('link', { name: 'Gotuj' }).click();

    await expect(page.getByRole('listitem')).toHaveText([
      '200 g piersi z kurczaka',
      'sól do smaku',
    ]);
  });

  test('S13: „Dalej” pokazuje dokładnie jeden krok z informacją „krok X z Y”', async ({ page }) => {
    await startCooking(page);
    await page.getByRole('link', { name: 'Gotuj' }).click();

    await page.getByRole('button', { name: 'Dalej' }).click();

    await expect(stepCounter(page, 'krok 1 z 3')).toBeVisible();
    await expect(page.getByText('Pokrój kurczaka.')).toBeVisible();
    await expect(page.getByText('Usmaż kurczaka.')).toHaveCount(0);
    await expect(page.getByText('Podaj z ryżem.')).toHaveCount(0);
  });

  test('S13: „Wstecz” i „Dalej” pokazują krok poprzedni albo następny', async ({ page }) => {
    await startCooking(page);
    await page.getByRole('link', { name: 'Gotuj' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();

    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(stepCounter(page, 'krok 2 z 3')).toBeVisible();
    await expect(page.getByText('Usmaż kurczaka.')).toBeVisible();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(stepCounter(page, 'krok 3 z 3')).toBeVisible();
    await page.getByRole('button', { name: 'Wstecz' }).click();

    await expect(stepCounter(page, 'krok 2 z 3')).toBeVisible();
    await expect(page.getByText('Usmaż kurczaka.')).toBeVisible();
  });

  test('S13: „Składniki” pokazuje listę i pozwala wrócić do tego samego kroku', async ({
    page,
  }) => {
    await startCooking(page);
    await page.getByRole('link', { name: 'Gotuj' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(stepCounter(page, 'krok 2 z 3')).toBeVisible();

    await page.getByRole('button', { name: 'Składniki' }).click();

    await expect(page.getByRole('listitem')).toHaveText([
      '400 g piersi z kurczaka',
      'sól do smaku',
    ]);
    await page.getByRole('button', { name: 'Wróć do kroku 2' }).click();
    await expect(stepCounter(page, 'krok 2 z 3')).toBeVisible();
    await expect(page.getByText('Usmaż kurczaka.')).toBeVisible();
  });

  test('S13: ekran nie gaśnie przez 5 minut bez dotyku, a po wyjściu blokada jest wyłączona', async ({
    page,
  }) => {
    await fakeWakeLock(page);
    await page.clock.install();
    await startCooking(page);

    await page.getByRole('link', { name: 'Gotuj' }).click();
    await expect(page.getByRole('heading', { name: /^Składniki/ })).toBeVisible();
    await expect.poll(() => heldLocks(page)).toBe(1);

    await page.clock.fastForward(5 * 60 * 1000);
    expect(await heldLocks(page)).toBe(1);
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.getByRole('link', { name: 'Wyjdź' }).click();
    await expect(page.getByRole('button', { name: 'Ugotowane' })).toBeVisible();
    expect(await heldLocks(page)).toBe(0);
  });

  test('S13: przeglądarka bez blokady wygaszania pokazuje informację, że ekran może zgasnąć, a tryb działa', async ({
    page,
  }) => {
    await withoutWakeLock(page);
    await startCooking(page);

    await page.getByRole('link', { name: 'Gotuj' }).click();

    await expect(page.getByRole('status')).toContainText('ekran może zgasnąć');
    await page.getByRole('button', { name: 'Rozumiem' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(stepCounter(page, 'krok 1 z 3')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('S13: „Zakończ” na ostatnim kroku wraca do szczegółów z „Ugotowane” i zachętą do oceny', async ({
    page,
  }) => {
    await startCooking(page);
    await page.getByRole('link', { name: 'Gotuj' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(stepCounter(page, 'krok 3 z 3')).toBeVisible();

    await page.getByRole('button', { name: 'Zakończ' }).click();

    await expect(page.getByRole('button', { name: 'Ugotowane' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Oceń smak i tolerancję');
    await expect(page.getByRole('heading', { level: 1, name: 'Kurczak z ryżem' })).toBeVisible();
  });
});
