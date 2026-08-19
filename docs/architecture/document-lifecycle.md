# Document lifecycle

State machine for the **Document** aggregate. The API is the only authority. The browser may suggest a next action; it must not set `state`.

## States

| State                 | Meaning                                                              | Signing allowed  | Terminal        |
| --------------------- | -------------------------------------------------------------------- | ---------------- | --------------- |
| `draft`               | Owner uploads a source PDF.                                          | No               | No              |
| `prepared`            | Signers, signing mode, and server-owned fields are valid.            | No               | No              |
| `sent`                | Frozen for signing; no signatures yet.                               | Yes, per routing | No              |
| `in_progress`         | At least one required signer has signed; others remain.              | Yes, per routing | No              |
| `completed`           | All required signers signed; artifact not yet stored.                | No               | No              |
| `finalizing`          | A worker holds a lease to build the artifact.                        | No               | No              |
| `finalized`           | Artifact digest stored; document immutable for signing.              | No               | Yes for signing |
| `voided`              | Cancelled by an authorized tenant member.                            | No               | Yes             |
| `expired`             | `expiresAt` passed before completion.                                | No               | Yes             |
| `declined`            | A signer declined; remaining signers cannot complete.                | No               | Yes             |
| `finalization_failed` | Lease released after failed attempts; waiting for retry or operator. | No               | No              |

`finalization_failed` is operational, not a signer-facing success state. Operators may re-queue finalization if the document is still complete and not voided.

## Source inspection

Uploaded PDFs stay in `draft` with `inspectionStatus` of `pending`, `accepted`, or `rejected`. Signing is unavailable until inspection is `accepted` and the document is later `sent`. Send must refuse a draft whose inspection is not `accepted` or that has no current revision.

The inspector is an application port (malware scanning and advanced PDF checks). The bundled `local` adapter is **NON-PRODUCTION**.

## Permitted transitions

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> prepared: signers and fields valid
  prepared --> draft: preparation no longer complete
  draft --> sent: owner sends
  prepared --> sent: owner sends
  draft --> voided: owner discards
  prepared --> voided: owner discards
  sent --> in_progress: first signature
  sent --> completed: sole signer signs
  sent --> voided: authorized void
  sent --> expired: clock past expiresAt
  sent --> declined: signer declines
  in_progress --> in_progress: another signature
  in_progress --> completed: last required signature
  in_progress --> voided: authorized void
  in_progress --> expired: clock past expiresAt
  in_progress --> declined: signer declines
  completed --> finalizing: worker claims
  finalizing --> finalized: artifact stored
  finalizing --> finalization_failed: lease expired or attempts exhausted
  finalization_failed --> finalizing: retry claim
  finalized --> [*]
  voided --> [*]
  expired --> [*]
  declined --> [*]
