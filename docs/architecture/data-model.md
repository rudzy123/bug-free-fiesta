# Data model (PostgreSQL / Prisma)

Physical schema for v1. Signing product behavior is not implemented in application services yet; this document describes tables, tenant isolation, and indexes.

`Organization` is the tenant. ADR-0013’s `tenantId` is `organizations.id`, stored as `organizationId` on every tenant-owned row. Account `User` rows are not tenant-owned; access is through `OrganizationMembership`.

Do not treat this schema as ESIGN, eIDAS, HIPAA, or similar compliance.

## Row-level security (deferred)

PostgreSQL RLS is **not** enabled in this iteration.

ADR-0013 accepts shared PostgreSQL with a mandatory tenant key on every tenant-scoped row, and explicitly treats RLS as a later complement rather than the v1 control: _“Row-level security in Postgres as the only control: useful complement later, not a substitute for application checks in v1.”_

v1 enforcement:

1. Composite foreign keys `(organizationId, parentId)` so a child row cannot point at another tenant’s parent.
2. Unique constraints that include `organizationId` where the natural key is per-tenant (membership, idempotency).
3. Repository queries (when implemented) **must** include `organizationId` from the authorized membership or signing session. Missing tenant context is deny-by-default.
4. Integration tests in `packages/database` cover cross-tenant foreign keys and `findMany` scoped by `organizationId`.

RLS policies would still be valuable as defense in depth (a `SET LOCAL` tenant GUC plus `USING (organization_id = current_setting(...))`). They are not a substitute for those repository predicates and are not in this migration.

## What is not stored in PostgreSQL

Raw PDF bytes and signature images are not columns. Revisions, artifacts, and optional field-completion payloads store `objectKey`, `contentType`, `sizeBytes`, and SHA-256 hex only ([ADR-0004](adrs/0004-private-object-storage.md), [ADR-0010](adrs/0010-content-addressed-finalized-artifacts.md)). Signing bearer tokens are stored only as SHA-256 hex `tokenHash`.

## Evidentiary deletion

Foreign keys on documents, revisions, signers, sessions, consent, artifacts, and audit use `ON DELETE RESTRICT`. Application code must not delete audit rows; a trigger rejects `UPDATE` and `DELETE` on `audit_logs`.

Source revisions (`document_revision_kind = source`) are immutable snapshots of uploaded PDFs. Intermediate revisions may exist for system-generated PDFs before finalization. The **finalized output** is `finalized_artifacts` (at most one per document), not a revision of the source file.

## Ordered and parallel signing

`signers.routingOrder` is a positive integer. Document `signingMode` is `ordered` (unique consecutive orders from 1) or `parallel` (every order is 1). The API recomputes turn from these rows; it does not trust the browser.

## Indexes and target queries

