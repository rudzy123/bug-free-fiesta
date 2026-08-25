# Remediation plan — 2026-08-25 adversarial review

Ordered by severity. Implement one coherent batch per iteration.

## Decision blockers (not code-only)

| Finding | Decision owner                | Why blocked                                                                       |
| ------- | ----------------------------- | --------------------------------------------------------------------------------- |
| SEC-002 | Product + legal (optional AV) | Structural inspector shipped; commercial AV/sanitizer still optional subprocessor |
| SEC-008 | Infrastructure                | Shared rate-limit store (e.g. Redis)                                              |
| SEC-011 | Legal + product               | Retention vs erasure vs legal hold                                                |
| SEC-012 | Operations                    | Backup/restore RPO/RTO drill                                                      |
| SEC-019 | Architecture + DBA            | RLS session GUC design                                                            |
| SEC-022 | Product                       | Production OIDC completeness                                                      |

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

### Batch 2 — Critical storage adapter (completed 2026-08-25)

**Findings:** SEC-001 — **fixed**  
**Decision:** New package `@esign/object-storage` (S3 API via `@aws-sdk/client-s3`; MinIO-compatible). Domain/application stay SDK-free.  
**Schema:** none  
**Breaking:** Production must set `OBJECT_STORAGE_DRIVER=s3` and credentials.  
**Regression tests:** passed after fix.

### Batch 3 — Critical PDF inspection (completed 2026-08-25)

**Findings:** SEC-002 — **fixed** (structural inspector; commercial AV deferred as optional)  
**Decision:** Ship `DOCUMENT_INSPECTOR=structural` as the production adapter (denylist of active/dangerous PDF features). Keep `fail_closed` as kill-switch. Do not claim antivirus.  
**Schema:** none  
**Breaking:** Production should use `structural` for upload acceptance (config enum extended).  
**Regression tests:** passed after fix.

### Batch 4 — Integrity hardening (completed 2026-08-25)

**Findings:** SEC-006, SEC-007 — **fixed**  
**Schema:** none  
**Breaking:** none (fail closed on integrity mismatch)  
**Regression tests:** `document-ingestion.test.ts` SEC-006/SEC-007 cases.

### Batch 5 — Edge observability & CSP

SEC-009, SEC-010.

### Batch 6 — Low priority

SEC-013, SEC-015, SEC-020, SEC-021.

## Unresolved Critical / High (after Batch 4)

| ID      | Severity | Status    |
| ------- | -------- | --------- |
| SEC-001 | critical | **fixed** |
| SEC-002 | critical | **fixed** |
| SEC-003 | high     | **fixed** |
| SEC-004 | high     | **fixed** |
| SEC-005 | high     | **fixed** |

Accepted critical/high remain fixed. Open mediums include SEC-008 (deferred), SEC-009, SEC-010, plus lows.
