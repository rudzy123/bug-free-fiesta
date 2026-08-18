import type { RequestHandler } from 'express';
import type { Logger } from '@esign/logger';
import { withCorrelationId } from '@esign/logger';

export function createHttpLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = Date.now();
    const child = withCorrelationId(logger, req.correlationId);

    res.on('finish', () => {
      child.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - started,
        },
        'request completed',
      );
    });

    next();
  };
}
