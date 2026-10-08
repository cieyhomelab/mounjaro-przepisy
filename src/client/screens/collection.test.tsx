import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalData } from '../data/localDb';
import { json, loggedIn, manual, recipeOf, renderAt, snapshotOf, stubFetch } from '../testHelpers';

afterEach(async () => {
  cleanup();
  await clearLocalData();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const withRecipes = (...recipes: Parameters<typeof snapshotOf>[0] & object) =>
  json(200, snapshotOf(recipes, 3), { ETag: '"3"' });

describe('S6: collection list', () => {
  it('S6: an empty collection invites to add the first recipe, "Z linku" is enabled', async () => {
    stubFetch(loggedIn);

    renderAt('/');

    expect(await screen.findByText('Dodaj pierwszy przepis')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Z linku' }).hasAttribute('disabled')).toBe(false);
    const manualButton = screen.getByRole('button', { name: 'Ręcznie' });
    expect(manualButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(manualButton);
    expect(await screen.findByRole('heading', { name: 'Nowy przepis' })).toBeTruthy();
  });

  it('S6: lists recipes by protein, highest first, with placeholders and "—" for missing values', async () => {
    const nutrition = (kcal: number | null, protein: number | null) => ({
      kcal: manual(kcal),
      proteinG: manual(protein),
      fatG: manual(null),
      fiberG: manual(null),
    });
    stubFetch(loggedIn, () =>
      withRecipes(
        recipeOf({
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Zupa',
          nutrition: nutrition(150, null),
        }),
        recipeOf({
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Kurczak',
          nutrition: nutrition(412, 28),
        }),
        recipeOf({
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Sałatka',
          nutrition: nutrition(200, 12),
          ownRating: 4,
        }),
      ),
    );

    renderAt('/');

    const list = await screen.findByRole('list', { name: 'Przepisy' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/Zupa|Kurczak|Sałatka/).textContent)).toEqual(
      ['Kurczak', 'Sałatka', 'Zupa'],
    );
    expect(items[0]?.textContent).toContain('Białko: 28 g');
    expect(items[0]?.textContent).toContain('Kalorie: 412 kcal');
    expect(items[0]?.textContent).toContain('ręczny');
    expect(within(items[0] as HTMLElement).getByRole('img', { name: 'Brak zdjęcia' })).toBeTruthy();
    expect(items[1]?.textContent).toContain('Twoja ocena: 4/5');
    expect(items[2]?.textContent).toContain('Białko: —');
    expect(items[2]?.textContent).toContain('Kalorie: 150 kcal');
  });

  it('shows the local copy and asks only for changes when the server answers 304', async () => {
    const fetchMock = stubFetch(loggedIn, () =>
      withRecipes(recipeOf({ id: '11111111-1111-4111-8111-111111111111', title: 'Zupa' })),
    );
    renderAt('/');
    await screen.findByText('Zupa');
    cleanup();

    stubFetch(loggedIn, () => new Response(null, { status: 304 }));
    renderAt('/');

    expect(await screen.findByText('Zupa')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('keeps showing the local copy when the server cannot be reached', async () => {
    stubFetch(loggedIn, () =>
      withRecipes(recipeOf({ id: '11111111-1111-4111-8111-111111111111', title: 'Zupa' })),
    );
    renderAt('/');
    await screen.findByText('Zupa');
    cleanup();

    stubFetch(loggedIn, () => {
      throw new TypeError('offline');
    });
    renderAt('/');

    expect(await screen.findByText('Zupa')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers a retry when the first load fails', async () => {
    let attempts = 0;
    stubFetch(loggedIn, () =>
      ++attempts === 1 ? json(500, { error: { code: 'internal' } }) : json(200, snapshotOf()),
    );

    renderAt('/');

    expect((await screen.findByRole('alert')).textContent).toContain('Coś poszło nie tak');
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(await screen.findByText('Dodaj pierwszy przepis')).toBeTruthy();
  });
});

describe('S4: manual recipe form', () => {
  const fillValid = () => {
    fireEvent.change(screen.getByLabelText('Tytuł'), { target: { value: 'Kurczak z ryżem' } });
    fireEvent.change(screen.getByLabelText('Liczba porcji'), { target: { value: '2,5' } });
    fireEvent.change(screen.getByLabelText('Składnik 1'), { target: { value: 'sól do smaku' } });
    fireEvent.change(screen.getByLabelText('Krok 1'), { target: { value: 'Usmaż.' } });
  };

  it('S4: saving an empty form names every missing field and sends nothing', async () => {
    const fetchMock = stubFetch(loggedIn);
    renderAt('/przepisy/nowy');
    await screen.findByRole('heading', { name: 'Nowy przepis' });

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Podaj tytuł przepisu.')).toBeTruthy();
    expect(screen.getByText('Podaj liczbę porcji.')).toBeTruthy();
    expect(screen.getByText('Dodaj co najmniej jeden składnik.')).toBeTruthy();
    expect(screen.getByText('Dodaj co najmniej jeden krok.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/recipes', expect.anything());
  });

  it.each(['0', '100', '1,3', 'dużo'])(
    'S4: %s servings is rejected with a message',
    async (servings) => {
      stubFetch(loggedIn);
      renderAt('/przepisy/nowy');
      await screen.findByRole('heading', { name: 'Nowy przepis' });
      fillValid();
      fireEvent.change(screen.getByLabelText('Liczba porcji'), { target: { value: servings } });

      fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

      expect(await screen.findByText(/Liczba porcji musi być od 0,5 do 99/)).toBeTruthy();
    },
  );

  it('S4: a lost connection shows a message and keeps what was typed', async () => {
    const fetchMock = stubFetch((url) => {
      if (url === '/api/recipes') throw new TypeError('network down');
      return loggedIn();
    });
    renderAt('/przepisy/nowy');
    await screen.findByRole('heading', { name: 'Nowy przepis' });
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Nie udało się połączyć');
    expect(screen.getByLabelText<HTMLInputElement>('Tytuł').value).toBe('Kurczak z ryżem');
    expect(screen.getByLabelText<HTMLInputElement>('Liczba porcji').value).toBe('2,5');
    expect(screen.getByLabelText<HTMLInputElement>('Składnik 1').value).toBe('sól do smaku');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Krok 1').value).toBe('Usmaż.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/recipes',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('S4: saving offline asks for a connection and keeps the data', async () => {
    const fetchMock = stubFetch(loggedIn);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderAt('/przepisy/nowy');
    await screen.findByRole('heading', { name: 'Nowy przepis' });
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Ta akcja wymaga połączenia z internetem',
      ),
    );
    expect(screen.getByLabelText<HTMLInputElement>('Tytuł').value).toBe('Kurczak z ryżem');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/recipes', expect.anything());
  });

  it('S4: a saved recipe opens its details', async () => {
    const saved = recipeOf({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Kurczak z ryżem',
    });
    stubFetch(
      (url) => (url === '/api/recipes' ? json(201, { recipe: saved, dataVersion: 1 }) : loggedIn()),
      () => json(200, snapshotOf([saved], 1)),
    );
    renderAt('/przepisy/nowy');
    await screen.findByRole('heading', { name: 'Nowy przepis' });
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByRole('heading', { name: 'Kurczak z ryżem' })).toBeTruthy();
    expect(screen.getByText('ręczny')).toBeTruthy();
  });
});
