# Retention model

Technical capabilities for keeping or deleting data. This is **not** a records-retention policy and **not** a claim of compliance with any statute of limitations, HIPAA, GDPR, or similar.

**Legal review required:** how long documents, consent, and audit events must be kept; whether signers have erasure rights that conflict with the other party’s record-keeping; legal holds; cross-border storage; subprocessors.

## Principles

1. Default engineering posture: do not silently delete audit events or finalized artifacts.
2. Product deletions (if any) are explicit, authorized, tenant-scoped, and themselves audited—except audit rows, which remain append-only.
3. Voiding a document does not erase history.
4. Backup retention can outlive application deletion; operators must treat backups as Restricted.

## Intended v1 behavior

| Record | While document is active | After terminal state (`finalized`, `voided`, `expired`, `declined`) |
| --- | --- | --- |
| Draft revisions superseded in `draft` | Keep until send or explicit replace policy (keep last N revisions) | Frozen revision kept |
| Signing sessions / token hashes | Keep until expiry + short grace for idempotent retries | Keep hashes until the retention job says otherwise; raw tokens never stored |
| Consent records | Keep | Keep; do not delete because the document voided |
| Audit events | Keep forever at the application layer | Keep; no application `DELETE` |
| Finalized artifacts | N/A | Keep in private storage |
| Outbox / job rows | Keep until processed + short operational window | May purge processed outbox after a configurable UTC interval (operational, not legal archive) |
| Idempotency keys | TTL from first request (e.g. 24h) | Expire |

Exact TTLs are configuration in `packages/config`, not hardcoded.

## Erasure vs audit

If a tenant requests deletion of personal data, engineering must **not** invent a process that rewrites the hash chain. Options that need legal and product decisions:

- Tombstone personal fields in mutable tables while leaving audit as opaque ids.
- Export-then-delete programs with chain-breaking acknowledged as a legal/process event.
- Isolation of “legal hold” tenants where purge is refused.

**Legal review required** before implementing any erasure that touches signer identity, documents, or audit.

## Backups

PostgreSQL and object-storage backups are Restricted. Restore is an operator action with dual control where practical. Compromised backups are a threat ([threat model](../security/threat-model.md)).

## Related documents

[Data classification](data-classification.md), [Audit model](audit-model.md), [Privacy considerations](../security/privacy-considerations.md).
