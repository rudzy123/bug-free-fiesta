import type { RequestHandler } from 'express';
import { ValidationError } from '@esign/domain';
import { originIsAllowed } from '@esign/application';

export function createRequireAllowedOrigin(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    const originHeader = headerValue(req.headers.origin);
    const refererHeader = headerValue(req.headers.referer);
    if (!originIsAllowed(originHeader, refererHeader, allowedOrigins)) {
      next(new ValidationError({ reason: 'origin_rejected' }));
      return;
    }
    next();
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
