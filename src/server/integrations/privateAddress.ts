import { isIP } from 'node:net';

const parseIPv4 = (address: string): number[] | null => {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
};

function isBlockedIPv4(address: string): boolean {
  const parts = parseIPv4(address);
  if (!parts) return true;
  const [a = 0, b = 0, c = 0] = parts;
  return (
    a === 0 || // "this" network
    a === 10 || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 address into its eight 16-bit groups, or null when it is malformed. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0] ?? '';
  const embedded = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (embedded) {
    const v4 = parseIPv4(embedded[1] ?? '');
    if (!v4) return null;
    const high = (((v4[0] ?? 0) << 8) | (v4[1] ?? 0)).toString(16);
    const low = (((v4[2] ?? 0) << 8) | (v4[3] ?? 0)).toString(16);
    text = `${text.slice(0, embedded.index)}${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const numbers = groups.map((group) => parseInt(group, 16));
  return numbers.length === 8 && numbers.every((n) => n >= 0 && n <= 0xffff) ? numbers : null;
}

function isBlockedIPv6(address: string): boolean {
  const g = ipv6Groups(address);
  if (!g) return true;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    // ::, ::1 and the IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms.
    if (g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true;
    if (g5 === 0xffff || g5 === 0) {
      return isBlockedIPv4(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
    }
  }
  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local
    (g0 & 0xffc0) === 0xfe80 || // link-local
    (g0 & 0xff00) === 0xff00 || // multicast
    (g0 === 0x64 && g1 === 0xff9b) || // NAT64 can reach IPv4 private hosts
    g0 === 0x2002 // 6to4 embeds an IPv4 address
  );
}

/**
 * True for addresses the page fetcher must never connect to: private, loopback, link-local,
 * multicast and reserved ranges of IPv4 and IPv6 (and anything that is not an IP address).
 */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIPv4(address);
  if (family === 6) return isBlockedIPv6(address);
  return true;
}
