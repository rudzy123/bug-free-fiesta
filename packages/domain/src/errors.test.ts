import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_KIND,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ExternalServiceError,
  IntegrityError,
  InvalidStateTransitionError,
  isApplicationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors.js';

const factories = [
  [ValidationError, APPLICATION_ERROR_KIND.validation],
  [AuthenticationError, APPLICATION_ERROR_KIND.authentication],
  [AuthorizationError, APPLICATION_ERROR_KIND.authorization],
  [NotFoundError, APPLICATION_ERROR_KIND.not_found],
  [ConflictError, APPLICATION_ERROR_KIND.conflict],
  [InvalidStateTransitionError, APPLICATION_ERROR_KIND.invalid_state_transition],
  [IntegrityError, APPLICATION_ERROR_KIND.integrity],
  [ExternalServiceError, APPLICATION_ERROR_KIND.external_service],
  [RateLimitError, APPLICATION_ERROR_KIND.rate_limit],
] as const;

describe('application errors', () => {
  it('exposes a typed kind and details without using the constructor message as a public API', () => {
    for (const [Ctor, kind] of factories) {
      const error = new Ctor({ reason: 'unit_test' });
      expect(isApplicationError(error)).toBe(true);
      expect(error.kind).toBe(kind);
      expect(error.details).toEqual({ reason: 'unit_test' });
      expect(error.name).toBe(Ctor.name);
    }
  });

  it('does not treat generic errors as application errors', () => {
    expect(isApplicationError(new Error('nope'))).toBe(false);
  });
});
