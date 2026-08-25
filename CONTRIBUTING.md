# Contributing

Production-oriented Electronic Signature SaaS monorepo: pnpm workspaces, Turborepo, Next.js App Router, Express, Prisma/PostgreSQL, Zod, Vitest, Playwright, Pino, and GitHub Actions.

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
packages/application     use cases, authorization
packages/database        Prisma + adapters
packages/contracts       Zod schemas + shared API types
packages/config          typed env (only process.env reader)
packages/object-storage  S3-compatible storage adapter
packages/observability   metrics / tracing
packages/logger          Pino
packages/eslint-config   shared lint
packages/typescript-config  strict TS bases
packages/test-utils      builders and fixtures
docs/                    ADRs, threat model, runbooks, OpenAPI, deployment
```

## Workflow

1. Branch from `main`. Keep pull requests focused.
2. Meet the [definition of done](docs/governance/definition-of-done.md) for every meaningful feature.
3. Validate input at API/worker boundaries with shared Zod contracts. Keep UI free of Prisma and storage SDKs.
4. Include tests, error handling, structured logging, metrics where applicable, and documentation with every feature.
5. For schema changes, add a Prisma migration. Do not edit migrations that have been applied.
6. Never commit secrets, `.env` files with credentials, signing tokens, or private documents.
7. Update [docs/](docs/) in the same change when behavior, config, or ops contracts change.

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
pnpm release:check
pnpm audit --audit-level=high
```

GitHub Actions on pull requests and `main` runs the same jobs plus Playwright, container image builds (no publish), TruffleHog, CodeQL, and commitlint on PR ranges. There is no production deploy workflow in this repository.

Do not use floating dependency versions; the lockfile is the pin. Do not suppress TypeScript or lint errors with `any`, `@ts-ignore`, or `eslint-disable` unless a nearby comment documents a narrow, time-bounded reason.

## Commits and pull requests

Use [Conventional Commits](docs/governance/conventional-commits.md). Allowed types include `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `style`, `revert`. Prefer `fix(security): …` for security remediations — a bare `security:` type fails CI commitlint.

PRs should include a summary, a test plan, security notes when authz/tokens/documents/audit change, and threat-model notes when trust boundaries shift.

## Security and compliance

Report suspected vulnerabilities privately via [SECURITY.md](SECURITY.md); do not file public issues with exploits or customer documents.

Technical controls (hashed tokens, audit logs, TLS, structural PDF inspection, and similar) do not by themselves constitute legal, regulatory, or cryptographic compliance. Do not state that they do.

Before first production traffic, complete [docs/deployment/production-readiness-checklist.md](docs/deployment/production-readiness-checklist.md).

## Documentation

Lasting decisions go in `docs/` as Architecture Decision Records. Operational steps go in runbooks. Public HTTP is described with [OpenAPI](docs/api/openapi.yaml). Security findings live under [docs/security/reviews/](docs/security/reviews/). Update those documents in the same change as the behavior they describe.
