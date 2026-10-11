import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  readThemeChoice,
  resolveTheme,
  setThemeChoice,
  THEME_STORAGE_KEY,
} from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('resolveTheme', () => {
  it.each([
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['light', null, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
    ['dark', null, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['system', null, 'light'],
  ] as const)('choice %s with system dark=%s gives %s', (choice, systemDark, expected) => {
    expect(resolveTheme(choice, systemDark)).toBe(expected);
  });
});

describe('stored choice', () => {
  it('is "system" when nothing was chosen or the value is unknown', () => {
    expect(readThemeChoice()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemeChoice()).toBe('system');
  });

  it('stores light and dark and removes the key for "system"', () => {
    setThemeChoice('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setThemeChoice('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('applies light when the environment gives no system mode', () => {
    expect(applyTheme('system')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
