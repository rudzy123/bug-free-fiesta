export const APPLICATION_ERROR_KIND = {
  validation: 'validation',
  authentication: 'authentication',
  authorization: 'authorization',
  not_found: 'not_found',
  conflict: 'conflict',
  invalid_state_transition: 'invalid_state_transition',
  integrity: 'integrity',
  external_service: 'external_service',
  rate_limit: 'rate_limit',
} as const;

export type ApplicationErrorKind =
  (typeof APPLICATION_ERROR_KIND)[keyof typeof APPLICATION_ERROR_KIND];

export type ApplicationErrorDetails = Readonly<Record<string, unknown>>;

export abstract class ApplicationError extends Error {
  abstract readonly kind: ApplicationErrorKind;
  readonly details: ApplicationErrorDetails;

  protected constructor(message: string, details: ApplicationErrorDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

export class ValidationError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.validation;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Validation failed', details);
  }
}

export class AuthenticationError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.authentication;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Authentication failed', details);
  }
}

export class AuthorizationError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.authorization;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Authorization failed', details);
  }
}

export class NotFoundError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.not_found;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Resource not found', details);
  }
}

export class ConflictError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.conflict;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Resource conflict', details);
  }
}

export class InvalidStateTransitionError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.invalid_state_transition;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Invalid state transition', details);
  }
}

export class IntegrityError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.integrity;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Integrity check failed', details);
  }
}

export class ExternalServiceError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.external_service;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('External service error', details);
  }
}

export class RateLimitError extends ApplicationError {
  readonly kind = APPLICATION_ERROR_KIND.rate_limit;

  public constructor(details: ApplicationErrorDetails = {}) {
    super('Rate limit exceeded', details);
  }
}
