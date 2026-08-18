# Electronic signature SaaS

Monorepo for a production electronic-signature platform. Application signing flows are not implemented yet.

Do not treat this software as legally or regulatorily compliant. See `docs/`.

## Prerequisites

- Node.js 22 LTS (see `.nvmrc`)
- [pnpm](https://pnpm.io) 9.15.9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker and Docker Compose

## Setup

```bash
cp .env.example .env
cp packages/database/.env.example packages/database/.env
pnpm install
pnpm infrastructure:up
pnpm db:migrate
```

## Common commands

```bash
pnpm dev
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
```

`Makefile` targets wrap the same scripts (`make test`, `make infrastructure-up`, …).

## Layout

```
apps/web          Next.js App Router
apps/api          Express API
apps/worker       document-processing worker
packages/*        shared libraries
docs/             architecture, ADRs, threat model, runbooks
```

## Documentation

Start at [docs/README.md](docs/README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
