import type { RequestHandler } from 'express';
import {
  AuthenticationError,
  RateLimitError,
  type RateLimiter,
  type SigningTokenHasher,
} from '@esign/domain';
import { assertCsrfToken, isCsrfSafeMethod } from '@esign/application';

export const SIGNING_RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
} as const;

export function createSigningResponseHeaders(): RequestHandler {
  return (_req, res, next) => {
    for (const [name, value] of Object.entries(SIGNING_RESPONSE_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  };
}

export function createSigningRateLimit(limiter: RateLimiter): RequestHandler {
  return (req, _res, next) => {
    void limiter
      .consume(`signing:${req.ip ?? 'unknown'}`)
      .then((decision) => {
        if (!decision.allowed) {
          throw new RateLimitError({ retryAfterSeconds: decision.retryAfterSeconds });
        }
        next();
      })
      .catch(next);
  };
}

export function createRequireSignerToken(deps: { sessionCookieName: string }): RequestHandler {
  return (req, _res, next) => {
    const fromCookie = req.cookies.get(deps.sessionCookieName);
    const fromBearer = bearerToken(req.header('authorization'));
    const token = fromCookie ?? fromBearer;
    if (token === undefined || token === '') {
      next(new AuthenticationError({ reason: 'signing_token' }));
      return;
    }
    req.signingToken = token;
    next();
  };
}

export function createRequireSignerCsrf(deps: {
  csrfCookieName: string;
  csrfHeaderName: string;
  hasher: SigningTokenHasher;
  loadCsrfHash: (rawToken: string) => Promise<string | null>;
}): RequestHandler {
  return (req, _res, next) => {
    if (isCsrfSafeMethod(req.method)) {
      next();
      return;
    }
    const rawToken = req.signingToken;
    if (rawToken === undefined) {
      next(new AuthenticationError({ reason: 'signing_token' }));
      return;
    }
    void deps
      .loadCsrfHash(rawToken)
      .then((expectedHash) => {
        if (expectedHash === null) {
          throw new AuthenticationError({ reason: 'signing_token' });
        }
        assertCsrfToken({
          headerToken: headerValue(req.headers[deps.csrfHeaderName]),
          cookieToken: req.cookies.get(deps.csrfCookieName),
          expectedHash,
          hash: (value) => deps.hasher.hash(value),
        });
        next();
      })
      .catch(next);
  };
}

export function extractExchangeToken(input: {
  bodyToken: string | undefined;
  authorization: string | undefined;
  queryToken: string | undefined;
}): string {
  const fromBody = typeof input.bodyToken === 'string' ? input.bodyToken.trim() : '';
  if (fromBody !== '') {
    return fromBody;
  }
  const fromBearer = bearerToken(input.authorization);
  if (fromBearer !== undefined) {
    return fromBearer;
  }
  const query = input.queryToken?.trim();
  if (query !== undefined && query !== '') {
    return query;
  }
  throw new AuthenticationError({ reason: 'signing_token' });
}

function bearerToken(value: string | undefined): string | undefined {
  if (value === undefined || !value.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }
  const token = value.slice('bearer '.length).trim();
  return token === '' ? undefined : token;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
