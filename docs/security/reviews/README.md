# Security reviews

Adversarial and design reviews of this repository. Findings keep original evidence; status updates append remediation notes without erasing them.

| Date       | Review                                                 | Remediation plan                       | Notes                                                                    |
| ---------- | ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| 2026-08-25 | [Adversarial review](2026-08-25-adversarial-review.md) | [Plan](2026-08-25-remediation-plan.md) | Batches 1–6 code-complete; deferred items remain for legal/infra/product |

## How to read statuses

| Status              | Meaning                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `fixed`             | Regression test + quality gates passed; docs updated              |
| `deferred_decision` | Blocked on legal, product, ops, or infrastructure — not code-only |
| `accepted_risk`     | Explicit residual; do not treat as “done” without an owner        |
| `open`              | Still actionable in code (should be empty after Batch 6)          |

## Production config reminders from remediations

Operators must set (among other env from `.env.example`):

- `OBJECT_STORAGE_DRIVER=s3` with private bucket credentials
- `DOCUMENT_INSPECTOR=structural` (or `fail_closed` as an emergency kill-switch; never `local`)
- `METRICS_BEARER_TOKEN` for authenticated Prometheus scrapes
- `TOKEN_HASH_PEPPER` — unique production secret (not the local-dev default); rotating invalidates hashed sessions/tokens
- `AUTH_PROVIDER=oidc` with complete OIDC settings (local IdP forbidden in production)
