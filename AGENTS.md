# AGENTS.md

Guidance for coding agents working in this Electronic Signature SaaS monorepo. Humans should also read [CONTRIBUTING.md](CONTRIBUTING.md). The workspace is scaffolded. Do not implement electronic-signature business logic unless explicitly asked.

## Before changing code

1. Inspect the current tree, existing conventions, and the matching files under `.cursor/rules/`.
2. Summarize current state, assumptions, a concise plan, security-sensitive changes, and the exact files you expect to touch.
3. If requirements conflict (including with these docs), stop and explain the conflict. Do not patch around it.

## Rules index (do not duplicate)

| Area                                     | File                                                               | When                            |
| ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| Layout, layering, DI, config, TypeScript | [`.cursor/rules/architecture.mdc`](.cursor/rules/architecture.mdc) | Always                          |
| Secrets, authz, tokens, audit, logging   | [`.cursor/rules/security.mdc`](.cursor/rules/security.mdc)         | Always                          |
| Vitest, Playwright, fixtures             | [`.cursor/rules/testing.mdc`](.cursor/rules/testing.mdc)           | Tests and `packages/test-utils` |
| Prisma, migrations, transactions         | [`.cursor/rules/database.mdc`](.cursor/rules/database.mdc)         | `packages/database`             |
| Next.js UI                               | [`.cursor/rules/frontend.mdc`](.cursor/rules/frontend.mdc)         | `apps/web`                      |
| Express API and worker                   | [`.cursor/rules/api.mdc`](.cursor/rules/api.mdc)                   | `apps/api`, `apps/worker`       |

While those packages do not exist yet, still follow the matching rule when creating them.

## Implementation

- Change code in small coherent batches. Do not rewrite unrelated files.
- Add or update tests with behavior changes. Add migrations; never edit applied migrations.
- Use `packages/config` for environment; `packages/contracts` for Zod at boundaries; `packages/logger` for Pino.
- Local infrastructure is Docker Compose; object storage is an S3/Azure-compatible port, with MinIO locally when needed.

## After changing code

1. List every created or modified file and explain important architectural decisions.
2. Run the repo `format`, `lint`, `typecheck`, `test`, and `build` scripts when they exist.
3. Report the exact commands and results. Do not claim tests passed unless they ran.
4. Call out untested paths, remaining risks, follow-up work, and one Conventional Commit message (do not commit unless asked).