```

Without the diagram, only these transitions are legal. Anything else is a conflict error.

| From                   | To                    | Actor / trigger                    | Guards                                                                                                                    |
| ---------------------- | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `draft`                | `prepared`            | Owner or member                    | Inspection `accepted`; at least one signer; each signer has a field; routing matches `ordered` or `parallel`.             |
| `prepared`             | `draft`               | Owner or member                    | Signers or fields no longer satisfy send guards.                                                                          |
| `draft` / `prepared`   | `sent`                | Document owner, admin, member      | Same send guards; freeze fields, routing, revision, and signing mode. Issue hashed sessions.                              |
| `draft` / `prepared`   | `voided`              | Owner or admin                     | Optional; equivalent to abandoning a draft. Still append audit.                                                           |
| `sent`                 | `in_progress`         | Sign mutation                      | First successful required signature.                                                                                      |
| `sent`                 | `completed`           | Sign mutation                      | Document had one required signer who just signed.                                                                         |
| `sent` / `in_progress` | `voided`              | Owner or admin                     | Not `completed` or later. Revoke active sessions.                                                                         |
| `sent` / `in_progress` | `expired`             | Expiry job or lazy check on access | `nowUtc >= expiresAt` and not completed. Revoke sessions.                                                                 |
| `sent` / `in_progress` | `declined`            | Assigned signer                    | Decline is explicit. Revoke other sessions.                                                                               |
| `in_progress`          | `in_progress`         | Sign mutation                      | Additional signer completed; others remain.                                                                               |
| `in_progress`          | `completed`           | Sign mutation                      | Last required signer completed. Publish `flatten_signature` (same job type as earlier signers). Flattening remains async. |
| `completed`            | `finalizing`          | Worker                             | Conditional update: `state = completed` AND lease empty or expired. Exactly one winner.                                   |
| `finalizing`           | `finalized`           | Worker                             | Artifact uploaded; digest persisted in the same short transaction as state change.                                        |
| `finalizing`           | `finalization_failed` | Worker or lease watchdog           | Attempts exceeded or lease expired without artifact.                                                                      |
| `finalization_failed`  | `finalizing`          | Worker retry                       | Same claim pattern as from `completed`.                                                                                   |

**v1 rule:** `completed`, `finalizing`, and `finalized` cannot move to `voided`. Changing that is **legal review required** (already-captured signatures).

## Multiple signers

Each **Signer** has `routingOrder` (unsigned integer, starting at 1) and `status`: `pending`, `signed`, `declined`. The document `signingMode` is `ordered` or `parallel`.

- **Ordered:** routing orders are unique and consecutive starting at 1. A signer may sign only when every required signer with a lower order is `signed`, and the document is `sent` or `in_progress`.
- **Parallel:** every signer has `routingOrder = 1` and may sign in any sequence, including concurrently.
- After each successful sign, the API publishes `flatten_signature`. The worker stamps that signer’s server-owned fields onto `currentRevisionId`, writes a new `intermediate` revision, and preserves prior flattened signatures. `COMPLETED` / `finalized` happen only when every required signer has status `signed` and the last flatten commits the artifact.

v1 does not mix ordered groups with parallel groups on the same document. The API ignores client-supplied “it is my turn” flags.

## Voided documents

- Allowed from `draft`, `sent`, `in_progress`.
- Effect: `state = voided`, all signing sessions `revoked`, further sign attempts return forbidden/conflict.
- Existing consent and signature payloads already stored remain as historical data; they are not erased by void. **Legal review required:** whether voiding must hide signatures from tenant UI; retention vs erasure.

## Expired signing vs expired document

- Document `expiresAt` (UTC) ends the whole workflow (`expired`).
- Signing session `expiresAt` ends that session only. If the document is still `sent` / `in_progress`, an authorized re-issue may create a new session (rate limited). **Legal review required:** re-issuance policy and notice to the signer.

Expiry is enforced on read and by a periodic worker. Do not rely on the client clock.

## Retries

- **Send:** idempotency key on the send mutation. Repeated send with the same key returns the original `sent` result; it does not re-freeze a different revision.
- **Sign:** idempotency key plus unique completion per `(documentId, signerId)` for successful sign. Duplicate submit returns the first completion.
- **Finalize:** content-addressed upload + conditional state transition. Retries after a crash must skip work if `finalized` or if the digest already exists.

## Concurrent finalization

Two workers must not both mark `finalized`.

1. Conditional `UPDATE ... WHERE id = :id AND state IN ('completed', 'finalization_failed')` set `finalizing`, `leaseOwner`, `leaseUntil`.
2. If row count is 0, exit (another worker won or state moved on).
3. Build PDF **outside** the database transaction. Upload artifact to a content-addressed key.
4. Short transaction: if still `finalizing` and lease owned by this worker, set `finalized`, store digest, append audit, complete outbox. Otherwise discard (the object key is immutable and may be orphan-GC’d later).

A unique constraint on “one finalized artifact per document” is a backstop.

## Related documents

[Signing lifecycle](signing-lifecycle.md), [Reliability model](reliability-model.md), [ADR-0005](adrs/0005-asynchronous-finalization-worker.md), [ADR-0008](adrs/0008-idempotency-strategy.md).
