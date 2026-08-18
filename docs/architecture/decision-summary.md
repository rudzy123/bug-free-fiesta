# Architecture decision summary and risk register

Capstone for the v1 architecture. Application code is not implemented; these decisions constrain that implementation. This file does **not** claim ESIGN, UETA, eIDAS, HIPAA, SOC 2, ISO 27001, or other compliance.

## Decision summary

| Decision                                        | ADR                                                        | One-line effect                                       |
| ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| pnpm/Turborepo monorepo with layered packages   | [0001](adrs/0001-monorepo-and-package-boundaries.md)       | Shared contracts/config; no framework types in domain |
| Express API, not Next.js as the domain boundary | [0002](adrs/0002-express-api-separate-from-nextjs.md)      | Web is presentation only                              |
| PostgreSQL + Prisma for metadata                | [0003](adrs/0003-postgresql-and-prisma.md)                 | Transactions and constraints; no serial public ids    |
| PDFs in private object storage                  | [0004](adrs/0004-private-object-storage.md)                | Short DB transactions; MinIO locally                  |
| Finalization in `apps/worker`                   | [0005](adrs/0005-asynchronous-finalization-worker.md)      | Sign HTTP path does not parse PDFs                    |
| Hash-chained append-only audit                  | [0006](adrs/0006-hash-chained-append-only-audit.md)        | Integrity detection, not a legal archive              |
| Server-owned field geometry                     | [0007](adrs/0007-server-owned-signature-placement.md)      | Browser coordinates are not trusted                   |
| Idempotency keys + unique constraints           | [0008](adrs/0008-idempotency-strategy.md)                  | Safe retries and duplicate jobs                       |
| Account-user vs signer vs worker auth           | [0009](adrs/0009-authentication-boundaries.md)             | Stolen link ≠ tenant admin                            |
| Content-addressed artifacts                     | [0010](adrs/0010-content-addressed-finalized-artifacts.md) | Immutable keys; retry-safe uploads                    |
| Transactional outbox as the job queue           | [0011](adrs/0011-outbox-pattern.md)                        | No dual-write to an external queue in v1              |
| UTC instants only                               | [0012](adrs/0012-utc-timestamp-handling.md)                | Expiry and audit use the server clock                 |
| Shared DB with `tenantId` predicates            | [0013](adrs/0013-multi-tenancy-isolation.md)               | Deny-by-default isolation, not silo                   |

Supporting models: [domain](domain-model.md), [data model](data-model.md), [document lifecycle](document-lifecycle.md), [signing lifecycle](signing-lifecycle.md), [reliability](reliability-model.md), [threat model](../security/threat-model.md).

## Prioritized risk register

Priority is **P0** (must mitigate before handling real customer documents), **P1** (mitigate early in implementation), **P2** (track; may accept with owner). Residual risks remain after intended controls. None of these rows is a legal opinion.

| ID  | Priority | Risk                                    | If it happens                       | Intended mitigation                                  | Residual                   | Owner                      |
| --- | -------- | --------------------------------------- | ----------------------------------- | ---------------------------------------------------- | -------------------------- | -------------------------- |
| R1  | P0       | Cross-tenant IDOR                       | Document leak                       | Membership-scoped queries; tests                     | New query omits `tenantId` | Engineering                |
| R2  | P0       | Trust client field/signer/document ids  | Wrong or forged signature placement | Server-owned fields; token binding                   | Implementation bug         | Engineering                |
| R3  | P0       | Raw signing tokens in logs or DB        | Universal stolen links              | Hash at rest; logger deny list                       | Downstream log pipeline    | Engineering + ops          |
| R4  | P0       | Public object-storage bucket            | Mass PDF leak                       | Private IaC; no public ACL                           | Console misclick           | Ops                        |
| R5  | P0       | Duplicate finalization / split artifact | Two “originals”                     | Lease + unique digest                                | Orphan objects             | Engineering                |
| R6  | P0       | Malicious PDF in worker                 | RCE or SSRF                         | Worker sandboxing, no fetches, timeouts, pin pdf-lib | Library 0-day              | Engineering                |
| R7  | P0       | SQL injection / raw SQL                 | Data loss, audit wipe               | Prisma; ban unsafe raw SQL                           | Future `$queryRaw`         | Engineering                |
| R8  | P1       | Stolen signing email link               | Unauthorized sign                   | TTL, HTTPS, revoke, rate limit                       | Email is not identity      | Product + **legal review** |
| R9  | P1       | Race on ordered signing                 | Signer 2 signs early                | Transactions + routing guards                        | Missed test                | Engineering                |
| R10 | P1       | Outbox not processed                    | Stuck `completed`                   | Poller, alerts, runbook                              | Operator delay             | Engineering + ops          |
| R11 | P1       | Audit chain break or UPDATE             | Integrity failure                   | Insert-only role; verifier; runbook                  | Superuser/backups          | Security + ops             |
| R12 | P1       | CSRF/XSS on account session             | Void or send as owner               | SameSite, CSRF, CSP, HTTP-only cookies               | New HTML sinks             | Engineering                |
| R13 | P1       | Oversized payload DoS                   | Outage                              | Body/field/quota limits                              | Volumetric DDoS            | Engineering + ops          |
| R14 | P1       | Forged forwarded headers                | Poisoned IP/tenant                  | Ignore for authz                                     | Edge misconfig             | Ops                        |
| R15 | P1       | Queue/email duplication                 | Duplicate notices                   | Idempotent handlers                                  | Duplicate email UX         | Engineering                |
| R16 | P2       | Insider export of PDFs                  | Breach                              | Least privilege; runbook bans                        | Trusted operators          | Security                   |
| R17 | P2       | Backup theft or rewrite                 | Historical leak/tamper              | Encrypted backups; restore control                   | Cloud admin                | Ops + **legal review**     |
| R18 | P2       | Dependency compromise                   | Supply-chain malware                | Lockfile, few deps, CI pins                          | Transitive packages        | Engineering                |
| R19 | P2       | Log PII drift                           | Privacy incident                    | Classification + redaction                           | New fields                 | Engineering                |
| R20 | P2       | Erasure vs append-only audit            | Legal conflict                      | Do not ship silent chain rewrite                     | Unresolved policy          | **Legal review** + product |
| R21 | P2       | Shared-tenancy noisy neighbor           | Degraded signing                    | Quotas, rate limits                                  | No silo in v1              | Engineering                |
| R22 | P2       | Claiming compliance in UI/docs          | Misrepresentation                   | Explicit non-claims in docs                          | Marketing copy             | Product + **legal review** |

## Legal review required (open questions)

These are not engineering backlog items that “tests can close”:

1. Enforceability of signatures and the meaning of consent copy in target jurisdictions.
2. Whether email possession is an acceptable signer authentication factor.
3. Retention vs erasure vs legal hold for artifacts, consent, and audit.
4. Data residency and subprocessors (email, object storage).
5. Customer notification after audit-verification or storage incidents.
6. Use with minors, consumers, employees, or health/financial documents.
7. Whether void-after-sign or re-issue of links is allowed.
8. Any customer questionnaire mapping this architecture to SOC 2, ISO 27001, HIPAA, eIDAS, ESIGN, UETA, or similar — **do not answer “compliant” from these documents**.

## Follow-up (engineering, after scaffolding)

- Implement packages and apps per [container architecture](container-architecture.md).
- Turn this register into tracked issues when the repo has an issue process.
- Revisit silo tenancy, HSM-signed audit, and external WORM if customers require stronger isolation — still without implying certification.
