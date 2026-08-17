# ADR-0005: Asynchronous finalization worker

## Status

Accepted.

## Context

Flattening signatures into a PDF is CPU-heavy and uses untrusted parsers. Doing it on the sign HTTP request would block signers, enlarge the attack surface of the API process, and make timeouts racy.

## Decision

- `apps/worker` performs PDF inspection, flattening, and artifact upload.
- When a document becomes `completed`, the API writes an outbox event and returns success for the sign request.
- The worker claims a lease (`finalizing`), works outside the DB transaction, then marks `finalized` or `finalization_failed`.
- Job payloads are not the source of truth; the worker re-reads PostgreSQL after authorization-equivalent internal checks (tenant/document ids from the outbox row must still match loaded rows).

## Consequences

- Owners may see a short window with all signatures captured but no artifact. UI must show `completed` / `finalizing`.
- Retries and duplicate messages are mandatory design ([ADR-0008](0008-idempotency-strategy.md)).
- pdf-lib stays off the request path.

## Alternatives

- Inline finalization in the API: rejected for timeout and isolation reasons.
- Separate queue product (SQS) without an outbox: dual-write risk ([ADR-0011](0011-outbox-pattern.md)).
