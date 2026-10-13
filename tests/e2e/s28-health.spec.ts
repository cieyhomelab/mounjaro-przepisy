import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer } from './helpers';
import { OFFLINE_MESSAGE, enableReminder, setNow } from './reminderHelpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const PHONE = { width: 390, height: 844 };
const SENTENCE = 'Dawkę ustala lekarz. Aplikacja tylko ją zapisuje.';
// Monday 2026-10-12, 10:00 in Warsaw (UTC+2); the reminder day below is Thursday 2026-10-15.
const MONDAY = '2026-10-12T08:00:00Z';

async function openHealth(page: Page, now = MONDAY) {
  await page.setViewportSize(PHONE);
  await setNow(page, now);
  await logIn(page, undefined, '/zdrowie');
  await expect(page.getByRole('heading', { level: 1, name: 'Zdrowie' })).toBeVisible();
  await expect(page.getByText(/^Ładowanie/)).toHaveCount(0);
}

const card = (page: Page, name: string) => page.getByRole('region', { name });
const nextCard = (page: Page) => card(page, 'Następny zastrzyk');
const sites = (page: Page) => page.getByRole('list', { name: 'Miejsca wkłucia' }).locator('> li');
const seedDose = (page: Page, date: string, doseMg: number, site: string) =>
  apiCall(page, 'POST', '/api/dose-entries', { date, doseMg, site });

