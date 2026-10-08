// Builds src/shared/nutrition/ingredients.pl.json from the mapping file and USDA FoodData Central
// (SR Legacy CSV files). Run it through scripts/build-nutrition-data.sh, not directly.
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP_FILE = path.join(ROOT, 'src/shared/nutrition/ingredients.map.json');
const OUT_FILE = path.join(ROOT, 'src/shared/nutrition/ingredients.pl.json');

// FoodData Central nutrient ids.
const NUTRIENTS = { '1008': 'kcal', '1003': 'proteinG', '1004': 'fatG', '1079': 'fiberG' } as const;

type MapEntry = {
  name: string;
  synonyms: string[];
  fdcId: number;
  fdcDescription: string;
  density?: number;
  unitGrams?: Record<string, number>;
  negligible?: boolean;
};

/** Splits one CSV line with quoted fields ("a, b","c""d"). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }
  fields.push(current);
  return fields;
}

async function readCsv(file: string, onRow: (row: Record<string, string>) => void) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of lines) {
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (!header) header = fields;
    else onRow(Object.fromEntries(header.map((name, index) => [name, fields[index] ?? ''])));
  }
}

const dataDir = process.argv[2];
if (!dataDir) {
  console.error('Usage: build.ts <directory with the SR Legacy CSV files>');
  process.exit(2);
}

const entries = JSON.parse(await readFile(MAP_FILE, 'utf8')) as MapEntry[];
const wanted = new Set(entries.map((entry) => String(entry.fdcId)));

const descriptions = new Map<string, string>();
await readCsv(path.join(dataDir, 'food.csv'), (row) => {
  if (wanted.has(row.fdc_id ?? '')) descriptions.set(row.fdc_id ?? '', row.description ?? '');
});

const values = new Map<string, Partial<Record<(typeof NUTRIENTS)[keyof typeof NUTRIENTS], number>>>();
await readCsv(path.join(dataDir, 'food_nutrient.csv'), (row) => {
  const id = row.fdc_id ?? '';
  const key = NUTRIENTS[(row.nutrient_id ?? '') as keyof typeof NUTRIENTS];
  if (!wanted.has(id) || !key) return;
  values.set(id, { ...values.get(id), [key]: Number(row.amount) });
});

const round = (value: number) => Math.round(value * 100) / 100;
const table = entries.map((entry) => {
  const id = String(entry.fdcId);
  if (descriptions.get(id) !== entry.fdcDescription) {
    throw new Error(`FDC ${id} is "${descriptions.get(id)}", the mapping expects "${entry.fdcDescription}"`);
  }
  const found = values.get(id) ?? {};
  for (const key of ['kcal', 'proteinG', 'fatG'] as const) {
    if (found[key] === undefined) throw new Error(`FDC ${id} has no ${key}`);
  }
  return {
    name: entry.name,
    synonyms: entry.synonyms,
    fdcId: entry.fdcId,
    per100g: {
      kcal: round(found.kcal ?? 0),
      proteinG: round(found.proteinG ?? 0),
      fatG: round(found.fatG ?? 0),
      // SR Legacy leaves fibre empty for foods that have none.
      fiberG: round(found.fiberG ?? 0),
    },
    ...(entry.density === undefined ? {} : { density: entry.density }),
    ...(entry.unitGrams ? { unitGrams: entry.unitGrams } : {}),
    ...(entry.negligible ? { negligible: true } : {}),
  };
});

await writeFile(OUT_FILE, `${JSON.stringify(table, null, 2)}\n`);
console.log(`Wrote ${table.length} ingredients to ${path.relative(ROOT, OUT_FILE)}`);
