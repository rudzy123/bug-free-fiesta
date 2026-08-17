# ADR-0009: Authentication boundaries

## Status

Accepted.

## Context

Account users manage tenants. Signers often have no account. Mixing cookies and signing URLs causes CSRF, session fixation, and accidental tenant privilege.

## Decision

Three boundaries:

1. **Account user:** authenticated to the SaaS (v1: session cookie or access token after credentials). Authorization is membership-based, deny by default.
2. **Signer:** authenticated only by a signing bearer token bound to one session/document/signer. No tenant-admin APIs. Token hashed at rest.
3. **Worker / internal:** no end-user credentials. Job processor uses environment credentials from `packages/config` to talk to DB and storage. Outbox rows are not proof of HTTP auth.

Do not accept `X-User-Id` or `X-Tenant-Id` as identity. Do not put account-user cookies on signer-only actions or signing tokens in account-user logs.

## Consequences

- Two UI surfaces (owner vs signer) with different auth middleware.
- Token-in-email remains a stolen-link risk ([threat model](../../security/threat-model.md)).
- SSO/SAML for account users is a future additive boundary, not a signer identity proof.

## Alternatives

- Force every signer to register: higher friction; still not legal identity.
- Magic links that create full account sessions: over-privilege; rejected.
