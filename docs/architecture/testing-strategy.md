# Testing strategy

Every feature includes tests, error handling, logging, and documentation. Vitest covers unit and integration tests. Playwright covers end-to-end tests. Shared builders live in `packages/test-utils`.

Do not hit production services. Do not assert on secrets, raw tokens, or full PII in snapshots.

## Layers

| Layer       | What                                                                                    | Where                                                     |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Unit        | Domain invariants, tenant repository contracts, error mapping, architecture import bans | `packages/domain`, `packages/application`; frozen clock   |
| Integration | Prisma repositories, HTTP adapters, worker handlers, outbox poller                      | Real PostgreSQL; MinIO when storage is involved           |
| Contract    | Zod schemas in `packages/contracts` reject extra fields and oversize payloads           | Vitest                                                    |
| E2E         | Owner login/upload/send via API fixtures; signer UI; worker finalization; audit verify  | Playwright against local compose + API + worker + Next.js |

Sender console UI is not built yet. Admin steps in e2e use authenticated HTTP fixtures, not a dashboard. Signer consent, intent, canvas, and completion screens are browser-driven.

## Playwright e2e

**Local**

1. Docker available (Compose starts Postgres; MinIO is not used by these tests).
2. `pnpm --filter @esign/web exec playwright install chromium`
3. `pnpm test:e2e`

Playwright global setup runs `infrastructure:up`, migrates, and seeds. It then starts the API, worker, and Next.js with `OBJECT_STORAGE_DRIVER=filesystem` so both processes share `tmp/e2e-object-storage`. Do not reuse a leftover API process that still uses in-memory storage.

Tag filters:

```bash
pnpm --filter @esign/web exec playwright test --grep @smoke
pnpm --filter @esign/web exec playwright test --grep @security
pnpm --filter @esign/web exec playwright test --grep @resilience
```

**CI**

The `e2e` GitHub Actions job installs Chromium, then runs `pnpm test:e2e` (same global setup). Artifacts: `apps/web/playwright-report` and `apps/web/test-results`. Traces and screenshots are kept on failure; teardown redacts `token=` query strings and JSON token fields.

Tests create their own documents and signers. They poll inspection and finalization with deadlines instead of fixed sleeps.

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

**Background jobs (outbox)**

Delivery is at-least-once, not exactly-once. Tests must not assert a single handler invocation as a platform guarantee; they may assert idempotent outcomes.

- API publish writes `outbox_events` and `background_jobs` in one transaction.
- Two concurrent workers: `FOR UPDATE SKIP LOCKED` lets only one claim a given row while its lease is held.
- Duplicate delivery: second handler run is a no-op when work is already done.
- Crash after object upload, before outbox `processed`: retry; content-addressed keys keep one object.
- Crash before the outbox commit: lease expiry or retry schedules another attempt.
- Expired processing lease is recoverable by another worker.
- Poison / non-retryable validation: dead-letter (`failed`) with no retry.
- Retryable failures use exponential backoff with jitter until `maxAttempts`.

**Security**

- Tenant A cannot read tenant B’s document by ID (IDOR).
- Client-supplied `signerId` / `documentId` that do not match the token hash fail.
- Stolen expired token fails.
- Oversize body and non-PDF magic bytes rejected.
- CSRF: cookie-authenticated mutation without token rejected.
- Unauthenticated, unauthorized role, wrong organization, revoked session, and expired session fail closed.
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
