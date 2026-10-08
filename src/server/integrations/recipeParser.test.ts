import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRating, parseRecipePage, parseServings } from './recipeParser';

const root = path.resolve(import.meta.dirname, '../../..');
const testPage = (name: string) =>
  readFileSync(path.join(root, 'tests/e2e/fixtures/pages', `${name}.html`), 'utf8');
const sitePage = (name: string) =>
  readFileSync(path.join(root, 'tests/fixtures/sites', `${name}.html`), 'utf8');

const BASE = 'http://fixtures.test:8080/przepisy/strona';

describe('test pages from the specification', () => {
  it('czytelna: reads title, photo, ingredients, steps, servings and rating', () => {
    const parsed = parseRecipePage(testPage('czytelna'), BASE);
    expect(parsed).toMatchObject({
      title: 'Kurczak pieczony z cukinią',
      imageUrl: 'http://fixtures.test:8080/img/danie.png',
      servings: 4,
      rating: 4.6,
      ratingCount: 128,
      nutrition: null,
      siteName: 'Smaczne Testy',
      hasRecipeData: true,
    });
    expect(parsed.ingredients).toEqual([
      '500 g piersi z kurczaka',
      '2 cukinie',
      '2 łyżki oliwy',
      '1 łyżeczka papryki słodkiej',
      'sól i pieprz do smaku',
    ]);
    expect(parsed.steps).toEqual([
      'Pokrój kurczaka i cukinię w kostkę.',
      'Wymieszaj z oliwą i przyprawami.',
      'Piecz 25 minut w 200 stopniach.',
    ]);
  });

  it('bez oceny: reads the microdata and gives no rating', () => {
    const parsed = parseRecipePage(testPage('bez-oceny'), BASE);
    expect(parsed).toMatchObject({
      title: 'Zupa krem z dyni',
      servings: 3,
      rating: null,
      ratingCount: null,
      imageUrl: 'http://fixtures.test:8080/img/danie.png',
    });
    expect(parsed.ingredients).toHaveLength(3);
    expect(parsed.steps).toEqual([
      'Podsmaż cebulę i dynię.',
      'Zalej bulionem i gotuj 20 minut.',
      'Zblenduj na gładki krem.',
    ]);
  });

  it('bez liczby porcji: no servings, instructions split into lines', () => {
    const parsed = parseRecipePage(testPage('bez-liczby-porcji'), BASE);
    expect(parsed.servings).toBeNull();
    expect(parsed.title).toBe('Jajecznica ze szpinakiem');
    expect(parsed.steps).toEqual(['Rozgrzej masło.', 'Dodaj szpinak i jajka.', 'Smaż do ścięcia.']);
    expect(parsed).toMatchObject({ rating: 4, ratingCount: 1 });
  });

  it('bez zdjęcia: no photo, rating converted from the 0–10 scale, sections flattened', () => {
    const parsed = parseRecipePage(testPage('bez-zdjecia'), BASE);
    expect(parsed.imageUrl).toBeNull();
    expect(parsed).toMatchObject({ servings: 2, rating: 4.5, ratingCount: 40 });
    expect(parsed.steps).toEqual(['Pokrusz twaróg.', 'Dodaj posiekane warzywa i wymieszaj.']);
  });

  it('bez składników: has the recipe but no ingredients', () => {
    const parsed = parseRecipePage(testPage('bez-skladnikow'), BASE);
    expect(parsed).toMatchObject({ title: 'Ryba w sosie', servings: 2, hasRecipeData: true });
    expect(parsed.ingredients).toEqual([]);
    expect(parsed.steps).toHaveLength(2);
  });

  it('nie-przepis: no recipe data, only the page title', () => {
    const parsed = parseRecipePage(testPage('nie-przepis'), BASE);
    expect(parsed).toMatchObject({
      title: 'Nasz blog o gotowaniu',
      hasRecipeData: false,
      ingredients: [],
      steps: [],
      servings: null,
      rating: null,
    });
  });

  it('z wartościami odżywczymi: reads all four values and a decimal comma', () => {
    const parsed = parseRecipePage(testPage('z-wartosciami-odzywczymi'), BASE);
    expect(parsed.nutrition).toEqual({ kcal: 310, proteinG: 21.5, fatG: 22, fiberG: 3 });
    expect(parsed).toMatchObject({ servings: 2, rating: 4.5, ratingCount: 12 });
  });

  it('z częścią wartości: reads only the values the page states', () => {
    const parsed = parseRecipePage(testPage('z-czescia-wartosci'), BASE);
    expect(parsed.nutrition).toMatchObject({ kcal: 240, proteinG: 26 });
    expect(parsed.nutrition?.fatG ?? null).toBeNull();
    expect(parsed.nutrition?.fiberG ?? null).toBeNull();
  });
});

