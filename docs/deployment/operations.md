# Operations (observability and rollback)

## Logging

- Structured JSON via Pino to stdout/stderr.
- Include correlation / request IDs; prefer opaque resource IDs.
- Redact: passwords, authorization headers, cookies, signing tokens, signature PNG/pointer streams, PDF bytes, private storage URLs.
- Ship logs to your platform aggregator; retain per policy (legal review for personal data retention).

## Metrics

- Prefer the metrics abstractions already emitted by API/worker (HTTP, DB, storage errors, queue, PDF failures, signing completion, audit verification failures).
- Scrape or push using your chosen backend (Prometheus-compatible text, vendor agents, etc.).
- Alert on: sustained 5xx, readiness failures, finalization error rate, audit verification failures, stale outbox.

## Tracing

- Use the observability tracing abstraction; export to your collector when configured.
- Sample carefully on signing paths; never attach raw token or document bytes to spans.

## Rollback

1. **Application:** Redeploy the previous image digest for web/API/worker. Prefer digests over mutable tags.
2. **Schema:** Only roll back DB if you have a tested down-path; default is forward-fix migrations. If the new app requires a new migration, rolling back the app without rolling back schema is the safe default.
3. **Objects:** Immutable finalized keys mean old artifacts remain; do not bulk-delete on rollback.
4. **Verify:** Hit readiness, run a smoke signing journey in staging, spot-check audit verification.
5. **Communicate:** Record the incident and residual risk; do not claim compliance from a successful rollback.

## Related runbooks

[Document finalization failure](../runbooks/document-finalization-failure.md), [Audit verification failure](../runbooks/audit-verification-failure.md).
