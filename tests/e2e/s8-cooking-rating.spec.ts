import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe, setServerClock } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const WEDNESDAY = '2026-10-14T10:00:00Z';

async function openRecipe(page: Page, id: string) {
  await page.goto(`/przepisy/${id}`);
  await expect(page.getByRole('button', { name: 'Ugotowane' })).toBeVisible();
}

async function loggedInWithRecipe(page: Page, seed: Parameters<typeof seedRecipe>[1]) {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  const id = await seedRecipe(page, seed);
  await openRecipe(page, id);
  return id;
}

const cook = (page: Page, id: string) => apiCall(page, 'POST', `/api/recipes/${id}/cook-events`);

test.describe('S8: ugotowania', () => {
  test('S8: „Ugotowane” zapisuje ugotowanie z dzisiejszą datą, a szczegóły pokazują ostatnią datę i liczbę', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await setServerClock(request, WEDNESDAY);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await openRecipe(page, id);
    await expect(page.getByText('Liczba ugotowań: 0')).toBeVisible();

    await page.getByRole('button', { name: 'Ugotowane' }).click();

    await expect(page.getByText('Ostatnio ugotowano: 14 października 2026')).toBeVisible();
    await expect(page.getByText('Liczba ugotowań: 1')).toBeVisible();
  });

  test('S8: kolejne „Ugotowane” w tym samym dniu zapisuje następne ugotowanie', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await setServerClock(request, WEDNESDAY);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await openRecipe(page, id);

    await page.getByRole('button', { name: 'Ugotowane' }).click();
    await expect(page.getByText('Liczba ugotowań: 1')).toBeVisible();
    await page.getByRole('button', { name: 'Ugotowane' }).click();

    await expect(page.getByText('Liczba ugotowań: 2')).toBeVisible();
    await expect(page.getByText('Ostatnio ugotowano: 14 października 2026')).toBeVisible();
  });

  test('S8: „Cofnij ostatnie ugotowanie” usuwa je i zmniejsza liczniki o jeden', async ({
    page,
    request,
  }) => {
    await logIn(page);
    await setServerClock(request, '2026-10-12T10:00:00Z');
    const id = await seedRecipe(page, { title: 'Zupa' });
    await cook(page, id);
    await setServerClock(request, WEDNESDAY);
    await cook(page, id);
    await openRecipe(page, id);
    await expect(page.getByText('Liczba ugotowań: 2')).toBeVisible();
    await expect(page.getByText('Ostatnio ugotowano: 14 października 2026')).toBeVisible();

    await page.getByRole('button', { name: 'Cofnij ostatnie ugotowanie' }).click();

    await expect(page.getByText('Liczba ugotowań: 1')).toBeVisible();
    await expect(page.getByText('Ostatnio ugotowano: 12 października 2026')).toBeVisible();
    await page.getByRole('button', { name: 'Cofnij ostatnie ugotowanie' }).click();
    await expect(page.getByText('Liczba ugotowań: 0')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cofnij ostatnie ugotowanie' })).toHaveCount(0);
  });

  test('S8: offline „Ugotowane” pokazuje, że akcja wymaga połączenia, i niczego nie zapisuje', async ({
    page,
    context,
  }) => {
    await loggedInWithRecipe(page, { title: 'Zupa' });

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Ugotowane' }).click();

    await expect(page.getByText('Ta akcja wymaga połączenia z internetem')).toBeVisible();
    await expect(page.getByText('Liczba ugotowań: 0')).toBeVisible();
  });
});

