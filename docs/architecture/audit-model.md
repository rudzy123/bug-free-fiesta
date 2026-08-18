# Audit model

Security-relevant actions are stored as **Audit events**: append-only and hash-chained per document. This is an engineering integrity control. It is not a qualified timestamp, not a WORM legal archive, and not evidence that a court must accept.

**Legal review required:** retention of audit data, whether customers may export it as “certificate of completion,” and wording of any verification report.

## Design

Each event contains:

| Field        | Purpose                                                               |
| ------------ | --------------------------------------------------------------------- |
| `id`         | Opaque event id (UUIDv7).                                             |
| `tenantId`   | Isolation key.                                                        |
| `documentId` | Chain is per document.                                                |
| `sequence`   | Monotonic integer per document, starting at 0 (genesis).              |
| `type`       | Stable enum (see below).                                              |
| `actorType`  | `account_user`, `signer`, `worker`, `system`.                         |
| `actorId`    | Opaque id or `system`. Never a raw email as the only identifier.      |
| `occurredAt` | UTC instant from the server clock.                                    |
| `payload`    | JSON with opaque ids and non-sensitive metadata only.                 |
| `prevHash`   | Hex digest of the previous event (`genesis` sentinel for sequence 0). |
| `thisHash`   | Digest of canonical payload + `prevHash` + sequence metadata.         |

`thisHash = H(canonical(prevHash, sequence, type, actorType, actorId, occurredAt, payload))`.

Canonicalization must be explicit (JCS or a documented field order) so verification is deterministic.

## Chain rules

- Insert only. Application roles must not `UPDATE` or `DELETE` audit rows. Prefer a database role that physically cannot.
- Sequence is unique per `(documentId, sequence)`.
- `prevHash` of event n must equal `thisHash` of event n-1.
- Genesis payload includes document id, tenant id, and a platform chain version.

Verification walks the chain from 0 and recomputes hashes. A mismatch is an incident ([runbook](../runbooks/audit-verification-failure.md)).

## Event types (v1)

| Type                   | When                                                   |
| ---------------------- | ------------------------------------------------------ |
| `document_created`     | Draft created.                                         |
| `revision_added`       | New source PDF stored.                                 |
| `fields_updated`       | Draft field set changed.                               |
| `signers_updated`      | Draft routing changed.                                 |
| `document_sent`        | Transition to `sent`.                                  |
| `session_issued`       | Signing session created (store session id, not token). |
| `session_revoked`      | Void, re-issue, or security revoke.                    |
| `consent_recorded`     | Consent row written (`consentCopyId`, not full PII).   |
| `signer_signed`        | Signer completed required fields.                      |
| `signer_declined`      | Decline.                                               |
| `document_voided`      | Void.                                                  |
| `document_expired`     | Expiry.                                                |
| `finalization_started` | Lease acquired.                                        |
| `document_finalized`   | Artifact digest recorded.                              |
| `finalization_failed`  | Lease released without artifact.                       |
| `artifact_downloaded`  | Authorized download of finalized bytes.                |
| `inspection_accepted`  | Source PDF passed inspection.                          |
| `inspection_rejected`  | Source PDF failed inspection.                          |
| `upload_abandoned`     | Issued upload session expired without completion.      |

Do not put raw tokens, passwords, authorization headers, signature image bytes, or full PDF contents in `payload`.

Account-user login, logout, and session revocation are stored in `account_security_events` (append-only, not hash-chained to a document). Those rows also must not contain emails, secrets, or raw session tokens.

## Hash algorithm

Use a single platform-wide algorithm (SHA-256 unless an ADR changes it). Record `chainVersion` so verifiers know the canonicalization rules. This is integrity hashing, not a digital signature by a certificate authority.

## What audit does not do

- It does not prevent an insider with database and storage admin on backups from rewriting history if backups are also replaced. Mitigate with least privilege, separate audit storage later, and backup controls ([threat model](../security/threat-model.md)).
- It does not prove the signer’s legal identity.
- It does not replace application authorization.

## Related ADRs

[ADR-0006](adrs/0006-hash-chained-append-only-audit.md), [ADR-0012](adrs/0012-utc-timestamp-handling.md).
