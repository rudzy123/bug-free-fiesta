# Remediation plan — 2026-08-25 adversarial review

Ordered by severity. Implement one coherent batch per iteration.

## Decision blockers (not code-only)

| Finding | Decision owner                | Why blocked                                                                                       |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| SEC-001 | Infrastructure / architecture | S3-compatible adapter must live outside domain/application (AWS SDK banned there); provider + IAM |
| SEC-002 | Product + legal               | Malware/PDF scanner vendor; subprocessor review                                                   |
| SEC-008 | Infrastructure                | Shared rate-limit store (e.g. Redis)                                                              |
| SEC-011 | Legal + product               | Retention vs erasure vs legal hold                                                                |
| SEC-012 | Operations                    | Backup/restore RPO/RTO drill                                                                      |
| SEC-019 | Architecture + DBA            | RLS session GUC design                                                                            |
| SEC-022 | Product                       | Production OIDC completeness                                                                      |

## Dependencies

```
SEC-001 (S3 adapter) ──► production refuse memory/filesystem
SEC-005 (key safety) ──► safe for both filesystem and future S3 keys
SEC-003 (BFF XFF) ──► TRUST_PROXY ops docs (threat-model residual)
SEC-004 independent of SEC-003
SEC-006 after SEC-001 desirable (verify against real storage)
SEC-007 independent integrity hardening
```

## Schema migrations

| Finding                             | Migration required                                 |
| ----------------------------------- | -------------------------------------------------- |
| SEC-001–005, 006–010, 013, 015, 021 | No                                                 |
| SEC-019                             | Yes — RLS policies                                 |
| SEC-020                             | Yes if pepper/HMAC — rehash or invalidate sessions |

## Breaking API / config changes

| Finding | Breaking?                                     |
| ------- | --------------------------------------------- |
| SEC-004 | **Yes** — reject query-string exchange tokens |
| SEC-001 | **Yes** — production driver/config            |
| SEC-002 | **Yes** — upload acceptance                   |
| SEC-003 | Ops/`TRUST_PROXY` contract; clients unchanged |
| SEC-005 | No for valid keys                             |
| SEC-020 | **Yes** — existing token hashes               |
| SEC-021 | Possible                                      |

## Batches

### Batch 1 — Signer edge + object-key path safety (completed 2026-08-25)

**Findings:** SEC-003, SEC-004, SEC-005 — **fixed**  
**Schema:** none  
**Breaking:** SEC-004 query tokens only  
**Regression tests:** passed after fix (failed before).

### Batch 2 — Critical storage adapter (deferred)

SEC-001: S3-compatible port implementation + production driver gate.

### Batch 3 — Critical PDF inspection (deferred)

SEC-002: production inspector adapter after vendor decision.

### Batch 4 — Integrity hardening

SEC-006, SEC-007 (digest verify on inspect/upload).

### Batch 5 — Edge observability & CSP

SEC-009, SEC-010.

### Batch 6 — Low priority

SEC-013, SEC-015, SEC-020, SEC-021.

## Unresolved Critical / High (after Batch 1)

| ID      | Severity | Status            |
| ------- | -------- | ----------------- |
| SEC-001 | critical | deferred_decision |
| SEC-002 | critical | deferred_decision |
| SEC-003 | high     | **fixed**         |
| SEC-004 | high     | **fixed**         |
| SEC-005 | high     | **fixed**         |
