# Observability

How we see the system without leaking Restricted data. Pino is the log library; `packages/logger` is the only application logging facade.

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

## Metrics (intended)

- HTTP: rate, latency, status class by route (no query strings).
- Authz denials by reason code (not by email).
- Outbox: pending age, processed rate, failed count.
- Finalization: success, retry, `finalization_failed`.
- Signing: session issue, sign success, decline, expiry.
- Storage: upload/download errors.
- Payload rejections: oversize, invalid PDF, Zod failures.

Metrics labels must not include names, emails, or tokens.

## Tracing

If tracing is added, span names are route or job type. Do not attach PDF bytes or tokens as span attributes. Propagation uses the correlation id.

## Audit vs logs

Logs are operational and rotatable. Audit events are the product integrity record ([audit model](audit-model.md)). Do not treat log aggregation as the audit chain. Do not dump audit payloads that contain Confidential data into debug logs.

## Alerts (intended)

- Outbox pending older than a configured threshold.
- Spike in 5xx or authz denials.
- Finalization failure rate.
- Audit verification job mismatch (page immediately).
- Object storage authentication failures.

Alert payloads follow the same deny list as logs.

## Related documents

[Data classification](data-classification.md), [Testing strategy](testing-strategy.md), [Runbooks](../runbooks/document-finalization-failure.md).
