# Signing lifecycle

How a **Signer** authenticates, consents, and completes **Signature fields**. Server state wins over anything the browser sends.

## Sequence (happy path)

```mermaid
sequenceDiagram
  participant Owner
  participant API
  participant Mail
  participant Signer
  participant Worker

  Owner->>API: Prepare signers, mode, and fields
  Owner->>API: Send document (idempotent)
  API->>API: Freeze preparation; store only token hashes
  API->>API: Audit + outbox notify_signer atomically
  API->>Mail: Invitation (raw token only in transit)
  Signer->>API: Open link (bearer token)
  API->>API: Lookup token hash; start session
  Signer->>API: Record consent
  Signer->>API: Submit signatures for assigned fields
  API->>API: Persist completions; maybe complete document
  API->>Worker: Outbox finalization
```

Without the diagram: owners add server-owned fields and signers while the document is `draft` or `prepared`. Send freezes preparation, stores SHA-256 hashes of cryptographically random bearer tokens, appends audit, and writes `notify_signer` outbox events in one transaction. The raw token is given to a provider-agnostic notifier for first delivery and is never persisted. Signer APIs load identity from the token hash, not from client-supplied document or signer ids.

Field types: `signature`, `initials`, `date_signed`, `signer_name`. Coordinates are normalized to the page (0–1). Page numbers must exist on the stored PDF. Overlap is rejected when `DOCUMENT_FIELD_OVERLAP_POLICY=prohibit`.

Signing session expiry uses `SIGNING_SESSION_TTL_SECONDS`. A second open session for the same signer is rejected unless an authorized rotate revokes the previous issued/active session first.

## Signing session lifecycle

| Session state | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| `issued`      | Token hash stored; not yet used.                             |
| `active`      | Token presented successfully; within `expiresAt`.            |
| `completed`   | This signer finished signing (or declining) in this session. |
| `expired`     | `nowUtc >= expiresAt` or document expired.                   |
| `revoked`     | Void, re-issue, or security revoke.                          |

Transitions: `issued` → `active` → `completed`; `issued`/`active` → `expired` or `revoked`. No return to `active` from `completed`. Re-issue creates a **new** session and revokes the previous active one.

## Tokens

- The signing URL contains a high-entropy bearer token (not the `signerId`, not the `documentId` alone).
- Persist only a keyed hash (e.g. HMAC or password-hash of the token with a server secret from `packages/config`). Never store or log the raw token.
- Token is bound to `tenantId + documentId + signerId + sessionId`.
- Presentation: `Authorization: Bearer` or a one-time exchange for a short-lived session cookie scoped to signer routes. Prefer not placing the raw token in query strings after the first redirect. **Legal review required** if tokens remain in email query strings (leakage via logs and referrers).

Stolen-link mitigations (technical, not a legal identity proof): short TTL, HTTPS only, revoke on void, optional email re-auth step (not v1 unless specified), rate limits, and showing the signer only their fields.

## Consent

Before applying signatures, the API requires a **Consent record** for the current session:

- `consentCopyId` (version of text shown)
- `acceptedAt` UTC
- `sessionId`, `signerId`, `documentId`, `tenantId`
- Affirmative action distinct from merely opening the page

IP and user agent are optional untrusted metadata. They are not proof of identity.

**Legal review required:** consent wording, whether opening a document implies consent, accessibility of consent UI, consumer-specific rules, and retention of consent text vs version id.

## Field completion

1. Load fields for this document from the database.
2. Authorize: session signer equals field `signerId`; document state allows signing; routing order allows this signer.
3. Ignore client-supplied page/x/y/assignee. The server places marks using stored field geometry.
4. Validate payload type (stroke, typed name, or adopted image) against field type and size limits.
5. In one transaction: mark fields complete, mark signer `signed` if all required fields for that signer are done, update document state, append audit, write outbox if the document is `completed`.

The visual appearance of a signature in the finalized PDF is produced later by the worker from stored completion data plus server geometry ([ADR-0007](adrs/0007-server-owned-signature-placement.md)).

## Decline

A signer in turn (ordered/parallel rules) may decline. That sets the signer to `declined`, document to `declined`, revokes sessions, and writes audit. It does not finalize an artifact.

## Replay and duplicates

- A completed signer cannot sign again.
- Idempotency keys make duplicate HTTP posts safe ([ADR-0008](adrs/0008-idempotency-strategy.md)).
- A new session after expiry does not clear prior completions for that signer.

## What the signer UI may send

Allowed as **intent**: which field ids they believe they completed, signature payload bytes/strokes, consent acceptance boolean, idempotency key.

Never trusted as **facts**: document state, other signers’ identities, field coordinates, tenant id, “all done” flags.

## Related documents

[Document lifecycle](document-lifecycle.md), [ADR-0007](adrs/0007-server-owned-signature-placement.md), [ADR-0009](adrs/0009-authentication-boundaries.md), [Threat model](../security/threat-model.md).
