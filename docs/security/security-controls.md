# Security controls

Technical controls we intend to implement. Presence of a control is **not** SOC 2, ISO 27001, HIPAA, PCI, FedRAMP, eIDAS, or any other certification. **Legal review required** before mapping these rows to a customer questionnaire as “in place.”

## Control catalog

| ID | Control | Where |
| --- | --- | --- |
| C1 | Deny-by-default authorization | API application services |
| C2 | Separate account-user and signer authentication | [ADR-0009](../architecture/adrs/0009-authentication-boundaries.md) |
| C3 | Opaque identifiers | All public ids |
| C4 | Tenant id from membership or session, never client headers | [ADR-0013](../architecture/adrs/0013-multi-tenancy-isolation.md) |
| C5 | Zod validation at HTTP and job boundaries | `packages/contracts` |
| C6 | Untrusted PDF handling, size limits, no outbound fetches | Worker |
| C7 | Signing tokens hashed at rest; raw token never logged | Sessions table, logger |
| C8 | Server-owned signature fields | [ADR-0007](../architecture/adrs/0007-server-owned-signature-placement.md) |
| C9 | Append-only hash-chained audit | [ADR-0006](../architecture/adrs/0006-hash-chained-append-only-audit.md) |
| C10 | Short DB transactions; no I/O inside | Repositories |
| C11 | Outbox + idempotent workers | [ADR-0011](../architecture/adrs/0011-outbox-pattern.md), [ADR-0008](../architecture/adrs/0008-idempotency-strategy.md) |
| C12 | Conditional finalization lease; one artifact per document | Document lifecycle |
| C13 | Private object storage; content-addressed artifact keys | [ADR-0004](../architecture/adrs/0004-private-object-storage.md), [ADR-0010](../architecture/adrs/0010-content-addressed-finalized-artifacts.md) |
| C14 | Structured logs with redaction and correlation ids | `packages/logger` |
| C15 | CSRF protections on cookie-authenticated mutations | Web + API |
| C16 | CSP and no untrusted HTML | Web |
| C17 | Prisma parameterized access; no Prisma in React | `packages/database` |
| C18 | Config-only environment access; no hardcoded secrets | `packages/config` |
| C19 | Pinned dependencies via lockfile | pnpm |
| C20 | UTC server clock for expiry and audit | [ADR-0012](../architecture/adrs/0012-utc-timestamp-handling.md) |
| C21 | Least-privilege DB roles (no audit UPDATE/DELETE) | Deploy |
| C22 | Rate limits and payload caps | API edge |

## Explicitly not claimed

- Hardware security modules or qualified signatures
- Customer-managed keys (v1)
- Guaranteed non-repudiation
- Guaranteed malware-free PDFs
- Legal enforceability of signatures or consent
- Immutable cloud WORM that survives a compromised cloud account

## Related documents

[Threat model](threat-model.md), [Privacy considerations](privacy-considerations.md).