| Index                                                        | Target query                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `users_email_key`                                            | Account login / lookup by normalized email.                                           |
| `organization_memberships_user_id_idx`                       | List tenants for an authenticated account user.                                       |
| `organization_memberships_organization_id_user_id_key`       | One membership per user per tenant; authorize `(org, user)`.                          |
| `organization_memberships_organization_id_id_key`            | Composite FK from `documents.ownerMembershipId` so the owner belongs to the same org. |
| `account_sessions_tokenHash_key`                             | Present account session cookie: hash then lookup.                                     |
| `account_sessions_user_id_idx`                               | List or revoke sessions for an account user.                                          |
| `account_sessions_expires_at_idx`                            | Expire account sessions from the server clock.                                        |
| `account_security_events_actor_occurred_idx`                 | Account login/logout/revoke history for an opaque user id.                            |
| `account_security_events_request_id_idx`                     | Correlate account security events with a request id.                                  |
| `documents_organization_id_id_key`                           | Composite FK target for all document children (tenant-safe joins).                    |
| `documents_organization_id_state_idx`                        | Tenant document lists filtered by state (`draft`, `sent`, …).                         |
| `documents_organization_id_created_at_idx`                   | Tenant document lists ordered by recency.                                             |
| `documents_state_expires_at_idx`                             | Expiry worker: `state IN ('sent','in_progress') AND expiresAt <= now`.                |
| `documents_state_lease_until_idx`                            | Finalization claim / lease watchdog on `finalizing`.                                  |
| `document_revisions_organization_id_id_key`                  | Composite FK from `documents.currentRevisionId` / `signingRevisionId` (same tenant).  |
| `document_revisions_organization_id_document_id_idx`         | Load revisions for one document in a tenant.                                          |
| `document_revisions_sha256_digest_idx`                       | Reconcile content-addressed object keys after a crash.                                |
| `signers_organization_id_id_key`                             | Composite FK from sessions and fields to a signer in the same tenant.                 |
| `signers_organization_id_document_id_routing_order_idx`      | Routing checks: who may sign now (ordered vs parallel).                               |
| `signers_account_user_id_idx`                                | Optional link from account user to signer rows.                                       |
| `signing_sessions_tokenHash_key`                             | Present bearer token: hash then lookup session.                                       |
| `signing_sessions_organization_id_id_key`                    | Composite FK from consent to session in the same tenant.                              |
| `signing_sessions_organization_id_document_id_signer_id_idx` | List sessions for a signer on a document.                                             |
| `signing_sessions_signer_id_status_idx`                      | Find issued/active session before re-issue.                                           |
| `signing_sessions_expires_at_status_idx`                     | Expire sessions: `status IN ('issued','active') AND expiresAt <= now`.                |
| `signing_sessions_one_open_per_signer_idx` (partial unique)  | At most one `issued` or `active` session per signer.                                  |
| `signature_fields_organization_id_id_key`                    | Tenant-safe field identity.                                                           |
| `signature_fields_organization_id_document_id_signer_id_idx` | Load server-owned fields for a signer (ignore client coordinates).                    |
| `consent_records_sessionId_key`                              | One consent row per signing session.                                                  |
| `consent_records_organization_id_document_id_idx`            | Consent history for a document (support / export).                                    |
| `finalized_artifacts_documentId_key`                         | At most one artifact per document (finalization backstop).                            |
| `finalized_artifacts_sha256_digest_idx`                      | Content-addressed artifact lookup / retry.                                            |
| `audit_logs_document_id_sequence_key`                        | Per-document hash chain order.                                                        |
| `audit_logs_organization_id_document_id_sequence_idx`        | Tenant-scoped chain walk / verification.                                              |
| `audit_logs_request_id_idx`                                  | Correlate audit events with a request id.                                             |
| `outbox_events_status_available_at_idx`                      | Poller: claim `pending` rows whose `availableAt` has passed.                          |
| `outbox_events_organization_id_document_id_idx`              | Inspect outbox for a document.                                                        |
| `outbox_events_request_id_idx`                               | Correlate outbox with the originating HTTP request.                                   |
| `background_jobs_status_available_at_idx`                    | Worker lease/claim of jobs.                                                           |
| `background_jobs_organization_id_document_id_idx`            | Jobs for a document.                                                                  |
| `background_jobs_outbox_event_id_idx`                        | Find the job created from an outbox row.                                              |
| `idempotency_records_org_principal_route_key_key`            | HTTP mutation replay: same tenant, principal, route, and key.                         |
| `idempotency_records_expires_at_idx`                         | TTL purge of expired keys.                                                            |
| `idempotency_records_request_id_idx`                         | Correlate stored responses with request ids.                                          |
| `upload_sessions_tokenHash_key`                              | Present upload token: hash then lookup.                                               |
| `upload_sessions_status_expires_at_idx`                      | Cleanup abandoned issued sessions past `expiresAt`.                                   |
| `preview_grants_tokenHash_key`                               | Present preview token: hash then lookup.                                              |

Primary keys (UUID) support direct get-by-id **after** authorization has loaded the row and checked `organizationId`.

## Check constraints

Defined in `prisma/migrations/20260818000000_initial_data_model/migration.sql`: SHA-256 hex (`^[0-9a-f]{64}$`), positive file sizes, normalized field boxes (0–1, non-overlapping the page edge), page numbers `>= 1`, nonnegative `routingOrder`, and matching token/audit/idempotency hex digests.

## Related documents

[Domain model](domain-model.md), [ADR-0003](adrs/0003-postgresql-and-prisma.md), [ADR-0013](adrs/0013-multi-tenancy-isolation.md), [Audit model](audit-model.md).
