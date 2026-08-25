# Threat model

Intended threats and architectural mitigations for the electronic-signature SaaS. This is an engineering model. It is **not** a penetration test, **not** a residual-risk acceptance by the business, and **not** a compliance certification (including SOC 2, ISO 27001, HIPAA, PCI, eIDAS, ESIGN, UETA).

**Legal review required:** customer notification duties, whether any control is “required” for enforceability, and cross-border implications of incident data.

Actors: external attacker, malicious signer, malicious tenant member, compromised dependency, insider operator, coincidental misconfiguration.

## Method

Each threat lists impact, mitigations we intend to build, and residual risk. Deny-by-default authorization and untrusted uploads are assumed.

## Threats

### Stolen signing links

**Impact:** Attacker who obtains the URL may sign as that signer until expiry or revoke.

**Mitigations:** High-entropy tokens; HTTPS; short session TTL; hash-at-rest; revoke on void/re-issue; rate limits; show only that signer’s fields; one-time exchange via POST body or `Authorization` only (query-string tokens rejected — SEC-004); strip tokens from the browser URL after exchange in the signing UI.

**Residual:** Email forwards, malware, and shoulder surfing still work. This is not identity proofing.

**Legal review required:** whether email possession is an acceptable authentication factor for the customer’s use case.

### Signing-token leakage

**Impact:** Tokens in server logs, browser history, Referer headers, analytics, or crash dumps.

**Mitigations:** Never log tokens or `Authorization`; redaction in `packages/logger`; reject durable query-string exchange tokens at the API (SEC-004); no third-party analytics on signer pages by default; hash only at rest.

**Residual:** Misconfigured log sinks or browser extensions; invitation channels that still put tokens in email URLs before first exchange.

### IDOR and broken tenant isolation

**Impact:** Tenant A reads or mutates tenant B’s documents.

**Mitigations:** Opaque ids; every query constrained by `tenantId` from the **membership** of the authenticated account user (or from the signing session binding), never from a client tenant header; deny-by-default; tests for cross-tenant IDs ([ADR-0013](../architecture/adrs/0013-multi-tenancy-isolation.md)).

**Residual:** Missing `WHERE tenant_id` in a new query; insider DB access; no PostgreSQL RLS yet (SEC-019).

### Client-supplied signer or document IDs

**Impact:** Privilege escalation by swapping ids in JSON.

**Mitigations:** Session token hash loads canonical `documentId` and `signerId`. Body ids must match or are ignored. Field geometry loaded from DB ([ADR-0007](../architecture/adrs/0007-server-owned-signature-placement.md)).

**Residual:** Bugs in the equality check.

### Signature replay

**Impact:** Reusing a captured sign request to sign again or sign another document.

**Mitigations:** Token bound to one session/document/signer; signer unique completion; idempotency keys; completed/voided/expired states reject sign.

**Residual:** Replay within an active session of an unsigned signer is intended (idempotent). Cross-document replay must fail.

### Duplicate finalization

**Impact:** Two artifacts or a lost signature flattening race.

**Mitigations:** Conditional lease; unique artifact per document; content-addressed keys; outbox at-least-once with idempotent handlers.

**Residual:** Orphan objects in storage (storage cost, not split-brain metadata if DB wins).

### Forged proxy headers

**Impact:** Attacker sets `X-Forwarded-For`, `X-Tenant-Id`, `X-User-Id`, or `X-Organization-Id` to bypass authz or poison audit.

**Mitigations:** Identity only from verified session/cookie/token. Organization access is loaded from authenticated membership, never from a client tenant header. Trusted-proxy topology is a precise hop count (`TRUST_PROXY`), never a boolean `true`; the client IP is resolved from that topology so forged `X-Forwarded-For` entries to the left of the trusted hops are ignored (`apps/api/src/http/client-ip.ts`, unit + integration tests). Rate limits and consent/audit IP metadata use this spoof-resistant IP, not the raw header. The Next.js signing BFF must **not** copy browser `X-Forwarded-For`; it may forward only a trusted `x-real-ip` as a single `X-Forwarded-For` hop (SEC-003). Reverse-proxy configuration trusted only at the edge that strips incoming spoofed forwarded headers. IP in consent is untrusted metadata.

**Residual:** Misconfigured edge (a proxy that does not overwrite/append the client IP, or a `TRUST_PROXY` count that does not match the real hop depth). When the BFF omits `X-Forwarded-For`, API `TRUST_PROXY=0` keys rate limits on the Next→API socket (shared budget). Correct topology configuration remains an operational responsibility.

### Malformed or malicious PDFs

**Impact:** Parser crash, infinite loops, embedded JavaScript, SSRF via remote streams, worker RCE in a library.

