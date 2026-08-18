import type { ErrorRequestHandler } from 'express';
import type { Logger } from '@esign/logger';
import { errorEnvelope, type ErrorCode } from '@esign/contracts';

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
        .json(errorEnvelope('payload_too_large', 'The request body is too large.', correlationId));
      return;
    }

    const status = readStatus(err);
    if (status !== undefined && status >= 400 && status < 500) {
      const code: ErrorCode = status === 404 ? 'not_found' : 'validation';
      res.status(status).json(errorEnvelope(code, clientMessage(err), correlationId));
      return;
    }

    logger.error(
      {
        correlationId,
        errorName: err instanceof Error ? err.name : 'unknown',
        errorMessage: err instanceof Error ? err.message : 'unknown',
      },
      'unhandled request error',
    );

    res.status(500).json(errorEnvelope('internal', 'An unexpected error occurred.', correlationId));
  };
}

function readStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      return error.statusCode;
    }
  }
  return undefined;
}

function clientMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0 && error.message.length < 200) {
    return error.message;
  }
  return 'The request was invalid.';
}
