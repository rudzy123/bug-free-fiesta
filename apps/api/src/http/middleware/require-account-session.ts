import type { RequestHandler } from 'express';
import { assertCsrfToken, isCsrfSafeMethod, type ResolveAccountSession } from '@esign/application';
import type { SigningTokenHasher } from '@esign/domain';

export function createRequireAccountSession(deps: {
  resolveSession: ResolveAccountSession;
  sessionCookieName: string;
}): RequestHandler {
  return (req, _res, next) => {
    void deps
      .resolveSession(req.cookies.get(deps.sessionCookieName))
      .then((resolved) => {
        req.accountSession = resolved.session;
        next();
      })
      .catch(next);
  };
}

export function createRequireCsrf(deps: {
  csrfCookieName: string;
  csrfHeaderName: string;
  hasher: SigningTokenHasher;
}): RequestHandler {
  return (req, _res, next) => {
    if (isCsrfSafeMethod(req.method)) {
      next();
      return;
    }
    const session = req.accountSession;
    if (session === undefined) {
      next(new Error('CSRF middleware requires an account session'));
      return;
    }
    try {
      assertCsrfToken({
        headerToken: headerValue(req.headers[deps.csrfHeaderName]),
        cookieToken: req.cookies.get(deps.csrfCookieName),
        expectedHash: session.csrfTokenHash,
        hash: (value) => deps.hasher.hash(value),
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
