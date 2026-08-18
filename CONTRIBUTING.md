# Contributing

This repository will host a production Electronic Signature SaaS: pnpm workspaces, Turborepo, Next.js App Router, Express, Prisma/PostgreSQL, Zod, Vitest, Playwright, and GitHub Actions.

Agent-specific operating rules live in [AGENTS.md](AGENTS.md) and `.cursor/rules/`. This file is for humans. Architecture, security, testing, database, frontend, and API conventions are defined there; do not copy them here.

## Prerequisites

- Node.js 22 LTS, or the LTS version in `package.json` `engines` once set
- [pnpm](https://pnpm.io) as the only package manager
- Docker and Docker Compose for local Postgres (and MinIO when object storage is needed)

```bash
cp .env.example .env
cp packages/database/.env.example packages/database/.env
pnpm install
pnpm infrastructure:up
pnpm db:migrate
```

Use only the placeholders in `.env.example`. Never commit real credentials or customer documents.

## Intended layout

```
apps/web          Next.js frontend
apps/api          Express API
apps/worker       document-processing worker
packages/*        domain, application, database, contracts, config, logger, eslint, typescript, test-utils
docs/             ADRs, threat model, runbooks, OpenAPI
```

## Workflow

1. Branch from `main`. Keep pull requests focused.
2. Validate input at API/worker boundaries with shared Zod contracts. Keep UI free of Prisma and storage SDKs.
3. Include tests, error handling, structured logging, and documentation with every feature.
4. For schema changes, add a Prisma migration. Do not edit migrations that have been applied.
5. Never commit secrets, `.env` files with credentials, signing tokens, or private documents.

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
pnpm db:validate
pnpm audit --audit-level=high
```

GitHub Actions on pull requests and `main` runs the same jobs plus Playwright, container image builds (no publish), TruffleHog, and CodeQL. There is no production deploy workflow.

Do not use floating dependency versions; the lockfile is the pin.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`). See [docs/governance/conventional-commits.md](docs/governance/conventional-commits.md). Describe why, not a file list.

PRs should include a summary, a test plan, and any security notes (authz, tokens, document handling, migrations).

## Security and compliance

Report suspected vulnerabilities privately via [SECURITY.md](SECURITY.md); do not file public issues with exploits or customer documents.

Technical controls (hashing tokens, audit logs, TLS, and similar) do not by themselves constitute legal, regulatory, or cryptographic compliance. Do not state that they do.

## Documentation

Lasting decisions go in `docs/` as Architecture Decision Records. Operational steps go in runbooks. Public HTTP is described with OpenAPI. Update those documents in the same change as the behavior they describe.
