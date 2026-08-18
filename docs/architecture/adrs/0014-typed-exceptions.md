# ADR-0014: Typed exceptions at the application boundary

## Status

Accepted.

## Context

Use cases need a single failure model that HTTP adapters, workers, and tests can share. The public API must return a stable error envelope without leaking stack traces, tenant internals, or secrets. Two common options are `Result` types (`Ok`/`Err`) and typed exceptions.

## Decision

Use **typed exceptions** as the application-layer failure strategy.

- Domain and application code throw subclasses of `ApplicationError` (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `InvalidStateTransitionError`, `IntegrityError`, `ExternalServiceError`, `RateLimitError`).
- `error.message` and `error.details` are for structured logs only.
- `packages/application` maps kinds to HTTP status, a stable public `ErrorCode`, and a stable public message. Express (or a worker adapter) must not send `error.message` to clients.
- Unhandled values become HTTP 500 `internal` with the same generic public message.
- Integrity failures are logged with details and presented as `internal`; clients must not learn that a hash chain or digest check failed.

`Result` types are allowed inside a single module when they clarify local control flow. They are not the cross-layer contract. Route handlers catch nothing of business interest: they parse, authorize via a use case, and pass failures to the error adapter.

## Consequences

- Express error middleware remains the HTTP composition seam ([ADR-0002](0002-express-api-separate-from-nextjs.md)).
- Public messages can stay unchanged while log `details` evolve.
- Callers must not catch `Error` and re-wrap it as validation; only `isApplicationError` distinguishes expected failures.
- Workers use the same types; they log and retry instead of mapping to HTTP unless they expose a health port.

## Alternatives

- **`Result` on every use case:** explicit, but noisy with TypeScript and fights the existing Express error middleware.
- **HTTP status on domain errors:** leaks the adapter into domain.
- **Stringly-typed `code` on generic `Error`:** easy to miss in reviews; rejected.
