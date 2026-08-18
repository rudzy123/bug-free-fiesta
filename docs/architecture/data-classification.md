# Data classification

How data is labeled for access control, logging, storage, and retention. Labels are engineering controls. They are not a regulatory mapping.

**Legal review required:** whether any dataset is “personal data,” “sensitive personal data,” PHI, financial data, or similar under laws that apply to a customer.

## Classes

| Class        | Examples                                                                                                            | Rules                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Public       | Marketing site copy, public OpenAPI that has no customer data                                                       | May appear in public repos.                                                                       |
| Internal     | Architecture docs, non-secret runbooks, metrics names                                                               | Authenticated operators; no customer documents.                                                   |
| Confidential | Tenant membership, document titles, signer display names, field geometry, audit payloads as defined                 | Tenant-isolated. Log only opaque ids.                                                             |
| Restricted   | PDF bytes, signature images/strokes, raw signing tokens, passwords, session cookies, email bodies with signing URLs | Encryption in transit; private storage; never in logs or client analytics; tokens hashed at rest. |

When unsure, treat as **Restricted**.

## Inventories (v1)

| Data                         | Class                                | Store               | Notes                                                       |
| ---------------------------- | ------------------------------------ | ------------------- | ----------------------------------------------------------- |
| Account email, password hash | Confidential / Restricted (password) | PostgreSQL          | Password hashes only; never log passwords.                  |
| Tenant id, membership roles  | Confidential                         | PostgreSQL          | Authorization key.                                          |
| Document title, state        | Confidential                         | PostgreSQL          |                                                             |
| PDF revision bytes           | Restricted                           | Object storage      | Untrusted until processed.                                  |
| Signature field coordinates  | Confidential                         | PostgreSQL          | Server-owned.                                               |
| Raw signing token            | Restricted                           | Memory / URL only   | Hash at rest.                                               |
| Token hash                   | Confidential                         | PostgreSQL          |                                                             |
| Consent copy version id      | Confidential                         | PostgreSQL          | Full legal text may be Restricted if stored.                |
| IP / user agent              | Confidential                         | PostgreSQL optional | Untrusted; may be personal data. **Legal review required.** |
| Audit chain                  | Confidential                         | PostgreSQL          | Append-only.                                                |
| Finalized artifact           | Restricted                           | Object storage      | Content-addressed.                                          |
| Correlation id               | Internal                             | Logs                | Safe to log.                                                |
| Outbox payload               | Confidential                         | PostgreSQL          | Opaque ids only, no PDFs.                                   |

## Logging allow/deny

**Allow:** correlation id, tenant id, document id, signer id, session id, job id, route name, error code, latency, HTTP status.

**Deny:** passwords, `Authorization` headers, cookies, raw tokens, raw signatures, PDF bytes, full names+addresses together, email bodies, object-storage signed URLs.

Structured logs go through `packages/logger` with redaction. If a field cannot be proven safe, do not log it.

## Object keys

Keys must not contain email addresses, names, or raw tokens. Prefer `tenants/{tenantId}/revisions/{digest}` and `tenants/{tenantId}/artifacts/{digest}`. Digests are content addresses, not secrets, but the objects remain Restricted.

## Related documents

[Privacy considerations](../security/privacy-considerations.md), [Retention model](retention-model.md), [Observability](observability.md).
