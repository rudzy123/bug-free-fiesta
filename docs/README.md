# Documentation

Foundational documentation for the electronic-signature SaaS. Signing product features are not implemented yet. These documents describe the intended system.

Do not treat anything here as legal, regulatory, or cryptographic compliance. Questions that need qualified legal counsel are marked **Legal review required**.

## Start here

1. [Product scope](product/product-scope.md)
2. [System context](architecture/system-context.md)
3. [Container architecture](architecture/container-architecture.md)
4. [Domain model](architecture/domain-model.md)
5. [Architecture decision summary and risk register](architecture/decision-summary.md)

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
| [Privacy considerations](security/privacy-considerations.md) | Data minimization and legal flags       |
| [Authentication setup](security/authentication-setup.md)     | Local adapter and OIDC configuration    |

## Runbooks

| Document                                                                   | Purpose                         |
| -------------------------------------------------------------------------- | ------------------------------- |
| [Document finalization failure](runbooks/document-finalization-failure.md) | Worker/artifact failures        |
| [Document upload failure](runbooks/document-upload-failure.md)             | Failed or abandoned PDF uploads |
| [Document inspection failure](runbooks/document-inspection-failure.md)     | Pending or rejected inspection  |
| [Audit verification failure](runbooks/audit-verification-failure.md)       | Broken or missing hash chains   |

## Governance

| Document                                                   | Purpose                                     |
| ---------------------------------------------------------- | ------------------------------------------- |
| [Governance index](governance/README.md)                   | Definition of done, commits, releases, CI   |
| [CI local equivalents](governance/ci-local-equivalents.md) | Commands that match GitHub Actions jobs     |
| [Branch protection](governance/branch-protection.md)       | Recommended GitHub rules (not auto-applied) |

## API

Health, authentication, document ingestion, preparation, and send are described in [docs/api/openapi.yaml](api/openapi.yaml).
