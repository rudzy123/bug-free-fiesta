import type { CookieOptions, Response } from 'express';

export type SessionCookieSettings = {
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
};

export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (header === undefined || header.trim() === '') {
    return cookies;
  }
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1);
    cookies.set(name, decodeURIComponent(rawValue));
  }
  return cookies;
}

export function setSessionCookies(
  res: Response,
  settings: SessionCookieSettings,
  tokens: { sessionToken: string; csrfToken: string },
): void {
  res.cookie(settings.sessionCookieName, tokens.sessionToken, sessionCookieOptions(settings));
  res.cookie(settings.csrfCookieName, tokens.csrfToken, csrfCookieOptions(settings));
}

export function clearSessionCookies(res: Response, settings: SessionCookieSettings): void {
  res.clearCookie(settings.sessionCookieName, sessionCookieOptions(settings));
  res.clearCookie(settings.csrfCookieName, csrfCookieOptions(settings));
}

function sessionCookieOptions(settings: SessionCookieSettings): CookieOptions {
  return {
    httpOnly: true,
    secure: settings.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: settings.maxAgeSeconds * 1000,
  };
}

function csrfCookieOptions(settings: SessionCookieSettings): CookieOptions {
  return {
    httpOnly: false,
    secure: settings.secure,
    sameSite: 'strict',
    path: '/',
    maxAge: settings.maxAgeSeconds * 1000,
  };
}
