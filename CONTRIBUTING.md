# Contributing

This repository hosts a production-oriented Electronic Signature SaaS monorepo: pnpm workspaces, Turborepo, Next.js App Router, Express, Prisma/PostgreSQL, Zod, Vitest, Playwright, and GitHub Actions.

Agent-specific operating rules live in [AGENTS.md](AGENTS.md) and `.cursor/rules/`. This file is for humans. Architecture, security, testing, database, frontend, and API conventions are defined there; do not copy them here.

## Prerequisites

- Node.js 22 LTS (see `.nvmrc` and `package.json` `engines`)
- [pnpm](https://pnpm.io) 9.15.9 as the only package manager (`corepack prepare pnpm@9.15.9 --activate`)
- Docker and Docker Compose for local Postgres and MinIO

```bash
cp .env.example .env
cp packages/database/.env.example packages/database/.env
pnpm install
pnpm infrastructure:up
pnpm db:migrate
```

Use only the placeholders in `.env.example`. Never commit real credentials or customer documents.

## Layout

```
apps/web                 Next.js frontend (account + signing)
apps/api                 Express API
apps/worker              document-processing / outbox worker
packages/domain          entities, ports, errors
packages/application     use cases
packages/database        Prisma + adapters
packages/contracts       Zod schemas
packages/config          typed env
packages/object-storage  S3-compatible storage adapter
packages/observability   metrics / tracing
packages/logger          Pino
docs/                    ADRs, threat model, runbooks, OpenAPI, deployment
```

## Workflow

1. Branch from `main`. Keep pull requests focused.
2. Validate input at API/worker boundaries with shared Zod contracts. Keep UI free of Prisma and storage SDKs.
3. Include tests, error handling, structured logging, and documentation with every feature.
4. For schema changes, add a Prisma migration. Do not edit migrations that have been applied.
5. Never commit secrets, `.env` files with credentials, signing tokens, or private documents.
6. Update [docs/](docs/) in the same change when behavior, config, or ops contracts change.

## Quality gates

Run the local equivalents of CI before opening a PR. The full table is in [docs/governance/ci-local-equivalents.md](docs/governance/ci-local-equivalents.md).

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm infrastructure:up
RUN_INFRA_TESTS=true pnpm test:integration
pnpm build
pnpm --filter @esign/web exec playwright install chromium
pnpm test:e2e
pnpm db:validate
pnpm audit --audit-level=high
```

GitHub Actions on pull requests and `main` runs the same jobs plus Playwright, container image builds (no publish), TruffleHog, CodeQL, and commitlint on PR ranges. There is no production deploy workflow in this repository.

Do not use floating dependency versions; the lockfile is the pin.

## Commits and pull requests

Use [Conventional Commits](docs/governance/conventional-commits.md). Allowed types include `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `style`, `revert`. Prefer `fix(security): …` for security remediations — a bare `security:` type fails CI commitlint.

PRs should include a summary, a test plan, and any security notes (authz, tokens, document handling, migrations, config breaks).

## Security and compliance

Report suspected vulnerabilities privately via [SECURITY.md](SECURITY.md); do not file public issues with exploits or customer documents.

Technical controls (hashed tokens, audit logs, TLS, structural PDF inspection, and similar) do not by themselves constitute legal, regulatory, or cryptographic compliance. Do not state that they do.

Before first production traffic, complete [docs/deployment/production-readiness-checklist.md](docs/deployment/production-readiness-checklist.md).

## Documentation

Lasting decisions go in `docs/` as Architecture Decision Records. Operational steps go in runbooks. Public HTTP is described with OpenAPI. Security findings live under [docs/security/reviews/](docs/security/reviews/). Update those documents in the same change as the behavior they describe.
