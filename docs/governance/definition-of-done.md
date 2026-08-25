# Definition of done

A change is **done** when every item below that applies to the change is satisfied. The [pull request template](../../.github/PULL_REQUEST_TEMPLATE.md) repeats the merge-facing subset.

## Every meaningful feature

| Area               | Requirement                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Behavior           | Functional implementation matches the request; no unrelated rewrites                                                                      |
| Authorization      | Deny-by-default; server-side authn/authz on every sensitive operation                                                                     |
| Tenant isolation   | Queries and mutations scoped to the authorized `organizationId`; tests for cross-tenant access where applicable                           |
| Input validation   | External input validated at the boundary with Zod (`packages/contracts`)                                                                  |
| State transitions  | Domain/application enforces valid document and signing states; DB constraints where they prevent corruption                               |
| Idempotency        | Mutation endpoints and retryable worker jobs accept idempotency keys or are otherwise safe to retry                                       |
| Concurrency        | Race-prone paths (ordered signing, outbox claims, finalization) handled with transactions, leases, or version checks                      |
| Audit              | Security-relevant actions append hash-chained audit events; never update or delete audit rows in application code                         |
| Logging            | Structured logs via `packages/logger` with correlation IDs; no passwords, tokens, cookies, or document bytes                              |
| Metrics            | Observable operations emit or extend `esign_*` metrics where the repo already instruments similar paths                                   |
| Errors             | Typed exceptions mapped to stable public envelopes; details only in logs                                                                  |
| Unit tests         | Domain invariants and pure application logic covered                                                                                      |
| Integration tests  | HTTP adapters, repositories, and worker handlers covered when persistence or I/O changes                                                  |
| End-to-end         | Critical sender/signer journeys covered when UI or cross-service flows change                                                             |
| API contract       | Route or schema changes update `packages/contracts` and [OpenAPI](../api/openapi.yaml) in the same change                                 |
| Documentation      | ADR, runbook, config docs, or governance updated when behavior or ops contracts change                                                    |
| Threat model       | New attack surface or trust-boundary change noted in the PR; update [threat model](../security/threat-model.md) when residual risk shifts |
| Migrations         | Schema changes ship a **new** Prisma migration (never edit an applied migration); `pnpm release:check` passes                             |
| Rollout / rollback | Config breaks, pepper rotation, or irreversible migrations include operator notes or a forward-fix/rollback plan                          |
| CI                 | Format, lint, typecheck, unit tests, build, and applicable integration/e2e jobs pass                                                      |
| History            | Focused commits using [Conventional Commits](conventional-commits.md)                                                                     |

## UI (when `apps/web` changes)

- Keyboard operable, labeled controls, visible focus, responsive layout

## Security-sensitive (when auth, documents, storage, or audit change)

- Security notes in the PR
- Tests for IDOR / tenant isolation or token handling as applicable
- Audit records remain append-only
- No legal or compliance claims (ESIGN, HIPAA, SOC 2, ISO 27001, and similar)

## Explicitly not done

- “Works on my machine” without the quality gates
- Provisioning real cloud accounts, clusters, or vendor resources from this repository
- Calling a control “compliant” because it exists

Production container images and the operator playbook: [deployment index](../deployment/README.md).
