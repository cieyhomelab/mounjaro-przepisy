const WWW_PREFIX = /^www\./;

export type SourceUrl = {
  /** The address as the user gave it (trimmed, without a fragment): what is fetched and shown as the source link. */
  url: string;
  /** Normalized address used to recognise the same page: see `sourceUrlKey`. */
  key: string;
  /** Host of the page without the "www." prefix, for example "kwestiasmaku.com". */
  host: string;
};

/**
 * Parses the address of a recipe page. Only absolute http and https addresses with a host name
 * are accepted; anything else (plain text, other schemes) gives null.
 */
export function parseSourceUrl(input: string): SourceUrl | null {
  const text = input.trim();
  if (text === '' || text.length > 2000 || /\s/.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  const host = parsed.hostname.toLowerCase().replace(WWW_PREFIX, '');
  // A usable host has a dot ("kwestiasmaku.com") or is an IP address; "http://a" is not a link to a page.
  if (!host.includes('.') && !host.startsWith('[')) return null;
  const path = parsed.pathname.replace(/\/+$/, '');
  const port = parsed.port === '' ? '' : `:${parsed.port}`;
  return { url: text.split('#')[0] ?? text, key: `${host}${port}${path}`, host };
}

/**
 * Two addresses are the same recipe when they differ only in protocol, a "www." prefix, a
 * trailing slash, the query string or the fragment (S2). The key is that common form.
 */
export function sourceUrlKey(input: string): string | null {
  return parseSourceUrl(input)?.key ?? null;
}
