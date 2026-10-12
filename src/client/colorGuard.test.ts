import { describe, expect, it } from 'vitest';

// Every client source file (tests excluded) as text.
const sources = Object.entries(
  import.meta.glob<string>(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

/** The browser's theme-color meta tag needs literal values; tokens do not reach it. */
const LITERAL_COLOR_ALLOWED = ['./data/theme.ts'];

const DEFAULT_PALETTE = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];
const COLOR_UTILITIES =
  'bg|text|border|ring|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow|placeholder';
const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:${COLOR_UTILITIES})-(?:${DEFAULT_PALETTE.join('|')})-\\d{2,3}(?![\\w-])`,
);
const PLAIN_COLOR_CLASS = new RegExp(`(?<![\\w-])(?:${COLOR_UTILITIES})-(?:black|white)(?![\\w-])`);
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
const DARK_VARIANT = /(?<![\w-])dark:[\w[!-]/;

const offenders = (pattern: RegExp, skip: string[] = []) =>
  sources
    .filter(([file]) => !skip.includes(file))
    .filter(([, text]) => pattern.test(text))
    .map(([file]) => file);

describe('colour guard (S29)', () => {
  it('scans the client sources', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it('uses no colour of the default Tailwind palette', () => {
    expect(offenders(PALETTE_CLASS)).toEqual([]);
    expect(offenders(PLAIN_COLOR_CLASS)).toEqual([]);
  });

  it('writes no colour literal into the code', () => {
    expect(offenders(LITERAL_COLOR, LITERAL_COLOR_ALLOWED)).toEqual([]);
  });

  it('uses no dark: variant (the dark mode comes from the tokens)', () => {
    expect(offenders(DARK_VARIANT)).toEqual([]);
  });

  it('catches a violation', () => {
    expect(PALETTE_CLASS.test('className="bg-red-50 p-2"')).toBe(true);
    expect(PALETTE_CLASS.test('className="bg-surface text-ink-muted"')).toBe(false);
    expect(LITERAL_COLOR.test("style={{ color: '#fff' }}")).toBe(true);
    expect(DARK_VARIANT.test('dark:bg-surface')).toBe(true);
  });
});
