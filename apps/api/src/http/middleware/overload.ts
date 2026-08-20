import type { RequestHandler } from 'express';
import { errorEnvelope } from '@esign/contracts';
import { PUBLIC_ERROR_MESSAGES } from '@esign/application';

export type OverloadGuardOptions = {
  readonly maxConcurrentRequests: number;
  readonly retryAfterSeconds?: number;
};

/**
 * Graceful overload behavior. Bounds the number of in-flight requests the API
 * will process at once; beyond the limit it sheds load with a stable 503 and a
 * `Retry-After` hint instead of exhausting memory or event-loop capacity.
 * Liveness/readiness probes are mounted before this guard so overload never
 * makes the process look dead to an orchestrator.
 */
export function createOverloadGuard(options: OverloadGuardOptions): RequestHandler {
  const limit = Math.max(1, Math.trunc(options.maxConcurrentRequests));
  const retryAfterSeconds = options.retryAfterSeconds ?? 1;
  let inFlight = 0;

  return (req, res, next) => {
    if (inFlight >= limit) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res
        .status(503)
        .json(
          errorEnvelope(
            'service_unavailable',
            PUBLIC_ERROR_MESSAGES.service_unavailable,
            req.correlationId ?? 'unknown',
          ),
        );
      return;
    }

    inFlight += 1;
    let released = false;
    const release = (): void => {
      if (!released) {
        released = true;
        inFlight -= 1;
      }
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}
