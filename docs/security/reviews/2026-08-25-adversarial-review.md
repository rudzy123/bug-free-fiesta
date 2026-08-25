# Adversarial security review — 2026-08-25

Full-repository review (read-only analysis). Threat actors: authenticated tenants, anonymous signers, malicious members, insiders, bots.

**Not** a penetration test, compliance attestation, or legal opinion.

## Summary

| Severity      | Count |
| ------------- | ----- |
| Critical      | 2     |
| High          | 3     |
| Medium        | 9     |
| Low           | 5     |
| Informational | 3     |

Scaffolding shows strong design intent (tenant compound keys, hashed one-time tokens, CSRF, append-only audit, outbox `SKIP LOCKED`, finalization digests). The platform is **not** production-ready for legally important documents until Critical findings are addressed.

## Findings

Status values: `open` | `in_progress` | `fixed` | `deferred_decision` | `accepted_risk`.

Original evidence is preserved under each finding. Status updates append a **Remediation** note; they do not erase Evidence.

---

### SEC-001 — No production object-storage adapter

| Field        | Value                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Severity     | critical                                                                                                                    |
| CWE          | CWE-922                                                                                                                     |
| Status       | deferred_decision                                                                                                           |
| Location     | `packages/config/src/index.ts` (`OBJECT_STORAGE_DRIVER`); `packages/application/src/documents/filesystem-object-storage.ts` |
| Breaking fix | Yes — production must configure S3-compatible credentials                                                                   |
| Migration    | No DB migration                                                                                                             |

**Attack:** Deploy with `memory` or `filesystem`; scale or restart loses or diverges PDFs/signatures.

**Impact:** Confidentiality/integrity failure for core artifacts.

**Evidence:** Driver enum is only `memory` \| `filesystem`. Architecture tests forbid `@aws-sdk` in domain/application. MinIO Compose exists but is unused by the app driver.

**Remediation (planned):** Ship S3-compatible `ObjectStorage` in an infrastructure-allowed package; refuse `memory`/`filesystem` when `NODE_ENV=production`. **Blocked on:** infrastructure package placement and provider choice (product/ops).

---

### SEC-002 — No production PDF/malware inspector

| Field        | Value                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| Severity     | critical                                                                                   |
| CWE          | CWE-434                                                                                    |
| Status       | deferred_decision                                                                          |
| Location     | `packages/application/src/documents/inspectors.ts`; `packages/config` `DOCUMENT_INSPECTOR` |
| Breaking fix | Yes — upload acceptance changes                                                            |
| Migration    | Policy decision for existing drafts                                                        |

**Attack:** Hostile PDF with JS/actions/polyglot malware; or production stuck on fail-closed rejecting all uploads.

**Evidence:** Local stub checks `%PDF-` magic only; fail-closed always rejects; production forbids `local`.

**Remediation (planned):** Production sanitizer/scanner behind `DocumentInspector`. **Blocked on:** product/vendor selection and legal review of scanning subprocessors.

---

### SEC-003 — BFF forwards client-controlled `X-Forwarded-For`

| Field        | Value                                     |
| ------------ | ----------------------------------------- |
| Severity     | high                                      |
| CWE          | CWE-290                                   |
| Status       | fixed                                     |
| Location     | `apps/web/src/app/signing/api/_proxy.ts`  |
| Breaking fix | Ops: `TRUST_PROXY` / edge header contract |
| Migration    | No                                        |

**Attack:** Forged `X-Forwarded-For` via Next `/signing/api/*` with `TRUST_PROXY≥1` spoofs rate-limit keys and client IP.

**Evidence:** `copyHeader(..., 'x-forwarded-for')` copied browser-controlled values; did not append verified peer IP. (Original defect observed 2026-08-25.)

**Remediation (2026-08-25 Batch 1):** `buildUpstreamSigningHeaders` never copies inbound `X-Forwarded-For`. When a trusted edge sets `x-real-ip`, that single address is forwarded. Regression: `apps/web/src/app/signing/api/_proxy.test.ts`.

---

### SEC-004 — Signing exchange accepts query-string tokens

| Field        | Value                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Severity     | high                                                                                                                   |
| CWE          | CWE-598                                                                                                                |
| Status       | fixed                                                                                                                  |
| Location     | `apps/api/src/http/middleware/require-signer-session.ts` `extractExchangeToken`; `apps/api/src/http/routes/signing.ts` |
| Breaking fix | Yes — query-only exchange clients break                                                                                |
| Migration    | No                                                                                                                     |

**Attack:** `?token=` leaks via history, Referer, proxy logs.

**Evidence:** Fallback to `queryToken` after body/Authorization existed. (Original defect observed 2026-08-25.)

**Remediation (2026-08-25 Batch 1):** Exchange accepts body or `Authorization: Bearer` only. Regression: `apps/api/src/http/middleware/require-signer-session.test.ts`.

---

### SEC-005 — Filesystem driver path traversal via `..` in keys

| Field        | Value                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Severity     | high                                                                                                    |
| CWE          | CWE-22                                                                                                  |
| Status       | fixed                                                                                                   |
| Location     | `packages/domain/src/object-keys.ts`; `packages/application/src/documents/filesystem-object-storage.ts` |
| Breaking fix | No for valid content-addressed keys                                                                     |
| Migration    | No                                                                                                      |

**Attack:** Key `org/<uuid>/revisions/../../outside` passed prefix check; `join` escaped root.

