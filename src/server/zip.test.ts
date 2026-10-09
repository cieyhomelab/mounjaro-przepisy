import { describe, expect, it } from 'vitest';
import { readZip } from '../../tests/e2e/zipReader';
import { createZip } from './zip';

describe('createZip', () => {
  it('stores compressed and plain entries that read back unchanged', () => {
    const json = Buffer.from(JSON.stringify({ tytuł: 'Zupa żurek', pole: 'x'.repeat(5000) }));
    const binary = Buffer.from([0, 1, 2, 3, 255, 254, 253]);

    const files = readZip(
      createZip([
        { name: 'dane.json', data: json, compress: true },
        { name: 'zdjecia/ąę.webp', data: binary },
      ]),
    );

    expect([...files.keys()]).toEqual(['dane.json', 'zdjecia/ąę.webp']);
    expect(files.get('dane.json')).toEqual(json);
    expect(files.get('zdjecia/ąę.webp')).toEqual(binary);
  });

  it('writes an empty archive', () => {
    expect(readZip(createZip([])).size).toBe(0);
  });
});
