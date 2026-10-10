import { describe, expect, it } from 'vitest';
import { accountExportSchema } from '../../src/shared/contracts/account';
import { recipeResponseSchema } from '../../src/shared/contracts/recipe';
import {
  checksResponseSchema,
  customItemDeletedResponseSchema,
  customItemResponseSchema,
} from '../../src/shared/contracts/shopping';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { readZip } from '../e2e/zipReader';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const WEEK = '2026-10-12';

describe('S20: shopping list', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const send = (jar: CookieJar, method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    harness.app.inject({
      method,
      url,
      headers: { ...originHeaders, ...jar.header() },
      ...(payload ? { payload } : {}),
    });

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  const addItem = async (jar: CookieJar, name = 'papier do pieczenia', week = WEEK) =>
    customItemResponseSchema.parse(
      (await send(jar, 'POST', `/api/shopping/${week}/custom-items`, { name })).json(),
    );

  it('S20: an own item is stored for the week, trimmed, and raises the data version', async () => {
    const jar = await login();
    const before = (await snapshot(jar)).dataVersion;

    const response = await send(jar, 'POST', `/api/shopping/${WEEK}/custom-items`, {
      name: '  papier do pieczenia ',
    });

    expect(response.statusCode).toBe(201);
    const { item, dataVersion } = customItemResponseSchema.parse(response.json());
    expect(item).toMatchObject({ weekStart: WEEK, name: 'papier do pieczenia', checked: false });
    expect(dataVersion).toBe(before + 1);
    expect((await snapshot(jar)).shoppingCustomItems).toEqual([item]);
  });

  it('S20: an empty name, a day that is not a Monday and a bad date are 400', async () => {
    const jar = await login();

    for (const [week, payload] of [
      [WEEK, { name: '   ' }],
      [WEEK, {}],
      ['2026-10-13', { name: 'sól' }],
      ['2026-02-30', { name: 'sól' }],
      ['jutro', { name: 'sól' }],
    ] as const) {
      const response = await send(jar, 'POST', `/api/shopping/${week}/custom-items`, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation' } });
    }
    expect((await snapshot(jar)).shoppingCustomItems).toEqual([]);
  });

  it('S20: an own item is removed; an unknown one is 404', async () => {
    const jar = await login();
    const { item } = await addItem(jar);

    const removed = await send(jar, 'DELETE', `/api/shopping/custom-items/${item.id}`);

    expect(removed.statusCode).toBe(200);
    customItemDeletedResponseSchema.parse(removed.json());
    expect((await snapshot(jar)).shoppingCustomItems).toEqual([]);
    expect((await send(jar, 'DELETE', `/api/shopping/custom-items/${item.id}`)).statusCode).toBe(
      404,
    );
  });

  it('S20: ticks are stored with the quantity, can be undone and are in the snapshot', async () => {
    const jar = await login();

    const response = await send(jar, 'PUT', `/api/shopping/${WEEK}/checks`, {
      changes: [
        { itemKey: 'twaróg|g', checked: true, quantity: 500 },
        { itemKey: 'sól|', checked: true },
        { itemKey: 'sól|', checked: false },
      ],
    });

    expect(response.statusCode).toBe(200);
    const body = checksResponseSchema.parse(response.json());
    expect(body.checks.map((c) => [c.itemKey, c.checked, c.checkedQuantity])).toEqual([
      ['sól|', false, null],
      ['twaróg|g', true, 500],
    ]);
    expect((await snapshot(jar)).shoppingChecks).toEqual(body.checks);
  });

  it('S20: a tick of an own item is stored on the item; a deleted item is skipped', async () => {
    const jar = await login();
    const { item } = await addItem(jar);
    const gone = await addItem(jar, 'sznurek');
    await send(jar, 'DELETE', `/api/shopping/custom-items/${gone.item.id}`);

    const response = await send(jar, 'PUT', `/api/shopping/${WEEK}/checks`, {
      changes: [
        { customItemId: item.id, checked: true },
        { customItemId: gone.item.id, checked: true },
      ],
    });

    expect(response.statusCode).toBe(200);
    const body = checksResponseSchema.parse(response.json());
    expect(body.customItems.map((i) => [i.name, i.checked])).toEqual([
      ['papier do pieczenia', true],
    ]);
  });

  it('S20: the change that reaches the server last wins', async () => {
    const jar = await login();
    await send(jar, 'PUT', `/api/shopping/${WEEK}/checks`, {
      changes: [{ itemKey: 'ryż|g', checked: true, quantity: 100 }],
    });

    await send(jar, 'PUT', `/api/shopping/${WEEK}/checks`, {
      changes: [{ itemKey: 'ryż|g', checked: false, quantity: 100 }],
    });

    const [check] = (await snapshot(jar)).shoppingChecks;
    expect(check).toMatchObject({ itemKey: 'ryż|g', checked: false });
  });

  it('S20: a change must name exactly one item; empty and oversized queues are 400', async () => {
    const jar = await login();
    const { item } = await addItem(jar);

    for (const changes of [
      [],
      [{ checked: true }],
      [{ itemKey: 'a|', customItemId: item.id, checked: true }],
      [{ itemKey: 'a|', checked: 'tak' }],
      [{ itemKey: 'a|', checked: true, quantity: -1 }],
      Array.from({ length: 501 }, () => ({ itemKey: 'a|', checked: true })),
    ]) {
      const response = await send(jar, 'PUT', `/api/shopping/${WEEK}/checks`, { changes });
      expect(response.statusCode).toBe(400);
    }
    expect(
      (await send(jar, 'PUT', '/api/shopping/2026-10-13/checks', { changes: [] })).statusCode,
    ).toBe(400);
  });

  it('S20: the shopping routes need a session', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: `/api/shopping/${WEEK}/checks`,
      headers: originHeaders,
      payload: { changes: [] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('S20: the export holds the plan, the own items and the computed list with ticks', async () => {
    const jar = await login();
    const recipe = recipeResponseSchema.parse(
      (
        await send(jar, 'POST', '/api/recipes', {
          title: 'Zupa',
          servings: 2,
          ingredients: [{ originalText: '200 g Twaróg' }, { originalText: 'sól do smaku' }],
          steps: ['Ugotuj.'],
        })
      ).json(),
    ).recipe;
    await send(jar, 'POST', '/api/meal-plan', {
      date: '2026-10-14',
      slot: 'lunch',
      recipeId: recipe.id,
      servings: 4,
    });
    const { item } = await addItem(jar);
    await send(jar, 'PUT', `/api/shopping/${WEEK}/checks`, {
      changes: [
        { itemKey: 'twaróg|g', checked: true, quantity: 400 },
        { customItemId: item.id, checked: true },
      ],
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/account/export',
      headers: jar.header(),
    });

    const data = accountExportSchema.parse(
      JSON.parse(readZip(response.rawPayload).get('dane.json')?.toString() ?? ''),
    );
    expect(data.mealPlan).toHaveLength(1);
    expect(data.shoppingCustomItems).toHaveLength(1);
    expect(data.shoppingChecks).toHaveLength(1);
    expect(data.shoppingLists).toEqual([
      {
        weekStart: WEEK,
        items: [
          { name: 'sól do smaku', quantity: null, unit: null, custom: false, checked: false },
          { name: 'papier do pieczenia', quantity: null, unit: null, custom: true, checked: true },
          { name: 'twaróg', quantity: 400, unit: 'g', custom: false, checked: true },
        ],
      },
    ]);
  });
});
