# Runbook: document finalization failure

**Severity:** high if customers cannot obtain a finalized artifact after all signers completed. Not a security breach by itself.

Application code does not exist yet; follow this when the worker is live.

## Symptoms

- Document state stuck in `completed`, `finalizing`, or `finalization_failed`.
- Metrics: finalization failure rate or outbox pending age high.
- Owner cannot download an artifact; API returns conflict or not found for the artifact.
- Worker logs: storage errors, PDF parse errors, lease stolen (correlation ids only).

## Immediate actions

1. Do **not** mark the document `finalized` by hand without an artifact digest.
2. Do **not** delete outbox rows, audit events, or object keys to “unblock.”
3. Do **not** download customer PDFs to laptops or paste bytes into tickets.
4. Capture `correlationId`, `tenantId`, `documentId`, `jobId`, worker attempt count, UTC time.

## Diagnosis

1. Read document state and lease (`leaseOwner`, `leaseUntil`) in PostgreSQL.
2. Check outbox for this document: `pending` / `processing` / `failed`.
3. Check object storage for `tenants/{tenantId}/artifacts/{digest}` if a digest was already written.
4. Classify:

| Observation | Likely cause |
| --- | --- |
| `finalizing` and lease in the future | Worker still running or hung |
| `finalizing` and lease in the past | Crash; watchdog should move to `finalization_failed` |
| `finalization_failed`, PDF validation error | Malformed or rejected PDF |
| Storage 403/404 | Bucket policy or wrong credentials |
| Repeated success logs but state `completed` | Transaction after upload failed |
| Two artifact objects, one document | Concurrent upload; DB unique constraint should keep one digest |

## Remediation

- **Hung lease:** wait for expiry or, if the process is confirmed dead, let the watchdog release. Do not assign `finalized`.
- **Retryable storage/network:** re-queue outbox; worker is idempotent ([reliability model](../architecture/reliability-model.md)).
- **Permanent PDF failure:** keep `finalization_failed`; notify document owner through product channels; do not bypass safety checks.
- **Upload succeeded, DB did not:** rerun worker; same content-addressed key; then conditional `finalized`.
- **Poison message:** mark outbox `failed` after budget; page humans.

## Verification

- State is `finalized`.
- Stored digest matches bytes in object storage.
- Audit chain verifies and includes `document_finalized`.
- Owner download works; other tenants still denied.

## Escalation

Platform on-call → storage/IAM owner if credentials or buckets are wrong → security if objects may have been public.

## Prevention

Lease watchdogs, storage canaries, payload size limits, PDF safety tests, dashboards on outbox age.
