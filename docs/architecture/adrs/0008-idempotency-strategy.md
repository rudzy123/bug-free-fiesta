# ADR-0008: Idempotency strategy

## Status

Accepted.

## Context

Clients retry on timeouts. Workers receive at-least-once outbox delivery. Without idempotency, documents can double-send, double-sign, or double-finalize.

## Decision

- HTTP mutations require an `Idempotency-Key`. Store key, tenant, principal, route, request body hash, response status/body reference, and UTC expiry in PostgreSQL.
- Same key and same body hash: return the original result.
- Same key and different body: `409 conflict`.
- Domain unique constraints: one successful sign per `(documentId, signerId)`; one finalized artifact per document; at most one `active` signing session per signer.
- Workers use outbox id (and lease owner) as the idempotency key for side effects including email and storage.

## Consequences

- Clients must send keys (web app generates UUIDv7 per user intent).
- Storage of response bodies must not include Restricted secrets (no raw tokens).
- Key TTL is config, not hardcoded.

## Alternatives

- “Clients should not retry”: they will.
- Dedup only in memory: fails across replicas.
