import { timingSafeEqual } from 'node:crypto';
import { AuthorizationError } from '@esign/domain';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isCsrfSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

export function assertCsrfToken(input: {
  headerToken: string | undefined;
  cookieToken: string | undefined;
  expectedHash: string;
  hash: (value: string) => string;
}): void {
  if (
    input.headerToken === undefined ||
    input.headerToken.trim() === '' ||
    input.cookieToken === undefined ||
    input.cookieToken.trim() === ''
  ) {
    throw new AuthorizationError({ reason: 'csrf_rejected' });
  }
  if (!equalUtf8(input.headerToken, input.cookieToken)) {
    throw new AuthorizationError({ reason: 'csrf_rejected' });
  }
  const presentedHash = input.hash(input.headerToken);
  if (!equalUtf8(presentedHash, input.expectedHash)) {
    throw new AuthorizationError({ reason: 'csrf_rejected' });
  }
}

export function originIsAllowed(
  originHeader: string | undefined,
  refererHeader: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  const origin = originFromHeaders(originHeader, refererHeader);
  if (origin === undefined) {
    return false;
  }
  return allowedOrigins.includes(origin);
}

function originFromHeaders(
  originHeader: string | undefined,
  refererHeader: string | undefined,
): string | undefined {
  if (originHeader !== undefined && originHeader.trim() !== '') {
    return originHeader.trim();
  }
  if (refererHeader === undefined || refererHeader.trim() === '') {
    return undefined;
  }
  try {
    return new URL(refererHeader).origin;
  } catch {
    return undefined;
  }
}

function equalUtf8(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}
