import type { RequestHandler } from 'express';

/**
 * Spoof-resistant client IP resolution.
 *
 * The address list is ordered client -> server: the parsed `X-Forwarded-For`
 * entries (left = originating client claim) followed by the real socket peer
 * (right = the hop we are directly connected to). With `trustedProxyCount = k`
 * we operate behind exactly `k` reverse proxies, each of which appends the true
 * upstream peer it observed. The real client is therefore the entry `k` hops to
 * the left of the socket peer. Every entry further left is fully client
 * controlled and MUST be ignored, so a client cannot spoof its source IP by
 * injecting extra `X-Forwarded-For` values.
 *
 * When `trustedProxyCount` is 0 the header is ignored entirely and only the
 * socket peer is trusted. When the observed chain is shorter than the declared
 * topology (a misconfiguration or a stripped header) we fail closed to the
 * socket peer rather than to any client-controlled value.
 */
export function resolveClientIp(input: {
  socketAddress: string | undefined;
  forwardedFor: string | string[] | undefined;
  trustedProxyCount: number;
}): string {
  const socket = normalizeIp(input.socketAddress ?? '') || 'unknown';
  const hops = Math.max(0, Math.trunc(input.trustedProxyCount));
  if (hops === 0) {
    return socket;
  }

  const forwarded = parseForwardedFor(input.forwardedFor);
  const chain = [...forwarded, socket];
  const clientIndex = chain.length - 1 - hops;
  if (clientIndex < 0) {
    return socket;
  }
  const candidate = chain[clientIndex];
  return candidate === undefined || candidate === '' ? socket : candidate;
}

export function parseForwardedFor(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw
    .split(',')
    .map((entry) => normalizeIp(entry))
    .filter((entry) => entry !== '');
}

/**
 * Normalizes an IP token: trims, strips control characters, removes an
 * IPv4-mapped IPv6 prefix and any zone id, and lowercases. Never throws.
 */
export function normalizeIp(value: string): string {
  let cleaned = '';
  for (const char of value.trim()) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      cleaned += char;
    }
  }
  cleaned = cleaned.trim();
  if (cleaned === '') {
    return '';
  }
  const zoneIndex = cleaned.indexOf('%');
  if (zoneIndex !== -1) {
    cleaned = cleaned.slice(0, zoneIndex);
  }
  const lowered = cleaned.toLowerCase();
  if (lowered.startsWith('::ffff:')) {
    const mapped = lowered.slice('::ffff:'.length);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) {
      return mapped;
    }
  }
  return lowered;
}

/**
 * Populates `req.clientIp` from the configured trusted-proxy topology so rate
 * limiting, abuse protection, and audit metadata never trust a raw
 * `X-Forwarded-For` header. Express `trust proxy` is set separately in the
 * composition root so framework internals stay consistent.
 */
export function createClientIpMiddleware(trustedProxyCount: number): RequestHandler {
  return (req, _res, next) => {
    req.clientIp = resolveClientIp({
      socketAddress: req.socket.remoteAddress,
      forwardedFor: req.headers['x-forwarded-for'],
      trustedProxyCount,
    });
    next();
  };
}
