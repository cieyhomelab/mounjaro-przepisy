import { describe, expect, it } from 'vitest';
import { formatWeight, parseWeightInput, sortWellbeingEntries, weightChart } from './wellbeing';

const box = { width: 100, height: 50, padding: 10 };

describe('S24: weightChart', () => {
  it('has no chart for fewer than two entries with a weight', () => {
    expect(weightChart([], box)).toBeNull();
    expect(weightChart([{ date: '2026-10-01', weightKg: 80 }], box)).toBeNull();
    expect(
      weightChart(
        [
          { date: '2026-10-01', weightKg: 80 },
          { date: '2026-10-02', weightKg: null },
        ],
        box,
      ),
    ).toBeNull();
  });

  it('puts the oldest day on the left and the heaviest weight at the top', () => {
    const chart = weightChart(
      [
        { date: '2026-10-11', weightKg: 78 },
        { date: '2026-10-01', weightKg: 80 },
        { date: '2026-10-06', weightKg: null },
        { date: '2026-10-06', weightKg: 79 },
      ],
      box,
    );
    expect(chart?.minKg).toBe(78);
    expect(chart?.maxKg).toBe(80);
    expect(chart?.points).toEqual([
      { date: '2026-10-01', weightKg: 80, x: 10, y: 10 },
      { date: '2026-10-06', weightKg: 79, x: 50, y: 25 },
      { date: '2026-10-11', weightKg: 78, x: 90, y: 40 },
    ]);
  });

  it('draws equal weights as a level line in the middle', () => {
    const chart = weightChart(
      [
        { date: '2026-10-01', weightKg: 80 },
        { date: '2026-10-02', weightKg: 80 },
      ],
      box,
    );
    expect(chart?.points.map((point) => point.y)).toEqual([25, 25]);
  });
});

describe('S24: weight and entries helpers', () => {
  it('parses a weight with a comma or a dot and refuses the rest', () => {
    expect(parseWeightInput('82,5')).toBe(82.5);
    expect(parseWeightInput(' 82.25 ')).toBe(82.25);
    for (const bad of ['', 'abc', '82,555', '-1', '8 2', '82 kg'])
      expect(parseWeightInput(bad)).toBeNull();
    expect(formatWeight(82.5)).toBe('82,5');
  });

  it('sorts newest day first', () => {
    const sorted = sortWellbeingEntries([
      { date: '2026-10-01' },
      { date: '2026-10-09' },
      { date: '2026-09-30' },
    ]);
    expect(sorted.map((entry) => entry.date)).toEqual(['2026-10-09', '2026-10-01', '2026-09-30']);
  });
});
