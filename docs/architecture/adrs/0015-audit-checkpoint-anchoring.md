# ADR-0015: External audit checkpoint anchoring

## Status

Accepted.

## Context

Per-document audit events are hash-chained and append-only in PostgreSQL ([ADR-0006](0006-hash-chained-append-only-audit.md)). Triggers reject `UPDATE`, `DELETE`, and `TRUNCATE`. The application role `esign_app` is granted `SELECT` and `INSERT` only.

Those controls detect application-level edits. They do **not** prevent a privileged database administrator, a stolen superuser credential, or a backup rewrite from replacing the entire chain with a newly computed, internally consistent history. The hash chain of the live table cannot testify against a wholesale replacement of that table.

## Decision

- Treat the PostgreSQL chain as an integrity detector for application and low-privilege database roles.
- Define an `ImmutableCheckpointStore` port that stores `(organizationId, documentId, sequence, eventHash, schemaVersion)` outside the application database.
- Implementations must not overwrite a different hash for the same key (`putIfAbsent`).
- Production anchoring should use object-lock / WORM / a separately controlled ledger. The object-storage adapter is a boundary, not WORM by itself.
- Verification recomputes hashes, checks previous-hash links, checks finalized artifact bytes, and compares the head (or last anchored sequence) to the checkpoint store when enabled.
- Operators enable anchoring with `AUDIT_CHECKPOINT_STORE=object_storage` after the checkpoint bucket is on a separately administered, immutable policy.
- Documentation and runbooks must not claim that the hash chain alone stops a privileged DBA.

## Residual threat

If an attacker can rewrite PostgreSQL **and** the checkpoint store (or the store was never populated), verification cannot distinguish the forged chain from the original. Mitigations are organizational: split custody, object-lock on a different account, periodic export of head hashes to an external log or transparency service. This is still not a qualified timestamp or legal archive.

## Consequences

- Disabled anchoring is the honest default until operators provision independent immutable storage.
- A clean verification with `CHECKPOINT_ANCHORING_DISABLED` means the live chain is internally consistent, not that history could not have been replaced.
- Legal review remains required before customer-facing “certificate of completion” language.

## Alternatives

- HSM-signed events: stronger, not v1, still not eIDAS qualified by default.
- Continuous export to a third-party WORM API: deferred; the port exists so it can be added without changing verifiers.
