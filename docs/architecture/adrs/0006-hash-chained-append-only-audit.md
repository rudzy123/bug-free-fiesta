# ADR-0006: Hash-chained append-only audit records

## Status

Accepted.

## Context

We need a forensic trail of send, consent, sign, void, and finalize. Ordinary updateable log tables can be silently edited. We also must not claim this equals a qualified timestamp or legal archive.

## Decision

- Per-document audit events with monotonic `sequence`, `prevHash`, and `thisHash` ([audit model](../audit-model.md)).
- Application code only inserts. Prefer a DB role that cannot UPDATE or DELETE these rows.
- Payloads contain opaque ids and non-Restricted metadata only.
- A verifier job recomputes the chain. Failures follow the [audit verification runbook](../../runbooks/audit-verification-failure.md).

## Consequences

- Erasure of personal data in-place would break the chain; that conflict is flagged for legal review.
- Insiders with superuser or backup rewrite can still tamper; hash chain detects application-level edits, not a compromised root.

## Alternatives

- Updateable `audit_logs` table: insufficient integrity.
- External WORM/object-lock ledger in v1: stronger, more cost; revisit after product-market fit.
- Digitally signing each event with an HSM: not v1; would still not be eIDAS qualified by default.