**Mitigations:** Treat all PDFs as untrusted; size limits at proxy, API, and object storage; validate content type, extension, and `%PDF-` magic bytes; inspect via a port — production uses `DOCUMENT_INSPECTOR=structural` (rejects active PDF features, encryption, polyglot prefixes; SEC-002 fixed); `local` stub is non-production only; `fail_closed` remains an ops kill-switch; process advanced PDF work in the worker; disable external stream fetches; timeout and memory limits; keep pdf-lib and OS packages pinned.

**Residual:** Zero-days in PDF libraries (dependency compromise overlap). Structural inspection is not commercial antivirus; novel name encodings and non-declared malware payloads may still pass. Optional vendor AV/sanitizer remains a product/legal follow-up.

### Oversized payloads

**Impact:** Denial of service, memory exhaustion.

**Mitigations:** HTTP body limits, including route-specific JSON limits smaller than the global cap for auth (`AUTH_JSON_BODY_LIMIT`) and signing (`SIGNING_JSON_BODY_LIMIT`) endpoints; strict content-type enforcement (415 for unsupported media types); HTTP parameter-pollution rejection (array-valued query keys → 400); field-count limits, signature-image size limits, Zod max lengths, storage quotas per tenant (config).

**Residual:** Slow-loris and authenticated bulk API abuse — mitigated by rate limits, server-level header/request/keep-alive timeouts, and the overload guard (see [Denial of service](#denial-of-service)).

### Object storage misconfiguration

**Impact:** Public bucket listing or world-readable PDFs.

**Mitigations:** Private containers; no public ACL in IaC; presigned URLs short-lived and authorized; content-addressed keys without PII; object-key segment validation rejects path traversal (`..`) and filesystem root containment for the local driver (SEC-005); alerts on public ACL if the provider supports detection; source upload puts with `expectedSha256Digest` plus read-back re-hash (SEC-007); inspection refuses objects whose size/digest diverge from revision metadata (SEC-006); finalized artifacts already verify digests on put/get.

**Residual:** Manual console change; leaked long-lived access keys; silent bit-rot between inspect and finalization until the next digest check. Production requires `OBJECT_STORAGE_DRIVER=s3` via `@esign/object-storage` (SEC-001 fixed). Filesystem/memory drivers remain local/e2e only and are rejected in production.

### Audit record alteration or deletion

**Impact:** Cover-up of signing or voiding.

**Mitigations:** Append-only application API; DB role `esign_app` without UPDATE/DELETE/TRUNCATE; triggers; per-document insert serialization; versioned canonical hashing; verification job, admin endpoint, and CLI; checkpoint port for external WORM ([ADR-0015](../architecture/adrs/0015-audit-checkpoint-anchoring.md)); [runbook](../runbooks/audit-verification-failure.md).

**Residual:** A privileged database administrator (or anyone who can disable triggers and rewrite backups) can replace the entire chain with newly computed hashes. The hash chain does not prevent that. External anchoring to separately controlled immutable storage is required to detect wholesale replacement. Superuser and backup rewrite remain ([insider](#insider-threats), [backup compromise](#backup-compromise)).

### Insider threats

**Impact:** Operators export PDFs, mint sessions, or change DB state.

**Mitigations:** Least privilege; no production PDF on laptops in runbooks; access logging; separate prod credentials; dual control for restores.

**Residual:** Cannot eliminate trusted insiders. **Legal review required** for employee access policies.

### Log leakage

**Impact:** Tokens or PII in centralized logs.

**Mitigations:** Deny list in [data classification](../architecture/data-classification.md); logger redaction; no logging of document bytes.

**Residual:** `console.log` in a dependency; mis-tagged fields.

### CSRF

**Impact:** Browser of a logged-in account user sends a send/void mutation.

**Mitigations:** HttpOnly session cookie with SameSite=Lax; CSRF cookie SameSite=Strict plus `X-CSRF-Token` matched to a server-stored hash; Origin/Referer allowlist for cookie-authenticated mutations; signer bearer flows not relying on account cookies; no state-changing GET.

**Residual:** XSS makes CSRF less relevant (see XSS).

### Session fixation and stolen account sessions

**Impact:** Attacker sets a session cookie before login, or reuses a captured cookie after logout.

**Mitigations:** Login always creates a new opaque session token and revokes any presented prior session; tokens stored only as SHA-256 hashes; logout and explicit session revocation; expiry from the server clock; HttpOnly cookies.

**Residual:** A stolen active cookie works until expiry or revoke. XSS can still read the non-HttpOnly CSRF cookie.

### Account enumeration

**Impact:** Attacker learns which emails have accounts via login errors or timing.

**Mitigations:** Same 401 public message for unknown email and bad secret; local adapter always performs a timing-safe secret compare; failed-login audit events omit email and secrets; rate limits on login by IP and email digest.

**Residual:** Coarse timing of the user lookup; email validity format still returns 400.

### XSS

**Impact:** Script in the web app steals account sessions or signing tokens.

**Mitigations:** React default escaping; strict Content-Security-Policy; no `dangerouslySetInnerHTML` for document titles or PDF text; treat metadata as untrusted; HTTP-only cookies for account sessions.

**Residual:** Future markdown/HTML features.

### SSRF

**Impact:** API or worker fetches attacker URLs (PDF streams, webhooks, previewers).

**Mitigations:** No server-side fetch of user-supplied URLs in v1; PDF external references disabled; webhook allowlists if added later.

**Residual:** Library defaults that fetch.

### SQL injection

**Impact:** Data exfiltration or audit destruction.

**Mitigations:** Prisma parameterized queries; no string-concatenated SQL; least-privilege DB user.

**Residual:** Unsafe `$queryRaw` in a future change.

### Queue message duplication

**Impact:** Double email, double finalize.

**Mitigations:** Outbox ids as idempotency keys; handlers no-op on terminal state.

**Residual:** Duplicate emails still possible if the provider has no idempotency; signing remains safe.

### Race conditions

**Impact:** Skip routing order; void vs sign; two final copies.

**Mitigations:** Transactions; conditional updates; unique constraints; tests for parallel signers and concurrent finalize.

**Residual:** Missing a new race in a new state.

### Dependency compromise

**Impact:** Malicious package in pnpm lockfile or CI.

**Mitigations:** Lockfile pins; review new dependencies; avoid unnecessary packages; CI from trusted GitHub Actions with hashed versions where practical; no postinstall secrets.

**Residual:** Supply chain of existing packages.

### Backup compromise

**Impact:** Stolen PDFs and database dumps; rewritten history restored.

**Mitigations:** Encrypted backups with provider features; restricted restore roles; treat backups as Restricted; detect unexpected restores.

**Residual:** Cloud-admin compromise.

### Tenant data leakage

**Impact:** Search, support tools, or object keys exposing another tenant.

**Mitigations:** Tenant on every row; support tools must impersonate with audit; keys prefixed by `tenantId`; no global “list all PDFs” UI.

**Residual:** Analytics warehouses later — must stay out of v1 unless isolated.

### Denial of service

**Impact:** CPU on PDF parse, storage fill, email flood.

**Mitigations:** Authn on owner APIs; rate limits by endpoint sensitivity (a general per-IP limit plus stricter auth and signing limits), all keyed on the spoof-resistant client IP; a graceful overload guard that sheds load with `503` + `Retry-After` beyond a configured in-flight concurrency (`API_MAX_CONCURRENT_REQUESTS`) while leaving liveness/readiness probes unthrottled; per-request timeouts with an `AbortSignal` (`API_REQUEST_TIMEOUT_MS`) plus Node server-level header/request/keep-alive timeouts; size limits; worker timeouts; tenant quotas.

**Residual:** Distributed volumetric DDoS needs edge/WAF (operations, not claimed as in-app). In-process rate-limit and overload state is per instance; coordinated limits across replicas need shared state (operational).

### API request hardening (implemented)

**Impact:** Boundary weaknesses (spoofed source IP, unexpected content types, parameter pollution, oversized or slow requests, header downgrade, leaked internals) enable abuse, DoS, or information disclosure.

**Mitigations (this iteration):**

- Spoof-resistant client IP from a precise `TRUST_PROXY` hop count; `true` is refused at config load. Used for all rate limiting and consent/audit IP metadata.
- Strict content-type allowlist (`application/json`, `application/pdf`, `application/octet-stream`) → 415 otherwise; bodyless requests are not blocked.
- Route-specific JSON body limits for auth and signing; global limit for document JSON; raw PDF cap unchanged.
- HTTP parameter-pollution rejection for array-valued query keys.
- Rate limits by endpoint sensitivity (general + auth + signing) keyed on the trusted client IP.
- Graceful overload shedding (`503` + `Retry-After`) with liveness/readiness kept before the guard; readiness still fails closed when the database is unusable, and is separate from liveness.
- Per-request timeout with an `AbortSignal` and Node server-level header/request/keep-alive timeouts.
- Helmet with an API-appropriate CSP (`default-src 'none'`), frameguard `deny`, cross-origin isolation, and HSTS gated to production.
- Stable error envelopes with no stack traces; logger redaction of authorization, cookie, referer, query strings, and signing/session/CSRF tokens.

**Residual:** Per-instance limiter/overload state (no cross-replica coordination); correct proxy topology and TLS termination remain operational; volumetric DDoS still needs edge/WAF; timing side channels and application-logic abuse are out of scope for this boundary layer.

## STRIDE summary

| STRIDE                 | Examples in this product                                   |
| ---------------------- | ---------------------------------------------------------- |
| Spoofing               | Stolen links, forged headers                               |
| Tampering              | Client field coordinates, audit edits, PDF content         |
| Repudiation            | Missing consent/audit — mitigated technically, not legally |
| Information disclosure | IDOR, public buckets, logs                                 |
| Denial of service      | Oversize PDF, worker hang                                  |
| Elevation of privilege | Client signer id, tenant header                            |

## Related documents

[Security controls](security-controls.md), [Decision summary and risk register](../architecture/decision-summary.md).
