# Electronic signature SaaS

pnpm / Turborepo monorepo for a multi-tenant electronic-signature platform maintained for long-term production use.

This software is under active engineering. Technical controls are **not** legal, regulatory, or cryptographic compliance. Do not claim ESIGN, UETA, eIDAS, HIPAA, SOC 2, ISO 27001, or similar from this repository alone. Start with [docs/README.md](docs/README.md).

## Stack

| Area              | Technology                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Runtime           | Node.js 22 LTS, TypeScript strict (`noUncheckedIndexedAccess`)                              |
| Monorepo          | pnpm workspaces, Turborepo; lockfile-pinned dependencies                                    |
| Frontend          | Next.js App Router, React, Tailwind CSS                                                     |
| API               | Express, TypeScript, [OpenAPI](docs/api/openapi.yaml)                                       |
| Data              | PostgreSQL, Prisma                                                                          |
| Validation        | Zod (`packages/contracts`)                                                                  |
| PDF               | pdf-lib (worker only; treat all PDFs as untrusted)                                          |
| Object storage    | S3-compatible port (`packages/object-storage`); MinIO locally; Azure Blob via the same port |
| Logging / metrics | Pino (`packages/logger`); Prometheus (`packages/observability`)                             |
| Testing           | Vitest (unit/integration), Playwright (e2e)                                                 |
| CI                | GitHub Actions                                                                              |
| Local infra       | Docker Compose (Postgres, MinIO)                                                            |

Engineering principles and layer boundaries: [`.cursor/rules/`](.cursor/rules/). Definition of done for features: [docs/governance/definition-of-done.md](docs/governance/definition-of-done.md).

## Current status

Implemented and exercised in CI for v1 engineering scope:

- Account-user auth (local adapter for non-production; OIDC config for production)
- Document draft → PDF upload → inspection → prepare → send → sign → finalize
- Hash-chained append-only audit with verification job, API, and CLI
- Private object storage (`memory` / `filesystem` locally; **`s3` required in production**)
- Structural PDF inspection for production (`DOCUMENT_INSPECTOR=structural`)
- Prometheus metrics, redacted logs, container images, and security remediation batches through 2026-08-25

Still open by design (need product, legal, or infrastructure decisions): shared rate-limit store, retention/erasure policy, backup/DR drills, PostgreSQL RLS, and production OIDC productization. See [security reviews](docs/security/reviews/).

## Prerequisites

- Node.js 22 LTS (see `.nvmrc` and `package.json` `engines`)
- [pnpm](https://pnpm.io) 9.15.9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker and Docker Compose

## Setup

```bash
cp .env.example .env
cp packages/database/.env.example packages/database/.env
pnpm install
pnpm infrastructure:up
pnpm db:migrate
pnpm db:seed   # optional local seed data
```

Use only placeholders from `.env.example`. Never commit real credentials or customer documents.

## Common commands

```bash
pnpm dev
pnpm lint
pnpm format
pnpm typecheck
pnpm test:unit
pnpm test:integration   # requires infrastructure:up and RUN_INFRA_TESTS=true in CI
pnpm test:e2e
pnpm build
pnpm audit --audit-level=high
pnpm release:check      # migrations, OpenAPI, audit schema locks
```

`Makefile` targets wrap the same scripts (`make test`, `make infrastructure-up`, …). Full CI parity: [docs/governance/ci-local-equivalents.md](docs/governance/ci-local-equivalents.md).

## Layout

```
apps/web                 Next.js App Router (account + signing UI)
apps/api                 Express HTTP adapter and composition root
apps/worker              Outbox poller, PDF inspect/flatten, audit verify
packages/domain          Entities, ports, typed errors
packages/application     Use cases, authorization, HTTP error mapping
packages/database        Prisma schema, migrations, infrastructure adapters
packages/contracts       Shared Zod request/response schemas
packages/config          Typed environment configuration (only process.env reader)
packages/object-storage  S3-compatible object-storage adapter
packages/observability   Metrics and tracing abstractions
packages/logger          Pino structured logging
packages/eslint-config   Shared ESLint configuration
packages/typescript-config  Strict TypeScript bases
packages/test-utils      Reusable test builders and fixtures
docs/                    Architecture, ADRs, threat model, runbooks, OpenAPI
```

## Documentation

| Audience                       | Start here                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Engineers (humans)             | [docs/README.md](docs/README.md), [CONTRIBUTING.md](CONTRIBUTING.md)                   |
| Coding agents                  | [AGENTS.md](AGENTS.md), `.cursor/rules/`                                               |
| Feature completion checklist   | [definition of done](docs/governance/definition-of-done.md)                            |
| Security / ops                 | [threat model](docs/security/threat-model.md), [deployment](docs/deployment/README.md) |
| Vulnerability reports          | [SECURITY.md](SECURITY.md)                                                             |
| Production gate before go-live | [production-readiness checklist](docs/deployment/production-readiness-checklist.md)    |
