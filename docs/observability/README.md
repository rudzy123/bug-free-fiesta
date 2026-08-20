# Observability (as code)

Operational visibility for the electronic-signature platform without leaking Restricted data. This directory holds configuration-as-code that operators can adapt to their stack (Prometheus/Grafana here; the metric and trace shapes are portable to any OpenTelemetry backend).

## Contents

| File                                                               | Purpose                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [`slos.md`](slos.md)                                               | SLIs, SLOs, error budgets, and the runbook each SLO breach links to |
| [`sampling.md`](sampling.md)                                       | Log-level and trace sampling guidance                               |
| [`pii-field-classification.md`](pii-field-classification.md)       | Classification for every field that may flow through logging        |
| [`alerts/prometheus-rules.yaml`](alerts/prometheus-rules.yaml)     | Prometheus alerting rules, each annotated with a runbook link       |
| [`dashboards/esign-overview.json`](dashboards/esign-overview.json) | Grafana dashboard (import as JSON)                                  |

## Signals

- **Logs** — structured JSON via `packages/logger` (Pino), redacted by default. Correlation id on every record.
- **Metrics** — `packages/observability` registry exposed at `GET /metrics` (Prometheus text) on both the API and the worker health server. Metric names are `esign_*`, base units are seconds, and labels are bounded, non-sensitive dimensions.
- **Traces** — OpenTelemetry-shaped abstraction in `packages/observability` (`Tracer`/`Span`). The default is a no-op; the API uses a logging tracer. Wire the OpenTelemetry SDK behind the same interface for a collector.

## Metric inventory

| Metric                                    | Type      | Labels                            | Emitting                                            |
| ----------------------------------------- | --------- | --------------------------------- | --------------------------------------------------- |
| `esign_http_request_duration_seconds`     | histogram | `method`, `route`, `status_class` | yes (API)                                           |
| `esign_http_requests_total`               | counter   | `method`, `route`, `status_class` | yes (API)                                           |
| `esign_http_errors_total`                 | counter   | `method`, `route`, `code`         | yes (API)                                           |
| `esign_db_query_duration_seconds`         | histogram | `operation`, `outcome`            | yes (API readiness ping)                            |
| `esign_queue_depth`                       | gauge     | `state`                           | yes (worker)                                        |
| `esign_job_attempts_total`                | counter   | `type`                            | yes (worker)                                        |
| `esign_job_duration_seconds`              | histogram | `type`, `outcome`                 | yes (worker; finalization = `flatten_signature`)    |
| `esign_object_storage_errors_total`       | counter   | `operation`                       | defined; emit at the storage adapter                |
| `esign_pdf_failures_total`                | counter   | `category`                        | defined; emit at PDF inspect/flatten categorization |
| `esign_signing_completions_total`         | counter   | `outcome`                         | defined; emit in complete/decline/expire use cases  |
| `esign_audit_verification_failures_total` | counter   | –                                 | defined; emit in the audit-verification job         |

The "defined" rows are registered and scrapeable (reading zero) with reserved names so dashboards and alerts are stable; their emit call sites are the documented next increment.

## Never in any signal

Raw signing tokens, `Authorization` headers, cookies, signature PNGs, pointer streams, PDF bytes, passwords, full document content, private storage URLs. Enforced by `packages/logger` redaction and asserted by `pnpm --filter @esign/logger audit:redaction` and the redaction test suite. See [`pii-field-classification.md`](pii-field-classification.md) and [data classification](../architecture/data-classification.md).