describe('replicas of the starter services', () => {
  it('aniagotuje: @graph, ImageObject, yield as a list', () => {
    const parsed = parseRecipePage(sitePage('aniagotuje'), 'https://aniagotuje.example/udka');
    expect(parsed).toMatchObject({
      title: 'Pieczone udka z ziołami',
      imageUrl: 'https://cdn.example.test/udka.jpg',
      servings: 6,
      rating: 4.78,
      ratingCount: 1234,
      nutrition: { kcal: 320 },
      siteName: 'aniagotuje.example',
    });
    expect(parsed.ingredients).toHaveLength(4);
    expect(parsed.steps).toEqual([
      'Natrzyj udka oliwą i ziołami.',
      'Piecz 45 minut w 190 stopniach.',
    ]);
  });

  it('kwestiasmaku: microdata with a nested rating', () => {
    const parsed = parseRecipePage(
      sitePage('kwestiasmaku'),
      'https://kwestia.example/przepis/leczo',
    );
    expect(parsed).toMatchObject({
      title: 'Leczo z cukinią',
      imageUrl: 'https://kwestia.example/sites/default/files/leczo.jpg',
      servings: 4,
      rating: 4.5,
      ratingCount: 57,
      siteName: 'Kwestia Smaku (replika)',
    });
    expect(parsed.ingredients).toEqual(['2 papryki', '1 cukinia', '400 g pomidorów z puszki']);
    expect(parsed.steps).toEqual(['Podsmaż paprykę i cukinię.', 'Dodaj pomidory i duś 15 minut.']);
  });

  it('przepisy: protocol-relative photo and a rating on the 0–10 scale', () => {
    const parsed = parseRecipePage(sitePage('przepisy'), 'https://przepisy.example/kasza');
    expect(parsed).toMatchObject({
      title: 'Kasza jaglana z warzywami',
      imageUrl: 'https://cdn.example.test/kasza.jpg',
      servings: 3,
      rating: 4.2,
      ratingCount: 210,
      siteName: 'Przepisy (replika)',
    });
  });

  it('doradcasmaku: a list of blocks and instructions as one text', () => {
    const parsed = parseRecipePage(sitePage('doradcasmaku'), 'https://doradca.example/ryba');
    expect(parsed).toMatchObject({
      title: 'Pieczona ryba z cytryną',
      imageUrl: 'https://cdn.example.test/ryba-16x9.jpg',
      servings: 2,
      rating: 4.5,
      ratingCount: 12,
    });
    expect(parsed.steps).toEqual([
      'Ułóż rybę w naczyniu.',
      'Polej sokiem z cytryny.',
      'Piecz 15 minut.',
    ]);
  });
});

describe('Open Graph fallback and broken data', () => {
  it('takes the title and photo from Open Graph when there is no recipe data', () => {
    const html =
      '<html><head><meta property="og:title" content="Tytuł OG"><meta property="og:image" content="/a.jpg"></head></html>';
    expect(parseRecipePage(html, 'https://example.test/x')).toMatchObject({
      title: 'Tytuł OG',
      imageUrl: 'https://example.test/a.jpg',
      hasRecipeData: false,
    });
  });

  it('skips a broken JSON-LD block and still reads the next one', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not json</script>
      <script type="application/ld+json">{"@type":"Recipe","name":"Dobry","recipeIngredient":["a"],"recipeInstructions":["b"]}</script>
      </head></html>`;
    expect(parseRecipePage(html, 'https://example.test/x')).toMatchObject({
      title: 'Dobry',
      ingredients: ['a'],
      steps: ['b'],
    });
  });

  it('does not treat javascript: photo addresses as photos', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Recipe","name":"X","image":"javascript:alert(1)"}</script>';
    expect(parseRecipePage(html, 'https://example.test/x').imageUrl).toBeNull();
  });
});

describe('parseServings', () => {
  it.each([
    ['4 porcje', 4],
    [4, 4],
    [['6', '6 porcji'], 6],
    ['2,5', 2.5],
    ['0', null],
    ['150', null],
    ['2,3', null],
    ['kilka', null],
    [undefined, null],
  ])('%j → %j', (input, expected) => {
    expect(parseServings(input)).toBe(expected);
  });
});

describe('parseRating', () => {
  it('scales to 0–5 using the best rating', () => {
    expect(parseRating({ ratingValue: '8', bestRating: '10', ratingCount: '5' })).toEqual({
      rating: 4,
      count: 5,
    });
    expect(parseRating({ ratingValue: 3, bestRating: 5, worstRating: 1 }).rating).toBe(3);
  });

  it('keeps the value within 0–5 and ignores nonsense', () => {
    expect(parseRating({ ratingValue: 9, bestRating: 5 }).rating).toBe(5);
    expect(parseRating({ ratingValue: 'brak' }).rating).toBeNull();
    expect(parseRating('4.5')).toEqual({ rating: null, count: null });
    expect(parseRating({ ratingValue: 4, bestRating: 0 }).rating).toBeNull();
  });

  it('uses the review count when there is no rating count', () => {
    expect(parseRating({ ratingValue: 4, reviewCount: 9 }).count).toBe(9);
  });
});
