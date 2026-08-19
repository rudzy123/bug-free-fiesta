# Runbook: outbox dead letter (terminal job failure)

**Severity:** high if a document never inspects, notifies, or finalizes. `failed` outbox rows are the dead letter. Delivery is at-least-once, not exactly-once.

## Symptoms

- Worker `/health/ready` `queue.failed` increasing, or `queue.stale: true`.
- `outbox_events.status = failed` and `background_jobs.status = failed`.
- Logs: `outbox job failed` with `terminal: true`, `correlationId`, `outboxEventId`, `jobId`, `documentId`, `errorCategory`.

## Immediate actions

1. Do **not** delete outbox, job, or audit rows to “unblock.”
2. Do **not** put raw tokens, PDFs, or signature images into a re-queue payload.
3. Capture `correlationId` (`requestId`), `outboxEventId`, `jobId`, `documentId`, `lastErrorCode`, UTC time.

## Diagnosis

| `lastErrorCode`                                  | Meaning                         | Action                                                                                                                         |
| ------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `non_retryable:validation`                       | Poison payload or handler input | Inspect payload keys (must be opaque ids). Fix publisher; do not retry as-is.                                                  |
| `non_retryable:integrity`                        | Domain integrity failed         | Stop. Verify audit/object keys.                                                                                                |
| `retryable:external_service` after `maxAttempts` | Storage/network exhausted       | Check object storage; after repair, reset that row to `pending` with `availableAt = now()` if the handler is still idempotent. |
| `retryable:unknown` after budget                 | Unclassified crash              | Read worker logs for that `outboxEventId`.                                                                                     |

Expired `processing` leases are recovered automatically on the next poll (`FOR UPDATE SKIP LOCKED`). If they persist, the worker process is down.

## Remediation

- **Poison:** leave `failed`. Correct the bug. Optionally enqueue a **new** outbox row in a new transaction; do not mutate audit.
- **Transient exhausted:** restore the dependency; operators may set `status=pending`, clear `leaseOwner`/`leaseUntil`, and set `availableAt` to now. That causes another at-least-once attempt.
- **Hung pending:** confirm the worker; check `WORKER_POLL_INTERVAL_MS` and `/health/ready` `checks.poller`.

## Related documents

[Reliability model](../architecture/reliability-model.md), [ADR-0011](../architecture/adrs/0011-outbox-pattern.md), [Inspection failure](document-inspection-failure.md).
