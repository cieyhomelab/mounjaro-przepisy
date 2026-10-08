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

function send(response: ServerResponse, status: number, type: string, body: string | Buffer) {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://fixtures.test').pathname;
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
