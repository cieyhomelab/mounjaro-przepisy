const MAX_LENGTH = 500;

const isControlCharacter = (char: string) => {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
};

/** Where the user lands after logging in when no (valid) return address was given. */
export const DEFAULT_RETURN_TO = '/';

/**
 * Accepts only in-app screen paths (relative, single leading slash, no scheme or host,
 * not an API or login path) so the login redirect cannot lead off the site.
 */
export function isSafeReturnTo(value: string | null | undefined): value is string {
  if (!value || value.length > MAX_LENGTH) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || [...value].some(isControlCharacter)) return false;
  const path = value.split(/[?#]/, 1)[0] ?? '';
  return !(path === '/api' || path.startsWith('/api/') || path === '/logowanie');
}

/** The return address when it is safe, otherwise the home screen. */
export function sanitizeReturnTo(value: string | null | undefined): string {
  return isSafeReturnTo(value) ? value : DEFAULT_RETURN_TO;
}
