# Reliability model

How the system stays correct under retries, crashes, and duplicate messages. Availability targets are not SLAs until product and legal define them.

## Goals

- State transitions are transactional and isolated.
- Every mutation that can be retried is idempotent.
- Database transactions never include object-storage or HTTP calls.
- Duplicate queue delivery cannot finalize twice or apply a second signature for the same signer.

## Transaction rules

Inside a transaction: read authorized rows, enforce domain rules, write document/signer/session/consent/audit/outbox/idempotency rows, commit.

Outside a transaction: upload/download PDFs, call email providers, parse PDFs, CPU-heavy flattening.

If storage succeeds and the follow-up transaction fails, reconciliation uses content-addressed keys and conditional updates (orphan objects are safe; missing DB pointers are retried).

## Outbox

See [ADR-0011](adrs/0011-outbox-pattern.md).

**Delivery guarantee: at-least-once, not exactly-once.** If the API transaction commits, the worker will attempt the handler one or more times. Duplicate handler invocation is expected after a crash, a timeout, or an expired lease. Handlers must be idempotent. This system does **not** provide exactly-once processing.

1. Write domain change + `outbox_events` row (`pending`) and a linked `background_jobs` row in one commit. Payloads contain opaque internal ids only (never raw signing tokens, signature PNGs, or PDF bytes).
2. Poller claims a row with `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)`. Concurrent workers cannot claim the same row while a lease is held. Claim also covers `processing` rows whose `leaseUntil` is in the past (crash recovery).
3. Worker performs side effects **outside** the database transaction (object storage, PDF, email). Then a short transaction marks `processed` / `succeeded`, or schedules a retry, or dead-letters.
4. Retryable failures (`external_service`, `rate_limit`, `conflict`, unknown errors) use exponential backoff with equal jitter and set `availableAt`. Non-retryable failures (`validation`, `integrity`, `authentication`, `authorization`, `not_found`, `invalid_state_transition`) go to `failed` immediately (dead letter). After `maxAttempts` (default 8), retryable work is also terminal.
5. `lastErrorCode` stores `{category}:{kind}` such as `retryable:external_service`. Correlation uses `requestId` (HTTP), `outboxEventId`, `jobId`, and `documentId` on outbox, jobs, audit, and worker logs.

At-least-once delivery is expected. Handlers must tolerate duplicates ([ADR-0008](adrs/0008-idempotency-strategy.md)). Email providers may send more than one invitation for the same outbox id; signing remains token-hash safe. **Do not claim exactly-once processing.**

## Idempotency

| Operation                                  | Key                                              | Replay behavior                                                                            |
| ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| HTTP mutations (send, sign, void, decline) | `Idempotency-Key` + tenant + principal + route   | Return stored response if key exists and body hash matches; 409 if same key different body |
| Session issue                              | `(documentId, signerId)` active session          | Return existing active session or revoke+replace per policy, never two actives             |
| Sign complete                              | Unique `(documentId, signerId)` signed           | Second success is a no-op                                                                  |
| Finalize                                   | Conditional state + unique artifact per document | Second worker exits                                                                        |
| Email send                                 | Outbox id                                        | Provider idempotency key = outbox id                                                       |

## Retries and backoff

Workers use bounded exponential backoff with jitter. Permanent errors (malformed PDF that fails safety checks) go to `failed` and page operators. Transient errors (storage 503) retry until the attempt budget, then `finalization_failed` for documents.

## Clock and expiry

All comparisons use server UTC ([ADR-0012](adrs/0012-utc-timestamp-handling.md)). Expiry jobs are idempotent: transitioning an already terminal document is a no-op.

## Concurrency

- Row-level locks or `UPDATE ... WHERE state = expected` for document state.
- Parallel signers at the same routing order update different signer rows; document state uses a single conditional transition to `completed`.
- Unique indexes: one active session per signer (partial), one signed completion per signer, one artifact per document.

## Failure modes

| Failure                                       | Detection                                    | Recovery                                                                                                      |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| API crash after commit, before response       | Client retries with same idempotency key     | Stored result                                                                                                 |
| Worker crash after upload, before `finalized` | Lease expires; object exists                 | Retry upload is same key; then DB transition                                                                  |
| Worker crash before upload                    | Lease expires                                | Another worker claims                                                                                         |
| Duplicate outbox delivery                     | Handler sees `finalized` or processed outbox | No-op                                                                                                         |
| Email provider timeout                        | Outbox not processed                         | Retry; may duplicate email — signing remains token-hash safe; **Legal review required** for duplicate notices |
| Postgres unavailable                          | API 5xx                                      | No partial commit                                                                                             |
| Object storage misconfigured                  | Upload errors; auth failures                 | Do not mark finalized; [runbook](../runbooks/document-finalization-failure.md)                                |

## Related documents

[Document lifecycle](document-lifecycle.md), [ADR-0005](adrs/0005-asynchronous-finalization-worker.md), [ADR-0011](adrs/0011-outbox-pattern.md).
