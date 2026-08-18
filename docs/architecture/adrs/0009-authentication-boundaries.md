# ADR-0009: Authentication boundaries

## Status

Accepted.

## Context

Account users manage tenants. Signers often have no account. Mixing cookies and signing URLs causes CSRF, session fixation, and accidental tenant privilege. Rolling a custom password KDF in this codebase would add crypto risk without replacing a real identity provider.

## Decision

Three boundaries remain:

1. **Account user:** authenticated to the SaaS. Authorization is membership-based and deny by default. Roles are `owner`, `admin`, `member`, and `read_only`.
2. **Signer:** authenticated only by a signing bearer token bound to one session/document/signer. No tenant-admin APIs. Token hashed at rest.
3. **Worker / internal:** no end-user credentials. Job processor uses environment credentials from `packages/config` to talk to DB and storage. Outbox rows are not proof of HTTP auth.

### Account-user authentication (v1)

- Identity verification is a provider-agnostic `IdentityProvider` port. Application code does **not** store or stretch per-user passwords.
- **Local development/test:** a shared-secret adapter (`AUTH_PROVIDER=local`) that may only run outside production. It checks the configured development secret with a timing-safe digest compare and looks up an existing `User` row. It is not a password-hashing scheme.
- **Production:** `AUTH_PROVIDER=oidc`. A complete authorization-code integration requires customer IdP credentials. Until those are supplied, the OIDC adapter fails closed. Setup is documented in [authentication-setup.md](../../security/authentication-setup.md). Do not invent production client secrets in the repo.
- Browser sessions use an opaque token in an **HttpOnly**, **Secure** (in production), **SameSite=Lax** cookie. Only the SHA-256 hash is stored (`account_sessions.tokenHash`).
- CSRF uses a double-submit cookie (**SameSite=Strict**, not HttpOnly) plus `X-CSRF-Token`, compared to the session’s `csrfTokenHash`, on unsafe methods. Login and other cookie-authenticated mutations also require an `Origin`/`Referer` in `CORS_ORIGINS`.
- Login always issues a **new** session id and token. A presented pre-login session cookie is revoked (session-fixation protection). Logout and `POST /auth/sessions/revoke` revoke hashed sessions. Expired and revoked sessions fail closed.
- Authentication-sensitive routes are rate-limited. Failed login responses and audit payloads do not reveal whether an email exists and never include secrets.
- Account security actions (`login_succeeded`, `login_failed`, `logout`, `session_revoked`) are append-only rows, not part of the per-document hash chain.

### Organization context

- `RequestActor` for account users carries `userId` plus membership (`membershipId`, `organizationId`, `role`) loaded from persistence.
- `organizationId` in a path or body is only a selector. Access is resolved from **authenticated membership**. `X-User-Id`, `X-Tenant-Id`, and `X-Organization-Id` are not identity.
- Missing membership is authorization failure (deny by default), not a client-supplied tenant override.

Do not put account-user cookies on signer-only actions or signing tokens in account-user logs.

Signer browser sessions after `POST /signing/exchange` use a separate HttpOnly cookie (`esign_sign`, path `/signing`) and CSRF cookie (`esign_sign_csrf`). Only hashes are stored. Account-user cookies are not treated as signer identity unless envelope policy requires a matching account.

## Consequences

- Two UI surfaces (owner vs signer) with different auth middleware.
- Token-in-email remains a stolen-link risk ([threat model](../../security/threat-model.md)).
- Production login depends on a configured OIDC provider; local login uses the development adapter only.
- SSO/SAML for account users is the OIDC boundary, not a signer identity proof.

## Alternatives

- Force every signer to register: higher friction; still not legal identity.
- Magic links that create full account sessions: over-privilege; rejected.
- Custom password hashing in this repo: rejected; use an identity provider or the isolated local adapter.
- Trust `X-Tenant-Id` / client `organizationId` as authorization: rejected ([ADR-0013](0013-multi-tenancy-isolation.md)).
