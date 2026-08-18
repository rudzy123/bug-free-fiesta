import type { ErrorCode } from '@esign/contracts';
import {
  APPLICATION_ERROR_KIND,
  isApplicationError,
  type ApplicationError,
  type ApplicationErrorDetails,
} from '@esign/domain';
import { PUBLIC_ERROR_MESSAGES } from './public-messages.js';

export type HttpErrorMapping = {
  readonly status: number;
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly retryAfterSeconds?: number;
  readonly logLevel: 'warn' | 'error';
  readonly logMessage: string;
  readonly log: {
    readonly errorName: string;
    readonly errorKind?: string;
    readonly details?: ApplicationErrorDetails;
  };
};

const SECRET_DETAIL_KEYS = new Set([
  'token',
  'rawToken',
  'password',
  'authorization',
  'cookie',
  'signature',
  'pdfBytes',
  'documentBytes',
  'uploadToken',
]);

function redactDetails(details: ApplicationErrorDetails): ApplicationErrorDetails | undefined {
  const entries = Object.entries(details).filter(([key]) => !SECRET_DETAIL_KEYS.has(key));
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

function mappingFor(error: ApplicationError, status: number, code: ErrorCode): HttpErrorMapping {
  const retryAfter = error.details.retryAfterSeconds;
  return {
    status,
    code,
    publicMessage: PUBLIC_ERROR_MESSAGES[code],
    retryAfterSeconds: typeof retryAfter === 'number' ? retryAfter : undefined,
    logLevel: status >= 500 ? 'error' : 'warn',
    logMessage: error.message,
    log: {
      errorName: error.name,
      errorKind: error.kind,
      details: redactDetails(error.details),
    },
  };
}

export function toHttpError(error: unknown): HttpErrorMapping {
  if (isApplicationError(error)) {
    switch (error.kind) {
      case APPLICATION_ERROR_KIND.validation:
        if (error.details.reason === 'payload_too_large') {
          return mappingFor(error, 413, 'payload_too_large');
        }
        return mappingFor(error, 400, 'validation');
      case APPLICATION_ERROR_KIND.authentication:
        return mappingFor(error, 401, 'authentication');
      case APPLICATION_ERROR_KIND.authorization:
        return mappingFor(error, 403, 'forbidden');
      case APPLICATION_ERROR_KIND.not_found:
        return mappingFor(error, 404, 'not_found');
      case APPLICATION_ERROR_KIND.conflict:
        if (error.details.reason === 'idempotency_replay') {
          return mappingFor(error, 409, 'idempotency_replay');
        }
        return mappingFor(error, 409, 'conflict');
      case APPLICATION_ERROR_KIND.invalid_state_transition:
        return mappingFor(error, 409, 'conflict');
      case APPLICATION_ERROR_KIND.rate_limit:
        return mappingFor(error, 429, 'rate_limited');
      case APPLICATION_ERROR_KIND.external_service:
        return mappingFor(error, 503, 'external_service');
      case APPLICATION_ERROR_KIND.integrity:
        return mappingFor(error, 500, 'internal');
    }
  }

  return {
    status: 500,
    code: 'internal',
    publicMessage: PUBLIC_ERROR_MESSAGES.internal,
    logLevel: 'error',
    logMessage: 'unhandled request error',
    log: {
      errorName: error instanceof Error ? error.name : 'unknown',
      details: {
        errorMessage: error instanceof Error ? error.message : 'unknown',
      },
    },
  };
}
