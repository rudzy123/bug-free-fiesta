# ADR-0013: Multi-tenancy isolation strategy

## Status

Accepted.

## Context

Multiple organizations share the product. Sequential ids and missing tenant predicates cause IDOR. Dedicated databases per tenant are operationally heavy for v1.

## Decision

- **Shared PostgreSQL, shared object-storage account**, with a mandatory `tenantId` (opaque UUID) on every tenant-scoped row and as a key prefix in object storage.
- The active tenant for account users is resolved from **membership**, not from a client header.
- Signing sessions carry `tenantId` from the document at issue time; it cannot be changed by the client.
- Every repository query for tenant data includes `tenantId` from the authorized context. Deny by default if context is missing.
- v1 does not implement per-tenant encryption keys or separate clusters.

## Consequences

- A single query bug can leak data; tests and review must treat missing `tenantId` as a blocker.
- Noisy-neighbor risk on shared DB and worker (quotas/rate limits).
- Stronger isolation (silo) is a future option for customers who need it — **legal review required** before promising isolation to regulated industries (this ADR is not HIPAA or similar).

## Alternatives

- Database-per-tenant: strong isolation, costly migrations.
- Trust `X-Tenant-Id`: rejected.
- Row-level security in Postgres as the only control: useful complement later, not a substitute for application checks in v1.
