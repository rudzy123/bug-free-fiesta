# ADR-0006: Hash-chained append-only audit records

## Status

Accepted.

## Context

We need a forensic trail of send, consent, sign, void, and finalize. Ordinary updateable log tables can be silently edited. We also must not claim this equals a qualified timestamp or legal archive.

## Decision

- Per-document audit events with monotonic `sequence`, `prevHash`, and `thisHash` ([audit model](../audit-model.md)).
- Canonical event document version `schemaVersion` (v1). Hash is SHA-256 over the canonical JSON of payload + previous hash + schema version (plus sequence/type/actor/timestamp so metadata tampering is visible).
- Application code only inserts. Role `esign_app` cannot UPDATE, DELETE, or TRUNCATE these rows. Triggers reject those statements even for table owners who are not superuser.
- Payloads contain opaque ids and policy-approved metadata only (no secrets, cookies, bearer tokens, raw PNG/PDF bytes, or pointer streams).
- A verifier job, admin endpoint, and CLI recompute the chain and finalized artifact digests. Failures follow the [audit verification runbook](../../runbooks/audit-verification-failure.md).
- Checkpoint hashes may be anchored to a separately controlled immutable store ([ADR-0015](0015-audit-checkpoint-anchoring.md)).

**Do not claim** that the hash chain prevents a privileged database administrator from replacing the entire chain. That residual threat requires split-custody external anchoring.

## Consequences

- Erasure of personal data in-place would break the chain; that conflict is flagged for legal review.
- Insiders with superuser or backup rewrite can still tamper; hash chain detects application-level edits, not a compromised root.

## Alternatives

- Updateable `audit_logs` table: insufficient integrity.
- External WORM/object-lock ledger in v1: stronger, more cost; revisit after product-market fit.
- Digitally signing each event with an HSM: not v1; would still not be eIDAS qualified by default.
