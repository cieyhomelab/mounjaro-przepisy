import { describe, expect, it } from 'vitest';
import { checkCollectionName, collectionNameKey } from './collectionName';

describe('checkCollectionName', () => {
  it('accepts a new name and returns it trimmed with single spaces', () => {
    expect(checkCollectionName('  Na   weekend ', ['Obiady'])).toEqual({
      ok: true,
      name: 'Na weekend',
    });
  });

  it('rejects an empty or blank name', () => {
    expect(checkCollectionName('', [])).toEqual({ ok: false, problem: 'empty' });
    expect(checkCollectionName('   ', [])).toEqual({ ok: false, problem: 'empty' });
  });

  it('rejects a name taken by another collection, ignoring letter case and Polish letters case', () => {
    expect(checkCollectionName('obiady', ['Obiady'])).toEqual({ ok: false, problem: 'duplicate' });
    expect(checkCollectionName('ŁATWE', ['łatwe'])).toEqual({ ok: false, problem: 'duplicate' });
  });

  it('rejects a name longer than 60 characters', () => {
    expect(checkCollectionName('a'.repeat(61), [])).toEqual({ ok: false, problem: 'too_long' });
    expect(checkCollectionName('a'.repeat(60), []).ok).toBe(true);
  });

  it('builds the same key for names that differ in case and spacing', () => {
    expect(collectionNameKey(' Szybkie  Obiady')).toBe(collectionNameKey('szybkie obiady'));
  });
});
