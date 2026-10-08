import { lookup as dnsLookup } from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';
import { isPrivateAddress } from './privateAddress';

export type FetchKind = 'html' | 'image';

export type FetchedPage = {
  /** Address of the last response, after redirects. */
  finalUrl: string;
  contentType: string;
  body: Buffer;
};

export type FetchFailure =
  | 'invalid_url'
  | 'blocked'
  | 'timeout'
  | 'too_large'
  | 'http_status'
  | 'content_type'
  | 'too_many_redirects'
  | 'network';

/** Why a page could not be fetched. Carries no address or page content: it may reach the logs. */
export class FetchError extends Error {
  constructor(readonly reason: FetchFailure) {
    super(reason);
    this.name = 'FetchError';
  }
}

/** Fetches somebody else's page or image. The one place that talks to sites of recipe authors. */
export interface PageFetcher {
  fetch(url: string, kind: FetchKind, options?: { timeoutMs?: number }): Promise<FetchedPage>;
}

export type PageFetcherOptions = {
  /** Time limit for one fetch including redirects and reading the body. */
  timeoutMs: number;
  /** Lets the fetcher reach private addresses; for the test pages, never in production. */
  allowPrivateNetwork: boolean;
  /** Size limits in bytes; default 5 MB for pages and 15 MB for images. */
  maxHtmlBytes?: number;
  maxImageBytes?: number;
  maxRedirects?: number;
  /** Replaces DNS resolution (tests). */
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  /** Replaces the address policy (tests). */
  isBlockedAddress?: (address: string) => boolean;
};

const USER_AGENT = 'MounjaroPrzepisy/1.0 (private recipe collection; page reader)';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class BlockedAddressError extends Error {
  code = 'FETCH_BLOCKED';
}

const defaultResolve = async (hostname: string) => dnsLookup(hostname, { all: true });

function decoderFor(response: IncomingMessage): Readable {
  switch (response.headers['content-encoding']?.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return response.pipe(createGunzip());
    case 'deflate':
      return response.pipe(createInflate());
    case 'br':
      return response.pipe(createBrotliDecompress());
    default:
      return response;
  }
}

export function createPageFetcher(options: PageFetcherOptions): PageFetcher {
  const maxRedirects = options.maxRedirects ?? 5;
  const resolve = options.resolve ?? defaultResolve;
  const blocked = options.isBlockedAddress ?? isPrivateAddress;
  const limits: Record<FetchKind, number> = {
    html: options.maxHtmlBytes ?? 5 * 1024 * 1024,
    image: options.maxImageBytes ?? 15 * 1024 * 1024,
  };

  // Every connection goes to an address checked here, so a name that resolves to a private
  // address (at any redirect hop, or changing between two lookups) is never contacted.
  const guardedLookup: LookupFunction = (hostname, lookupOptions, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (
          addresses.length === 0 ||
          (!options.allowPrivateNetwork && addresses.some((a) => blocked(a.address)))
        ) {
          return callback(new BlockedAddressError(), '', 4);
        }
        const wanted =
          lookupOptions.family === 4 || lookupOptions.family === 6 ? lookupOptions.family : null;
        const usable = wanted ? addresses.filter((a) => a.family === wanted) : addresses;
        const first = usable[0];
        if (!first) return callback(new BlockedAddressError(), '', 4);
        if (lookupOptions.all) return callback(null, usable);
        return callback(null, first.address, first.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, '', 4),
    );
  };

  const open = (url: URL, signal: AbortSignal, kind: FetchKind) =>
    new Promise<IncomingMessage>((resolveResponse, reject) => {
      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.request(
        url,
        {
          method: 'GET',
          lookup: guardedLookup,
          signal,
          headers: {
            'user-agent': USER_AGENT,
            accept: kind === 'html' ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' : 'image/*',
            'accept-language': 'pl,en;q=0.5',
            'accept-encoding': 'gzip, deflate, br',
          },
        },
        resolveResponse,
      );
      request.on('error', reject);
      request.end();
    });

  const readBody = async (response: IncomingMessage, limit: number): Promise<Buffer> => {
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit && !response.headers['content-encoding']) {
      throw new FetchError('too_large');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of decoderFor(response)) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > limit) {
        response.destroy();
        throw new FetchError('too_large');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  };

  const checkUrl = (url: URL) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('invalid_url');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // Node does not resolve IP literals, so the lookup guard never sees them.
    if (isIP(host) !== 0 && !options.allowPrivateNetwork && blocked(host)) {
      throw new FetchError('blocked');
    }
  };

  const run = async (start: string, kind: FetchKind, signal: AbortSignal): Promise<FetchedPage> => {
    let current: URL;
    try {
      current = new URL(start);
    } catch {
      throw new FetchError('invalid_url');
    }
    for (let hops = 0; hops <= maxRedirects; hops += 1) {
      checkUrl(current);
      const response = await open(current, signal, kind);
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (REDIRECT_STATUSES.has(status) && location) {
        response.resume();
        try {
          current = new URL(location, current);
        } catch {
          throw new FetchError('invalid_url');
        }
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new FetchError('http_status');
      }
      const contentType =
        (response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const acceptable =
        kind === 'html'
          ? contentType === '' ||
            contentType === 'text/html' ||
            contentType === 'application/xhtml+xml'
          : contentType.startsWith('image/');
      if (!acceptable) {
        response.resume();
        throw new FetchError('content_type');
      }
      const body = await readBody(response, limits[kind]);
      return { finalUrl: current.href, contentType, body };
    }
    throw new FetchError('too_many_redirects');
  };

  return {
    async fetch(url, kind, fetchOptions) {
      const signal = AbortSignal.timeout(fetchOptions?.timeoutMs ?? options.timeoutMs);
      try {
        return await run(url, kind, signal);
      } catch (error) {
        if (error instanceof FetchError) throw error;
        if (signal.aborted) throw new FetchError('timeout');
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        throw new FetchError(code === 'FETCH_BLOCKED' ? 'blocked' : 'network');
      }
    },
  };
}
