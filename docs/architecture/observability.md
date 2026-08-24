# Observability

How we see the system without leaking Restricted data. Pino is the log library; `packages/logger` is the only application logging facade. Metrics and tracing live in `packages/observability`. Operator-facing configuration-as-code (SLOs, alerts, dashboards, sampling, PII classification) is in [`docs/observability/`](../observability/README.md).

## Correlation

- Every HTTP request gets a `correlationId` (generated if the client did not send a allowed safe header). Propagate to worker jobs via the outbox row.
- Log fields: `correlationId`, `tenantId` (when authorized), `documentId`, `jobId`, `route`, `outcome`.
- Never use the signing token or `Authorization` header as a correlation id.

## Logs

Structured JSON. UTC timestamps. Level policy:

| Level   | Use                                                                |
| ------- | ------------------------------------------------------------------ |
| `error` | Operation failed; includes error code, not stack traces to clients |
| `warn`  | Recoverable: lease steal, idempotency conflict, rejected PDF       |
| `info`  | State transitions by type (sent, signed, finalized)                |
| `debug` | Local only; still no Restricted fields                             |

Redact by default: headers named `authorization`, `cookie`, `set-cookie`; keys matching `token`, `password`, `secret`, `signature`; raw buffers.

## Metrics

Implemented via `packages/observability`: a Prometheus registry exposed at `GET /metrics` on the API and the worker health server. Names are `esign_*`, base units seconds, labels bounded and non-sensitive. Full inventory (and which metrics are emitting vs reserved) is in [`docs/observability/README.md`](../observability/README.md).

Coverage:

- HTTP: rate, latency, status class by route template (no query strings).
- Authz denials by reason code (not by email).
- Database: query/ping latency by bounded operation label and outcome.
- Outbox: pending / processing / failed depth, oldest claimable age, expired leases, claim count, recovered leases, attempt count, success latency, retryable vs terminal failures.
- Finalization: success, retry, `finalization_failed`; PDF failures by category.
- Signing: session completions (`completed` / `declined` / `expired`).
- Storage: upload/download/list/delete errors.
- Audit verification failures (must stay zero).
- Payload rejections: oversize, invalid PDF, Zod failures.

The worker `/health/ready` body includes a `queue` snapshot (`stale` when claimable work or expired leases are older than `WORKER_STALE_QUEUE_MS`) and an in-process `metrics` snapshot. Labels must not include names, emails, or tokens.

## Tracing

An OpenTelemetry-shaped abstraction (`Tracer`/`Span`) lives in `packages/observability`: `createNoopTracer` (default) and `createLoggingTracer` (used by the API). Wire the OpenTelemetry SDK behind the same interface for a collector. Span names are route or job type. Do not attach PDF bytes or tokens as span attributes. Propagation uses the correlation id. Sampling guidance: [`docs/observability/sampling.md`](../observability/sampling.md).

## Audit vs logs

Logs are operational and rotatable. Audit events are the product integrity record ([audit model](audit-model.md)). Do not treat log aggregation as the audit chain. Do not dump audit payloads that contain Confidential data into debug logs.

## Alerts (intended)

- Outbox pending older than a configured threshold.
- Spike in 5xx or authz denials.
- Finalization failure rate.
- Audit verification job mismatch (page immediately).
- Object storage authentication failures.

Alert payloads follow the same deny list as logs.

## Redaction enforcement

The prohibited-field deny list is enforced in `packages/logger` (redaction with `remove: true`) and continuously verified: the redaction test suite feeds representative sensitive payloads through the logger and asserts none survive, and `pnpm --filter @esign/logger audit:redaction` runs the same audit as a script (non-zero exit on any leak). Per-field classification: [`docs/observability/pii-field-classification.md`](../observability/pii-field-classification.md).

## Related documents

[Data classification](data-classification.md), [Testing strategy](testing-strategy.md), [SLOs](../observability/slos.md), [Alerts](../observability/alerts/prometheus-rules.yaml), [Runbooks](../runbooks/document-finalization-failure.md).
