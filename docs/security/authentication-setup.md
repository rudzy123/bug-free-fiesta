# Account-user authentication setup

How to configure the account-user identity boundary. This is not a production runbook for a specific vendor, not SSO legal advice, and not a claim that local login is suitable for customer data.

See [ADR-0009](../architecture/adrs/0009-authentication-boundaries.md).

## Providers

| `AUTH_PROVIDER` | When                                          | What it does                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`         | `NODE_ENV` is `development` or `test` only    | Looks up an existing `users` row by email and checks `AUTH_LOCAL_SHARED_SECRET` with a timing-safe digest compare. No per-user password hashes. Rejected in production configuration.                                        |
| `oidc`          | Production (and staging that uses a real IdP) | Adapter boundary for an external OpenID Connect provider. A working authorization-code flow needs **your** issuer, client id, client secret, and redirect URI. This repository does not ship working production credentials. |

The API never accepts `X-User-Id` or `X-Organization-Id` as identity. Organization access comes from `organization_memberships` for the session’s user.

## Local development

1. Copy `.env.example` to `.env`. Keep `AUTH_PROVIDER=local`.
2. Set `AUTH_LOCAL_SHARED_SECRET` to a long development-only string (16+ characters). Do not reuse it in production.
3. Apply migrations and seed. Example users: `ada@example.test` (owner of North), `beau@example.test` (owner of South), `cora@example.test` (`read_only` on South).
4. `POST /auth/login` with `{ "email": "ada@example.test", "secret": "<AUTH_LOCAL_SHARED_SECRET>" }` from an origin listed in `CORS_ORIGINS`.
5. The API sets `esign_sid` (HttpOnly, SameSite=Lax) and `esign_csrf` (readable, SameSite=Strict). Send `esign_csrf` back as `X-CSRF-Token` on POST/PUT/PATCH/DELETE.

`AUTH_COOKIE_SECURE=false` is acceptable on `http://localhost`. Production defaults Secure cookies on.

## Production OIDC (credentials required)

Do not invent issuer URLs, client ids, or secrets. Create an application in your identity provider (for example Auth0, Okta, or Keycloak) and set:

| Variable                  | Meaning                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `AUTH_PROVIDER`           | `oidc`                                                            |
| `AUTH_OIDC_ISSUER`        | Provider issuer URL (discovery document base)                     |
| `AUTH_OIDC_CLIENT_ID`     | Confidential client id                                            |
| `AUTH_OIDC_CLIENT_SECRET` | Confidential client secret (from the provider, not this repo)     |
| `AUTH_OIDC_REDIRECT_URI`  | HTTPS callback registered with the provider, pointing at this API |

Until those values are supplied by operators, the OIDC adapter **fails closed**. Completing the authorization-code callback, token exchange, and account linking is follow-up work once a provider is chosen.

## Session and CSRF settings

| Variable                          | Default        | Notes                                            |
| --------------------------------- | -------------- | ------------------------------------------------ |
| `AUTH_SESSION_TTL_SECONDS`        | `28800`        | Absolute session lifetime from the server clock. |
| `AUTH_SESSION_COOKIE_NAME`        | `esign_sid`    | HttpOnly session token.                          |
| `AUTH_CSRF_COOKIE_NAME`           | `esign_csrf`   | Double-submit CSRF token.                        |
| `AUTH_CSRF_HEADER_NAME`           | `x-csrf-token` | Must match the CSRF cookie and the stored hash.  |
| `AUTH_LOGIN_RATE_LIMIT_MAX`       | `10`           | Per IP and per email digest, per window.         |
| `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS` | `60000`        | Sliding fixed window in the API process.         |

## What not to do

- Do not put passwords, session tokens, or CSRF tokens in logs or audit payloads.
- Do not enable `AUTH_PROVIDER=local` in production.
- Do not treat a client-supplied `organizationId` as authorization.
- Do not copy `.env` example secrets into a real IdP console and assume they work.
