import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../../shared/contracts/recipe';
import { ApiError } from '../data/api';
import { CookPanel } from './CookPanel';

const { apiRequest, changeSaved } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  changeSaved: vi.fn(),
}));
const EVENT_ID = '6f1c1d9e-3b7a-4c55-9a52-0e2f6b1d7a10';
const RECIPE_ID = '0b7e6a52-1c3d-4e8f-8a41-5d9c2f7b3e66';

vi.mock('../data/api', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, apiRequest };
});
vi.mock('../data/collection', () => ({
  useCollection: () => ({
    state: {
      status: 'ready',
      cookEvents: [
        {
          id: EVENT_ID,
          recipeId: RECIPE_ID,
          cookedOn: '2026-10-09',
          createdAt: '2026-10-09T10:00:00Z',
        },
      ],
    },
    changeSaved,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('CookPanel retry', () => {
  it('repeats the undo, not a new cooking, after the undo failed', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError('internal', 500));
    apiRequest.mockResolvedValueOnce({
      cookEvent: {
        id: EVENT_ID,
        recipeId: RECIPE_ID,
        cookedOn: '2026-10-09',
        createdAt: '2026-10-09T10:00:00.000Z',
      },
      dataVersion: 3,
    });
    render(<CookPanel recipe={{ id: RECIPE_ID } as Recipe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cofnij ostatnie ugotowanie' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }));

    await waitFor(() =>
      expect(changeSaved).toHaveBeenCalledWith({ removeCookEventId: EVENT_ID }, 3),
    );
    expect(apiRequest).toHaveBeenCalledTimes(2);
    for (const call of apiRequest.mock.calls) {
      expect(call).toEqual([`/api/recipes/${RECIPE_ID}/cook-events/last`, { method: 'DELETE' }]);
    }
  });

  it('repeats the undo after it was refused offline', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    apiRequest.mockResolvedValueOnce({
      cookEvent: {
        id: EVENT_ID,
        recipeId: RECIPE_ID,
        cookedOn: '2026-10-09',
        createdAt: '2026-10-09T10:00:00.000Z',
      },
      dataVersion: 4,
    });
    render(<CookPanel recipe={{ id: RECIPE_ID } as Recipe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cofnij ostatnie ugotowanie' }));
    expect(await screen.findByText('Ta akcja wymaga połączenia z internetem')).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));

    await waitFor(() =>
      expect(changeSaved).toHaveBeenCalledWith({ removeCookEventId: EVENT_ID }, 4),
    );
    expect(apiRequest).toHaveBeenCalledWith(`/api/recipes/${RECIPE_ID}/cook-events/last`, {
      method: 'DELETE',
    });
  });
});
