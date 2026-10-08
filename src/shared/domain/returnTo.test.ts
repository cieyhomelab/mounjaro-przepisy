import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from './returnTo';

describe('sanitizeReturnTo', () => {
  it('keeps in-app paths with query and hash', () => {
    expect(sanitizeReturnTo('/przepisy/123?x=1#a')).toBe('/przepisy/123?x=1#a');
    expect(sanitizeReturnTo('/konto')).toBe('/konto');
  });

  it.each([
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    'przepisy',
    '/api/session',
    '/logowanie?returnTo=/',
    '/a\nb',
    '/' + 'a'.repeat(600),
    '',
  ])('falls back to the home screen for %j', (value) => {
    expect(sanitizeReturnTo(value)).toBe('/');
  });

  it('falls back for missing values', () => {
    expect(sanitizeReturnTo(undefined)).toBe('/');
    expect(sanitizeReturnTo(null)).toBe('/');
  });
});
