import type { ErrorRequestHandler } from 'express';
import type { Logger } from '@esign/logger';
import { errorEnvelope } from '@esign/contracts';
import { PUBLIC_ERROR_MESSAGES, toHttpError } from '@esign/application';

type BodyParserError = {
  type?: string;
  status?: number;
  statusCode?: number;
};

function isBodyParserError(error: unknown): error is BodyParserError {
  return typeof error === 'object' && error !== null && 'type' in error;
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const correlationId = req.correlationId ?? 'unknown';

    if (isBodyParserError(err) && err.type === 'entity.too.large') {
      res
        .status(413)
        .json(
          errorEnvelope(
            'payload_too_large',
            PUBLIC_ERROR_MESSAGES.payload_too_large,
            correlationId,
          ),
        );
      return;
    }

    const mapped = toHttpError(err);
    logger[mapped.logLevel]({ correlationId, ...mapped.log }, mapped.logMessage);
    if (mapped.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(mapped.retryAfterSeconds));
    }
    res.status(mapped.status).json(errorEnvelope(mapped.code, mapped.publicMessage, correlationId));
  };
}
