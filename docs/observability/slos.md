# SLIs, SLOs, and error budgets

Proposed service-level objectives. These are engineering targets, not contractual SLAs, and not a compliance claim. Tune windows and targets to the deployment. Each objective links to the runbook that a sustained breach should trigger.

SLIs are expressed against the metrics in [`README.md`](README.md). Windows are 30-day rolling unless noted. Error budget = `1 - SLO`.

## 1. API availability

- **SLI:** `1 - (sum(rate(esign_http_requests_total{status_class="5xx"}[5m])) / sum(rate(esign_http_requests_total[5m])))`
- **SLO:** 99.9% of API requests are non-5xx.
- **Error budget:** 0.1% (~43m/30d).
- **Runbook:** [document-finalization-failure](../runbooks/document-finalization-failure.md) for worker-driven 5xx; general API triage otherwise.

## 2. Signer-session availability

- **SLI:** non-5xx ratio of signer endpoints: `sum(rate(esign_http_requests_total{route=~"/signing.*",status_class!="5xx"}[5m])) / sum(rate(esign_http_requests_total{route=~"/signing.*"}[5m]))`
- **SLO:** 99.9% availability for the signer-facing API (the path a signer must complete).
- **Error budget:** 0.1%.
- **Runbook:** [document-finalization-failure](../runbooks/document-finalization-failure.md); escalate if signer completion is blocked.

## 3. Finalization success

- **SLI:** `sum(increase(esign_job_duration_seconds_count{type="flatten_signature",outcome="succeeded"}[30d])) / sum(increase(esign_job_duration_seconds_count{type="flatten_signature"}[30d]))`
- **SLO:** 99.5% of finalization (signature flatten) jobs succeed within the retry budget.
- **Error budget:** 0.5%.
- **Runbook:** [document-finalization-failure](../runbooks/document-finalization-failure.md), [outbox-dead-letter](../runbooks/outbox-dead-letter.md).

## 4. Finalization latency

- **SLI:** `histogram_quantile(0.95, sum(rate(esign_job_duration_seconds_bucket{type="flatten_signature",outcome="succeeded"}[1h])) by (le))`
- **SLO:** p95 finalization duration < 30s.
- **Error budget:** 5% of the window may exceed the latency target.
- **Runbook:** [document-finalization-failure](../runbooks/document-finalization-failure.md).

## 5. Audit verification

- **SLI:** `increase(esign_audit_verification_failures_total[24h])`
- **SLO:** 0 audit-chain verification failures. Any non-zero value is a hard breach.
- **Error budget:** none — page immediately.
- **Runbook:** [audit-verification-failure](../runbooks/audit-verification-failure.md).

## Dashboards and alerts

- Dashboard: [`dashboards/esign-overview.json`](dashboards/esign-overview.json).
- Alerts: [`alerts/prometheus-rules.yaml`](alerts/prometheus-rules.yaml). Alert payloads follow the same deny list as logs (no tokens, PII, or storage URLs).
