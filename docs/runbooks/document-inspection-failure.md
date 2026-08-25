# Runbook: failed document inspection

**Severity:** high if a valid source PDF never becomes eligible to send. Inspection `rejected` is expected for malware-like structure, encryption, or invalid PDF.

Inspectors:

| Value         | Use                                                       |
| ------------- | --------------------------------------------------------- |
| `local`       | **NON-PRODUCTION** stub (magic + test reject marker only) |
| `structural`  | **Production** structural denylist (not commercial AV)    |
| `fail_closed` | Ops kill-switch — always rejects                          |

## Symptoms

- Document stays `draft` with `inspectionStatus=pending` after upload.
- `inspectionStatus=rejected`; `availableForSigning` remains false.
- Outbox `inspect_document` rows `pending` / `processing` / retrying.
- Worker logs: `document inspection job failed` with `correlationId` and `documentId` only.

## Immediate actions

1. Do **not** set `inspectionStatus=accepted` in SQL to “unblock” signing.
2. Do **not** download customer PDFs to laptops or paste bytes into tickets.
3. Capture `correlationId`, `organizationId`, `documentId`, `revisionId`, outbox id, UTC time.

## Diagnosis

| Observation                                                                            | Likely cause                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pending` and outbox still `pending`                                                   | Worker not running or poll interval lag                                |
| `pending` and outbox retrying `missing_object`                                         | Upload wrote metadata but object storage is not shared with the worker |
| `rejected` / `not_pdf`                                                                 | Magic bytes, content type, or polyglot prefix failed inspection        |
| `rejected` / `pdf_missing_eof`                                                         | Truncated or non-PDF body                                              |
| `rejected` / `pdf_javascript` / `pdf_launch` / `pdf_embedded_file` / `pdf_encrypt` / … | Structural inspector denied a dangerous or encrypted PDF feature       |
| `rejected` / `local_stub_reject_marker`                                                | Local-dev stub saw `%ESIGN-LOCAL-REJECT%` (tests only)                 |
| `rejected` / `inspector_unconfigured`                                                  | `DOCUMENT_INSPECTOR=fail_closed`                                       |
| `accepted` but `availableForSigning=false`                                             | Document is still `draft`; send has not run. This is expected          |

Signing remains denied until inspection is `accepted` **and** the document is `sent` or `in_progress`.

## Remediation

- **Hung pending:** confirm the worker process; inspect jobs are idempotent. Re-queue by leaving the outbox `pending`. See [outbox dead letter](outbox-dead-letter.md) if status is `failed`.
- **Missing object:** restore shared private storage (S3/Azure/MinIO). Do not copy PDFs through tickets.
- **Rejected (structural):** tell the tenant the file was not accepted (active content, encryption, or invalid structure). They may create a new draft. Do not claim commercial antivirus detected malware.
- **fail_closed in production:** set `DOCUMENT_INSPECTOR=structural` when ready to accept uploads again.

## Related documents

[Failed uploads](document-upload-failure.md), [Document lifecycle](../architecture/document-lifecycle.md), [ADR-0011 outbox](../architecture/adrs/0011-outbox-pattern.md).
