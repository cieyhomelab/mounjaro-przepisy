export type NavItemId = 'recipes' | 'planner' | 'shopping' | 'health';
export type AppArea = 'culinary' | 'health';

export type NavItem = { id: NavItemId; label: string; to: string };

/** The four items of the main navigation, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'recipes', label: 'Przepisy', to: '/' },
  { id: 'planner', label: 'Planer', to: '/planer' },
  // No "tydzien" parameter: the shopping list of the current week.
  { id: 'shopping', label: 'Zakupy', to: '/zakupy' },
  // Until the Health screen exists (stage 5.5) this is the dose log.
  { id: 'health', label: 'Zdrowie', to: '/dawki' },
];

export type Placement = { item: NavItemId | null; area: AppArea };

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/** Which navigation item is active on a path, and which part of the app the screen belongs to. */
export function placementOf(pathname: string): Placement {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || under(path, '/szukaj') || under(path, '/kolekcje')) {
    return { item: 'recipes', area: 'culinary' };
  }
  if (path === '/przepisy/nowy' || path === '/przepisy/z-linku') {
    return { item: 'recipes', area: 'culinary' };
  }
  if (/^\/przepisy\/[^/]+(\/edycja)?$/.test(path)) return { item: 'recipes', area: 'culinary' };
  if (under(path, '/planer')) return { item: 'planner', area: 'culinary' };
  if (under(path, '/zakupy')) return { item: 'shopping', area: 'culinary' };
  if (
    under(path, '/zdrowie') ||
    under(path, '/dawki') ||
    under(path, '/waga') ||
    under(path, '/licznik')
  ) {
    return { item: 'health', area: 'health' };
  }
  // Settings, account, unknown paths and the cooking mode (outside the shell).
  return { item: null, area: 'culinary' };
}
