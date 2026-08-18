import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ExternalServiceError,
  IntegrityError,
  InvalidStateTransitionError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '@esign/domain';
import { PUBLIC_ERROR_MESSAGES } from './public-messages.js';
import { toHttpError } from './to-http-error.js';

describe('HTTP error mapping', () => {
  it('maps typed errors to stable public messages and never returns internal details', () => {
    const cases = [
      [new ValidationError({ field: 'title' }), 400, 'validation'],
      [new ValidationError({ reason: 'payload_too_large' }), 413, 'payload_too_large'],
      [new AuthenticationError({ reason: 'missing_session' }), 401, 'authentication'],
      [new AuthorizationError({ reason: 'role_denied' }), 403, 'forbidden'],
      [new NotFoundError({ resource: 'document' }), 404, 'not_found'],
      [new ConflictError({ version: 3 }), 409, 'conflict'],
      [new ConflictError({ reason: 'idempotency_replay' }), 409, 'idempotency_replay'],
      [new InvalidStateTransitionError({ from: 'finalized', to: 'draft' }), 409, 'conflict'],
      [new RateLimitError({ retryAfterSeconds: 30 }), 429, 'rate_limited'],
      [new ExternalServiceError({ service: 'object-storage' }), 503, 'external_service'],
      [new IntegrityError({ reason: 'audit_hash_mismatch' }), 500, 'internal'],
    ] as const;

    for (const [error, status, code] of cases) {
      const mapped = toHttpError(error);
      expect(mapped.status).toBe(status);
      expect(mapped.code).toBe(code);
      expect(mapped.publicMessage).toBe(PUBLIC_ERROR_MESSAGES[code]);
      expect(mapped.publicMessage).not.toContain('audit_hash');
      expect(mapped.publicMessage).not.toContain('object-storage');
      expect(JSON.stringify(mapped.publicMessage)).not.toContain('title');
    }
  });

  it('redacts secret details from structured logs', () => {
    const mapped = toHttpError(new AuthenticationError({ token: 'stolen', reason: 'bad_token' }));
    expect(mapped.log.details).toEqual({ reason: 'bad_token' });
    expect(JSON.stringify(mapped.log)).not.toContain('stolen');
  });

  it('maps unknown errors to a generic internal response and keeps the message in logs', () => {
    const mapped = toHttpError(new Error('secret internals'));
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe('internal');
    expect(mapped.publicMessage).toBe(PUBLIC_ERROR_MESSAGES.internal);
    expect(mapped.log.details).toEqual({ errorMessage: 'secret internals' });
  });
});
