# Sampling guidance

Keep signal high and cost bounded without ever sampling away integrity or security evidence.

## Logs

- **Level policy** (see [observability](../architecture/observability.md)): `error` for failures, `warn` for recoverable anomalies, `info` for state transitions, `debug` local only. Production default `info`.
- **Do not sample** `error` and `warn`, security events, or audit-adjacent state transitions. These are low volume and high value.
- **High-volume `info`/`debug`** (for example per-request completion lines) may be head-sampled at the aggregation tier if volume is a problem. Prefer keeping metrics for rates/latency and sampling the verbose logs, not the reverse.
- Redaction is independent of sampling: sampled-in or not, prohibited fields never appear.

## Traces

- Default **parent-based** sampling: honor the incoming decision; root spans sampled at a low base rate (start ~5–10% in high traffic).
- **Always sample (tail-based when available):** any request that errors (5xx), exceeds a latency threshold, or touches finalization/audit paths. Errors and slow requests are the traces worth keeping.
- Propagate the correlation id as the trace linkage; never use a signing token or `Authorization` header as a trace/span id or attribute.
- Span attributes are limited to safe, bounded values (route template, status code, job type, outcome). Never attach PDF bytes, signatures, tokens, or storage URLs.

## Metrics

- Metrics are aggregates, not sampled. Control cost via **cardinality**: labels are bounded (route templates, status classes, job types, error categories). Never label by user id, email, raw IP, token, or full path.
- Histogram buckets are shared defaults tuned for sub-second-to-10s operations; adjust per deployment rather than adding per-request series.
