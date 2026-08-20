import type { RequestHandler } from 'express';
import { ValidationError } from '@esign/domain';

/**
 * Rejects HTTP parameter pollution in the query string. Express parses repeated
 * query keys (for example `?token=a&token=b`) into arrays, which can bypass
 * scalar validation or smuggle a second value past a security check. Every
 * public endpoint expects scalar query parameters, so any array-valued key is
 * rejected with a stable validation error.
 */
export function createNoParameterPollution(): RequestHandler {
  return (req, _res, next) => {
    const query = req.query as Record<string, unknown>;
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        next(new ValidationError({ reason: 'parameter_pollution', field: key }));
        return;
      }
    }
    next();
  };
}
