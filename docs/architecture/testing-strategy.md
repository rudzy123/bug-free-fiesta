# Testing strategy

Every feature includes tests, error handling, logging, and documentation. Vitest covers unit and integration tests. Playwright covers end-to-end tests. Shared builders live in `packages/test-utils`.

Do not hit production services. Do not assert on secrets, raw tokens, or full PII in snapshots.

## Layers

| Layer | What | Where |
| --- | --- | --- |
| Unit | Domain invariants: transitions, routing order, hash chain append, idempotent complete-signer | Pure functions; frozen clock |
| Integration | Prisma repositories, HTTP adapters, worker handlers, outbox poller | Real PostgreSQL; MinIO when storage is involved |
| Contract | Zod schemas in `packages/contracts` reject extra fields and oversize payloads | Vitest |
| E2E | Owner sends → signer consents and signs → artifact downloadable by owner, not by other tenant | Playwright against local compose |

## Required scenarios (v1)

**Document lifecycle**

- Draft cannot be signed.
- Send freezes fields; later client coordinates are ignored.
- Ordered: signer 2 is forbidden until signer 1 completes.
- Parallel: two signers same order can complete without lost updates.
- Void from `in_progress` revokes sessions; sign returns forbidden.
- Expiry uses server UTC, not client-supplied time.
- Decline is terminal.

**Finalization**

- Two concurrent workers: exactly one `finalized` artifact.
- Worker crash after upload: retry still one digest.
- Duplicate outbox message: no-op.

**Security**

- Tenant A cannot read tenant B’s document by ID (IDOR).
- Client-supplied `signerId` / `documentId` that do not match the token hash fail.
- Stolen expired token fails.
- Oversize body and non-PDF magic bytes rejected.
- CSRF: cookie-authenticated mutation without token rejected.
- Forged `X-Tenant-Id` ignored.

**Audit**

- Each transition appends an event; verification recomputes the chain.
- Application repository refuses update/delete (test via API or DB role).

**Idempotency**

- Same `Idempotency-Key` + body: same result.
- Same key + different body: conflict.

## Test data

Builders create opaque ids, UTC instants, and hashed tokens. Fixtures never use sequential ids as public identifiers. PDFs used in tests are tiny, known-safe fixtures stored in-repo, not customer documents.

## What tests do not prove

Passing tests do not prove legal enforceability, penetration-test coverage, or certification. Performance and chaos tests are follow-up work.

## Related documents

[Document lifecycle](document-lifecycle.md), [Threat model](../security/threat-model.md), `.cursor/rules/testing.mdc`.
