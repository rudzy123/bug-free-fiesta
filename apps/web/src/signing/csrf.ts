import { SIGNING_CSRF_COOKIE_NAME_DEFAULT } from '@esign/contracts';

export function readCookie(name: string, cookieHeader: string): string | undefined {
  if (cookieHeader.trim() === '') {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (key !== name) {
      continue;
    }
    return decodeURIComponent(trimmed.slice(separator + 1));
  }
  return undefined;
}

export function readSigningCsrfToken(
  cookieHeader: string,
  cookieName: string = SIGNING_CSRF_COOKIE_NAME_DEFAULT,
): string | undefined {
  return readCookie(cookieName, cookieHeader);
}
