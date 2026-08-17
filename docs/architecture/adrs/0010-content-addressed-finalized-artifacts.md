# ADR-0010: Content-addressed finalized artifacts

## Status

Accepted.

## Context

Final PDFs must be immutable and retry-safe. Keys based on document id alone invite overwrite. Keys based on email leak PII.

## Decision

- Object key for artifacts: `tenants/{tenantId}/artifacts/{sha256}` (hex digest of the bytes).
- Revisions similarly: `tenants/{tenantId}/revisions/{sha256}`.
- PostgreSQL stores the digest and key. `finalized` is only set after the object exists and the digest is persisted in a short transaction.
- Overwrite of a key with different bytes is treated as an incident (should be impossible if the digest is the key).

## Consequences

- Identical PDFs across documents could theoretically collide in path if we omitted `tenantId`; we keep tenant prefix for isolation and IAM prefixes.
- Orphan objects after failed DB commits are safe and GC-able.
- Digest algorithm is SHA-256; this is content addressing, not a digital signature.

## Alternatives

- UUID object keys: easier overwrite bugs; weaker retry identity.
- Mutable “latest.pdf” key: rejected.
