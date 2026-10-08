import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalData } from './data/localDb';
import { json, loggedIn, renderAt, stubFetch, unauthenticated } from './testHelpers';

afterEach(async () => {
  cleanup();
  await clearLocalData();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App without a session', () => {
  it('shows the login screen for any address and remembers where the user wanted to go', async () => {
    stubFetch(unauthenticated);

    renderAt('/przepisy/123?x=1');

    const link = await screen.findByRole('link', { name: 'Zaloguj przez Google' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mounjaro Przepisy');
    expect(link.getAttribute('href')).toBe(
      `/api/auth/google/start?returnTo=${encodeURIComponent('/przepisy/123?x=1')}`,
    );
    expect(screen.queryByText('Kolekcja')).toBeNull();
  });

  it('tells a refused account it has no access', async () => {
    stubFetch(unauthenticated);

    renderAt('/logowanie?blad=konto');

    expect((await screen.findByRole('alert')).textContent).toBe('To konto nie ma dostępu');
  });

  it('ignores an unsafe returnTo on the login screen', async () => {
    stubFetch(unauthenticated);

    renderAt('/logowanie?returnTo=https%3A%2F%2Fevil.example');

    const link = await screen.findByRole('link', { name: 'Zaloguj przez Google' });
    expect(link.getAttribute('href')).toBe('/api/auth/google/start?returnTo=%2F');
  });

  it('offers a retry in Polish when the session cannot be checked', async () => {
    let attempts = 0;
    stubFetch(() => {
      attempts += 1;
      return attempts === 1 ? json(500, { error: { code: 'internal' } }) : loggedIn();
    });

    renderAt('/');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Coś poszło nie tak');
    expect(alert.textContent).not.toContain('internal');
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(await screen.findByRole('heading', { name: 'Kolekcja' })).toBeTruthy();
  });
});

describe('App with a session', () => {
  it('shows the collection and the account screen inside the shell', async () => {
    stubFetch(loggedIn);

    renderAt('/konto');

    expect(await screen.findByText('owner@example.test')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Mounjaro Przepisy' }));
    expect(await screen.findByRole('heading', { name: 'Kolekcja' })).toBeTruthy();
  });

  it('logs out and returns to the login screen', async () => {
    const fetchMock = stubFetch((url) =>
      url === '/api/auth/logout' ? new Response(null, { status: 204 }) : loggedIn(),
    );

    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Wyloguj' }));

    expect(await screen.findByRole('link', { name: 'Zaloguj przez Google' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('asks for a connection instead of logging out offline', async () => {
    const fetchMock = stubFetch(loggedIn);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Wyloguj' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Ta akcja wymaga połączenia z internetem'),
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/logout', expect.anything());
    expect(screen.getByRole('heading', { name: 'Kolekcja' })).toBeTruthy();
  });

  it('sends a user whose session was revoked back to the login screen', async () => {
    let calls = 0;
    stubFetch(() => (++calls === 1 ? loggedIn() : unauthenticated()));

    renderAt('/');
    await screen.findByRole('heading', { name: 'Kolekcja' });
    fireEvent.click(screen.getByRole('button', { name: 'Wyloguj' }));

    expect(await screen.findByRole('link', { name: 'Zaloguj przez Google' })).toBeTruthy();
  });
});
