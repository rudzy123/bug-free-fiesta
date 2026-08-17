# ADR-0002: Express API separate from Next.js

## Status

Accepted.

## Context

Next.js App Router can host Route Handlers. Putting signing, authorization, PDF orchestration, and tenant isolation inside Next.js would couple browser rendering to the domain and blur signer vs account-user auth.

## Decision

- `apps/web` is presentation: React, Tailwind, accessibility. It calls `apps/api`.
- `apps/api` is Express + TypeScript: validation, authn/authz, application services, OpenAPI.
- Next.js must not contain Prisma or object-storage access. Server Actions, if used, only forward intent to the API.

## Consequences

- Two processes to run locally and in production.
- CORS, CSRF, and cookie domains must be designed explicitly.
- Worker shares application services with the API via packages, not via Next.js internals.

## Alternatives

- Next.js Route Handlers as the only API: faster prototype, weaker isolation, harder worker reuse.
- BFF in Next.js plus Express: extra hop without enough gain for v1.
