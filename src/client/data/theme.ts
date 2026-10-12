// The colour theme: "System", "Light" or "Dark". The choice lives only on this device
// (localStorage, so it survives logout and is readable before the first paint, see
// public/theme-init.js, which implements the same rule).

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ThemeResult = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mp-theme';

/** The `bg` token of each mode, for <meta name="theme-color">. */
export const THEME_COLORS: Record<ThemeResult, string> = { light: '#FBF8F4', dark: '#1C1816' };

/** An explicit choice wins; "System" follows the system mode; unknown system mode means light. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean | null): ThemeResult {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemDark === true ? 'dark' : 'light';
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage is unavailable: the choice applies until the page is closed.
  }
}

const systemQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Writes the result to <html data-theme> and to <meta name="theme-color">. */
export function applyTheme(choice: ThemeChoice = readThemeChoice()): ThemeResult {
  const result = resolveTheme(choice, systemQuery()?.matches ?? null);
  document.documentElement.setAttribute('data-theme', result);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[result]);
  return result;
}

/** Stores a new choice and applies it at once. */
export function setThemeChoice(choice: ThemeChoice): void {
  writeThemeChoice(choice);
  applyTheme(choice);
}

/** Applies the stored choice and follows later changes of the system mode. Returns a stop function. */
export function startThemeSync(): () => void {
  applyTheme();
  const query = systemQuery();
  if (!query) return () => undefined;
  const onChange = () => applyTheme();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
