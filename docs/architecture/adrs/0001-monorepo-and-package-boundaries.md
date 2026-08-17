# ADR-0001: Monorepo and package boundaries

## Status

Accepted.

## Context

The product has a web UI, an HTTP API, a document worker, and shared contracts. We need one versioned codebase with clear compile-time boundaries so domain logic does not import frameworks.

## Decision

Use a pnpm workspace + Turborepo monorepo:

- `apps/web`, `apps/api`, `apps/worker` are deployable applications and composition roots.
- `packages/database`, `packages/contracts`, `packages/config`, `packages/logger`, `packages/eslint-config`, `packages/typescript-config`, `packages/test-utils` are libraries.
- Presentation, application, domain, and infrastructure remain separate **inside** API and worker. Domain/application code must not import Express, Next.js, Prisma, or object-storage SDKs.
- Dependencies are injected via interfaces and constructors or factories.
- Only `packages/config` reads `process.env`.

## Consequences

- Shared Zod types and config stay consistent across apps.
- Cross-package imports that skip layers are a review failure.
- CI builds a graph; apps do not duplicate Prisma schemas.

## Alternatives

- Polyrepo: slower contract changes, easier independent release (not needed at this stage).
- Next.js full-stack only: rejected in [ADR-0002](0002-express-api-separate-from-nextjs.md).
