export type ClientRequestMetadataInput = {
  readonly forwardedFor: string | undefined;
  readonly remoteAddress: string | undefined;
  readonly userAgent: string | undefined;
};

const MAX_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 256;

/**
 * Captures untrusted client IP and user agent from a trusted adapter.
 * Use cases must not read Express `req` directly.
 */
export function clientRequestMetadataFromHeaders(input: ClientRequestMetadataInput): {
  readonly untrustedClientIp: string | null;
  readonly untrustedUserAgent: string | null;
} {
  const forwarded = firstForwarded(input.forwardedFor);
  const ip = sanitize(forwarded ?? input.remoteAddress, MAX_IP_LENGTH);
  return {
    untrustedClientIp: ip,
    untrustedUserAgent: sanitize(input.userAgent, MAX_USER_AGENT_LENGTH),
  };
}

function firstForwarded(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const first = value.split(',')[0];
  return first?.trim();
}

function sanitize(value: string | undefined, maxLength: number): string | null {
  if (value === undefined) {
    return null;
  }
  const cleaned = stripControls(value).trim();
  if (cleaned === '') {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

function stripControls(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      out += char;
    }
  }
  return out;
}
