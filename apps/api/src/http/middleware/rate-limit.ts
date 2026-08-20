import type { RequestHandler } from 'express';
import { RateLimitError, type RateLimiter } from '@esign/domain';

/**
 * Generic per-client-IP rate limit. Keys on the spoof-resistant `req.clientIp`
 * (falling back to the socket address) so a client cannot dodge limits by
 * forging `X-Forwarded-For`. Sensitivity is expressed by composing several of
 * these with different limiters and key prefixes (general API, auth, signing).
 */
export function createIpRateLimit(limiter: RateLimiter, keyPrefix: string): RequestHandler {
  return (req, _res, next) => {
    const key = `${keyPrefix}:${req.clientIp ?? req.ip ?? 'unknown'}`;
    void limiter
      .consume(key)
      .then((decision) => {
        if (!decision.allowed) {
          throw new RateLimitError({ retryAfterSeconds: decision.retryAfterSeconds });
        }
        next();
      })
      .catch(next);
  };
}
