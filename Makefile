.PHONY: dev build lint lint-fix format format-check typecheck test test-unit test-integration test-e2e db-generate db-migrate db-reset db-seed infrastructure-up infrastructure-down

dev:
	pnpm dev

build:
	pnpm build

lint:
	pnpm lint

lint-fix:
	pnpm lint:fix

format:
	pnpm format

format-check:
	pnpm format:check

typecheck:
	pnpm typecheck

test:
	pnpm test

test-unit:
	pnpm test:unit

test-integration:
	pnpm test:integration

test-e2e:
	pnpm test:e2e

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-reset:
	pnpm db:reset

db-seed:
	pnpm db:seed

infrastructure-up:
	pnpm infrastructure:up

infrastructure-down:
	pnpm infrastructure:down
