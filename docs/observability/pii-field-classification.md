# PII classification for logged fields

Every field that may flow through logging is classified. Only Public/Internal and a small set of opaque Confidential identifiers are loggable; everything Restricted is redacted by `packages/logger` and asserted by the redaction audit (`pnpm --filter @esign/logger audit:redaction`). Machine-readable source of truth: `PII_FIELD_CLASSIFICATION` and `PROHIBITED_LOG_FIELDS` in `packages/logger`.

Classes follow [data classification](../architecture/data-classification.md).

## Loggable

| Field                                                               | Class                   | Notes                                                                                |
| ------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `correlationId`, `requestId`                                        | Internal                | Safe linkage across logs/traces.                                                     |
| `route`, `method`, `status`, `statusCode`, `durationMs`             | Internal                | HTTP shape; `route` is a template, never a raw path.                                 |
| `errorCode`, `errorKind`, `errorName`, `outcome`                    | Internal                | Stable taxonomy; no messages with data.                                              |
| `jobId`, `jobType`, `attemptCount`, `outboxEventId`                 | Internal / Confidential | Opaque job identifiers.                                                              |
| `organizationId`, `tenantId`, `documentId`, `signerId`, `sessionId` | Confidential            | Opaque, tenant-scoped ids only.                                                      |
| `tokenHash`                                                         | Confidential            | Hash at rest, never the raw token.                                                   |
| `clientIp`, `userAgent`                                             | Confidential            | Untrusted metadata; may be personal data — **legal review required**. Log sparingly. |

## Never loggable (redacted)

| Field(s)                                                                                         | Class        | Category                                |
| ------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------- |
| `password`, `secret`                                                                             | Restricted   | Credentials                             |
| `token`, `rawToken`, `sessionToken`, `csrfToken`, `bearer`, `authorization`                      | Restricted   | Raw signing tokens / auth headers       |
| `cookie`, `setCookie`                                                                            | Restricted   | Cookies                                 |
| `signature`, `signaturePng`, `signatureImage`, `initials`, `initialsPng`, `png`, `dataUrl`       | Restricted   | Signature PNGs                          |
| `points`, `strokes`, `pointer`, `pointerStream`                                                  | Restricted   | Pointer streams                         |
| `pdf`, `pdfBytes`, `documentBytes`, `documentContent`, `content`, `bytes`, `buffer`              | Restricted   | PDF bytes / full document content       |
| `signedUrl`, `presignedUrl`, `storageUrl`, `objectUrl`, `downloadUrl`, `uploadUrl`, `previewUrl` | Restricted   | Private storage URLs                    |
| `email`                                                                                          | Confidential | Not logged (account enumeration / PII). |

Header and URL paths (`req.headers.authorization`, `req.headers.cookie`, `req.headers.referer`, `req.query`, `req.url`, `req.originalUrl`) are redacted explicitly in addition to the field names above, at the top level and nested depths.

## Enforcement

- Redaction: `packages/logger` (`remove: true`).
- Test suite: `packages/logger/src/redaction-audit.test.ts`.
- Script: `pnpm --filter @esign/logger audit:redaction` (non-zero exit on any leak) — suitable for CI.
