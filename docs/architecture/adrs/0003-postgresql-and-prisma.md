# ADR-0003: PostgreSQL and Prisma

## Status

Accepted.

## Context

We need transactional state machines, unique constraints (one artifact, one signer completion), and an append-only audit table. The team standard is TypeScript.

## Decision

- PostgreSQL is the system of record for metadata, sessions (token hashes), consent, audit, outbox, and idempotency keys.
- Prisma lives only in `packages/database`. Migrations are additive; never edit applied migrations.
- Public ids are application-generated opaque UUIDs (prefer UUIDv7), not serial integers.
- Timestamps are `timestamptz` in UTC ([ADR-0012](0012-utc-timestamp-handling.md)).
- Domain invariants are enforced in application/domain code **and** backed by constraints where they prevent corruption.

## Consequences

- Relational joins and transactions are straightforward.
- PDF bytes stay out of Postgres ([ADR-0004](0004-private-object-storage.md)).
- Prisma must not leak into `apps/web` or domain modules.

## Alternatives

- Document database: weaker transactional constraints for signing races.
- SQL without an ORM: more boilerplate; possible later for specialized audit inserts.
- Separate audit database in v1: better insider resistance, higher ops cost — deferred.
