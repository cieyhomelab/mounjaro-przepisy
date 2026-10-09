import { errorResponseSchema } from '../../shared/contracts/error';

/** A failed API call. `code` is the server's error code, or "network" when no response arrived. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
    /** The recipe already in the collection, for `duplicate_source`. */
    readonly recipeId?: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

let onUnauthenticated: (() => void) | undefined;

/** Registers what happens when any call is answered with 401 (the session provider clears its state). */
export function setUnauthenticatedHandler(handler: (() => void) | undefined) {
  onUnauthenticated = handler;
}

type RequestOptions = {
  method?: string;
  /** JSON body. */
  body?: unknown;
  /** Binary body (a photo), sent with its own content type. Wins over `body`. */
  file?: Blob;
  headers?: Record<string, string>;
};

/** Resolved by `apiRequest` for a 304 answer: the caller's copy is current. */
export const NOT_MODIFIED = Symbol('not-modified');

/**
 * Calls the API with the session cookie. Resolves with the parsed body (undefined for 204,
 * NOT_MODIFIED for 304) and throws ApiError for every failure; the caller maps `code` to a
 * Polish message.
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { method = 'GET', body, file, headers } = options;
  let response: Response;
  try {
    // no-store: Firefox answers from its HTTP cache while offline, which would show a stale
    // session after logout instead of failing like a real lost connection.
    const init: RequestInit = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { ...headers },
    };
    if (file) {
      init.headers = { ...headers, 'Content-Type': file.type };
      init.body = file;
    } else if (body !== undefined) {
      init.headers = { ...headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    response = await fetch(path, init);
  } catch {
    throw new ApiError('network', 0);
  }
  if (response.status === 304) return NOT_MODIFIED;
  if (response.status === 204) return undefined;
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401) onUnauthenticated?.();
    const parsed = errorResponseSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(
        parsed.data.error.code,
        response.status,
        parsed.data.error.fields,
        parsed.data.error.recipeId,
      );
    }
    throw new ApiError('internal', response.status);
  }
  return payload;
}

/** A file received from the API. */
export type Download = { blob: Blob; filename: string };

/** Downloads a file (GET) with the session cookie; throws ApiError like `apiRequest`. */
export async function apiDownload(path: string): Promise<Download> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError('network', 0);
  }
  if (!response.ok) {
    if (response.status === 401) onUnauthenticated?.();
    const parsed = errorResponseSchema.safeParse(await response.json().catch(() => undefined));
    throw new ApiError(parsed.success ? parsed.data.error.code : 'internal', response.status);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'dane.zip';
  return { blob: await response.blob(), filename };
}
