# Product scope

This product is a multi-tenant electronic-signature SaaS. An organization prepares a PDF document, places signature fields, invites signers, captures signatures, and produces an immutable finalized artifact with an append-only audit trail.

This document describes intended product behavior. It is not a contract, not legal advice, and not a claim that electronic signatures created here are enforceable in any jurisdiction.

**Legal review required:** whether, when, and how signatures captured by this system have legal effect under applicable law (including but not limited to electronic signature, consumer disclosure, evidence, and record-keeping statutes). Do not cite ESIGN, UETA, eIDAS, or similar regimes as satisfied.

## Goals

- Let an authenticated account user, acting in a tenant, upload a PDF, define server-owned signature fields, and send the document to one or more signers.
- Let signers open a time-bounded signing session, record consent, and apply signatures to server-defined fields.
- Finalize a content-addressed artifact after all required signatures are present.
- Record hash-chained, append-only audit events for security-relevant actions.
- Isolate tenant data by default. Deny authorization by default.

## In scope (v1 intent)

- Organizations (tenants) and membership roles.
- PDF upload, untrusted-document handling (structural inspection in production; commercial AV optional), and revision history.
- Multiple signers; ordered and parallel routing.
- Signing links bound to hashed bearer tokens and signing sessions.
- Typed signature fields (signature, initials, date signed) owned by the server.
- Void, expiry, decline, and retry-safe finalization.
- Private object storage for document bytes; PostgreSQL for metadata and audit.
- Account-user authentication separate from signer authentication.
- Operator runbooks for finalization and audit-chain failures.

## Out of scope (v1)

- Qualified certificates, smart cards, or hardware-backed signatures.
- Identity proofing, KBA, biometric matching, or government ID verification.
- In-person / wet-ink workflows, notarization, or witnessing.
- Collaborative PDF editing, Microsoft Office conversion, or arbitrary file types.
- Public document sharing, embedding signing widgets on third-party sites (beyond a first-party signer UI), or marketplace apps.
- Billing, usage metering, and self-serve plan changes.
- Customer-managed encryption keys and dedicated per-tenant databases (see [ADR-0013](../architecture/adrs/0013-multi-tenancy-isolation.md)).
- Mobile native apps.
- Legal hold eDiscovery export formats defined by a specific regulator.

**Legal review required:** any later claim that a postponed control is “not required” for a customer’s use case.

## Actors

| Actor          | Meaning                                                 |
| -------------- | ------------------------------------------------------- |
| Account user   | Person who can log into the SaaS.                       |
| Tenant member  | Account user acting inside an organization with a role. |
| Document owner | Tenant member responsible for a given document.         |
| Signer         | Party invited to sign; may or may not have an account.  |
| Operator       | Internal engineer or on-call responding to incidents.   |
| Platform       | API, worker, and data stores enforcing invariants.      |

See [domain model](../architecture/domain-model.md) for precise entity definitions.

## Non-goals for documentation and marketing

- Do not claim HIPAA, SOC 2, ISO 27001, PCI DSS, FedRAMP, or similar.
- Do not claim cryptographic non-repudiation equivalent to a qualified electronic signature.
- Do not claim that an audit hash chain is a legal archive or trusted timestamp authority.
- Do not claim that IP address, user agent, or checkbox text constitutes legally sufficient consent.

**Legal review required:** customer-facing terms, signer consent copy, retention periods, cross-border transfers, and subprocessors.

## Success criteria (engineering)

A document can be drafted, sent, signed by all required parties, finalized exactly once, and later downloaded by authorized tenant members. A verifier can recompute the audit hash chain and the artifact digest. Unauthorized tenants and unauthenticated callers cannot read or mutate another tenant’s documents.