test.describe('S28: ekran Zdrowie', () => {
  test('S28: zdanie o dawce jest widoczne bez przewijania na 390 × 844', async ({ page }) => {
    await openHealth(page);
    await expect(page.getByText(SENTENCE)).toBeInViewport();
  });

  test('S28: karta pokazuje najbliższy czwartek, a w dniu przypomnienia datę dzisiejszą do północy', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await setNow(page, MONDAY);
    await logIn(page);
    await enableReminder(page, 4, '19:00');
    // A dose entered on the reminder day itself (a journal cannot hold a future date).
    await setNow(page, '2026-10-15T05:00:00Z');
    await seedDose(page, '2026-10-15', 2.5, 'abdomen_left');

    const expectations: [string, string][] = [
      [MONDAY, 'czwartek, 15 października, 19:00'],
      ['2026-10-15T05:00:00Z', 'czwartek, 15 października, 19:00'],
      // 19:04 and later in the evening, with a dose already entered for the day.
      ['2026-10-15T17:04:00Z', 'czwartek, 15 października, 19:00'],
      ['2026-10-15T21:30:00Z', 'czwartek, 15 października, 19:00'],
      // 00:00 on Friday in Warsaw.
      ['2026-10-15T22:00:00Z', 'czwartek, 22 października, 19:00'],
    ];
    for (const [now, text] of expectations) {
      await setNow(page, now);
      await page.goto('/zdrowie');
      await expect(nextCard(page).getByText(text, { exact: true }), now).toBeVisible();
    }
  });

  test('S28: wyłączone przypomnienie nie pokazuje daty, tylko przejście do ustawień przypomnienia', async ({
    page,
  }) => {
    await openHealth(page);
    const hint = nextCard(page).getByRole('link', {
      name: 'Ustaw przypomnienie, żeby widzieć termin',
    });
    await expect(hint).toBeVisible();
    await expect(nextCard(page).getByText(/\d{1,2} \S+, \d{2}:\d{2}/)).toHaveCount(0);
    await hint.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Przypomnienie o zastrzyku' }),
    ).toBeVisible();
  });

  test('S28: karta pokazuje ostatnią zapisaną dawkę, a pusty dziennik „Brak zapisanych dawek”', async ({
    page,
  }) => {
    await openHealth(page);
    await expect(nextCard(page).getByText('Brak zapisanych dawek')).toBeVisible();

    await seedDose(page, '2026-10-01', 2.5, 'abdomen_left');
    await seedDose(page, '2026-10-08', 5, 'thigh_left');
    await page.goto('/zdrowie');
    await expect(
      nextCard(page).getByText('Ostatnia dawka: 5 mg, udo lewe, 8 października', { exact: true }),
    ).toBeVisible();
  });

  test('S28: „Zapisz zastrzyk” otwiera pusty formularz dawki, a offline pokazuje komunikat', async ({
    page,
  }) => {
    await openHealth(page);
    await seedDose(page, '2026-10-08', 5, 'thigh_left');
    await page.goto('/zdrowie');
    await nextCard(page).getByRole('button', { name: 'Zapisz zastrzyk' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
    await expect(page.getByLabel('Dawka (mg)')).toHaveValue('');
    const group = page.getByRole('group', { name: 'Miejsce wkłucia' });
    await expect(group.getByRole('button', { pressed: true })).toHaveCount(0);

    await page.goto('/zdrowie');
    await expect(nextCard(page).getByText('Ostatnia dawka')).toBeVisible();
    await page.context().setOffline(true);
    await nextCard(page).getByRole('button', { name: 'Zapisz zastrzyk' }).click();
    await expect(nextCard(page).getByText(OFFLINE_MESSAGE)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Zdrowie' })).toBeVisible();
  });

  test('S28: siatka ma sześć miejsc w trzech wierszach, z dopiskami „ostatnio” i „proponowane”, i nie jest przyciskami', async ({
    page,
  }) => {
    await openHealth(page);
    await seedDose(page, '2026-10-01', 2.5, 'abdomen_left');
    await seedDose(page, '2026-10-08', 2.5, 'abdomen_right');
    await page.goto('/zdrowie');

    const cells = sites(page);
    await expect(cells).toHaveCount(6);
    const labels = ['Brzuch L', 'Brzuch P', 'Udo L', 'Udo P', 'Ramię L', 'Ramię P'];
    const full = [
      'brzuch lewa strona',
      'brzuch prawa strona',
      'udo lewe',
      'udo prawe',
      'ramię lewe',
      'ramię prawe',
    ];
    const boxes = [];
    for (const [index, label] of labels.entries()) {
      const cell = cells.nth(index);
      await expect(cell.getByText(label, { exact: true })).toBeVisible();
      await expect(cell.getByText(full[index] ?? '', { exact: true })).toHaveCount(1);
      boxes.push(await cell.boundingBox());
    }
    for (let row = 0; row < 3; row += 1) {
      const left = boxes[row * 2];
      const right = boxes[row * 2 + 1];
      expect(left && right).toBeTruthy();
      if (!left || !right) continue;
      expect(left.x).toBeLessThan(right.x);
      expect(Math.abs(left.y - right.y)).toBeLessThan(2);
      if (row > 0) expect(left.y).toBeGreaterThan((boxes[(row - 1) * 2]?.y ?? 0) + 10);
    }
    await expect(card(page, 'Miejsce wkłucia').getByRole('button')).toHaveCount(0);

    await expect(cells.nth(1)).toContainText('ostatnio');
    await expect(cells.nth(2)).toContainText('proponowane');
    for (const index of [0, 3, 4, 5]) {
      await expect(cells.nth(index)).not.toContainText(/ostatnio|proponowane/);
    }
  });

  test('S28: przy pustym dzienniku dawek żadne miejsce nie ma dopisku', async ({ page }) => {
    await openHealth(page);
    await expect(sites(page)).toHaveCount(6);
    await expect(card(page, 'Miejsce wkłucia').getByText(/ostatnio|proponowane/)).toHaveCount(0);
  });

  test('S28: karta „Dzisiaj” pokazuje sumę z celem, pasek i oznaczenie osiągniętego celu', async ({
    page,
  }) => {
    await openHealth(page);
    await apiCall(page, 'PUT', '/api/settings/goals', {
      proteinGoalG: 100,
      waterGoalMl: 500,
      glassMl: 250,
    });
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 60,
      description: 'twaróg',
    });
    await page.goto('/zdrowie');
    const today = card(page, 'Dzisiaj');
    await expect(today.getByText('60 / 100 g', { exact: true })).toBeVisible();
    await expect(today.getByRole('progressbar', { name: 'Postęp: białko' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    await expect(today.getByText('0 / 500 ml', { exact: true })).toBeVisible();

    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 50,
      description: 'jajka',
    });
    await page.goto('/zdrowie');
    await expect(today.getByText('110 / 100 g', { exact: true })).toBeVisible();
    await expect(today.getByRole('progressbar', { name: 'Postęp: białko' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    await expect(today.getByText('cel osiągnięty')).toHaveCount(1);
  });

  test('S28: bez celu karta pokazuje samą sumę i zachętę do ustawienia celu', async ({ page }) => {
    await openHealth(page);
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 35,
      description: 'jogurt',
    });
    await page.goto('/zdrowie');
    const today = card(page, 'Dzisiaj');
    await expect(today.getByText('35 g', { exact: true })).toBeVisible();
    await expect(today.getByRole('progressbar')).toHaveCount(0);
    await expect(today.getByRole('link', { name: 'Ustaw cel w ustawieniach' })).toHaveCount(2);
  });

  test('S28: przycisk szklanki dodaje wodę, a licznik pokazuje tę samą sumę', async ({ page }) => {
    await openHealth(page);
    await apiCall(page, 'PUT', '/api/settings/goals', {
      proteinGoalG: null,
      waterGoalMl: 2000,
      glassMl: 300,
    });
    await page.goto('/zdrowie');
    const today = card(page, 'Dzisiaj');
    await expect(today.getByText('0 / 2000 ml', { exact: true })).toBeVisible();
    await today.getByRole('button', { name: '+ 300 ml' }).click();
    await expect(today.getByText('300 / 2000 ml', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Białko i woda' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Licznik białka i wody' }),
    ).toBeVisible();
    await expect(page.getByTestId('sum-Woda')).toHaveText('300 / 2000 ml');
  });

  test('S28: przy szklance 250 ml przycisk ma napis „+ 250 ml”, a offline niczego nie dodaje', async ({
    page,
  }) => {
    await openHealth(page);
    const today = card(page, 'Dzisiaj');
    const button = today.getByRole('button', { name: '+ 250 ml' });
    await expect(button).toBeVisible();
    await page.context().setOffline(true);
    await button.click();
    await expect(today.getByText(OFFLINE_MESSAGE)).toBeVisible();
    await page.context().setOffline(false);
    await button.click();
    await expect(today.getByText('250 ml', { exact: true })).toBeVisible();
  });

  test('S28: przejścia otwierają dziennik dawek, wagę i samopoczucie oraz licznik', async ({
    page,
  }) => {
    await openHealth(page);
    const targets: [string, string][] = [
      ['Dziennik dawek', 'Dziennik dawek'],
      ['Waga i samopoczucie', 'Waga i samopoczucie'],
      ['Białko i woda', 'Licznik białka i wody'],
    ];
    for (const [link, heading] of targets) {
      await page.getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.getByRole('link', { name: 'Zdrowie', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Zdrowie' })).toBeVisible();
    }
  });

  test('S28: offline ekran pokazuje ostatnio pobrane dane we wszystkich kartach', async ({
    page,
  }) => {
    await openHealth(page);
    await enableReminder(page, 4, '19:00');
    await seedDose(page, '2026-10-08', 5, 'thigh_left');
    await apiCall(page, 'PUT', '/api/settings/goals', {
      proteinGoalG: 100,
      waterGoalMl: 2000,
      glassMl: 250,
    });
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 35,
      description: 'jogurt',
    });
    await page.goto('/zdrowie');
    await expect(page.getByText('35 / 100 g')).toBeVisible();

    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Zdrowie' })).toBeVisible();
    await expect(nextCard(page).getByText('czwartek, 15 października, 19:00')).toBeVisible();
    await expect(
      nextCard(page).getByText('Ostatnia dawka: 5 mg, udo lewe, 8 października'),
    ).toBeVisible();
    await expect(sites(page)).toHaveCount(6);
    await expect(sites(page).nth(2)).toContainText('ostatnio');
    await expect(card(page, 'Dzisiaj').getByText('35 / 100 g')).toBeVisible();
  });
});
