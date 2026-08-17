# ADR-0011: Outbox pattern for reliable background jobs

## Status

Accepted.

## Context

If the API commits `completed` and then fails to enqueue a job, the document never finalizes. If it enqueues then fails to commit, the worker processes a phantom. Dual writes to Postgres and a queue are not atomic.

## Decision

- In the same PostgreSQL transaction as the state transition, insert an `outbox` row (`pending`, type, aggregate ids, correlation id, UTC).
- A poller (worker) claims rows with `UPDATE ... WHERE status = pending` (or lease expired), then performs side effects, then marks `processed`.
- v1 may use the outbox table as the queue (no external broker required). An external broker may be added later as a consumer of already-committed outbox rows.
- Handlers are idempotent ([ADR-0008](0008-idempotency-strategy.md)).

## Consequences

- Polling latency vs push queues; acceptable for v1 finalization.
- Outbox payloads must not contain Restricted blobs.
- Processed rows may be purged on an operational TTL; that is not audit retention.

## Alternatives

- Listen/notify only: can miss events on crash.
- Application-level “best effort enqueue”: silent data loss.
- Dual-write to SQS in the request: rejected.
