import { describe, expect, it } from 'vitest';
import { INJECTION_SITES, type DoseEntry } from '../contracts/dose';
import { parseDoseInput, sortDoseEntries, suggestSite } from './doseSites';

let counter = 0;
const entry = (overrides: Partial<DoseEntry>): DoseEntry => {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    date: '2026-10-01',
    doseMg: 2.5,
    site: 'abdomen_left',
    note: null,
    createdAt: `2026-10-01T10:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    ...overrides,
  };
};

describe('suggestSite', () => {
  it('has no suggestion for an empty journal', () => {
    expect(suggestSite([])).toBeNull();
  });

  it('suggests the first site of the list that was never used', () => {
    const result = suggestSite([
      entry({ site: 'abdomen_left', date: '2026-09-17' }),
      entry({ site: 'thigh_left', date: '2026-09-24' }),
    ]);
    expect(result?.site).toBe('abdomen_right');
    expect(result?.last).toEqual({ site: 'thigh_left', date: '2026-09-24' });
  });

  it('skips used sites however they were entered', () => {
    const entries = [
      entry({ site: 'abdomen_right', date: '2026-09-01' }),
      entry({ site: 'abdomen_left', date: '2026-09-08' }),
    ];
    expect(suggestSite(entries)?.site).toBe('thigh_left');
  });

  it('suggests the site whose latest use is the oldest once all six were used', () => {
    const days = [
      '2026-09-10',
      '2026-09-03',
      '2026-09-24',
      '2026-09-17',
      '2026-10-01',
      '2026-10-08',
    ];
    const entries = INJECTION_SITES.map((site, index) => entry({ site, date: days[index] ?? '' }));
    expect(suggestSite(entries)?.site).toBe('abdomen_right');
  });

  it('judges a site by its latest use, not its first', () => {
    const entries = [
      ...INJECTION_SITES.map((site, index) => entry({ site, date: `2026-08-0${index + 1}` })),
      // The first site is used again, so the second one is now the oldest.
      entry({ site: 'abdomen_left', date: '2026-09-01' }),
    ];
    expect(suggestSite(entries)?.site).toBe('abdomen_right');
  });

  it('prefers the earlier site of the list on a tie', () => {
    const entries = INJECTION_SITES.map((site) => entry({ site, date: '2026-09-01' }));
    expect(suggestSite(entries)?.site).toBe('abdomen_left');
  });

  it('names the entry added later as the last one when two share a day', () => {
    const earlier = entry({
      site: 'arm_left',
      date: '2026-10-08',
      createdAt: '2026-10-08T08:00:00.000Z',
    });
    const later = entry({
      site: 'arm_right',
      date: '2026-10-08',
      createdAt: '2026-10-08T09:00:00.000Z',
    });
    expect(suggestSite([later, earlier])?.last.site).toBe('arm_right');
  });
});

describe('sortDoseEntries', () => {
  it('puts the newest day first and, within a day, the entry added later', () => {
    const old = entry({ date: '2026-09-01' });
    const first = entry({ date: '2026-10-01', createdAt: '2026-10-01T08:00:00.000Z' });
    const second = entry({ date: '2026-10-01', createdAt: '2026-10-01T09:00:00.000Z' });
    expect(sortDoseEntries([old, first, second]).map((item) => item.id)).toEqual([
      second.id,
      first.id,
      old.id,
    ]);
  });
});

describe('parseDoseInput', () => {
  it('reads numbers with a comma or a dot', () => {
    expect(parseDoseInput('2,5')).toBe(2.5);
    expect(parseDoseInput(' 5 ')).toBe(5);
    expect(parseDoseInput('7.5')).toBe(7.5);
    expect(parseDoseInput('0')).toBe(0);
  });

  it('refuses everything else', () => {
    for (const text of ['', 'abc', '-2', '2,5mg', '1e3', '1,2345', '2,,5'])
      expect(parseDoseInput(text)).toBeNull();
  });
});
