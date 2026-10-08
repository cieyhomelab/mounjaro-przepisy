import { describe, expect, it } from 'vitest';
import { parseSourceUrl, sourceUrlKey } from './sourceUrl';

describe('parseSourceUrl', () => {
  it('accepts http and https addresses and drops the fragment from the address', () => {
    expect(parseSourceUrl('  https://www.example.pl/przepis/kurczak?x=1#skladniki ')).toEqual({
      url: 'https://www.example.pl/przepis/kurczak?x=1',
      key: 'example.pl/przepis/kurczak',
      host: 'example.pl',
    });
  });

  it.each([
    '',
    '   ',
    'to nie jest adres',
    'kwestiasmaku.com/przepis',
    'ftp://example.pl/przepis',
    'javascript:alert(1)',
    'https://localhost/przepis',
    'https://user:pass@example.pl/przepis',
    'https://example.pl/a b',
  ])('rejects %j', (input) => {
    expect(parseSourceUrl(input)).toBeNull();
  });
});

describe('sourceUrlKey', () => {
  const key = 'example.pl/przepis/kurczak';

  it.each([
    'https://example.pl/przepis/kurczak',
    'http://example.pl/przepis/kurczak',
    'https://www.example.pl/przepis/kurczak',
    'HTTPS://WWW.EXAMPLE.PL/przepis/kurczak/',
    'https://example.pl/przepis/kurczak?utm_source=fb&id=2',
    'https://example.pl/przepis/kurczak#komentarze',
    'https://example.pl/przepis/kurczak/?a=1#b',
  ])('treats %s as the same page', (input) => {
    expect(sourceUrlKey(input)).toBe(key);
  });

  it('keeps different paths, hosts and ports apart', () => {
    expect(sourceUrlKey('https://example.pl/przepis/ryba')).not.toBe(key);
    expect(sourceUrlKey('https://example.com/przepis/kurczak')).not.toBe(key);
    expect(sourceUrlKey('https://example.pl/Przepis/kurczak')).not.toBe(key);
    expect(sourceUrlKey('http://example.pl:8080/przepis/kurczak')).toBe(
      'example.pl:8080/przepis/kurczak',
    );
  });

  it('gives the bare site a key without a trailing slash', () => {
    expect(sourceUrlKey('https://www.example.pl/')).toBe('example.pl');
  });

  it('is null for text that is not an address', () => {
    expect(sourceUrlKey('kurczak')).toBeNull();
  });
});
