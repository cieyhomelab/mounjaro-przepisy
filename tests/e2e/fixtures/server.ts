// Test pages for the e2e stack (compose.e2e.yml, service "fixtures"). Stands in for the sites of
// recipe authors: the app fetches these pages with its real page fetcher.
// Run with `node server.ts` (Node 24 strips the types).
import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const PAGES_DIR = path.join(import.meta.dirname, 'pages');

// A valid 1×1 PNG, enough for the photo pipeline.
const IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Page names from the specification ("czytelna", "bez oceny", …) mapped to files in pages/. */
const PAGES = new Set([
  'czytelna',
  'bez-oceny',
  'bez-liczby-porcji',
  'bez-zdjecia',
  'bez-skladnikow',
  'nie-przepis',
  'z-wartosciami-odzywczymi',
  'z-czescia-wartosci',
]);

// Search sites. The same server answers under several host names (aliases in compose.e2e.yml);
// the host decides which site it plays.
const KURCZAK_RATINGS = [3.1, 4.9, 4.0, 4.5, 3.8, 4.2, 2.5, 4.7, 3.3, 4.4, 3.0, 4.8];

const link = (href: string) => `<a href="${href}">przepis</a>`;
const resultsPage = (links: string[]) =>
  `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Wyniki</title></head><body>${links.map(link).join('\n')}</body></html>`;

function recipePage(title: string, ratingValue: number, bestRating: number, ratingCount: number) {
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    image: ['/img/danie.png'],
    recipeYield: '2 porcje',
    recipeIngredient: ['200 g piersi z kurczaka'],
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Usmaż kurczaka.' }],
    aggregateRating: { '@type': 'AggregateRating', ratingValue, ratingCount, bestRating },
  };
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body><h1>${title}</h1></body></html>`;
}

/** Front page of a site that says how it is searched (schema.org SearchAction) and what it is called. */
const searchableFrontPage = (host: string) => {
  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Przeszukiwalny',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `http://${host}:8080/szukaj?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Przeszukiwalny</title><script type="application/ld+json">${JSON.stringify(site)}</script></head><body><h1>Przeszukiwalny</h1></body></html>`;
};

/** A site without search: every address answers with a page that has no recipe in it. */
const UNSEARCHABLE_PAGE =
  '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Nieprzeszukiwalny</title></head><body><h1>Nieprzeszukiwalny</h1><a href="/o-nas">O nas</a></body></html>';

/** Answers for the search sites; null when the request is not for one of them. */
function searchSiteAnswer(host: string, url: URL): string | null {
  const query = (url.searchParams.get('q') ?? '').toLowerCase();
  const searching = url.pathname === '/szukaj';
  const number = Number(/^\/przepis\/[a-z]+-(\d+)$/.exec(url.pathname)?.[1]);
  if (host === 'nieprzeszukiwalny.test') return UNSEARCHABLE_PAGE;
  if (host === 'przeszukiwalny.test') {
    if (url.pathname === '/') return searchableFrontPage(host);
    if (searching) {
      if (query.includes('kurczak')) {
        return resultsPage(Array.from({ length: 12 }, (_, i) => `/przepis/kurczak-${i + 1}`));
      }
      if (query.includes('obiad')) {
        return resultsPage(['/przepisy/czytelna', '/przepisy/bez-oceny', '/przepisy/nie-przepis']);
      }
      if (query.includes('braki')) {
        return resultsPage(['/przepisy/bez-skladnikow', '/przepisy/bez-liczby-porcji']);
      }
      return resultsPage([]);
    }
    const rating = KURCZAK_RATINGS[number - 1];
    if (url.pathname.startsWith('/przepis/kurczak-') && rating !== undefined) {
      return recipePage(`Kurczak ${number}`, rating, 5, number * 10);
    }
  }
  if (host === 'skala10.test') {
    if (searching) return resultsPage(['/przepis/skala-1', '/przepis/skala-2']);
    if (number === 1) return recipePage('Danie z oceną z dziesięciu 1', 8, 10, 40);
    if (number === 2) return recipePage('Danie z oceną z dziesięciu 2', 9.5, 10, 12);
  }
  return null;
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer) {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
}

const server = createServer((request, response) => {
  const host = (request.headers.host ?? '').split(':')[0] ?? '';
  const url = new URL(request.url ?? '/', 'http://fixtures.test');
  const pathname = url.pathname;
  if (host === 'niedostepny.test') {
    // "niedostępny": the site never answers.
    request.on('close', () => response.destroy());
    return;
  }
  const searchAnswer = searchSiteAnswer(host, url);
  if (searchAnswer !== null) return send(response, 200, 'text/html; charset=utf-8', searchAnswer);
  const page = /^\/przepisy\/([a-z-]+)\/?$/.exec(pathname)?.[1];

  if (page && PAGES.has(page)) {
    readFile(path.join(PAGES_DIR, `${page}.html`)).then(
      (html) => send(response, 200, 'text/html; charset=utf-8', html),
      () => send(response, 500, 'text/plain', 'missing page'),
    );
    return;
  }
  if (page === 'niedostepna') {
    // "niedostępna": the connection stays open and no answer ever comes.
    request.on('close', () => response.destroy());
    return;
  }
  if (page === 'blad') {
    send(response, 500, 'text/plain', 'błąd serwera');
    return;
  }
  if (pathname === '/przekierowanie/czytelna') {
    response.writeHead(302, { location: '/przepisy/czytelna' });
    response.end();
    return;
  }
  if (pathname === '/img/danie.png') {
    send(response, 200, 'image/png', IMAGE);
    return;
  }
  send(response, 404, 'text/plain', 'nie ma takiej strony');
});

server.listen(PORT, '0.0.0.0');
process.once('SIGTERM', () => server.close(() => process.exit(0)));
