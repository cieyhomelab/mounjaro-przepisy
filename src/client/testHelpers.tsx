import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { API_VERSION } from '../shared/contracts/session';
import type { Recipe } from '../shared/contracts/recipe';
import type { Snapshot } from '../shared/contracts/snapshot';
import { App } from './App';

export type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

export const json = (status: number, body: unknown, headers?: Record<string, string>) =>
  Response.json(body, { status, headers: headers ?? {} });
export const unauthenticated = () => json(401, { error: { code: 'unauthenticated' } });
export const loggedIn = () => json(200, { email: 'owner@example.test', apiVersion: API_VERSION });

export const snapshotOf = (recipes: Recipe[] = [], dataVersion = 0): Snapshot => ({
  apiVersion: API_VERSION,
  dataVersion,
  generatedAt: '2026-10-08T12:00:00.000Z',
  settings: {
    thresholdProteinG: 25,
    thresholdFatG: 15,
    thresholdFiberG: 5,
    thresholdKcal: 400,
    thresholdSmallPortionKcal: 300,
  },
  recipes,
  collections: [],
  cookEvents: [],
  trustedSites: [],
  mealPlan: [],
  shoppingChecks: [],
  shoppingCustomItems: [],
});

export function recipeOf(overrides: Partial<Recipe> & { id: string; title: string }): Recipe {
  const none = { value: null, origin: 'none' as const };
  return {
    kind: 'manual',
    servings: 2,
    ingredients: [{ quantity: null, unit: null, name: 'sól', originalText: 'sól' }],
    steps: ['Wymieszaj.'],
    sourceUrl: null,
    sourceSiteName: null,
    sourceRating: null,
    sourceRatingCount: null,
    nutrition: { kcal: none, proteinG: none, fatG: none, fiberG: none },
    unrecognizedIngredients: [],
    ownRating: null,
    tolerance: null,
    toleranceSymptoms: [],
    toleranceNote: null,
    worseDays: false,
    photoId: null,
    collectionIds: [],
    createdAt: '2026-10-08T12:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

export const manual = (value: number | null) => ({
  value,
  origin: value === null ? ('none' as const) : ('manual' as const),
});

/**
 * Replaces fetch. The snapshot answers with an empty collection unless the handler is given
 * a different one in `snapshot`; everything else goes to `handler`.
 */
export function stubFetch(
  handler: Handler,
  snapshot: () => Response = () => json(200, snapshotOf()),
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(url === '/api/snapshot' ? snapshot() : handler(url, init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
