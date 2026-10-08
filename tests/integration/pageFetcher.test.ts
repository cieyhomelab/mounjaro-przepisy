import { gzipSync } from 'node:zlib';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FetchError,
  createPageFetcher,
  type PageFetcherOptions,
} from '../../src/server/integrations/pageFetcher';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let port = 0;
let handler: Handler = () => undefined;

beforeAll(async () => {
  server = createServer((request, response) => handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const base = () => `http://127.0.0.1:${port}`;

const fetcher = (options: Partial<PageFetcherOptions> = {}) =>
  createPageFetcher({ timeoutMs: 2000, allowPrivateNetwork: true, ...options });

const failureOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(FetchError);
  return (error as FetchError).reason;
};

describe('page fetcher: private addresses', () => {
  it.each([
    ['loopback', () => `http://127.0.0.1:${port}/`],
    ['IPv6 loopback', () => `http://[::1]:${port}/`],
    ['link-local metadata address', () => 'http://169.254.169.254/latest/meta-data'],
    ['private range', () => 'http://10.0.0.5/'],
    ['a name that resolves to loopback', () => `http://localhost:${port}/`],
  ])('refuses %s without connecting', async (_name, address) => {
    let connected = false;
    handler = (_request, response) => {
      connected = true;
      response.end('<html></html>');
    };

    const reason = await failureOf(
      createPageFetcher({ timeoutMs: 2000, allowPrivateNetwork: false }).fetch(address(), 'html'),
    );

    expect(reason).toBe('blocked');
    expect(connected).toBe(false);
  });

  it('refuses a name whose address is private even when the name looks public', async () => {
    const reason = await failureOf(
      createPageFetcher({
        timeoutMs: 2000,
        allowPrivateNetwork: false,
        resolve: () => Promise.resolve([{ address: '10.1.2.3', family: 4 }]),
      }).fetch('http://public-looking.test/przepis', 'html'),
    );

    expect(reason).toBe('blocked');
  });

  it('refuses a redirect to a private address', async () => {
    handler = (_request, response) => {
      response.writeHead(302, { location: `http://internal.test:${port}/tajne` });
      response.end();
    };

    const reason = await failureOf(
      createPageFetcher({
        timeoutMs: 2000,
        allowPrivateNetwork: false,
        // Only 127.0.0.2 counts as private here, so the first hop (127.0.0.1) is reachable.
        isBlockedAddress: (address) => address === '127.0.0.2',
        resolve: (hostname) =>
          Promise.resolve([
            { address: hostname === 'internal.test' ? '127.0.0.2' : '127.0.0.1', family: 4 },
          ]),
      }).fetch(`http://start.test:${port}/`, 'html'),
    );

    expect(reason).toBe('blocked');
  });

  it('refuses schemes other than http and https', async () => {
    expect(await failureOf(fetcher().fetch('file:///etc/passwd', 'html'))).toBe('invalid_url');
    expect(await failureOf(fetcher().fetch('ftp://example.test/a', 'html'))).toBe('invalid_url');
    expect(await failureOf(fetcher().fetch('not an address', 'html'))).toBe('invalid_url');
  });
});

describe('page fetcher: limits', () => {
  it('gives up after the time limit when the server never answers', async () => {
    handler = () => undefined;
    const started = Date.now();

    const reason = await failureOf(fetcher({ timeoutMs: 300 }).fetch(`${base()}/`, 'html'));

    expect(reason).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('gives up when the answer starts but stalls', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write('<html>');
    };

    const reason = await failureOf(fetcher({ timeoutMs: 300 }).fetch(`${base()}/`, 'html'));

    expect(reason).toBe('timeout');
  });

  it('refuses a page larger than the limit, declared or streamed', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('x'.repeat(5000));
    };
    expect(await failureOf(fetcher({ maxHtmlBytes: 1000 }).fetch(`${base()}/`, 'html'))).toBe(
      'too_large',
    );

    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write('x'.repeat(600));
      response.end('x'.repeat(600));
    };
    expect(await failureOf(fetcher({ maxHtmlBytes: 1000 }).fetch(`${base()}/`, 'html'))).toBe(
      'too_large',
    );
  });

  it('applies the limit to the decompressed size', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      response.end(gzipSync('x'.repeat(100_000)));
    };

    expect(await failureOf(fetcher({ maxHtmlBytes: 2000 }).fetch(`${base()}/`, 'html'))).toBe(
      'too_large',
    );
  });

  it('uses a larger limit for images than for pages', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.alloc(5000));
    };

    const page = await fetcher({ maxHtmlBytes: 1000, maxImageBytes: 10_000 }).fetch(
      `${base()}/`,
      'image',
    );

    expect(page.body.length).toBe(5000);
  });

  it('stops after too many redirects', async () => {
    handler = (_request, response) => {
      response.writeHead(302, { location: '/dalej' });
      response.end();
    };

    expect(await failureOf(fetcher({ maxRedirects: 3 }).fetch(`${base()}/`, 'html'))).toBe(
      'too_many_redirects',
    );
  });
});

describe('page fetcher: answers', () => {
  it('returns the body, the type and the final address after redirects', async () => {
    handler = (request, response) => {
      if (request.url === '/stary') {
        response.writeHead(301, { location: '/nowy' });
        return response.end();
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<html>zażółć</html>');
    };

    const page = await fetcher().fetch(`${base()}/stary`, 'html');

    expect(page.finalUrl).toBe(`${base()}/nowy`);
    expect(page.contentType).toBe('text/html');
    expect(page.body.toString('utf8')).toBe('<html>zażółć</html>');
  });

  it('decodes gzip answers and identifies itself', async () => {
    let userAgent = '';
    handler = (request, response) => {
      userAgent = request.headers['user-agent'] ?? '';
      response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      response.end(gzipSync('<html>spakowane</html>'));
    };

    const page = await fetcher().fetch(`${base()}/`, 'html');

    expect(page.body.toString()).toBe('<html>spakowane</html>');
    expect(userAgent).toContain('MounjaroPrzepisy');
  });

  it.each([404, 403, 500])('fails on status %i', async (status) => {
    handler = (_request, response) => {
      response.writeHead(status, { 'content-type': 'text/html' });
      response.end('<html>błąd</html>');
    };

    expect(await failureOf(fetcher().fetch(`${base()}/`, 'html'))).toBe('http_status');
  });

  it('refuses a page that is not HTML and an image that is not an image', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      response.end('%PDF');
    };
    expect(await failureOf(fetcher().fetch(`${base()}/`, 'html'))).toBe('content_type');

    handler = (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html></html>');
    };
    expect(await failureOf(fetcher().fetch(`${base()}/`, 'image'))).toBe('content_type');
  });

  it('reports a refused connection as a network failure', async () => {
    expect(await failureOf(fetcher().fetch('http://127.0.0.1:9/', 'html'))).toBe('network');
  });
});
