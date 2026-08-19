# ADR-0011: Outbox pattern for reliable background jobs

## Status

Accepted.

## Context

If the API commits `completed` and then fails to enqueue a job, the document never finalizes. If it enqueues then fails to commit, the worker processes a phantom. Dual writes to Postgres and a queue are not atomic.

## Decision

- In the same PostgreSQL transaction as the state transition, insert an `outbox_events` row (`pending`, type, aggregate ids, correlation `requestId`, UTC) and a linked `background_jobs` tracking row.
- A poller (worker) claims rows with `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` for `pending` work whose `availableAt` has passed, **or** `processing` rows whose processing lease has expired. Side effects run outside the database transaction. Then the worker marks `processed` / `succeeded`, schedules a retry (`pending` + backoff `availableAt`), or dead-letters (`failed`).
- v1 uses the outbox table as the queue (no external broker required). An external broker may be added later as a consumer of already-committed outbox rows.
- Handlers are idempotent ([ADR-0008](0008-idempotency-strategy.md)). Delivery is **at-least-once**, never exactly-once: a crash after side effects and before the outbox commit, or an expired lease, causes another attempt.

## Consequences

- Polling latency vs push queues; acceptable for v1 finalization.
- Outbox payloads must not contain Restricted blobs (no tokens, PDFs, or signature images—opaque ids only).
- Processed rows may be purged on an operational TTL; that is not audit retention.
- Duplicate handler runs are a designed outcome. Operators must not treat `processed` as proof the side effect ran only once (especially email).

## Alternatives

- Listen/notify only: can miss events on crash.
- Application-level “best effort enqueue”: silent data loss.
- Dual-write to SQS in the request: rejected.