**Evidence:** `assertTenantObjectKey` only checked prefix; no `..` rejection; no realpath containment. (Original defect observed 2026-08-25.)

**Remediation (2026-08-25 Batch 1):** `assertSafeObjectKeySegments` rejects `.` / `..` / empty / backslash; filesystem `resolveUnderRoot` containment. Regression: `packages/domain/src/object-keys.test.ts`, `packages/application/src/documents/filesystem-object-storage.test.ts`.

---

### SEC-006 — Inspection skips source digest verification

| Field    | Value                                                    |
| -------- | -------------------------------------------------------- |
| Severity | medium                                                   |
| CWE      | CWE-345                                                  |
| Status   | open                                                     |
| Location | `packages/application/src/documents/inspect-document.ts` |

---

### SEC-007 — Source upload put without expected digest / read-back

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Severity | medium                                                         |
| CWE      | CWE-345                                                        |
| Status   | open                                                           |
| Location | `packages/application/src/documents/complete-source-upload.ts` |

---

### SEC-008 — In-process memory rate limits

| Field    | Value                                                |
| -------- | ---------------------------------------------------- |
| Severity | medium                                               |
| CWE      | CWE-770                                              |
| Status   | deferred_decision                                    |
| Location | `apps/api/src/create-app.ts`                         |
| Notes    | Needs shared store (Redis) — infrastructure decision |

---

### SEC-009 — Unauthenticated `/metrics`

| Field    | Value                                 |
| -------- | ------------------------------------- |
| Severity | medium                                |
| CWE      | CWE-200                               |
| Status   | open                                  |
| Location | `apps/api/src/http/routes/metrics.ts` |

---

### SEC-010 — Signing CSP allows `unsafe-inline` scripts

| Field    | Value                     |
| -------- | ------------------------- |
| Severity | medium                    |
| CWE      | CWE-79                    |
| Status   | open                      |
| Location | `apps/web/next.config.ts` |

---

### SEC-011 — Retention and erasure not implemented

| Field    | Value                                     |
| -------- | ----------------------------------------- |
| Severity | medium                                    |
| CWE      | CWE-212                                   |
| Status   | deferred_decision                         |
| Notes    | Legal/product policy required before code |

---

### SEC-012 — Backups and DR unproven in code

| Field    | Value                      |
| -------- | -------------------------- |
| Severity | medium                     |
| CWE      | CWE-778                    |
| Status   | deferred_decision          |
| Notes    | Operational/infrastructure |

---

### SEC-013 — Preview `Content-Disposition` weakly sanitized

| Field    | Value                                   |
| -------- | --------------------------------------- |
| Severity | low                                     |
| CWE      | CWE-113                                 |
| Status   | open                                    |
| Location | `apps/api/src/http/routes/documents.ts` |

---

### SEC-014 — Default local/CI credentials committed

| Field    | Value                                                                   |
| -------- | ----------------------------------------------------------------------- |
| Severity | low                                                                     |
| CWE      | CWE-798                                                                 |
| Status   | accepted_risk                                                           |
| Notes    | Local/dev only; production must refuse known defaults (partially gated) |

---

### SEC-015 — Consent create race outside transaction

| Field    | Value                                                  |
| -------- | ------------------------------------------------------ |
| Severity | low                                                    |
| CWE      | CWE-362                                                |
| Status   | open                                                   |
| Location | `packages/application/src/signing/signer-mutations.ts` |

---

### SEC-016 — Superuser audit rewrite residual

| Field    | Value                                                 |
| -------- | ----------------------------------------------------- |
| Severity | informational                                         |
| CWE      | CWE-284                                               |
| Status   | accepted_risk                                         |
| Notes    | Documented residual; enable checkpoints in production |

---

### SEC-017 — Tenant isolation strong (positive)

| Field    | Value                |
| -------- | -------------------- |
| Severity | informational        |
| Status   | fixed (control held) |

---

### SEC-018 — Signer placement coordinates not trusted (positive)

| Field    | Value                |
| -------- | -------------------- |
| Severity | informational        |
| Status   | fixed (control held) |

---

### SEC-019 — No PostgreSQL RLS

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Severity | medium                                             |
| CWE      | CWE-284                                            |
| Status   | deferred_decision                                  |
| Notes    | Defense-in-depth; schema/session GUC design needed |

---

### SEC-020 — Token hashing plain SHA-256 vs keyed HMAC

| Field        | Value                        |
| ------------ | ---------------------------- |
| Severity     | low                          |
| CWE          | CWE-916                      |
| Status       | open                         |
| Breaking fix | Yes — rehash/re-issue tokens |
| Migration    | Yes if pepper added          |

---

### SEC-021 — Complete schema accepts unused stroke payloads

| Field        | Value                            |
| ------------ | -------------------------------- |
| Severity     | low                              |
| CWE          | CWE-400                          |
| Status       | open                             |
| Breaking fix | Possible if clients send strokes |

---

### SEC-022 — Local shared-secret IdP scaffold

| Field    | Value                          |
| -------- | ------------------------------ |
| Severity | medium                         |
| CWE      | CWE-1188                       |
| Status   | deferred_decision              |
| Notes    | Production OIDC productization |

## Related

- [Remediation plan](2026-08-25-remediation-plan.md)
- [Threat model](../threat-model.md)
- [Security controls](../security-controls.md)
