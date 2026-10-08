import { errorResponseSchema } from '../../shared/contracts/error';

/** A failed API call. `code` is the server's error code, or "network" when no response arrived. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
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

type RequestOptions = { method?: string; body?: unknown };

/**
 * Calls the API with the session cookie. Resolves with the parsed body (undefined for 204)
 * and throws ApiError for every failure; the caller maps `code` to a Polish message.
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { method = 'GET', body } = options;
  let response: Response;
  try {
    const init: RequestInit = { method, credentials: 'same-origin' };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    response = await fetch(path, init);
  } catch {
    throw new ApiError('network', 0);
  }
  if (response.status === 204) return undefined;
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401) onUnauthenticated?.();
    const parsed = errorResponseSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, response.status, parsed.data.error.fields);
    }
    throw new ApiError('internal', response.status);
  }
  return payload;
}
