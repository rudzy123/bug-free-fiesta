# Runbook: failed document upload

**Severity:** medium if senders cannot attach a source PDF. High if many tenants fail at once (proxy/API/storage misconfiguration).

This is not a security breach by itself. Do not treat a rejected upload as malware confirmation.

## Symptoms

- `POST /organizations/{organizationId}/documents` succeeds, but `PUT .../source` returns 400, 409, or 413.
- Metrics: upload 413 rate, validation failures, abandoned upload sessions.
- Document remains `draft` with `inspectionStatus=pending` and no `currentRevisionId`.
- Worker logs: `upload_abandoned` audit events for expired sessions.

## Immediate actions

1. Do **not** paste PDF bytes, filenames that look like personal data, or upload tokens into tickets.
2. Do **not** copy object keys into chat. Capture `correlationId`, `organizationId`, `documentId`, UTC time.
3. Do **not** mark inspection `accepted` by hand to unblock signing.

## Diagnosis

| Observation                           | Likely cause                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| HTTP 413 `payload_too_large`          | Body exceeds `DOCUMENT_MAX_UPLOAD_BYTES` at proxy, Express raw parser, or storage wrapper |
| HTTP 400, reason `pdf_magic`          | Body does not start with `%PDF-`                                                          |
| HTTP 400, content type                | `Content-Type` was not `application/pdf`                                                  |
| HTTP 400, filename extension          | Client filename did not sanitize to `.pdf`                                                |
| HTTP 409 `upload_expired` / abandoned | Upload token TTL elapsed; cleanup marked the session abandoned                            |
| HTTP 401 on PUT                       | Missing or unknown `x-upload-token`                                                       |
| Create 201, PUT never sent            | Abandoned session after `DOCUMENT_UPLOAD_TTL_SECONDS`                                     |

Confirm proxy `client_max_body_size` (or equivalent) is **at least** `DOCUMENT_MAX_UPLOAD_BYTES`. The three boundaries must match: reverse proxy, API raw body limit, object-storage `maxBytes` / bucket policy.

## Remediation

- **Oversized:** ask the sender to reduce the PDF, or raise all three limits together after capacity review.
- **Malformed / wrong magic:** reject; do not “fix” the file on the server.
- **Abandoned session:** create a new draft with a new idempotency key; do not reuse the expired token.
- **Idempotent retry:** same `Idempotency-Key` and same body returns the original draft. The upload token is only in the first 201 response.

## Related documents

[Document inspection failure](document-inspection-failure.md), [Deployment model](../architecture/deployment-model.md), [OpenAPI](../api/openapi.yaml).