test.describe('S8: licznik tygodniowy', () => {
  async function seededWeek(page: Page, request: Parameters<typeof setServerClock>[0]) {
    await logIn(page);
    const id = await seedRecipe(page, { title: 'Zupa' });
    return { id, request };
  }

  test('S8: trzy ugotowania w bieżącym tygodniu (poniedziałek–niedziela) dają „W tym tygodniu ugotowano: 3”', async ({
    page,
    request,
  }) => {
    const { id } = await seededWeek(page, request);
    // Monday 12 and Sunday 18 October belong to the week of Wednesday 14 October.
    for (const day of [
      '2026-10-11T10:00:00Z',
      '2026-10-12T10:00:00Z',
      '2026-10-14T10:00:00Z',
      '2026-10-18T10:00:00Z',
    ]) {
      await setServerClock(request, day);
      await cook(page, id);
    }
    await page.clock.setFixedTime(new Date(WEDNESDAY));

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'W tym tygodniu ugotowano: 3' })).toBeVisible();
  });

  test('S8: niedziela po północy czasu polskiego liczy się do nowego tygodnia', async ({
    page,
    request,
  }) => {
    const { id } = await seededWeek(page, request);
    // 22:30 UTC on Sunday is 00:30 on Monday in Warsaw.
    await setServerClock(request, '2026-10-18T22:30:00Z');
    await cook(page, id);
    await page.clock.setFixedTime(new Date('2026-10-19T08:00:00Z'));

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'W tym tygodniu ugotowano: 1' })).toBeVisible();
  });

  test('S8: nowy tydzień bez ugotowań pokazuje licznik 0', async ({ page, request }) => {
    const { id } = await seededWeek(page, request);
    await setServerClock(request, WEDNESDAY);
    await cook(page, id);
    await page.clock.setFixedTime(new Date('2026-10-19T08:00:00Z'));

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'W tym tygodniu ugotowano: 0' })).toBeVisible();
  });

  test('S8: wybranie licznika pokazuje liczbę ugotowań w każdym z ostatnich 8 tygodni', async ({
    page,
    request,
  }) => {
    const { id } = await seededWeek(page, request);
    // Two cookings this week, one three weeks ago, one nine weeks ago (outside the history).
    for (const day of [
      '2026-08-12T10:00:00Z',
      '2026-09-24T10:00:00Z',
      '2026-10-12T10:00:00Z',
      '2026-10-14T10:00:00Z',
    ]) {
      await setServerClock(request, day);
      await cook(page, id);
    }
    await page.clock.setFixedTime(new Date(WEDNESDAY));
    await page.goto('/');

    await page.getByRole('button', { name: /W tym tygodniu ugotowano/ }).click();

    const weeks = page.getByRole('list', { name: 'Ugotowania w ostatnich 8 tygodniach' });
    await expect(weeks.getByRole('listitem')).toHaveText([
      'Tydzień od 12 października 2026: 2',
      'Tydzień od 5 października 2026: 0',
      'Tydzień od 28 września 2026: 0',
      'Tydzień od 21 września 2026: 1',
      'Tydzień od 14 września 2026: 0',
      'Tydzień od 7 września 2026: 0',
      'Tydzień od 31 sierpnia 2026: 0',
      'Tydzień od 24 sierpnia 2026: 0',
    ]);
  });
});

test.describe('S8: własna ocena', () => {
  const stars = (page: Page) => page.getByRole('group', { name: 'Moja ocena w gwiazdkach' });

  test('S8: 4 gwiazdki są widoczne w szczegółach i na liście jako „moja ocena”, osobno od oceny ze źródła', async ({
    page,
  }) => {
    await loggedInWithRecipe(page, {
      title: 'Zupa',
      source: { url: 'https://example.test/zupa', rating: 4.5 },
    });
    await expect(page.getByText('Moja ocena: brak')).toBeVisible();

    await stars(page).getByRole('button', { name: '4 gwiazdki' }).click();

    await expect(page.getByText('Moja ocena: 4/5')).toBeVisible();
    await expect(page.getByText(/^Ocena ze źródła: 4,5/)).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    const item = page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem').first();
    await expect(item).toContainText('Moja ocena: 4/5');
    await expect(item).toContainText('Ocena ze źródła: 4,5');
  });

  test('S8: wybranie innej liczby gwiazdek zastępuje ocenę', async ({ page }) => {
    await loggedInWithRecipe(page, { title: 'Zupa' });
    await stars(page).getByRole('button', { name: '4 gwiazdki' }).click();
    await expect(page.getByText('Moja ocena: 4/5')).toBeVisible();

    await stars(page).getByRole('button', { name: '2 gwiazdki' }).click();

    await expect(page.getByText('Moja ocena: 2/5')).toBeVisible();
    await expect(page.getByText('Moja ocena: 4/5')).toHaveCount(0);
  });

  test('S8: „Usuń ocenę” usuwa własną ocenę przepisu', async ({ page }) => {
    await loggedInWithRecipe(page, { title: 'Zupa' });
    await stars(page).getByRole('button', { name: '5 gwiazdek' }).click();
    await expect(page.getByText('Moja ocena: 5/5')).toBeVisible();

    await page.getByRole('button', { name: 'Usuń ocenę', exact: true }).click();

    await expect(page.getByText('Moja ocena: brak')).toBeVisible();
    await page.getByRole('link', { name: 'Wróć do kolekcji' }).click();
    await expect(
      page.getByRole('list', { name: 'Przepisy' }).getByRole('listitem').first(),
    ).not.toContainText('Moja ocena');
  });
});
