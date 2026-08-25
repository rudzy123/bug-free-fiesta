# Documentation

Engineering documentation for the electronic-signature SaaS monorepo. These documents describe the system as implemented and the residual risks that remain.

Do not treat anything here as legal, regulatory, or cryptographic compliance. Questions that need qualified legal counsel are marked **Legal review required**.

## Project status (engineering)

| Area                         | State                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| Monorepo apps + packages     | Implemented; CI quality, unit, integration, e2e, containers, audit   |
| Document + signing lifecycle | Implemented end-to-end in API/worker/web                             |
| Object storage               | Port + S3 adapter; production requires `OBJECT_STORAGE_DRIVER=s3`    |
| PDF inspection               | Production `structural` inspector; commercial AV still optional      |
| Audit                        | Hash chain + verification job/API/CLI; optional checkpoint anchoring |
| Security remediation         | 2026-08-25 adversarial review batches 1–6 code-complete              |
| Deferred decisions           | Redis rate limits, retention, DR drills, RLS, OIDC productization    |

Product intent and non-goals: [product scope](product/product-scope.md). Production gates: [production-readiness checklist](deployment/production-readiness-checklist.md).

## Start here

1. [Product scope](product/product-scope.md)
2. [System context](architecture/system-context.md)
3. [Container architecture](architecture/container-architecture.md)
4. [Domain model](architecture/domain-model.md)
5. [Architecture decision summary and risk register](architecture/decision-summary.md)
6. [Security reviews](security/reviews/) — latest adversarial findings and remediations

## Architecture

| Document                                                         | Purpose                                    |
| ---------------------------------------------------------------- | ------------------------------------------ |
| [System context](architecture/system-context.md)                 | Actors, external systems, trust boundaries |
| [Container architecture](architecture/container-architecture.md) | Apps, packages, data stores                |
| [Domain model](architecture/domain-model.md)                     | Entities and invariants                    |
| [Data model](architecture/data-model.md)                         | Prisma/PostgreSQL tables, indexes, RLS     |
| [Document lifecycle](architecture/document-lifecycle.md)         | Document states and transitions            |
| [Signing lifecycle](architecture/signing-lifecycle.md)           | Sessions, tokens, consent, fields          |
| [Audit model](architecture/audit-model.md)                       | Hash-chained append-only events            |
| [Data classification](architecture/data-classification.md)       | Sensitivity and logging rules              |
| [Retention model](architecture/retention-model.md)               | Technical retention vs legal policy        |
| [Reliability model](architecture/reliability-model.md)           | Outbox, idempotency, retries               |
| [Observability](architecture/observability.md)                   | Logs, metrics, traces, correlation         |
| [Testing strategy](architecture/testing-strategy.md)             | Unit, integration, e2e                     |
| [Deployment model](architecture/deployment-model.md)             | Local, CI, environments                    |
| [ADRs](architecture/adrs/)                                       | Architecture Decision Records              |
| [Decision summary](architecture/decision-summary.md)             | ADR index and risk register                |

## Security and privacy

| Document                                                     | Purpose                                 |
| ------------------------------------------------------------ | --------------------------------------- |
| [Threat model](security/threat-model.md)                     | Attacks and residual risk               |
| [Security controls](security/security-controls.md)           | Technical controls (not certifications) |
| [Security reviews](security/reviews/)                        | Adversarial findings and remediation    |
| [Privacy considerations](security/privacy-considerations.md) | Data minimization and legal flags       |
| [Authentication setup](security/authentication-setup.md)     | Local adapter and OIDC configuration    |

## Deployment and operations

| Document                                                                       | Purpose                                |
| ------------------------------------------------------------------------------ | -------------------------------------- |
| [Deployment index](deployment/README.md)                                       | Containers, data plane, platform, ops  |
| [Object storage](deployment/object-storage.md)                                 | S3-compatible production configuration |
| [Production-readiness checklist](deployment/production-readiness-checklist.md) | Pre-production technical gates         |
| [Observability runbooks/config](observability/README.md)                       | Metrics, SLOs, PII classification      |

## Runbooks

| Document                                                                   | Purpose                         |
| -------------------------------------------------------------------------- | ------------------------------- |
| [Document finalization failure](runbooks/document-finalization-failure.md) | Worker/artifact failures        |
| [Document upload failure](runbooks/document-upload-failure.md)             | Failed or abandoned PDF uploads |
| [Document inspection failure](runbooks/document-inspection-failure.md)     | Pending or rejected inspection  |
| [Outbox dead letter](runbooks/outbox-dead-letter.md)                       | Failed outbox / job recovery    |
| [Audit verification failure](runbooks/audit-verification-failure.md)       | Broken or missing hash chains   |

## Governance

| Document                                                   | Purpose                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Governance index](governance/README.md)                   | Definition of done, commits, releases, CI                                    |
| [CI local equivalents](governance/ci-local-equivalents.md) | Commands that match GitHub Actions jobs                                      |
| [Conventional commits](governance/conventional-commits.md) | Allowed commit types (`security` is **not** a type — use `fix(security): …`) |
| [Branch protection](governance/branch-protection.md)       | Recommended GitHub rules (not auto-applied)                                  |

## API

Health, authentication, document ingestion, preparation, send, and the signer-facing API are described in [docs/api/openapi.yaml](api/openapi.yaml).
