# Runbook: document finalization failure

**Severity:** high if customers cannot obtain a finalized artifact after all required signers completed. Not a security breach by itself.

The API records consent and signature captures, then publishes `flatten_signature`. The worker loads the source revision, verifies bytes, flattens with pdf-lib, uploads a content-addressed object, and commits database state plus an append-only audit event in one transaction.

## Symptoms

- Document state stuck in `completed`, `finalizing`, `in_progress` (after a signer), or `finalization_failed`.
- Metrics: flatten failure rate or outbox pending age high.
- Owner cannot download an artifact; API returns conflict or not found for the artifact.
- Worker logs: storage errors, PDF parse errors, lease stolen (correlation ids and opaque resource ids only).

## Immediate actions

1. Do **not** mark the document `finalized` by hand without an artifact digest.
2. Do **not** delete outbox rows, audit events, or object keys to “unblock.”
3. Do **not** download customer PDFs to laptops or paste bytes into tickets.
4. Capture `correlationId` / `requestId`, `organizationId`, `documentId`, `jobId`, `outboxEventId`, worker attempt count, UTC time.

## Diagnosis

1. Read document state and lease (`leaseOwner`, `leaseUntil`, `currentRevisionId`, `version`) in PostgreSQL.
2. Check outbox for `flatten_signature` on this document: `pending` / `processing` / `failed`.
3. Check `signature_fields.flattenedRevisionId` for the signer. Already set means this signer’s image was applied; retry should reuse that revision.
4. Check object storage for `org/{organizationId}/revisions/{sha256}` and `org/{organizationId}/artifacts/{sha256}` if a digest was already written.
5. Classify using worker `lastErrorCode` and the typed failure code in audit `finalization_failed` payload:

| Observation                             | Likely cause                       | Code                                        |
| --------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `finalizing` and lease in the future    | Worker still running or hung       | —                                           |
| `finalizing` and lease in the past      | Crash; retry should reclaim        | `CONCURRENT_FINALIZATION` on the loser      |
| Stored size or SHA-256 ≠ revision row   | Source object corrupted or swapped | `SOURCE_INTEGRITY_FAILURE`                  |
| Missing source object                   | Bucket/key/IAM                     | `SOURCE_OBJECT_NOT_FOUND`                   |
| Encrypted or unreadable PDF             | Unsupported source                 | `ENCRYPTED_PDF_UNSUPPORTED` / `INVALID_PDF` |
| PNG magic/size/dimensions               | Bad capture                        | `INVALID_SIGNATURE_IMAGE`                   |
| Page or rectangle vs server-owned field | Field does not match revision      | `INVALID_SIGNATURE_FIELD`                   |
| pdf-lib timeout or throw                | Generation                         | `PDF_GENERATION_FAILED`                     |
| Storage 5xx / timeout on put            | Upload                             | `FINAL_OBJECT_UPLOAD_FAILED`                |
| Get-after-put digest mismatch           | Persist integrity                  | `FINAL_OBJECT_INTEGRITY_FAILURE`            |
| Unique artifact / version conflict      | Concurrent winner                  | `CONCURRENT_FINALIZATION`                   |
| Upload ok, commit failed                | Retry reuses the same key          | `DATABASE_COMMIT_FAILED`                    |

## Remediation

- **Hung lease:** wait for expiry. Do not assign `finalized`. A later worker claim is conditional on an empty or expired lease plus document version.
- **Retryable storage/network/timeout/conflict:** leave the outbox row; the worker is idempotent ([reliability model](../architecture/reliability-model.md)). Same PNG and source bytes produce the same content-addressed key.
- **Permanent PDF/PNG/field failure:** keep `finalization_failed` (or dead-letter the outbox row); notify the document owner through product channels; do not bypass integrity checks.
- **Upload succeeded, DB did not:** rerun the worker. It must reuse `org/{organizationId}/revisions/{sha256}` / `artifacts/{sha256}` and then conditionally set `finalized` with the digest.
- **Finalized without artifact row:** retry still uploads/copies the current revision to the artifact key and inserts `finalized_artifacts` if missing.
- **Poison message:** after `maxAttempts` the outbox is `failed`; page humans. Orphan objects older than `WORKER_ORPHAN_OBJECT_TTL_MS` are deleted only when no revision, artifact, or field completion key references them.

## Verification

- State is `finalized` only after every required signer has signed **and** the last flatten committed.
- SHA-256 of stored artifact bytes equals `finalized_artifacts.sha256Digest` and the audit `finalizedSha256`.
- Audit chain verifies and includes `document_finalized` (plus `revision_added` for each per-signer intermediate revision).
- Payload contains document/signer/session/correlation ids, consent version, intent timestamp, field id, and hashes — never raw PDF/PNG bytes.
- Owner download works; other tenants still denied.

## Escalation

Platform on-call → storage/IAM owner if credentials or buckets are wrong → security if objects may have been public.

## Prevention

Document leases, optimistic `version` checks, content-addressed keys with expected-hash metadata, get-after-put rehash, payload size limits, pdf-lib timeouts (`WORKER_PDF_TIMEOUT_MS`), orphan GC, dashboards on outbox age. Delivery is at-least-once, not exactly-once.
