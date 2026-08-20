import type { RequestHandler } from 'express';
import type { Logger } from '@esign/logger';
import { errorEnvelope } from '@esign/contracts';
import { PUBLIC_ERROR_MESSAGES } from '@esign/application';

/**
 * Bounds how long a single request may occupy a worker. On timeout, or when the
 * client disconnects, an `AbortSignal` is exposed on the request so outbound
 * operations can cancel promptly, and a stable 503 is returned if the response
 * has not started. This prevents slow or hung requests from pinning resources.
 */
export function createRequestTimeout(timeoutMs: number, logger: Logger): RequestHandler {
  const timeout = Math.max(1_000, Math.trunc(timeoutMs));

  return (req, res, next) => {
    const controller = new AbortController();
    req.abortSignal = controller.signal;

    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        logger.warn(
          {
            correlationId: req.correlationId,
            method: req.method,
            path: req.path,
            timeoutMs: timeout,
          },
          'request timed out',
        );
        res
          .status(503)
          .json(
            errorEnvelope(
              'service_unavailable',
              PUBLIC_ERROR_MESSAGES.service_unavailable,
              req.correlationId ?? 'unknown',
            ),
          );
      }
      res.destroy();
    }, timeout);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    const clear = (): void => {
      clearTimeout(timer);
    };
    const abortOnClose = (): void => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };
    res.on('finish', clear);
    res.on('close', () => {
      clear();
      abortOnClose();
    });
    next();
  };
}
