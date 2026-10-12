import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, placementOf } from './navigation';

describe('placementOf', () => {
  it.each([
    ['/', 'recipes', 'culinary'],
    ['/przepisy/nowy', 'recipes', 'culinary'],
    ['/przepisy/z-linku', 'recipes', 'culinary'],
    ['/przepisy/abc', 'recipes', 'culinary'],
    ['/przepisy/abc/edycja', 'recipes', 'culinary'],
    ['/szukaj', 'recipes', 'culinary'],
    ['/kolekcje', 'recipes', 'culinary'],
    ['/planer', 'planner', 'culinary'],
    ['/zakupy', 'shopping', 'culinary'],
    ['/zdrowie', 'health', 'health'],
    ['/dawki', 'health', 'health'],
    ['/dawki/przypomnienie', 'health', 'health'],
    ['/dawki/nowy', 'health', 'health'],
    ['/dawki/abc/edycja', 'health', 'health'],
    ['/waga', 'health', 'health'],
    ['/waga/nowy', 'health', 'health'],
    ['/licznik', 'health', 'health'],
    ['/ustawienia', null, 'culinary'],
    ['/ustawienia/progi-filtrow', null, 'culinary'],
    ['/ustawienia/moje-dane', null, 'culinary'],
    ['/konto', null, 'culinary'],
    ['/nie-ma-takiej', null, 'culinary'],
    ['/logowanie', null, 'culinary'],
    ['/przepisy/abc/gotuj', null, 'culinary'],
  ])('%s → %s, %s', (path, item, area) => {
    expect(placementOf(path)).toEqual({ item, area });
  });

  it('has four items and none of them is Ustawienia, Konto or Wyloguj', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Przepisy',
      'Planer',
      'Zakupy',
      'Zdrowie',
    ]);
  });

  it('points Zakupy at the current week and Zdrowie at the dose log', () => {
    expect(NAV_ITEMS.find((item) => item.id === 'shopping')?.to).toBe('/zakupy');
    expect(NAV_ITEMS.find((item) => item.id === 'health')?.to).toBe('/dawki');
  });
});
